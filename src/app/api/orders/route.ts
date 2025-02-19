import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { scrapeOrders, startOrderMonitoring, stopOrderMonitoring, isMonitoringActive, getMonitoringStatus } from '@/utils/scraper';

// Create a single PrismaClient instance and reuse it
const prisma = new PrismaClient();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const checkMonitoring = url.searchParams.get('checkMonitoring');

  if (checkMonitoring === 'true') {
    try {
      // Use the exported function to check monitoring status
      const monitoringStatus = await getMonitoringStatus();
      return NextResponse.json({ 
        success: true, 
        monitoring: monitoringStatus
      });
    } catch (error) {
      console.error('Error checking monitoring status:', error);
      return NextResponse.json({ 
        success: false, 
        monitoring: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Original GET endpoint for orders
  try {
    // Ensure database connection
    await prisma.$connect();

    console.log('Fetching orders from database...');
    const orders = await prisma.order.findMany({
      where: {
        isActive: true
      },
      orderBy: {
        orderTime: 'desc',
      },
    });
    console.log(`Found ${orders.length} orders in database`);

    // Map database fields to frontend fields
    const mappedOrders = orders.map(order => ({
      ...order,
      orderTime: order.orderTime.toISOString()
    }));

    // Properly close the connection
    await prisma.$disconnect();

    console.log('Sending orders to frontend:', mappedOrders);
    return NextResponse.json({ success: true, orders: mappedOrders });
  } catch (error) {
    // Ensure connection is closed even if there's an error
    await prisma.$disconnect();
    
    console.error('Error fetching orders:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch orders',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { email, password, startMonitoring } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Connect to database
    await prisma.$connect();

    // If monitoring is requested
    if (startMonitoring) {
      console.log('Starting monitoring...');
      try {
        // Clear existing orders first
        console.log('Clearing existing orders...');
        const deleteResult = await prisma.order.deleteMany({});
        console.log('Cleared orders:', deleteResult);
        
        const result = await startOrderMonitoring(email, password, async (newOrders) => {
          try {
            console.log('Received new orders to store:', newOrders);
            // Store new orders in the database
            for (const order of newOrders) {
              try {
                // Check if order already exists
                const existingOrder = await prisma.order.findUnique({
                  where: { orderId: order.orderId }
                });

                if (!existingOrder) {
                  console.log('Creating new order in database:', order.orderId);
                  // Create new order if it doesn't exist
                  const createdOrder = await prisma.order.create({
                    data: {
                      orderId: order.orderId,
                      orderTime: new Date(order.orderTime),
                      deliveryTime: order.deliveryTime,
                      paymentMethod: order.paymentMethod,
                      visitCount: order.visitCount,
                      customerName: order.customerName,
                      customerPhone: order.customerPhone,
                      status: order.status,
                      items: order.items || '',
                      totalAmount: order.totalAmount,
                      receiptName: order.receiptName,
                      waitingTime: order.waitingTime,
                      address: order.address,
                      isDelivered: false,
                      isActive: true,
                      notes: order.notes || ''
                    },
                  });
                  console.log('Order created successfully:', createdOrder);
                } else {
                  console.log('Order already exists in database:', order.orderId);
                  // Update existing order's status if needed
                  if (existingOrder.status !== order.status) {
                    await prisma.order.update({
                      where: { orderId: order.orderId },
                      data: { status: order.status }
                    });
                  }
                }
              } catch (orderError) {
                console.error('Error processing individual order:', order.orderId, orderError);
              }
            }
          } catch (error) {
            console.error('Error storing new orders:', error);
            throw error;
          }
        });

        await prisma.$disconnect();
        console.log('Monitoring started successfully');
        return NextResponse.json({ 
          success: true, 
          monitoring: true,
          existing: result.existing 
        });
      } catch (error) {
        console.error('Failed to start monitoring:', error);
        await prisma.$disconnect();
        return NextResponse.json(
          { success: false, error: 'Failed to start monitoring' },
          { status: 500 }
        );
      }
    }

    // Regular order fetching logic (when startMonitoring is false)
    console.log('Fetching orders without monitoring...');
    try {
      await prisma.order.deleteMany({});
      const result = await scrapeOrders(email, password);

      if (!result.success || !result.orders) {
        console.error('Failed to fetch orders:', result.error);
        await prisma.$disconnect();
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        );
      }

      console.log('Storing fetched orders:', result.orders);
      // Store new orders in the database
      for (const order of result.orders) {
        const createdOrder = await prisma.order.create({
          data: {
            orderId: order.orderId,
            orderTime: new Date(order.orderTime),
            deliveryTime: order.deliveryTime,
            paymentMethod: order.paymentMethod,
            visitCount: order.visitCount,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            status: order.status,
            items: order.items || '',
            totalAmount: order.totalAmount,
            receiptName: order.receiptName,
            waitingTime: order.waitingTime,
            address: order.address,
            isDelivered: false,
            isActive: true,
            notes: order.notes || ''
          },
        });
        console.log('Created order:', createdOrder);
      }

      await prisma.$disconnect();
      console.log('Orders stored successfully');
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Error in regular order fetching:', error);
      await prisma.$disconnect();
      return NextResponse.json(
        { success: false, error: 'Failed to process orders' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in POST endpoint:', error);
    await prisma.$disconnect();
    return NextResponse.json(
      { success: false, error: 'Failed to process orders' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { orderId, isDelivered, isActive } = await request.json();

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'Order ID is required' },
        { status: 400 }
      );
    }

    await prisma.order.update({
      where: { orderId },
      data: {
        isDelivered,
        isActive,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating order:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update order' },
      { status: 500 }
    );
  }
}

// Add new endpoint to stop monitoring
export async function DELETE(request: Request) {
  try {
    await stopOrderMonitoring();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error stopping monitoring:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to stop monitoring' },
      { status: 500 }
    );
  }
} 