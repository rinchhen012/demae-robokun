import { chromium } from 'playwright';

interface DetailedOrder {
  orderId: string;
  orderTime: string;
  status: string;
  priceInfo: {
    subtotal: number;
    deliveryFee: number;
    total: number;
  };
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
      await page.waitForSelector('.Table_table__RdwIW', { 
        state: 'visible', 
        timeout: 15000 
      });
    }

    // Initial navigation to orders page
    await goToOrderList();
    
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
          // Log all text content from the page for debugging
          const allText = Array.from(document.querySelectorAll('*'))
            .map(el => el.textContent?.trim())
            .filter(text => text && text.length > 0);
          console.log('All text content on page:', allText);

          // Specifically look for elements containing "Utensils" or "箸"
          const utensilElements = Array.from(document.querySelectorAll('*'))
            .filter(el => el.textContent?.includes('Utensils') || el.textContent?.includes('箸'));
          console.log('Elements containing utensils:', utensilElements.map(el => el.textContent));

          // Try to find the specific table containing order items
          const orderTable = document.querySelector('table.orderItemList');
          if (orderTable) {
            console.log('Order items table found:', orderTable.textContent);
          }

          const findValueByLabel = (labelText: string): string => {
            // Try finding in dl/dt/dd structure
            const dlElements = document.querySelectorAll('dl');
            for (const dl of dlElements) {
              const dt = dl.querySelector('dt');
              const dd = dl.querySelector('dd');
              if (dt?.textContent?.includes(labelText) && dd) {
                const value = dd.textContent?.trim() || '';
                console.log(`Found ${labelText}:`, value);
                return value;
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
                      const value = nextCell.textContent?.trim() || '';
                      console.log(`Found ${labelText} in table:`, value);
                      return value;
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
                  const value = nextElement.textContent?.trim() || '';
                  console.log(`Found ${labelText} (in dt/dd):`, value);
                  return value;
                }
              }
            }

            // Try finding in any element with specific text content
            const elements = document.querySelectorAll('*');
            for (const element of elements) {
              if (element.textContent?.includes(labelText)) {
                const parent = element.parentElement;
                if (parent) {
                  const value = parent.textContent?.replace(labelText, '').trim() || '';
                  console.log(`Found ${labelText} in general element:`, value);
                  return value;
                }
              }
            }

            console.log(`Could not find ${labelText}`);
            return '';
          };

          // Extract price information with logging
          const priceText = findValueByLabel('商品代金合計（税込）');
          console.log('Raw price text:', priceText);
          
          // More flexible price matching
          const priceMatch = priceText.match(/[¥￥]([0-9,]+)/);
          console.log('Price match:', priceMatch);
          
          const total = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : 0;
          console.log('Parsed total:', total);

          // For debugging, let's log all dt elements
          const allDts = Array.from(document.querySelectorAll('dt')).map(dt => dt.textContent?.trim());
          console.log('All dt elements:', allDts);

          // Get items information with more specific selectors and logging
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
              console.log('Found utensils in order items table:', tableText);
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
                console.log('Found utensils text in element:', text);
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
              console.log('Found items section:', items);
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

          console.log('Final items information:', items);
          console.log('Has utensils?', hasUtensils);
          console.log('Raw items text:', items);

          const details = {
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
            priceInfo: {
              subtotal: 0,
              deliveryFee: 0,
              total: total
            }
          };

          console.log('Extracted order details:', details);
          return details;
        });

        if (!orderDetails.orderId || orderDetails.orderId === '-') {
          console.log('Invalid or missing order ID, skipping...');
          await goToOrderList();
          continue;
        }

        detailedOrders.push({
          ...orderDetails,
          status,
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