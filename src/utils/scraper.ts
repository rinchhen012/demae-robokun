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
}

let monitoringBrowser: Browser | null = null;
let monitoringPage: Page | null = null;
let isMonitoringActive = false;

export async function startOrderMonitoring(email: string, password: string, onNewOrders: (orders: DetailedOrder[]) => void) {
  isMonitoringActive = true;
  
  // If there's an existing browser session, try to reuse it
  if (monitoringBrowser && monitoringPage) {
    try {
      // Check if the page is still accessible
      await monitoringPage.evaluate(() => document.title);
      await monitoringPage.bringToFront();
      return { success: true, monitoring: true, existing: true };
    } catch {
      // Only cleanup if we can't access the page
      await stopOrderMonitoring();
    }
  }

  try {
    // Launch new browser if we don't have one
    if (!monitoringBrowser) {
      monitoringBrowser = await chromium.launch({ 
        headless: false,
        slowMo: 200
      });
    }

    // Create new page if we don't have one
    if (!monitoringPage) {
      monitoringPage = await monitoringBrowser.newPage();
    }

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

    const knownOrderIds = new Set<string>();

    // Start monitoring loop
    while (monitoringBrowser && monitoringPage && isMonitoringActive) {
      try {
        // Check if browser or page is closed
        if (!monitoringBrowser || !monitoringPage || monitoringPage.isClosed()) {
          throw new Error('Browser or page is closed');
        }

        await monitoringPage.goto('https://partner.demae-can.com/merchant-admin/order/order-list', {
          waitUntil: 'networkidle',
          timeout: 30000 // Increase timeout to 30 seconds
        });

        // Wait for either the table or the no-orders message
        try {
          await Promise.race([
            monitoringPage.waitForSelector('.Table_table__RdwIW', { timeout: 5000 }),
            monitoringPage.waitForSelector('text=/注文がありません|No orders found/', { timeout: 5000 })
          ]);
        } catch {
          // If neither is found after timeout, just wait and continue
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }

        // Check if there are any orders
        const hasOrders = await monitoringPage.$('.Table_table__RdwIW');
        if (!hasOrders) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before next check
          continue;
        }

        // Get all order IDs from the current page
        const currentOrders = await monitoringPage.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('.Table_table__RdwIW tbody tr'));
          return rows.map(row => ({
            orderId: row.querySelector('td:nth-child(1)')?.textContent?.trim() || '',
            status: row.querySelector('td:nth-child(3)')?.textContent?.trim() || '',
            index: Array.from(row.parentElement?.children || []).indexOf(row)
          }));
        });

        // Filter new orders
        const newOrders = currentOrders.filter(order => !knownOrderIds.has(order.orderId));

        if (newOrders.length > 0) {
          const detailedOrders: DetailedOrder[] = [];

          // Process each new order
          for (const { status, index } of newOrders) {
            try {
              // Click on the order row
              await monitoringPage.locator('.Table_table__RdwIW tbody tr').nth(index).click();
              await monitoringPage.waitForLoadState('networkidle');
              await monitoringPage.waitForSelector('dl', { state: 'visible', timeout: 15000 });

              // Get order details using the existing evaluation logic
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
                  status
                };
              });

              if (orderDetails.orderId && orderDetails.orderId !== '-') {
                detailedOrders.push({
                  ...orderDetails,
                });
              }

              // Go back to the order list
              await monitoringPage.goto('https://partner.demae-can.com/merchant-admin/order/order-list', {
                waitUntil: 'networkidle'
              });
            } catch {
              continue;
            }
          }

          // Update known order IDs
          detailedOrders.forEach(order => knownOrderIds.add(order.orderId));

          // Notify about new orders
          if (detailedOrders.length > 0) {
            onNewOrders(detailedOrders);
          }
        }

        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds interval

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Only restart if the browser or page is actually closed
        if ((!monitoringBrowser || !monitoringPage || monitoringPage.isClosed()) &&
            (errorMessage.includes('Target closed') || 
             errorMessage.includes('Browser or page is closed') ||
             errorMessage.includes('Target page, context or browser has been closed'))) {
          console.error('Browser closed, attempting to restart monitoring');
          await stopOrderMonitoring();
          return startOrderMonitoring(email, password, onNewOrders);
        }
        
        // For other errors, just log and continue monitoring
        console.error('Error during order monitoring:', error);
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Try to recover by going back to the order list
        try {
          if (monitoringPage && !monitoringPage.isClosed()) {
            await monitoringPage.goto('https://partner.demae-can.com/merchant-admin/order/order-list', {
              waitUntil: 'networkidle',
              timeout: 30000
            });
          }
        } catch (navigationError) {
          console.error('Failed to recover from error:', navigationError);
        }
      }
    }

    return { success: true, monitoring: true, existing: false };
  } catch (error) {
    await stopOrderMonitoring();
    throw error;
  }
}

export async function stopOrderMonitoring() {
  isMonitoringActive = false;
  
  try {
    if (monitoringPage && !monitoringPage.isClosed()) {
      await monitoringPage.close().catch(() => {});
    }
    if (monitoringBrowser) {
      await monitoringBrowser.close().catch(() => {});
    }
  } catch (error: unknown) {
    console.error('Error while stopping monitoring:', error);
  } finally {
    monitoringBrowser = null;
    monitoringPage = null;
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
      
      // Wait for either the table or the no-orders message
      try {
        await Promise.race([
          page.waitForSelector('.Table_table__RdwIW', { timeout: 5000 }),
          page.waitForSelector('text=/注文がありません|No orders found/', { timeout: 5000 })
        ]);
      } catch {
        // If neither is found after timeout, throw error
        throw new Error('No orders');
      }
    }

    // Initial navigation to orders page
    await goToOrderList();
    
    // Check if there are any orders
    const hasOrders = await page.$('.Table_table__RdwIW');
    if (!hasOrders) {
      await browser.close();
      return { 
        success: true, 
        orders: [] 
      };
    }
    
    // Get all rows and their data
    const orderRows = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.Table_table__RdwIW tbody tr'));
      return rows.map(row => ({
        status: row.querySelector('td:nth-child(3)')?.textContent?.trim() || '',
        index: Array.from(row.parentElement?.children || []).indexOf(row)
      }));
    });

    // Process each row
    for (const { status, index } of orderRows) {
      try {
        // Make sure we're on the order list page
        const isOnOrderList = await page.$('.Table_table__RdwIW');
        if (!isOnOrderList) {
          await goToOrderList();
        }

        // Get fresh reference to the row and click it
        const currentRow = await page.locator('.Table_table__RdwIW tbody tr').nth(index);
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
            status
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