import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { scrapeOrders } from '@/utils/scraper';

// Create a single PrismaClient instance and reuse it
const prisma = new PrismaClient();

export async function GET() {
  try {
    // Ensure database connection
    await prisma.$connect();

    const orders = await prisma.order.findMany({
      orderBy: {
        orderTime: 'desc',
      },
    });

    console.log('Orders from database:', orders.map(order => ({
      orderId: order.orderId,
      price: order.priceInfo
    })));

    // Map database fields to frontend fields
    const mappedOrders = orders.map(order => ({
      ...order,
      orderTime: order.orderTime.toISOString()
    }));

    // Properly close the connection
    await prisma.$disconnect();

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
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const result = await scrapeOrders(email, password);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    // Update or create orders in the database
    for (const order of result.orders) {
      console.log('Processing order:', {
        orderId: order.orderId,
        price: order.priceInfo
      });
      
      await prisma.order.upsert({
        where: { orderId: order.orderId },
        update: {
          orderTime: new Date(order.orderTime),
          deliveryTime: order.deliveryTime,
          paymentMethod: order.paymentMethod,
          visitCount: order.visitCount,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          status: order.status,
          items: order.items || '',
          priceInfo: order.priceInfo,
          receiptName: order.receiptName,
          waitingTime: order.waitingTime,
          address: order.address,
        },
        create: {
          orderId: order.orderId,
          orderTime: new Date(order.orderTime),
          deliveryTime: order.deliveryTime,
          paymentMethod: order.paymentMethod,
          visitCount: order.visitCount,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          status: order.status,
          items: order.items || '',
          priceInfo: order.priceInfo,
          receiptName: order.receiptName,
          waitingTime: order.waitingTime,
          address: order.address,
        },
      });

      // Verify the saved data
      const savedOrder = await prisma.order.findUnique({
        where: { orderId: order.orderId },
      });
      console.log('Saved order:', {
        orderId: savedOrder?.orderId,
        price: savedOrder?.priceInfo
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing orders:', error);
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