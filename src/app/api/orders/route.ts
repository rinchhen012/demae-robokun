import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { scrapeOrders } from '@/utils/scraper';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const orders = await prisma.order.findMany({
      orderBy: { orderTime: 'desc' },
      select: {
        id: true,
        orderId: true,
        orderTime: true,
        deliveryTime: true,
        paymentMethod: true,
        visitCount: true,
        customerName: true,
        customerPhone: true,
        status: true,
        items: true,
        subtotal: true,
        deliveryFee: true,
        totalAmount: true,
        isDelivered: true,
        isActive: true,
        receiptName: true,
        waitingTime: true
      }
    });

    return NextResponse.json({ success: true, orders });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch orders from database' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const result = await scrapeOrders(email, password);
    
    if (!result.success || !result.orders) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to fetch orders' },
        { status: 400 }
      );
    }

    for (const order of result.orders) {
      await prisma.order.upsert({
        where: { orderId: order.orderId },
        update: {
          orderTime: new Date(order.orderTime),
          status: order.status,
          deliveryTime: order.deliveryTime,
          paymentMethod: order.paymentMethod,
          visitCount: order.visitCount,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          subtotal: order.priceInfo.subtotal,
          deliveryFee: order.priceInfo.deliveryFee,
          totalAmount: order.priceInfo.total,
          receiptName: order.receiptName,
          waitingTime: order.waitingTime
        },
        create: {
          orderId: order.orderId,
          orderTime: new Date(order.orderTime),
          status: order.status,
          deliveryTime: order.deliveryTime,
          paymentMethod: order.paymentMethod,
          visitCount: order.visitCount,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          items: '',
          subtotal: order.priceInfo.subtotal,
          deliveryFee: order.priceInfo.deliveryFee,
          totalAmount: order.priceInfo.total,
          receiptName: order.receiptName,
          waitingTime: order.waitingTime
        },
      });
    }

    return NextResponse.json({ success: true, orders: result.orders });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
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

    const order = await prisma.order.update({
      where: { orderId },
      data: { isDelivered, isActive },
    });
    
    return NextResponse.json({ success: true, order });
  } catch (error) {
    console.error('Update error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update order status' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
} 