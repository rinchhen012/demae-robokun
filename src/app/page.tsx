'use client';

import { useState, useEffect, useCallback } from 'react';
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
  totalAmount: number;
  status: string;
  items: string;
  isDelivered?: boolean;
  isActive?: boolean;
  address: string;
  notes: string;
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
  const [loading, setLoading] = useState(true);
  const [monitoring, setMonitoring] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'delivered'>('active');
  const [storeName, setStoreName] = useState('');

  // Function to force a re-render
  const forceUpdate = useCallback(() => {
    // Force React to re-render by triggering a state update
    requestAnimationFrame(() => {
      setOrders(prev => [...prev]);
    });
  }, []);

  // Function to update orders state
  const updateOrders = useCallback((newOrders: Order[]) => {
    setOrders(newOrders);
    // Ensure UI updates by using requestAnimationFrame
    requestAnimationFrame(() => {
      forceUpdate();
    });
  }, [forceUpdate]);

  // Fetch orders function with improved error handling and state updates
  const fetchOrders = useCallback(async () => {
    if (!monitoring) return;

    try {
      const response = await fetch('/api/orders', {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }

      const data = await response.json();

      if (data.success) {
        if (!data.orders || data.orders.length === 0) {
          console.log('No orders found');
          updateOrders([]);
          setStoreName('');
          return;
        }

        const sortedOrders = data.orders.map((order: Order) => ({
          ...order,
          notes: (!order.notes || !order.notes.trim() || order.notes === '-' || /^[{<!]/.test(order.notes)) ? '-' : order.notes
        })).sort((a: Order, b: Order) => {
          return new Date(b.orderTime).getTime() - new Date(a.orderTime).getTime();
        });

        // Update orders and ensure UI updates
        updateOrders(sortedOrders);

        if (sortedOrders.length > 0 && sortedOrders[0].items) {
          const items = sortedOrders[0].items;
          const storeMatch = items.match(/店舗：(.+?)(?:\n|$)/);
          if (storeMatch) {
            setStoreName(storeMatch[1].trim());
          }
        }

        // Force an immediate UI update
        requestAnimationFrame(() => {
          forceUpdate();
        });
      } else {
        console.log('Failed to fetch orders:', data.error);
        updateOrders([]);
        setStoreName('');
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to fetch orders');
      updateOrders([]);
      setStoreName('');
    }
  }, [monitoring, updateOrders, forceUpdate]);

  // Check monitoring status from backend
  const checkMonitoringStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/orders?checkMonitoring=true', {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to check monitoring status');
      }

      const data = await response.json();
      
      if (data.success) {
        const newMonitoringState = data.monitoring;
        
        // If monitoring was active but is now inactive (window closed)
        if (monitoring && !newMonitoringState) {
          // Stop monitoring completely
          await fetch('/api/orders', {
            method: 'DELETE',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            }
          });
          
          setMonitoring(false);
          setOrders([]);
          setStoreName('');
          setEmail('');
          setPassword('');
          localStorage.removeItem('isMonitoring');
          localStorage.removeItem('monitoringEmail');
          localStorage.removeItem('monitoringPassword');
          toast.error('Monitoring stopped: Browser window was closed');
          forceUpdate();
          setLoading(false);
          return;
        }

        if (newMonitoringState !== monitoring) {
          setMonitoring(newMonitoringState);
          if (!newMonitoringState) {
            updateOrders([]);
            setStoreName('');
          }
          forceUpdate();
        }
        setLoading(false);
        
        if (!newMonitoringState) {
          localStorage.removeItem('isMonitoring');
          localStorage.removeItem('monitoringEmail');
          localStorage.removeItem('monitoringPassword');
          setEmail('');
          setPassword('');
        } else {
          localStorage.setItem('isMonitoring', 'true');
          const savedEmail = localStorage.getItem('monitoringEmail');
          const savedPassword = localStorage.getItem('monitoringPassword');
          if (savedEmail && savedPassword) {
            setEmail(savedEmail);
            setPassword(savedPassword);
          }
        }
      }
    } catch (error) {
      console.error('Error checking monitoring status:', error);
      if (monitoring) {
        setMonitoring(false);
        setLoading(false);
        setOrders([]);
        setStoreName('');
        setEmail('');
        setPassword('');
        localStorage.removeItem('isMonitoring');
        localStorage.removeItem('monitoringEmail');
        localStorage.removeItem('monitoringPassword');
        toast.error('Monitoring stopped: Connection lost');
      }
      forceUpdate();
    }
  }, [monitoring, forceUpdate, updateOrders]);

  // Initial setup effect
  useEffect(() => {
    const initialize = async () => {
      await checkMonitoringStatus();
      if (monitoring) {
        await fetchOrders();
      }
    };
    initialize();
  }, [checkMonitoringStatus, fetchOrders, monitoring]);

  // Effect to handle monitoring state changes
  useEffect(() => {
    if (monitoring) {
      let monitoringInterval: NodeJS.Timeout;
      let fetchInterval: NodeJS.Timeout;

      const startMonitoring = async () => {
        try {
          // Initial fetch
          await fetchOrders();

          // Set up polling intervals
          fetchInterval = setInterval(fetchOrders, 2000);
          monitoringInterval = setInterval(checkMonitoringStatus, 5000);
        } catch (error) {
          console.error('Error in monitoring loop:', error);
        }
      };

      startMonitoring();

      // Cleanup function
      return () => {
        if (monitoringInterval) clearInterval(monitoringInterval);
        if (fetchInterval) clearInterval(fetchInterval);
      };
    }
  }, [monitoring, fetchOrders, checkMonitoringStatus]);

  // Add effect to handle real-time UI updates
  useEffect(() => {
    if (monitoring) {
      // Force an immediate UI update when monitoring starts
      forceUpdate();
      fetchOrders();
    }
  }, [monitoring, forceUpdate, fetchOrders]);

  const handleLogin = async (e: React.FormEvent | null) => {
    if (e) {
    e.preventDefault();
    }

    if (!email || !password) {
      toast.error('Email and password are required');
      return;
    }

    setLoading(true);
    
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        body: JSON.stringify({ 
          email, 
          password,
          startMonitoring: true
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Update state in a single batch
        await Promise.all([
          new Promise<void>(resolve => {
            setMonitoring(true);
            setLoading(false);
            resolve();
          }),
          new Promise<void>(resolve => {
            localStorage.setItem('isMonitoring', 'true');
            localStorage.setItem('monitoringEmail', email);
            localStorage.setItem('monitoringPassword', password);
            resolve();
          })
        ]);

        // Show success message
        if (data.existing) {
          toast.success('Focused existing monitoring window');
        } else {
          toast.success('Started monitoring for new orders');
        }

        // Fetch initial data
        const ordersResponse = await fetch('/api/orders', {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });

        if (ordersResponse.ok) {
          const ordersData = await ordersResponse.json();
          if (ordersData.success && ordersData.orders) {
            const sortedOrders = ordersData.orders
              .map((order: Order) => ({
                ...order,
                notes: (!order.notes || !order.notes.trim() || order.notes === '-' || /^[{<!]/.test(order.notes)) ? '-' : order.notes
              }))
              .sort((a: Order, b: Order) => new Date(b.orderTime).getTime() - new Date(a.orderTime).getTime());

            // Update orders state
            setOrders(sortedOrders);

            // Update store name if available
            if (sortedOrders.length > 0 && sortedOrders[0].items) {
              const storeMatch = sortedOrders[0].items.match(/店舗：(.+?)(?:\n|$)/);
              if (storeMatch) {
                setStoreName(storeMatch[1].trim());
              }
            }
          }
        }
      } else {
        // Clear all states and storage on failure
        await Promise.all([
          new Promise<void>(resolve => {
            setMonitoring(false);
            setLoading(false);
            setOrders([]);
            resolve();
          }),
          new Promise<void>(resolve => {
            localStorage.removeItem('isMonitoring');
            localStorage.removeItem('monitoringEmail');
            localStorage.removeItem('monitoringPassword');
            resolve();
          })
        ]);
        toast.error(data.error || 'Failed to start monitoring');
      }
    } catch (error) {
      console.error('Login error:', error);
      // Clear all states and storage on error
      await Promise.all([
        new Promise<void>(resolve => {
          setMonitoring(false);
          setLoading(false);
          setOrders([]);
          resolve();
        }),
        new Promise<void>(resolve => {
          localStorage.removeItem('isMonitoring');
          localStorage.removeItem('monitoringEmail');
          localStorage.removeItem('monitoringPassword');
          resolve();
        })
      ]);
      toast.error('Failed to start monitoring');
    }
  };

  const handleStopMonitoring = async () => {
    // Ask for confirmation before stopping
    if (!confirm('Are you sure you want to stop monitoring? This will clear all current orders.')) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/orders', {
        method: 'DELETE',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      const data = await response.json();
      if (data.success) {
        setMonitoring(false);
        localStorage.removeItem('isMonitoring');
        localStorage.removeItem('monitoringEmail');
        localStorage.removeItem('monitoringPassword');
        setEmail('');
        setPassword('');
        setOrders([]);
        forceUpdate();
        toast.success('Stopped monitoring for new orders');
      } else {
        toast.error('Failed to stop monitoring');
      }
    } catch (error) {
      console.error('Error stopping monitoring:', error);
      toast.error('Failed to stop monitoring');
    } finally {
    setLoading(false);
    }
  };

  const toggleDeliveryStatus = async (orderId: string, currentStatus: boolean) => {
    try {
      const response = await fetch('/api/orders', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        body: JSON.stringify({ 
          orderId, 
          isDelivered: !currentStatus,
          isActive: true 
        }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success(`Order marked as ${!currentStatus ? 'delivered' : 'not delivered'}`);
        await fetchOrders();
        forceUpdate();
      }
    } catch (error: unknown) {
      console.error('Status update error:', error);
      toast.error('Failed to update order status');
    }
  };

  const filteredOrders = orders.filter(order => {
    switch (activeTab) {
      case 'active':
        return !order.isDelivered;
      case 'delivered':
        return order.isDelivered;
    }
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-2">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-black" style={{ color: '#E83434' }}>Demae Robokun</h1>
            
            {/* Login Form - Updated with loading state */}
            <form onSubmit={handleLogin} className="flex items-center gap-2">
              <div className="w-48">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full px-2 py-1 text-sm text-gray-900 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 placeholder:text-gray-600 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                required
                  disabled={monitoring || loading}
              />
            </div>
              <div className="w-48">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full px-2 py-1 text-sm text-gray-900 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 placeholder:text-gray-600 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                required
                  disabled={monitoring || loading}
              />
            </div>
              <div className="flex items-center gap-2">
                {!loading && (
                  <>
            <button
              type="submit"
                      disabled={loading || monitoring}
                      className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {monitoring ? 'Monitoring...' : 'Start Monitoring'}
                    </button>
                    {monitoring && (
                      <button
                        type="button"
                        onClick={handleStopMonitoring}
                        className="px-3 py-1 text-sm bg-red-600 text-white rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                      >
                        Stop Monitoring
                      </button>
                    )}
                  </>
                )}
                {loading && !monitoring && (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                    <span className="text-sm text-gray-600">Checking status...</span>
                  </div>
                )}
                {loading && monitoring && (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                    <span className="text-sm text-gray-600">Checking orders...</span>
                    <button
                      type="button"
                      onClick={handleStopMonitoring}
                      className="px-3 py-1 text-sm bg-red-600 text-white rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                    >
                      Stop Monitoring
            </button>
                  </div>
                )}
              </div>
          </form>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4">
        {/* Store Name Display */}
        {storeName && (
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">{storeName}</h2>
          </div>
        )}

        {/* Date Display */}
        <div className="text-right mb-4">
          <ClientDate />
        </div>

        {/* Orders Grid */}
        <div className="space-y-6">
          <div className="flex flex-col space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-semibold text-gray-900">Orders</h2>
                {(monitoring || loading) && (
                  <div className="flex items-center">
                    <span className="relative flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-green-500"></span>
                    </span>
                  </div>
                )}
              </div>
              <span className="text-sm text-gray-500">{filteredOrders.length} orders found</span>
            </div>
            
            {/* Tabs */}
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveTab('active')}
                  className={`${
                    activeTab === 'active'
                      ? 'border-green-500 text-green-600'
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
                      ? 'border-red-500 text-red-600'
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
                className={`bg-white rounded-lg shadow-sm overflow-hidden transition-all duration-200 ${
                  order.isDelivered ? 'opacity-85' : ''
                } ${
                  order.waitingTime === '-分' && 
                  ((order.paymentMethod === '着払い' || order.paymentMethod === '代金引換') || 
                   (order.receiptName && order.receiptName !== '-'))
                  ? 'border-4 border-blue-300 outline outline-4 outline-red-300 outline-offset-2'
                  : order.waitingTime === '-分' 
                    ? 'border-4 border-blue-300'
                    : (order.paymentMethod === '着払い' || order.paymentMethod === '代金引換' || 
                       (order.receiptName && order.receiptName !== '-'))
                      ? 'border-4 border-red-300'
                      : 'border-2 border-gray-200'
                }`}
              >
                <div className="h-full">
                  <div className={`h-full bg-white rounded-lg ${
                    order.waitingTime === '-分' && 
                    ((order.paymentMethod === '着払い' || order.paymentMethod === '代金引換') || 
                     (order.receiptName && order.receiptName !== '-'))
                    ? 'm-[1px]'
                    : ''
                  }`}>
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
                          {order.notes && /lassi|lissa|lassy/i.test(order.notes) && (
                            <span className="px-1 py-0.5 bg-yellow-100 text-yellow-600 rounded-full text-sm font-bold">
                              Lassi
                            </span>
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
                          <p className="text-sm font-medium text-gray-900">
                            <span>{new Date(order.orderTime).toLocaleString('ja-JP', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit'
                            })}</span>
                            <span className="text-base font-bold ml-2">
                              {new Date(order.orderTime).toLocaleString('ja-JP', {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false
                              })}
                            </span>
                          </p>
                    </div>
                    <div>
                          <span className="text-xs text-gray-500">Delivery Time</span>
                          <p className={`text-sm font-medium ${
                            order.waitingTime === '-分'
                              ? 'text-blue-600'
                              : 'text-gray-900'
                          }`}>
                            <span>{order.deliveryTime.split(' ')[0]}</span>
                            <span className={`text-base font-bold ml-2 ${
                              order.waitingTime === '-分'
                                ? 'text-blue-600'
                                : 'text-gray-900'
                            }`}>
                              {order.deliveryTime.split(' ')[1]?.replace(/:\d{2}$/, '')}
                            </span>
                          </p>
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

                      {/* Notes Section */}
                      {order.notes && (
                        <div className="border-t border-gray-200 pt-1">
                          <span className="text-xs text-gray-500">Notes</span>
                          <p className="text-sm font-medium text-gray-900 break-words">{order.notes}</p>
                        </div>
                      )}

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
                        {order.isDelivered 
                          ? (activeTab === 'delivered' ? 'Send Back' : 'Not Delivered')
                          : 'Delivered'}
                  </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {orders.length === 0 && (
            <div className="text-center py-12 bg-white rounded-lg shadow-sm">
              <p className="text-gray-500">
                {monitoring ? 'No orders found. Monitoring is active.' : 'No orders found. Please login to fetch orders.'}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
