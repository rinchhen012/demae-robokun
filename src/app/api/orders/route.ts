import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { scrapeOrders } from '@/utils/scraper';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const orders = await prisma.order.findMany({
      orderBy: {
        orderTime: 'desc',
      },
    });

    return NextResponse.json({ success: true, orders });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch orders' },
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
          subtotal: order.priceInfo.subtotal,
          deliveryFee: order.priceInfo.deliveryFee,
          totalAmount: order.priceInfo.total,
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
          subtotal: order.priceInfo.subtotal,
          deliveryFee: order.priceInfo.deliveryFee,
          totalAmount: order.priceInfo.total,
          receiptName: order.receiptName,
          waitingTime: order.waitingTime,
          address: order.address,
        },
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