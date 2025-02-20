import { chromium, Browser, Page } from 'playwright';

interface DetailedOrder {
  orderId: string;
  orderTime: string;
  status: string;
  totalAmount: number;
  deliveryTime: string;
  paymentMethod: string;
  visitCount: string;
  customerName: string;
  customerPhone: string;
  receiptName: string;
  waitingTime: string;
  address: string;
  items: string;
  notes: string;
}

let monitoringBrowser: Browser | null = null;
let monitoringPage: Page | null = null;
let isMonitoringActive = false;
const processedOrderIds = new Set<string>();

export async function getMonitoringStatus(): Promise<boolean> {
  try {
    if (!monitoringBrowser || !monitoringPage) {
      return false;
    }

    // Check if browser is connected and page is not closed
    const isConnected = monitoringBrowser.isConnected();
    const isPageOpen = !monitoringPage.isClosed();
    
    // Verify we can actually interact with the page
    if (isConnected && isPageOpen) {
      try {
        await monitoringPage.evaluate(() => document.title);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking monitoring status:', error);
    return false;
  }
}

export async function checkIsMonitoringActive(): Promise<boolean> {
  return getMonitoringStatus();
}

async function checkAndRefreshSession(page: Page, email: string, password: string): Promise<boolean> {
  try {
    // Check if we're logged out by looking for login button
    const isLoggedOut = await page.$('button:has-text("メールアドレス")') !== null;
    
    if (isLoggedOut) {
      console.log('Session expired, attempting to re-login...');
      await page.click('button:has-text("メールアドレス")');
      const emailLoginForm = page.locator('div').filter({ hasText: /^メールアドレスパスワード$/ });
      await emailLoginForm.locator('input[type="email"]').fill(email);
      await emailLoginForm.locator('input[type="password"]').fill(password);
      await page.click('button:has-text("ログイン")');
      await page.waitForNavigation({ waitUntil: 'networkidle' });
      
      // Verify login was successful
      const errorElement = await page.$('text=/Error|Invalid|失敗/i');
      if (errorElement) {
        console.error('Re-login failed');
        return false;
      }
      console.log('Re-login successful');
      return true;
    }
    return true;
  } catch (error) {
    console.error('Error checking/refreshing session:', error);
    return false;
  }
}

export async function startOrderMonitoring(email: string, password: string, onNewOrders: (orders: DetailedOrder[]) => void) {
  try {
    // Check if there's already an active monitoring session
    if (await getMonitoringStatus()) {
      // Focus the existing window
      if (monitoringPage) {
        await monitoringPage.bringToFront();
      }
      return { success: true, monitoring: true, existing: true };
    }

    // Clean up any existing browser/page instances
    await stopOrderMonitoring();

    // Launch new browser
    monitoringBrowser = await chromium.launch({ 
      headless: false,
      slowMo: 200
    });

    // Create new page
    monitoringPage = await monitoringBrowser.newPage();

    // Login process
    await monitoringPage.goto('https://partner.demae-can.com/merchant-admin/login', { waitUntil: 'networkidle' });
    await monitoringPage.click('button:has-text("メールアドレス")');
    const emailLoginForm = monitoringPage.locator('div').filter({ hasText: /^メールアドレスパスワード$/ });
    await emailLoginForm.locator('input[type="email"]').fill(email);
    await emailLoginForm.locator('input[type="password"]').fill(password);
    await monitoringPage.click('button:has-text("ログイン")');
    await monitoringPage.waitForNavigation({ waitUntil: 'networkidle' });

    // Check for login errors
    const errorElement = await monitoringPage.$('text=/Error|Invalid|失敗/i');
    if (errorElement) {
      const errorText = await errorElement.textContent();
      throw new Error(`Login failed: ${errorText}`);
    }

    // Set monitoring as active
    isMonitoringActive = true;
    // Clear processed orders set
    processedOrderIds.clear();

    // Go to orders page initially
    await monitoringPage.goto('https://partner.demae-can.com/merchant-admin/order/order-list', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Process all existing orders first
    console.log('Processing existing orders...');
    try {
      // Wait for table using more reliable selectors
      console.log('Waiting for order table...');
      await monitoringPage.waitForSelector('table:has(tr:has(td:nth-child(1):has-text("注文ID/受取用番号"))), table:has(tr:has(th:has-text("注文ID/受取用番号"))), table[role="grid"]', { timeout: 5000 }).catch(() => {
        console.log('Table selector timeout, will try alternative methods');
      });

      // Debug: Log all tables on the page
      const tableDebug = await monitoringPage.evaluate(() => {
        const tables = document.querySelectorAll('table');
        return Array.from(tables).map(table => ({
          text: table.textContent?.trim(),
          role: table.getAttribute('role'),
          headers: Array.from(table.querySelectorAll('th, td')).map(cell => cell.textContent?.trim())
        }));
      });
      console.log('Found tables on page:', tableDebug);

      // Get all existing orders first
      const existingOrders = await monitoringPage.evaluate(() => {
        // Try multiple selectors to find the table
        const table = document.querySelector('table:has(tr:has(td:has-text("注文ID/受取用番号")))') || 
                      document.querySelector('table:has(tr:has(th:has-text("注文ID/受取用番号")))') ||
                      document.querySelector('table[role="grid"]') ||
                      Array.from(document.querySelectorAll('table')).find(table => {
                        const headerText = table.textContent || '';
                        return headerText.includes('注文ID/受取用番号') || headerText.includes('注文ID');
                      });

        if (!table) {
          console.log('No table found with order ID header');
          return [];
        }

        console.log('Found table with content:', table.textContent);
        
        // Find tbody - if not found, use table directly
        const tbody = table.querySelector('tbody') || table;
        const rows = Array.from(tbody.querySelectorAll('tr'));
        console.log(`Found ${rows.length} rows in table`);
        
        return rows
          .filter(row => {
            const cells = row.querySelectorAll('td');
            const firstCell = cells[0]?.textContent?.trim();
            const isHeader = firstCell?.includes('注文ID') || firstCell?.includes('受取用番号');
            return cells.length >= 3 && firstCell && !isHeader;
          })
          .map(row => {
            const cells = row.querySelectorAll('td');
            const data = {
              orderId: cells[0]?.textContent?.trim() || '',
              status: cells[2]?.textContent?.trim() || '',
              index: Array.from(tbody.children).indexOf(row)
            };
            console.log('Mapped row data:', data);
            return data;
          })
          .filter(order => order.orderId !== '');
      });

      console.log(`Found ${existingOrders.length} existing orders`);

      // Process each existing order
      for (let i = 0; i < existingOrders.length; i++) {
        const { orderId } = existingOrders[i];
        if (!orderId || processedOrderIds.has(orderId)) continue;

        try {
          await monitoringPage.click(`text=${orderId}`);
          await monitoringPage.waitForLoadState('networkidle');
          await monitoringPage.waitForSelector('dl', { state: 'visible', timeout: 15000 });

          const orderDetails = await monitoringPage.evaluate(() => {
            const findValueByLabel = (labelText: string): string => {
              // Try finding in dl/dt/dd structure
              const dlElements = document.querySelectorAll('dl');
              for (const dl of dlElements) {
                const dt = dl.querySelector('dt');
                const dd = dl.querySelector('dd');
                if (dt?.textContent?.includes(labelText) && dd) {
                  return dd.textContent?.trim() || '';
                }
              }

              // Try finding in table structure
              const tables = document.querySelectorAll('table');
              for (const table of tables) {
                const rows = table.querySelectorAll('tr');
                for (const row of rows) {
                  const cells = row.querySelectorAll('td, th');
                  for (const cell of cells) {
                    if (cell.textContent?.includes(labelText)) {
                      const nextCell = cell.nextElementSibling;
                      if (nextCell) {
                        return nextCell.textContent?.trim() || '';
                      }
                    }
                  }
                }
              }

              // Try finding in dt/dd pairs
              const allDts = document.querySelectorAll('dt');
              for (const dt of allDts) {
                if (dt.textContent?.includes(labelText)) {
                  const nextElement = dt.nextElementSibling;
                  if (nextElement?.tagName.toLowerCase() === 'dd') {
                    return nextElement.textContent?.trim() || '';
                  }
                }
              }

              // Try finding in any element with specific text content
              const elements = document.querySelectorAll('*');
              for (const element of elements) {
                if (element.textContent?.includes(labelText)) {
                  const parent = element.parentElement;
                  if (parent) {
                    return parent.textContent?.replace(labelText, '').trim() || '';
                  }
                }
              }

              return '';
            };

            // Extract price information
            let total = 0;
            
            // First find the items section
            const itemsFieldset = Array.from(document.querySelectorAll('fieldset')).find(el => 
              el.textContent?.includes('商品情報') || 
              el.textContent?.includes('注文商品')
            );

            if (itemsFieldset) {
              // Get all divs in the fieldset
              const allDivs = Array.from(itemsFieldset.querySelectorAll('div'));
              
              // Look for the last occurrence of '合計'
              for (let i = allDivs.length - 1; i >= 0; i--) {
                const div = allDivs[i];
                const text = div.textContent || '';
                
                if (text.includes('合計')) {
                  const match = text.match(/[¥￥]([0-9,]+)/);
                  if (match) {
                    total = parseInt(match[1].replace(/,/g, ''));
                    break;
                  }
                }
              }
            }
            
            // If still not found, try the old method as fallback
            if (total === 0) {
              const elements = document.querySelectorAll('*');
              for (const el of elements) {
                if (el.textContent?.includes('合計')) {
                  const text = el.textContent;
                  const match = text.match(/[¥￥]([0-9,]+)/);
                  if (match) {
                    total = parseInt(match[1].replace(/,/g, ''));
                    break;
                  }
                }
              }
            }
            
            // Get items information
            let items = '';
            let hasUtensils = false;
            let notes = '';  // Add notes variable
            
            // Extract notes from 備考 fieldset
            const remarkFieldset = Array.from(document.querySelectorAll('fieldset')).find(el => 
              el.textContent?.includes('備考')
            );
            
            if (remarkFieldset) {
              const remarkContent = remarkFieldset.textContent || '';
              notes = remarkContent.replace('備考', '').trim();
            }

            // If notes not found in fieldset, try finding in other elements
            if (!notes) {
              const remarkElements = Array.from(document.querySelectorAll('*')).filter(el => 
                el.textContent?.includes('備考')
              );
              
              for (const el of remarkElements) {
                const parent = el.parentElement;
                if (parent && parent.textContent) {
                  notes = parent.textContent.replace('備考', '').trim();
                  if (notes) break;
                }
              }
            }

            // Try to find utensils in the order items table first
            const orderItemsTable = document.querySelector('table.orderItemList');
            if (orderItemsTable) {
              const tableText = orderItemsTable.textContent || '';
              if (tableText.includes('箸、スプーン、おしぼり等／Utensils') || 
                  tableText.includes('箸、スプーン、おしぼり等') ||
                  tableText.includes('Utensils')) {
                hasUtensils = true;
              }
            }

            // If not found in table, try all elements
            if (!hasUtensils) {
              const allElements = document.querySelectorAll('*');
              for (const el of allElements) {
                const text = el.textContent || '';
                if (text.includes('箸、スプーン、おしぼり等／Utensils') || 
                    text.includes('箸、スプーン、おしぼり等') ||
                    text.includes('Utensils')) {
                  hasUtensils = true;
                  break;
                }
              }
            }

            // Get the items information
            const itemsSection = Array.from(document.querySelectorAll('*')).find(el => 
              el.textContent?.includes('商品情報') || 
              el.textContent?.includes('注文商品')
            );
            
            if (itemsSection) {
              // Get the parent container that might contain the items list
              const container = itemsSection.closest('dl, div, section');
              if (container) {
                items = container.textContent || '';
                // Clean up the text
                items = items.replace('商品情報', '').replace('注文商品', '').trim();
              }
            }

            // If not found, try the general search
            if (!items) {
              items = findValueByLabel('商品情報') || findValueByLabel('注文商品') || '';
            }

            // If utensils were found, make sure they're included in the items text
            if (hasUtensils && !items.includes('箸、スプーン、おしぼり等／Utensils')) {
              items = items + ' 箸、スプーン、おしぼり等／Utensils';
            }

            return {
              orderId: findValueByLabel('注文ID'),
              orderTime: findValueByLabel('注文日時'),
              deliveryTime: findValueByLabel('配達/テイクアウト日時') || findValueByLabel('配達希望日時'),
              paymentMethod: findValueByLabel('支払方法'),
              visitCount: findValueByLabel('店舗利用回数'),
              customerName: findValueByLabel('注文者氏名'),
              customerPhone: findValueByLabel('注文者電話番号'),
              receiptName: findValueByLabel('領収書宛名'),
              waitingTime: findValueByLabel('受付時の待ち時間'),
              address: findValueByLabel('配達先住所'),
              items: items,
              totalAmount: total,
              status,
              notes: notes  // Add notes to the returned object
            };
          });

          if (orderDetails.orderId) {
            processedOrderIds.add(orderDetails.orderId);
            console.log('Processed existing order:', orderDetails.orderId);
            onNewOrders([orderDetails]);
          }

          // Go back to order list
          await monitoringPage.goto('https://partner.demae-can.com/merchant-admin/order/order-list', {
            waitUntil: 'networkidle',
            timeout: 30000
          });
        } catch (error) {
          console.error('Error processing existing order:', orderId, error);
          await monitoringPage.goto('https://partner.demae-can.com/merchant-admin/order/order-list', {
            waitUntil: 'networkidle',
            timeout: 30000
          });
        }
      }

      console.log('Finished processing existing orders:', Array.from(processedOrderIds));

    } catch (error) {
      console.error('Error during initial order processing:', error);
    }

    console.log('Starting monitoring for new orders...');
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;

    // Start monitoring loop for new orders
    while (isMonitoringActive) {
      try {
        // Check if browser is still connected
        if (!monitoringBrowser?.isConnected()) {
          console.error('Browser disconnected, attempting to recreate...');
          try {
            monitoringBrowser = await chromium.launch({ 
              headless: false,
              slowMo: 200
            });
            monitoringPage = await monitoringBrowser.newPage();
            await monitoringPage.goto('https://partner.demae-can.com/merchant-admin/login', { waitUntil: 'networkidle' });
            await monitoringPage.click('button:has-text("メールアドレス")');
            const emailLoginForm = monitoringPage.locator('div').filter({ hasText: /^メールアドレスパスワード$/ });
            await emailLoginForm.locator('input[type="email"]').fill(email);
            await emailLoginForm.locator('input[type="password"]').fill(password);
            await monitoringPage.click('button:has-text("ログイン")');
            await monitoringPage.waitForNavigation({ waitUntil: 'networkidle' });
            console.log('Successfully recreated browser and logged in');
            continue;
          } catch (error) {
            console.error('Failed to recreate browser:', error);
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
          }
        }

        // Check if page is still available
        if (!monitoringPage || monitoringPage.isClosed()) {
          console.error('Page unavailable, attempting to recreate...');
          try {
            monitoringPage = await monitoringBrowser.newPage();
            await monitoringPage.goto('https://partner.demae-can.com/merchant-admin/login', { waitUntil: 'networkidle' });
            await monitoringPage.click('button:has-text("メールアドレス")');
            const emailLoginForm = monitoringPage.locator('div').filter({ hasText: /^メールアドレスパスワード$/ });
            await emailLoginForm.locator('input[type="email"]').fill(email);
            await emailLoginForm.locator('input[type="password"]').fill(password);
            await monitoringPage.click('button:has-text("ログイン")');
            await monitoringPage.waitForNavigation({ waitUntil: 'networkidle' });
            console.log('Successfully recreated page and logged in');
            continue;
          } catch (error) {
            console.error('Failed to recreate page:', error);
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
          }
        }

        // Verify page is still connected before any operations
        try {
          await monitoringPage.evaluate(() => document.title);
        } catch (error) {
          console.error('Page disconnected, will attempt to recreate on next iteration');
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }

        // Check and refresh session periodically
        if (!await checkAndRefreshSession(monitoringPage, email, password)) {
          throw new Error('Session check failed');
        }

        // Ensure we're on the order list page with retries
        let retryCount = 0;
        let navigationSuccessful = false;
        while (!navigationSuccessful && retryCount < 3) {
          try {
            if (!monitoringPage.url().includes('order-list')) {
              await monitoringPage.goto('https://partner.demae-can.com/merchant-admin/order/order-list', {
                waitUntil: 'networkidle',
                timeout: 30000
              });
            }
            navigationSuccessful = true;
          } catch (error) {
            console.error(`Navigation retry ${retryCount + 1} failed:`, error);
            retryCount++;
            if (retryCount < 3) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        }

        if (!navigationSuccessful) {
          throw new Error('Failed to navigate to order list after retries');
        }

        // Wait for table to be visible with more reliable selectors
        await monitoringPage.waitForSelector('table:has(tr:has(td:nth-child(1):has-text("注文ID/受取用番号"))), table:has(tr:has(th:has-text("注文ID/受取用番号"))), table[role="grid"]', { timeout: 5000 }).catch(() => {});

        // Get current orders with improved table selection
        const currentOrders = await monitoringPage.evaluate(() => {
          // Debug: Log all tables and their content
          const allTables = document.querySelectorAll('table');
          console.log(`Found ${allTables.length} tables on page`);
          allTables.forEach((table, index) => {
            console.log(`Table ${index + 1} content:`, {
              text: table.textContent,
              headers: Array.from(table.querySelectorAll('th, td')).map(cell => cell.textContent?.trim()),
              rows: table.querySelectorAll('tr').length
            });
          });

          // Try multiple strategies to find the table
          let table = null;
          
          // Strategy 1: Look for specific header content
          const headerTexts = [
            'お客様情報',
            '店舗/注文したサイト',
            '注文/配達テイクアウト日時',
            '加盟店の売上/お客様への請求額',
            '申請ステータス'
          ];
          
          // Find all tables and check their headers
          const tables = Array.from(document.querySelectorAll('table'));
          for (const currentTable of tables) {
            const headers = Array.from(currentTable.querySelectorAll('th, td'));
            for (const header of headers) {
              const headerText = header.textContent?.trim() || '';
              if (headerTexts.some(text => headerText.includes(text))) {
                table = currentTable;
                console.log('Found table with header:', headerText);
                break;
              }
            }
            if (table) break;
          }

          // Strategy 2: Check table content for multiple headers
          if (!table) {
            table = tables.find(t => {
              const content = t.textContent || '';
              return headerTexts.some(header => content.includes(header));
            });
            if (table) console.log('Found table using content check');
          }

          // Strategy 3: Role-based + content check
          if (!table) {
            table = Array.from(document.querySelectorAll('table[role="grid"]')).find(t => {
              const content = t.textContent || '';
              return headerTexts.some(header => content.includes(header));
            });
            if (table) console.log('Found table using role and content check');
          }

          if (!table) {
            console.log('No order table found after trying all strategies');
            return [];
          }

          console.log('Found table with content:', {
            text: table.textContent,
            headers: Array.from(table.querySelectorAll('th, td')).map(cell => cell.textContent?.trim()),
            rows: table.querySelectorAll('tr').length
          });

          const tbody = table.querySelector('tbody') || table;
          const rows = Array.from(tbody.querySelectorAll('tr'));
          console.log(`Found ${rows.length} total rows in table`);

          // Process rows with better filtering
          const processedRows = rows
            .filter(row => {
              const cells = row.querySelectorAll('td');
              if (cells.length < 3) {
                console.log('Filtered out row: insufficient cells');
                return false;
              }

              const firstCell = cells[0]?.textContent?.trim() || '';
              if (!firstCell) {
                console.log('Filtered out row: empty first cell');
                return false;
              }

              // Check if it's a header row by looking for any of the header texts
              if (headerTexts.some(header => firstCell.includes(header))) {
                console.log('Filtered out row: header row');
                return false;
              }

              return true;
            })
            .map(row => {
              const cells = row.querySelectorAll('td');
              const data = {
                orderId: cells[0]?.textContent?.trim() || '',
                status: cells[2]?.textContent?.trim() || '',
                orderTime: cells[1]?.textContent?.trim() || ''
              };
              console.log('Processed row:', data);
              return data;
            })
            .filter(order => {
              if (!order.orderId) {
                console.log('Filtered out order: missing orderId');
                return false;
              }
              return true;
            });

          console.log(`Processed ${processedRows.length} valid order rows`);
          return processedRows;
        });

        // Sort orders by time to process newest first
        const sortedOrders = currentOrders.sort((a, b) => {
          const timeA = new Date(a.orderTime).getTime();
          const timeB = new Date(b.orderTime).getTime();
          return timeB - timeA;
        });

        let foundNewOrders = false;

        // Process only new orders
        for (const { orderId } of sortedOrders) {
          if (!orderId || processedOrderIds.has(orderId)) continue;

          foundNewOrders = true;
          let orderProcessed = false;
          let retryCount = 0;

          while (!orderProcessed && retryCount < 3 && isMonitoringActive) {
            try {
              // Click the order ID and wait for navigation
              await monitoringPage.click(`text=${orderId}`);
              
              // Wait for navigation and content to load with increased timeouts
              await monitoringPage.waitForLoadState('networkidle', { timeout: 30000 });
              await monitoringPage.waitForLoadState('domcontentloaded', { timeout: 30000 });
              
              // Wait for key elements with increased timeout
              await monitoringPage.waitForSelector('dl', { state: 'visible', timeout: 30000 });
              
              // Additional wait for dynamic content
              await monitoringPage.waitForFunction(() => {
                const dts = document.querySelectorAll('dt');
                return Array.from(dts).some(dt => dt.textContent?.includes('注文ID'));
              }, { timeout: 30000 });

              // Extra wait to ensure all content is loaded
              await monitoringPage.waitForTimeout(2000);

              const orderDetails = await monitoringPage.evaluate(() => {
                const findValueByLabel = (labelText: string): string => {
                  // Try finding in dl/dt/dd structure
                  const dlElements = document.querySelectorAll('dl');
                  for (const dl of dlElements) {
                    const dt = dl.querySelector('dt');
                    const dd = dl.querySelector('dd');
                    if (dt?.textContent?.includes(labelText) && dd) {
                      return dd.textContent?.trim() || '';
                    }
                  }

                  // Try finding in table structure
                  const tables = document.querySelectorAll('table');
                  for (const table of tables) {
                    const rows = table.querySelectorAll('tr');
                    for (const row of rows) {
                      const cells = row.querySelectorAll('td, th');
                      for (const cell of cells) {
                        if (cell.textContent?.includes(labelText)) {
                          const nextCell = cell.nextElementSibling;
                          if (nextCell) {
                            return nextCell.textContent?.trim() || '';
                          }
                        }
                      }
                    }
                  }

                  // Try finding in dt/dd pairs
                  const allDts = document.querySelectorAll('dt');
                  for (const dt of allDts) {
                    if (dt.textContent?.includes(labelText)) {
                      const nextElement = dt.nextElementSibling;
                      if (nextElement?.tagName.toLowerCase() === 'dd') {
                        return nextElement.textContent?.trim() || '';
                      }
                    }
                  }

                  // Try finding in any element with specific text content
                  const elements = document.querySelectorAll('*');
                  for (const element of elements) {
                    if (element.textContent?.includes(labelText)) {
                      const parent = element.parentElement;
                      if (parent) {
                        return parent.textContent?.replace(labelText, '').trim() || '';
                      }
                    }
                  }

                  return '';
                };

                // Extract price information
                let total = 0;
                
                // First find the items section
                const itemsFieldset = Array.from(document.querySelectorAll('fieldset')).find(el => 
                  el.textContent?.includes('商品情報') || 
                  el.textContent?.includes('注文商品')
                );

                if (itemsFieldset) {
                  // Get all divs in the fieldset
                  const allDivs = Array.from(itemsFieldset.querySelectorAll('div'));
                  
                  // Look for the last occurrence of '合計'
                  for (let i = allDivs.length - 1; i >= 0; i--) {
                    const div = allDivs[i];
                    const text = div.textContent || '';
                    
                    if (text.includes('合計')) {
                      const match = text.match(/[¥￥]([0-9,]+)/);
                      if (match) {
                        total = parseInt(match[1].replace(/,/g, ''));
                        break;
                      }
                    }
                  }
                }
                
                // If still not found, try the old method as fallback
                if (total === 0) {
                  const elements = document.querySelectorAll('*');
                  for (const el of elements) {
                    if (el.textContent?.includes('合計')) {
                      const text = el.textContent;
                      const match = text.match(/[¥￥]([0-9,]+)/);
                      if (match) {
                        total = parseInt(match[1].replace(/,/g, ''));
                        break;
                      }
                    }
                  }
                }
                
                // Get items information
                let items = '';
                let hasUtensils = false;
                let notes = '';  // Add notes variable
                
                // Extract notes from 備考 fieldset
                const remarkFieldset = Array.from(document.querySelectorAll('fieldset')).find(el => 
                  el.textContent?.includes('備考')
                );
                
                if (remarkFieldset) {
                  const remarkContent = remarkFieldset.textContent || '';
                  notes = remarkContent.replace('備考', '').trim();
                }

                // If notes not found in fieldset, try finding in other elements
                if (!notes) {
                  const remarkElements = Array.from(document.querySelectorAll('*')).filter(el => 
                    el.textContent?.includes('備考')
                  );
                  
                  for (const el of remarkElements) {
                    const parent = el.parentElement;
                    if (parent && parent.textContent) {
                      notes = parent.textContent.replace('備考', '').trim();
                      if (notes) break;
                    }
                  }
                }

                // Try to find utensils in the order items table first
                const orderItemsTable = document.querySelector('table.orderItemList');
                if (orderItemsTable) {
                  const tableText = orderItemsTable.textContent || '';
                  if (tableText.includes('箸、スプーン、おしぼり等／Utensils') || 
                      tableText.includes('箸、スプーン、おしぼり等') ||
                      tableText.includes('Utensils')) {
                    hasUtensils = true;
                  }
                }

                // If not found in table, try all elements
                if (!hasUtensils) {
                  const allElements = document.querySelectorAll('*');
                  for (const el of allElements) {
                    const text = el.textContent || '';
                    if (text.includes('箸、スプーン、おしぼり等／Utensils') || 
                        text.includes('箸、スプーン、おしぼり等') ||
                        text.includes('Utensils')) {
                      hasUtensils = true;
                      break;
                    }
                  }
                }

                // Get the items information
                const itemsSection = Array.from(document.querySelectorAll('*')).find(el => 
                  el.textContent?.includes('商品情報') || 
                  el.textContent?.includes('注文商品')
                );
                
                if (itemsSection) {
                  // Get the parent container that might contain the items list
                  const container = itemsSection.closest('dl, div, section');
                  if (container) {
                    items = container.textContent || '';
                    // Clean up the text
                    items = items.replace('商品情報', '').replace('注文商品', '').trim();
                  }
                }

                // If not found, try the general search
                if (!items) {
                  items = findValueByLabel('商品情報') || findValueByLabel('注文商品') || '';
                }

                // If utensils were found, make sure they're included in the items text
                if (hasUtensils && !items.includes('箸、スプーン、おしぼり等／Utensils')) {
                  items = items + ' 箸、スプーン、おしぼり等／Utensils';
                }

                return {
                  orderId: findValueByLabel('注文ID'),
                  orderTime: findValueByLabel('注文日時'),
                  deliveryTime: findValueByLabel('配達/テイクアウト日時') || findValueByLabel('配達希望日時'),
                  paymentMethod: findValueByLabel('支払方法'),
                  visitCount: findValueByLabel('店舗利用回数'),
                  customerName: findValueByLabel('注文者氏名'),
                  customerPhone: findValueByLabel('注文者電話番号'),
                  receiptName: findValueByLabel('領収書宛名'),
                  waitingTime: findValueByLabel('受付時の待ち時間'),
                  address: findValueByLabel('配達先住所'),
                  items: items,
                  totalAmount: total,
                  status,
                  notes: notes  // Add notes to the returned object
                };
              });

              if (orderDetails.orderId) {
                processedOrderIds.add(orderDetails.orderId);
                console.log('Processing order:', orderDetails.orderId);
                onNewOrders([orderDetails]);
                orderProcessed = true;

                // Wait before navigating back
                await monitoringPage.waitForTimeout(2000);
              }

              // Return to order list with retries and increased timeouts
              let navRetryCount = 0;
              while (navRetryCount < 3) {
                try {
                  await monitoringPage.goto('https://partner.demae-can.com/merchant-admin/order/order-list', {
                    waitUntil: 'networkidle',
                    timeout: 30000
                  });
                  
                  // Wait for the order list page to load completely
                  await monitoringPage.waitForLoadState('domcontentloaded', { timeout: 30000 });
                  await monitoringPage.waitForTimeout(2000);
                  
                  // Verify we're actually on the order list page
                  const currentUrl = await monitoringPage.evaluate(() => window.location.href);
                  if (currentUrl.includes('order-list')) {
                    break;
                  }
                  throw new Error('Navigation did not reach order list page');
                } catch (navError) {
                  console.error(`Navigation retry ${navRetryCount + 1} failed:`, navError);
                  navRetryCount++;
                  if (navRetryCount < 3) {
                    await monitoringPage.waitForTimeout(3000);
                  }
                }
              }
            } catch (error) {
              console.error(`Error processing order (attempt ${retryCount + 1}):`, orderId, error);
              retryCount++;
              if (retryCount < 3) {
                await monitoringPage.waitForTimeout(3000);
              }
            }
          }
        }

        // If no new orders were found, wait longer before next check
        if (!foundNewOrders) {
          console.log('No new orders found, waiting...');
          await monitoringPage.waitForTimeout(5000);
        }

        // Verify page is still connected before refreshing
        try {
          const currentUrl = await monitoringPage.evaluate(() => window.location.href);
          if (currentUrl.includes('order-list')) {
            try {
              // Wait before refreshing
              await monitoringPage.waitForTimeout(2000);
              await monitoringPage.reload({ waitUntil: 'networkidle', timeout: 30000 });
              // Wait after refreshing
              await monitoringPage.waitForTimeout(2000);
            } catch (error) {
              console.error('Error refreshing page:', error);
              // Don't throw, just continue to next iteration
            }
          }
        } catch (error) {
          console.error('Error checking page URL:', error);
          // Don't throw, just continue to next iteration
          continue;
        }

      } catch (error) {
        console.error('Error in monitoring loop:', error);
        consecutiveErrors++;
        
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error(`Too many consecutive errors (${consecutiveErrors}), attempting full restart...`);
          try {
            // Close existing browser if it exists
            if (monitoringBrowser?.isConnected()) {
              await monitoringBrowser.close();
            }
            
            // Create new browser and page
            monitoringBrowser = await chromium.launch({ 
              headless: false,
              slowMo: 200
            });
            monitoringPage = await monitoringBrowser.newPage();
            
            // Log in again
            await monitoringPage.goto('https://partner.demae-can.com/merchant-admin/login', { waitUntil: 'networkidle' });
            await monitoringPage.click('button:has-text("メールアドレス")');
            const emailLoginForm = monitoringPage.locator('div').filter({ hasText: /^メールアドレスパスワード$/ });
            await emailLoginForm.locator('input[type="email"]').fill(email);
            await emailLoginForm.locator('input[type="password"]').fill(password);
            await monitoringPage.click('button:has-text("ログイン")');
            await monitoringPage.waitForNavigation({ waitUntil: 'networkidle' });
            
            consecutiveErrors = 0;
            console.log('Successfully performed full restart');
          } catch (restartError) {
            console.error('Failed to perform full restart:', restartError);
          }
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
    }

    // Only stop monitoring if explicitly requested via stopOrderMonitoring()
    if (!isMonitoringActive) {
      console.log('Monitoring was explicitly stopped');
      await stopOrderMonitoring();
      return { success: false, monitoring: false, existing: false };
    }

    return { success: true, monitoring: true, existing: false };
  } catch (error) {
    console.error('Error in startOrderMonitoring:', error);
    await stopOrderMonitoring();
    return { success: false, monitoring: false, existing: false };
  }
}

export async function stopOrderMonitoring() {
  try {
    // Set monitoring as inactive first
    isMonitoringActive = false;
    // Clear processed orders set
    processedOrderIds.clear();

    // Close page if it exists and is not closed
    if (monitoringPage && !monitoringPage.isClosed()) {
      try {
        await monitoringPage.close();
      } catch (error) {
        console.error('Error closing page:', error);
      }
    }

    // Close browser if it exists and is connected
    if (monitoringBrowser && monitoringBrowser.isConnected()) {
      try {
        // Close all contexts first
        const contexts = monitoringBrowser.contexts();
        for (const context of contexts) {
          await context.close();
        }
        await monitoringBrowser.close();
      } catch (error) {
        console.error('Error closing browser:', error);
      }
    }
  } catch (error) {
    console.error('Error in stopOrderMonitoring:', error);
  } finally {
    // Always reset the state variables
    monitoringPage = null;
    monitoringBrowser = null;
    isMonitoringActive = false;
    processedOrderIds.clear();
  }
}

export async function scrapeOrders(email: string, password: string) {
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 200
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Login process
    await page.goto('https://partner.demae-can.com/merchant-admin/login', { waitUntil: 'networkidle' });
    await page.click('button:has-text("メールアドレス")');
    const emailLoginForm = page.locator('div').filter({ hasText: /^メールアドレスパスワード$/ });
    await emailLoginForm.locator('input[type="email"]').fill(email);
    await emailLoginForm.locator('input[type="password"]').fill(password);
    await page.click('button:has-text("ログイン")');
    await page.waitForNavigation({ waitUntil: 'networkidle' });

    // Check for login errors
    const errorElement = await page.$('text=/Error|Invalid|失敗/i');
    if (errorElement) {
      const errorText = await errorElement.textContent();
      throw new Error(`Login failed: ${errorText}`);
    }

    const detailedOrders: DetailedOrder[] = [];

    // Function to navigate to orders page and wait for table
    async function goToOrderList() {
      await page.goto('https://partner.demae-can.com/merchant-admin/order/order-list', {
        waitUntil: 'networkidle'
      });
      
      console.log('Waiting for order list page to load...');
      // Wait for either the table or the no-orders message with improved selectors
      try {
        await Promise.race([
          page.waitForSelector('table:has(tr:has(td:has-text("注文ID/受取用番号"))), table:has(tr:has(th:has-text("注文ID/受取用番号"))), table[role="grid"]', { timeout: 5000 }),
          page.waitForSelector('text=/注文がありません|No orders found/', { timeout: 5000 })
        ]);
      } catch {
        console.log('Neither table nor no-orders message found');
        throw new Error('No orders');
      }
    }

    // Initial navigation to orders page
    await goToOrderList();
    
    // Check if there are any orders with improved selectors
    const hasOrders = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      console.log(`Found ${tables.length} tables on page`);
      
      const table = document.querySelector('table:has(tr:has(td:has-text("注文ID/受取用番号")))') || 
                    document.querySelector('table:has(tr:has(th:has-text("注文ID/受取用番号")))') ||
                    document.querySelector('table[role="grid"]') ||
                    Array.from(tables).find(table => {
                      const headerText = table.textContent || '';
                      return headerText.includes('注文ID/受取用番号') || headerText.includes('注文ID');
                    });
      
      if (table) {
        console.log('Found order table with content:', table.textContent);
      } else {
        console.log('No order table found');
      }
      
      return !!table;
    });

    if (!hasOrders) {
      await browser.close();
      return { 
        success: true, 
        orders: [] 
      };
    }
    
    // Get all rows and their data with improved selection
    const orderRows = await page.evaluate(() => {
      const table = document.querySelector('table:has(tr:has(td:nth-child(1):has-text("注文ID/受取用番号")))') || 
                    document.querySelector('table:has(tr:has(th:has-text("注文ID/受取用番号")))') ||
                    document.querySelector('table[role="grid"]') ||
                    Array.from(document.querySelectorAll('table')).find(table => 
                      table.textContent?.includes('注文ID/受取用番号') && 
                      table.textContent?.includes('注文日時')
                    );
      if (!table) return [];
      
      const tbody = table.querySelector('tbody') || table;
      const rows = Array.from(tbody.querySelectorAll('tr'));
      
      return rows
        .filter(row => {
          const cells = row.querySelectorAll('td');
          const firstCell = cells[0]?.textContent?.trim();
          return cells.length >= 3 && firstCell && !firstCell.includes('注文ID');
        })
        .map(row => ({
          status: row.querySelectorAll('td')[2]?.textContent?.trim() || '',
          index: Array.from(tbody.children).indexOf(row)
      }));
    });

    // Process each row
    for (const { status, index } of orderRows) {
      try {
        // Make sure we're on the order list page
        const isOnOrderList = await page.$('table[role="grid"], table:has(tr:has(td:nth-child(1):has-text("注文ID")))');
        if (!isOnOrderList) {
          await goToOrderList();
        }

        // Get fresh reference to the row and click it
        const currentRow = await page.locator('table[role="grid"] tbody tr, table:has(tr:has(td:nth-child(1):has-text("注文ID"))) tbody tr').nth(index);
        await currentRow.click();
        
        // Wait for navigation and details to load with multiple checks
        await page.waitForLoadState('networkidle');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForSelector('dl', { state: 'visible', timeout: 15000 });
        
        // Wait for order ID to be present
        await page.waitForFunction(() => {
          const dts = document.querySelectorAll('dt');
          return Array.from(dts).some(dt => dt.textContent?.includes('注文ID'));
        }, { timeout: 15000 });

        // Additional wait to ensure all elements are loaded
        await page.waitForTimeout(2000);

        // Get order details
        const orderDetails = await page.evaluate(() => {
          const findValueByLabel = (labelText: string): string => {
            // Try finding in dl/dt/dd structure
            const dlElements = document.querySelectorAll('dl');
            for (const dl of dlElements) {
              const dt = dl.querySelector('dt');
              const dd = dl.querySelector('dd');
              if (dt?.textContent?.includes(labelText) && dd) {
                return dd.textContent?.trim() || '';
              }
            }

            // Try finding in table structure
            const tables = document.querySelectorAll('table');
            for (const table of tables) {
              const rows = table.querySelectorAll('tr');
              for (const row of rows) {
                const cells = row.querySelectorAll('td, th');
                for (const cell of cells) {
                  if (cell.textContent?.includes(labelText)) {
                    const nextCell = cell.nextElementSibling;
                    if (nextCell) {
                      return nextCell.textContent?.trim() || '';
                    }
                  }
                }
              }
            }

            // Try finding in dt/dd pairs
            const allDts = document.querySelectorAll('dt');
            for (const dt of allDts) {
              if (dt.textContent?.includes(labelText)) {
                const nextElement = dt.nextElementSibling;
                if (nextElement?.tagName.toLowerCase() === 'dd') {
                  return nextElement.textContent?.trim() || '';
                }
              }
            }

            // Try finding in any element with specific text content
            const elements = document.querySelectorAll('*');
            for (const element of elements) {
              if (element.textContent?.includes(labelText)) {
                const parent = element.parentElement;
                if (parent) {
                  return parent.textContent?.replace(labelText, '').trim() || '';
                }
              }
            }

            return '';
          };

          // Extract price information
          let total = 0;
          
          // First find the items section
          const itemsFieldset = Array.from(document.querySelectorAll('fieldset')).find(el => 
            el.textContent?.includes('商品情報') || 
            el.textContent?.includes('注文商品')
          );

          if (itemsFieldset) {
            // Get all divs in the fieldset
            const allDivs = Array.from(itemsFieldset.querySelectorAll('div'));
            
            // Look for the last occurrence of '合計'
            for (let i = allDivs.length - 1; i >= 0; i--) {
              const div = allDivs[i];
              const text = div.textContent || '';
              
              if (text.includes('合計')) {
                const match = text.match(/[¥￥]([0-9,]+)/);
                if (match) {
                  total = parseInt(match[1].replace(/,/g, ''));
                  break;
                }
              }
            }
          }
          
          // If still not found, try the old method as fallback
          if (total === 0) {
            const elements = document.querySelectorAll('*');
            for (const el of elements) {
              if (el.textContent?.includes('合計')) {
                const text = el.textContent;
                const match = text.match(/[¥￥]([0-9,]+)/);
                if (match) {
                  total = parseInt(match[1].replace(/,/g, ''));
                  break;
                }
              }
            }
          }
          
          // Get items information
          let items = '';
          let hasUtensils = false;
          let notes = '';  // Add notes variable
          
          // Extract notes from 備考 fieldset
          const remarkFieldset = Array.from(document.querySelectorAll('fieldset')).find(el => 
            el.textContent?.includes('備考')
          );
          
          if (remarkFieldset) {
            const remarkContent = remarkFieldset.textContent || '';
            notes = remarkContent.replace('備考', '').trim();
          }

          // If notes not found in fieldset, try finding in other elements
          if (!notes) {
            const remarkElements = Array.from(document.querySelectorAll('*')).filter(el => 
              el.textContent?.includes('備考')
            );
            
            for (const el of remarkElements) {
              const parent = el.parentElement;
              if (parent && parent.textContent) {
                notes = parent.textContent.replace('備考', '').trim();
                if (notes) break;
              }
            }
          }

          // Try to find utensils in the order items table first
          const orderItemsTable = document.querySelector('table.orderItemList');
          if (orderItemsTable) {
            const tableText = orderItemsTable.textContent || '';
            if (tableText.includes('箸、スプーン、おしぼり等／Utensils') || 
                tableText.includes('箸、スプーン、おしぼり等') ||
                tableText.includes('Utensils')) {
              hasUtensils = true;
            }
          }

          // If not found in table, try all elements
          if (!hasUtensils) {
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
              const text = el.textContent || '';
              if (text.includes('箸、スプーン、おしぼり等／Utensils') || 
                  text.includes('箸、スプーン、おしぼり等') ||
                  text.includes('Utensils')) {
                hasUtensils = true;
                break;
              }
            }
          }

          // Get the items information
          const itemsSection = Array.from(document.querySelectorAll('*')).find(el => 
            el.textContent?.includes('商品情報') || 
            el.textContent?.includes('注文商品')
          );
          
          if (itemsSection) {
            // Get the parent container that might contain the items list
            const container = itemsSection.closest('dl, div, section');
            if (container) {
              items = container.textContent || '';
              // Clean up the text
              items = items.replace('商品情報', '').replace('注文商品', '').trim();
            }
          }

          // If not found, try the general search
          if (!items) {
            items = findValueByLabel('商品情報') || findValueByLabel('注文商品') || '';
          }

          // If utensils were found, make sure they're included in the items text
          if (hasUtensils && !items.includes('箸、スプーン、おしぼり等／Utensils')) {
            items = items + ' 箸、スプーン、おしぼり等／Utensils';
          }

          return {
            orderId: findValueByLabel('注文ID'),
            orderTime: findValueByLabel('注文日時'),
            deliveryTime: findValueByLabel('配達/テイクアウト日時') || findValueByLabel('配達希望日時'),
            paymentMethod: findValueByLabel('支払方法'),
            visitCount: findValueByLabel('店舗利用回数'),
            customerName: findValueByLabel('注文者氏名'),
            customerPhone: findValueByLabel('注文者電話番号'),
            receiptName: findValueByLabel('領収書宛名'),
            waitingTime: findValueByLabel('受付時の待ち時間'),
            address: findValueByLabel('配達先住所'),
            items: items,
            totalAmount: total,
            status,
            notes: notes  // Add notes to the returned object
          };
        });

        if (!orderDetails.orderId || orderDetails.orderId === '-') {
          await goToOrderList();
          continue;
        }

        detailedOrders.push({
          ...orderDetails,
        });

        // Go back to the order list
        await goToOrderList();

      } catch {
        await goToOrderList();
        continue;
      }
    }

    await browser.close();
    
    if (detailedOrders.length === 0) {
      return { 
        success: false, 
        error: 'No orders found. Please verify you have access to view orders.' 
      };
    }

    return { success: true, orders: detailedOrders };
  } catch (error) {
    if (browser) await browser.close();
    return { 
      success: false, 
      error: `Failed to fetch orders: ${(error as Error).message}` 
    };
  }
} 