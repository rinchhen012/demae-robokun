'use client';

import { useState, useEffect } from 'react';
import toast, { Toaster } from 'react-hot-toast';

interface Order {
  id?: string;
  orderId: string;
  orderTime: string;
  deliveryTime: string;
  paymentMethod: string;
  receiptName: string;
  visitCount: string;
  customerName: string;
  customerPhone: string;
  waitingTime: string;
  priceInfo: {
    subtotal: number;
    deliveryFee: number;
    total: number;
  };
  status: string;
  items: string;
  isDelivered?: boolean;
  isActive?: boolean;
  address: string;
}

// Add ClientDate component
const ClientDate = () => {
  const [date, setDate] = useState('');

  useEffect(() => {
    setDate(`${new Date().toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })} ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}`);
  }, []);

  return (
    <span className="text-sm text-gray-600">
      {date}
    </span>
  );
};

export default function Home() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'delivered'>('active');

  const filteredOrders = orders.filter(order => {
    switch (activeTab) {
      case 'active':
        return !order.isDelivered;
      case 'delivered':
        return order.isDelivered;
      default:
        return true;
    }
  });

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await fetch('/api/orders');
      const data = await response.json();
      if (data.success) {
        setOrders(data.orders);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to fetch orders');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success('Orders fetched successfully');
        fetchOrders();
      } else {
        toast.error(data.error || 'Failed to fetch orders');
      }
    } catch (error: unknown) {
      console.error('Login error:', error);
      toast.error('Failed to fetch orders');
    }
    setLoading(false);
  };

  const toggleDeliveryStatus = async (orderId: string, currentStatus: boolean) => {
    try {
      const response = await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          orderId, 
          isDelivered: !currentStatus,
          isActive: true 
        }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success(`Order marked as ${!currentStatus ? 'delivered' : 'not delivered'}`);
        fetchOrders();
      }
    } catch (error: unknown) {
      console.error('Status update error:', error);
      toast.error('Failed to update order status');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-3xl font-black text-center" style={{ color: '#E83434' }}>Demae Robokun</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Login Form */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <form onSubmit={handleLogin} className="flex items-end gap-3">
            <div className="w-64">
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email"
                className="w-full px-2 py-1.5 text-sm text-gray-900 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 placeholder:text-gray-400"
                required
              />
            </div>
            <div className="w-64">
              <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-2 py-1.5 text-sm text-gray-900 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 placeholder:text-gray-400"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {loading ? 'Fetching...' : 'Fetch Orders'}
            </button>
          </form>
        </div>

        {/* Date Display */}
        <div className="text-right mb-4">
          <ClientDate />
        </div>

        {/* Orders Grid */}
        <div className="space-y-6">
          <div className="flex flex-col space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Orders</h2>
              <span className="text-sm text-gray-500">{filteredOrders.length} orders found</span>
            </div>
            
            {/* Tabs */}
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`${
                    activeTab === 'all'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  } whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors duration-200`}
                >
                  All Orders
                  <span className="ml-2 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-900">
                    {orders.length}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('active')}
                  className={`${
                    activeTab === 'active'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  } whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors duration-200`}
                >
                  Active Orders
                  <span className="ml-2 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-900">
                    {orders.filter(order => !order.isDelivered).length}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('delivered')}
                  className={`${
                    activeTab === 'delivered'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  } whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors duration-200`}
                >
                  Delivered Orders
                  <span className="ml-2 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-900">
                    {orders.filter(order => order.isDelivered).length}
                  </span>
                </button>
              </nav>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredOrders.map((order) => (
              <div
                key={order.orderId}
                className={`bg-white rounded-lg shadow-sm overflow-hidden transition-all duration-200 border-2 ${
                  order.isDelivered ? 'opacity-85' : ''
                } ${
                  order.waitingTime === '-分' ? 'bg-blue-50 border-blue-300' : 'border-gray-200'
                } ${
                  order.receiptName && order.receiptName !== '-' ? 'bg-red-50 border-red-300' : ''
                } ${
                  (order.paymentMethod === '着払い' || order.paymentMethod === '代金引換') ? 'bg-red-50 border-red-300' : ''
                }`}
              >
                {/* Order Header */}
                <div className="px-2 py-2 bg-gray-50 border-b border-gray-200">
                  <div className="flex justify-between items-center">
                    <h3 className="text-base font-medium text-gray-900">
                      Order ID: {order.orderId}
                    </h3>
                    <div className="flex gap-0.5">
                      {order.waitingTime === '-分' && (
                        <span className="px-1 py-0.5 bg-blue-100 text-blue-600 rounded-full text-sm font-bold">
                          Reserved
                        </span>
                      )}
                      {order.items && (
                        (order.items.includes('箸、スプーン、おしぼり等／Utensils') ||
                         order.items.includes('箸、スプーン、おしぼり等') ||
                         order.items.includes('Utensils')) && (
                          <span className="px-1 py-0.5 bg-green-100 text-green-600 rounded-full text-sm font-bold">
                            Utensils
                          </span>
                        )
                      )}
                      {order.receiptName && order.receiptName !== '-' && (
                        <span className="px-1 py-0.5 bg-red-100 text-red-600 rounded-full text-sm font-bold">
                          Receipt
                        </span>
                      )}
                      {(order.paymentMethod === '着払い' || order.paymentMethod === '代金引換') && (
                        <span className="px-1 py-0.5 bg-red-100 text-red-600 rounded-full text-sm font-bold">
                          Cash
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Order Details */}
                <div className="px-2 py-2 space-y-2">
                  <div className="grid grid-cols-2 gap-1">
                    <div>
                      <span className="text-xs text-gray-500">Order Time</span>
                      <p className="text-sm font-medium text-gray-900">{new Date(order.orderTime).toLocaleString('ja-JP', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                      })}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Delivery Time</span>
                      <p className="text-sm font-medium text-gray-900">{order.deliveryTime.replace(/:\d{2}$/, '')}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Payment Method</span>
                      <p className={`text-sm font-medium ${
                        order.paymentMethod === '着払い' || order.paymentMethod === '代金引換'
                          ? 'text-red-600 font-bold'
                          : 'text-gray-900'
                      }`}>
                        {order.paymentMethod === '着払い' || order.paymentMethod === '代金引換' 
                          ? 'Cash'
                          : order.paymentMethod === 'カード払い（注文時に決済）'
                            ? 'Credit Card'
                            : order.paymentMethod === 'Ａｍａｚｏｎ　Ｐａｙ（注文時に決済）'
                              ? 'Amazon Pay'
                              : order.paymentMethod}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Visit Count</span>
                      <p className="text-sm font-medium text-gray-900">{order.visitCount}</p>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-2">
                    <div className="grid grid-cols-2 gap-1">
                      <div>
                        <span className="text-xs text-gray-500">Customer Name</span>
                        <p className="text-sm font-medium text-gray-900">{order.customerName}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Phone Number</span>
                        <p className="text-sm font-medium text-gray-900">{order.customerPhone}</p>
                      </div>
                    </div>
                    <div className="mt-1">
                      <span className="text-xs text-gray-500">Address</span>
                      <p className="text-sm font-medium text-gray-900">{order.address}</p>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-1">
                    <div className="grid grid-cols-2 gap-0.5">
                      <div>
                        <span className="text-xs text-gray-500">Total Amount (Tax Incl.)</span>
                        <p className={`text-xs font-medium ${
                          order.paymentMethod === '着払い' || order.paymentMethod === '代金引換'
                            ? 'text-red-600 font-bold'
                            : 'text-gray-900'
                        }`}>¥{(order.priceInfo?.total || 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="px-2 py-2 bg-gray-50 border-t border-gray-200">
                  <button
                    onClick={() => toggleDeliveryStatus(order.orderId, order.isDelivered || false)}
                    className={`w-full inline-flex justify-center items-center px-2 py-1.5 rounded-md text-sm font-medium text-white shadow-sm transition-colors duration-200 ${
                      order.isDelivered 
                        ? 'bg-blue-600 hover:bg-blue-700' 
                        : 'bg-green-600 hover:bg-green-700'
                    }`}
                  >
                    {order.isDelivered ? 'Not Delivered' : 'Delivered'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {orders.length === 0 && (
            <div className="text-center py-12 bg-white rounded-lg shadow-sm">
              <p className="text-gray-500">No orders found. Please login to fetch orders.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
