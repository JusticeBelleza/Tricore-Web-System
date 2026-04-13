import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { 
  Search, Package, CheckCircle2, XCircle, Clock, 
  Truck, X, AlertCircle, PackageCheck, User, Car, Hash, Building, MapPin,
  ChevronDown, DollarSign, CreditCard, FileText, Calendar, ShieldAlert, Phone, FileDown, Mail,
  ChevronLeft, ChevronRight, AlertTriangle, Receipt, Edit3, RefreshCw, Plus
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function AdminOrders() {
  const { profile } = useAuth(); 
  const isWarehouse = profile?.role === 'warehouse';

  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]); 
  const [loading, setLoading] = useState(true);
  
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 10;
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all'); 
  
  const [tabCounts, setTabCounts] = useState({ pending: 0, processing: 0, shipped: 0, completed: 0, due: 0, paid: 0, cancelled: 0, attempted: 0, restocked: 0 });
  const [newPendingCount, setNewPendingCount] = useState(0);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  
  const [confirmAction, setConfirmAction] = useState({ show: false, title: '', message: '', onConfirm: null });
  const [cancelReason, setCancelReason] = useState(''); 

  const [itemAction, setItemAction] = useState({ show: false, type: '', order: null, item: null, reason: '', newQty: '', newVariantId: '' });
  
  const [availableVariants, setAvailableVariants] = useState([]);
  const [substituteSearch, setSubstituteSearch] = useState('');
  const [selectedSubstitute, setSelectedSubstitute] = useState(null);

  const [notification, setNotification] = useState({ show: false, message: '', isError: false });

  useEffect(() => {
    if (notification.show) {
      const timer = setTimeout(() => setNotification({ ...notification, show: false }), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification.show]);

  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedSearch(searchTerm); setPage(0); }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => { setPage(0); }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'pending') {
      localStorage.setItem('lastViewedPending', new Date().toISOString());
      setNewPendingCount(0);
      window.dispatchEvent(new Event('pendingViewed')); 
    }
  }, [activeTab, orders]);

  useEffect(() => {
    if (itemAction.show && (itemAction.type === 'substitute' || itemAction.type === 'add') && availableVariants.length === 0) {
      const fetchVariants = async () => {
        const { data, error } = await supabase
          .from('product_variants')
          .select('id, name, price, sku, products(name, base_sku)')
          .order('name', { ascending: true });
        if (!error && data) setAvailableVariants(data);
      };
      fetchVariants();
    }
  }, [itemAction.show, itemAction.type]);

  useEffect(() => {
    if (profile?.id) {
      fetchOrdersAndDrivers();
      fetchTabCounts(); 
      const sub = supabase.channel('admin_orders_channel').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { fetchOrdersAndDrivers(); fetchTabCounts(); }).subscribe();
      
      const localUpdateHandler = () => { fetchOrdersAndDrivers(); fetchTabCounts(); };
      window.addEventListener('orderStatusChanged', localUpdateHandler);
      return () => {
        supabase.removeChannel(sub);
        window.removeEventListener('orderStatusChanged', localUpdateHandler);
      };
    }
  }, [profile?.id, activeTab, debouncedSearch, page]); 

  const fetchTabCounts = async () => {
    try {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - 25);
      const lastViewedPending = localStorage.getItem('lastViewedPending') || new Date(0).toISOString();

      const [pendingReq, newPendingReq, processingReq, shippedReq, completedReq, dueReq, paidReq, cancelledReq, attemptedReq, restockedReq] = await Promise.all([
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending').gt('created_at', lastViewedPending),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'processing'),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'shipped'),
        supabase.from('orders').select('*', { count: 'exact', head: true }).in('status', ['delivered', 'delivered_partial']).eq('payment_status', 'unpaid'),
        supabase.from('orders').select('*', { count: 'exact', head: true }).in('status', ['delivered', 'delivered_partial']).eq('payment_method', 'net_30').eq('payment_status', 'unpaid').lte('created_at', thresholdDate.toISOString()),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('payment_status', 'paid'),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'cancelled'),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'attempted'),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('is_restocked', true).not('processing_at', 'is', null)
      ]);
      
      setTabCounts({ 
        pending: pendingReq.count || 0, processing: processingReq.count || 0, shipped: shippedReq.count || 0, 
        completed: completedReq.count || 0, due: dueReq.count || 0, paid: paidReq.count || 0, cancelled: cancelledReq.count || 0,
        attempted: attemptedReq.count || 0, restocked: restockedReq.count || 0 
      });
      setNewPendingCount(newPendingReq.count || 0);
    } catch (error) { console.error('Error fetching tab counts:', error); }
  };

  const fetchOrdersAndDrivers = async () => {
    setLoading(true);
    try {
      const driversRes = await supabase.from('user_profiles').select('id, full_name, contact_number').eq('role', 'driver').order('full_name', { ascending: true });
      setDrivers(driversRes.data || []);

      let query = supabase.from('orders').select(`
          *, 
          companies ( name, address, city, state, zip, phone, email ), 
          agency_patients ( contact_number, email ),
          user_profiles ( full_name, contact_number, email ),
          order_items ( id, product_variant_id, quantity_variants, total_base_units, unit_price, line_total, status, cancellation_reason, product_variants ( id, product_id, name, sku, price, products(name, base_sku) ) )
        `, { count: 'exact' }); 

      if (activeTab === 'pending') query = query.eq('status', 'pending');
      else if (activeTab === 'processing') query = query.eq('status', 'processing');
      else if (activeTab === 'shipped') query = query.eq('status', 'shipped');
      else if (activeTab === 'completed') query = query.in('status', ['delivered', 'delivered_partial']).eq('payment_status', 'unpaid');
      else if (activeTab === 'paid') query = query.eq('payment_status', 'paid');
      else if (activeTab === 'cancelled') query = query.eq('status', 'cancelled');
      else if (activeTab === 'attempted') query = query.eq('status', 'attempted'); 
      else if (activeTab === 'restocked') query = query.eq('is_restocked', true).not('processing_at', 'is', null); 
      else if (activeTab === 'due') {
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - 25);
        query = query.in('status', ['delivered', 'delivered_partial']).eq('payment_method', 'net_30').eq('payment_status', 'unpaid').lte('created_at', thresholdDate.toISOString());
      }

      if (debouncedSearch) {
        const cleanSearch = debouncedSearch.trim();
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanSearch);
        
        if (isUUID) {
          query = query.or(`id.eq.${cleanSearch},shipping_name.ilike.%${cleanSearch}%,companies.name.ilike.%${cleanSearch}%`);
        } else {
          query = query.or(`shipping_name.ilike.%${cleanSearch}%,companies.name.ilike.%${cleanSearch}%`);
        }
      }

      const sortColumn = (activeTab === 'completed' || activeTab === 'cancelled' || activeTab === 'paid' || activeTab === 'attempted' || activeTab === 'restocked') ? 'updated_at' : 'created_at';
      query = query.order(sortColumn, { ascending: false });
      query = query.range(page * pageSize, (page * pageSize) + pageSize - 1);

      const { data, count, error } = await query;
      if (error) throw error;
      setOrders(data || []);
      setTotalCount(count || 0);
    } catch (error) { console.error('Error fetching data:', error.message); } finally { setLoading(false); }
  };

  const toggleOrderDetails = (orderId) => setExpandedOrderId(expandedOrderId === orderId ? null : orderId);

  const executeOrderStatusUpdate = async (orderId, newStatus, reason = null) => {
    try {
      const currentOrder = orders.find(o => o.id === orderId);
      if (!currentOrder) return;

      const updatePayload = { status: newStatus, updated_at: new Date().toISOString() };
      if (newStatus === 'processing') updatePayload.processing_at = new Date().toISOString();
      
      if (newStatus === 'cancelled') {
        updatePayload.cancelled_at = new Date().toISOString();
        updatePayload.cancellation_reason = reason; 
        
        if (currentOrder.status === 'pending') {
          updatePayload.is_restocked = true;
          
          for (const item of currentOrder.order_items) {
            const productId = item.product_variants?.product_id;
            if (item.status !== 'cancelled' && productId) {
              const { data: invData } = await supabase.from('inventory').select('base_units_on_hand').eq('product_id', productId).single();
              if (invData && invData.base_units_on_hand !== undefined) {
                const qtyToReturn = Number(item.total_base_units || item.quantity_variants || 0);
                const newStock = Number(invData.base_units_on_hand) + qtyToReturn;
                await supabase.from('inventory').update({ base_units_on_hand: newStock }).eq('product_id', productId);
              }
            }
          }
        } else {
          updatePayload.is_restocked = false;
        }
      }

      const { data, error } = await supabase.from('orders').update(updatePayload).eq('id', orderId).eq('status', currentOrder.status).select();
      if (error) throw error; 

      if (data && data.length === 0) {
        setNotification({ show: true, isError: true, message: 'Action Blocked: Another user already updated this order.' });
        fetchOrdersAndDrivers(); 
        return;
      }

      setNotification({ show: true, isError: false, message: newStatus === 'processing' ? 'Order sent to warehouse.' : 'Order rejected & items restocked.' });
      window.dispatchEvent(new Event('orderStatusChanged'));
    } catch (error) { setNotification({ show: true, isError: true, message: `Update failed: ${error.message}` }); }
  };

  const handleStatusChangeClick = (orderId, newStatus) => {
    const currentOrder = orders.find(o => o.id === orderId);
    
    setConfirmAction({
      show: true, title: newStatus === 'processing' ? 'Accept Order?' : 'Reject Order?',
      message: newStatus === 'processing' 
        ? 'Approve and send to warehouse?' 
        : (currentOrder?.status === 'pending' ? 'Cancel order? Items will auto-restock since they were never picked.' : 'Cancel order? The warehouse will need to physically unpack and restock these items.'),
      onConfirm: (reason) => { setConfirmAction({ show: false, title: '', message: '', onConfirm: null }); executeOrderStatusUpdate(orderId, newStatus, reason); }
    });
  };

  const executeItemCancel = async () => {
    const { order, item, reason } = itemAction;
    setItemAction({ show: false, type: '', order: null, item: null, reason: '', newQty: '', newVariantId: '' });

    try {
      const productId = item.product_variants?.product_id;
      if (productId) {
        const { data: invData } = await supabase.from('inventory').select('base_units_on_hand').eq('product_id', productId).single();
        if (invData && invData.base_units_on_hand !== undefined) {
          const qtyToReturn = Number(item.total_base_units || item.quantity_variants || 0);
          const newStock = Number(invData.base_units_on_hand) + qtyToReturn;
          await supabase.from('inventory').update({ base_units_on_hand: newStock }).eq('product_id', productId);
        }
      }

      let newSubtotal = 0;
      order.order_items.forEach(oi => {
        if (oi.id !== item.id && oi.status !== 'cancelled' && oi.status !== 'rejected') {
          newSubtotal += Number(oi.line_total || 0);
        }
      });

      const taxRate = Number(order.subtotal) > 0 ? (Number(order.tax_amount || 0) / Number(order.subtotal)) : 0;
      const newTaxAmount = newSubtotal * taxRate;
      const newTotalAmount = newSubtotal + Number(order.shipping_amount || 0) + newTaxAmount;

      const { data, error: itemError } = await supabase.from('order_items')
        .update({ status: 'cancelled', cancellation_reason: reason })
        .eq('id', item.id)
        .select(); 
        
      if (itemError) throw itemError;
      if (!data || data.length === 0) throw new Error("Action Blocked: Check Supabase Permissions.");

      const { error: deductError } = await supabase.from('orders').update({ subtotal: newSubtotal, tax_amount: newTaxAmount, total_amount: newTotalAmount, updated_at: new Date().toISOString() }).eq('id', order.id);
      if (deductError) throw deductError;

      setOrders(prevOrders => prevOrders.map(o => {
        if (o.id === order.id) {
          const updatedItems = o.order_items.map(oi => oi.id === item.id ? { ...oi, status: 'cancelled', cancellation_reason: reason } : oi);
          return { ...o, subtotal: newSubtotal, tax_amount: newTaxAmount, total_amount: newTotalAmount, order_items: updatedItems };
        }
        return o;
      }));

      setNotification({ show: true, isError: false, message: 'Item cancelled and inventory restocked.' });
    } catch (error) { setNotification({ show: true, isError: true, message: `Cancel failed: ${error.message}` }); }
  };

  const executeItemAdd = async () => {
    const { order, newQty } = itemAction;
    try {
      if (!selectedSubstitute) throw new Error("Please select a product to add.");
      const parsedQty = parseInt(newQty, 10);
      if (isNaN(parsedQty) || parsedQty <= 0) throw new Error("Please enter a valid quantity.");

      const newUnitPrice = Number(selectedSubstitute.price || 0);

      const existingItem = order.order_items.find(
        oi => oi.product_variants?.id === selectedSubstitute.id && oi.status !== 'cancelled' && oi.status !== 'rejected'
      );

      if (existingItem) {
        const updatedQty = Number(existingItem.quantity_variants) + parsedQty;
        const updatedLineTotal = updatedQty * newUnitPrice;

        let newSubtotal = 0;
        order.order_items.forEach(oi => {
          if (oi.id === existingItem.id) {
            newSubtotal += updatedLineTotal; 
          } else if (oi.status !== 'cancelled' && oi.status !== 'rejected') {
            newSubtotal += Number(oi.line_total || 0); 
          }
        });

        const taxRate = Number(order.subtotal) > 0 ? (Number(order.tax_amount || 0) / Number(order.subtotal)) : 0;
        const newTaxAmount = newSubtotal * taxRate;
        const newTotalAmount = newSubtotal + Number(order.shipping_amount || 0) + newTaxAmount;

        const { data: updateData, error: itemError } = await supabase.from('order_items').update({ 
          quantity_variants: updatedQty, 
          line_total: updatedLineTotal,
          total_base_units: updatedQty 
        }).eq('id', existingItem.id).select(); 
        
        if (itemError) throw itemError;
        if (!updateData || updateData.length === 0) throw new Error("Action Blocked: Check Supabase Permissions.");

        const { error: orderError } = await supabase.from('orders').update({ subtotal: newSubtotal, tax_amount: newTaxAmount, total_amount: newTotalAmount, updated_at: new Date().toISOString() }).eq('id', order.id);
        if (orderError) throw orderError;

        setOrders(prevOrders => prevOrders.map(o => {
          if (o.id === order.id) {
            const updatedItems = o.order_items.map(oi => oi.id === existingItem.id ? { ...oi, quantity_variants: updatedQty, line_total: updatedLineTotal } : oi);
            return { ...o, subtotal: newSubtotal, tax_amount: newTaxAmount, total_amount: newTotalAmount, order_items: updatedItems };
          }
          return o;
        }));

        setNotification({ show: true, isError: false, message: 'Quantity updated for existing product!' });

      } else {
        const newLineTotal = parsedQty * newUnitPrice;
        let newSubtotal = newLineTotal; 
        order.order_items.forEach(oi => {
          if (oi.status !== 'cancelled' && oi.status !== 'rejected') {
            newSubtotal += Number(oi.line_total || 0);
          }
        });

        const taxRate = Number(order.subtotal) > 0 ? (Number(order.tax_amount || 0) / Number(order.subtotal)) : 0;
        const newTaxAmount = newSubtotal * taxRate;
        const newTotalAmount = newSubtotal + Number(order.shipping_amount || 0) + newTaxAmount;

        const { data: newItemData, error: itemError } = await supabase
          .from('order_items')
          .insert([{
            order_id: order.id,
            product_variant_id: selectedSubstitute.id, 
            quantity_variants: parsedQty,
            unit_price: newUnitPrice,
            line_total: newLineTotal,
            status: 'active',
            total_base_units: parsedQty 
          }])
          .select()
          .single();

        if (itemError) throw itemError;

        const { error: orderError } = await supabase
          .from('orders')
          .update({ subtotal: newSubtotal, tax_amount: newTaxAmount, total_amount: newTotalAmount, updated_at: new Date().toISOString() })
          .eq('id', order.id);

        if (orderError) throw orderError;

        const optimisticItem = { ...newItemData, product_variants: selectedSubstitute };
        setOrders(prevOrders => prevOrders.map(o => {
          if (o.id === order.id) {
            return { ...o, subtotal: newSubtotal, tax_amount: newTaxAmount, total_amount: newTotalAmount, order_items: [...o.order_items, optimisticItem] };
          }
          return o;
        }));

        setNotification({ show: true, isError: false, message: 'Product added successfully!' });
      }

      setItemAction({ show: false, type: '', order: null, item: null, reason: '', newQty: '', newVariantId: '' });
      setSelectedSubstitute(null);
      setSubstituteSearch('');
      
    } catch (error) { setNotification({ show: true, isError: true, message: error.message }); }
  };

  const executeItemEdit = async () => {
    const { order, item, newQty } = itemAction;
    try {
      const parsedQty = parseInt(newQty, 10);
      if (isNaN(parsedQty) || parsedQty <= 0) throw new Error("Please enter a valid quantity greater than 0.");

      const unitPrice = Number(item.unit_price || 0);
      const newLineTotal = parsedQty * unitPrice;

      let newSubtotal = 0;
      order.order_items.forEach(oi => {
        if (oi.id === item.id) {
          newSubtotal += newLineTotal; 
        } else if (oi.status !== 'cancelled' && oi.status !== 'rejected') {
          newSubtotal += Number(oi.line_total || 0); 
        }
      });

      const taxRate = Number(order.subtotal) > 0 ? (Number(order.tax_amount || 0) / Number(order.subtotal)) : 0;
      const newTaxAmount = newSubtotal * taxRate;
      const newTotalAmount = newSubtotal + Number(order.shipping_amount || 0) + newTaxAmount;

      const { data, error: itemError } = await supabase.from('order_items')
        .update({ 
          quantity_variants: parsedQty, 
          line_total: newLineTotal,
          total_base_units: parsedQty
        }).eq('id', item.id).select(); 
      
      if (itemError) throw itemError;
      if (!data || data.length === 0) throw new Error("Action Blocked: Check Supabase Permissions.");

      const { error: orderError } = await supabase.from('orders').update({ subtotal: newSubtotal, tax_amount: newTaxAmount, total_amount: newTotalAmount, updated_at: new Date().toISOString() }).eq('id', order.id);
      if (orderError) throw orderError;

      setOrders(prevOrders => prevOrders.map(o => {
        if (o.id === order.id) {
          const updatedItems = o.order_items.map(oi => oi.id === item.id ? { ...oi, quantity_variants: parsedQty, line_total: newLineTotal } : oi);
          return { ...o, subtotal: newSubtotal, tax_amount: newTaxAmount, total_amount: newTotalAmount, order_items: updatedItems };
        }
        return o;
      }));

      setNotification({ show: true, isError: false, message: 'Item quantity and totals updated!' });
      setItemAction({ show: false, type: '', order: null, item: null, reason: '', newQty: '', newVariantId: '' });
    } catch (error) { setNotification({ show: true, isError: true, message: error.message }); }
  };

  const executeItemSubstitute = async () => {
    const { order, item } = itemAction;
    try {
      if (!selectedSubstitute) throw new Error("Please select a product to substitute.");
      
      const newUnitPrice = Number(selectedSubstitute.price || 0);
      const qty = Number(item.quantity_variants || 1);
      const newLineTotal = qty * newUnitPrice;

      let newSubtotal = 0;
      order.order_items.forEach(oi => {
        if (oi.id === item.id) {
          newSubtotal += newLineTotal;
        } else if (oi.status !== 'cancelled' && oi.status !== 'rejected') {
          newSubtotal += Number(oi.line_total || 0);
        }
      });

      const taxRate = Number(order.subtotal) > 0 ? (Number(order.tax_amount || 0) / Number(order.subtotal)) : 0;
      const newTaxAmount = newSubtotal * taxRate;
      const newTotalAmount = newSubtotal + Number(order.shipping_amount || 0) + newTaxAmount;

      const { data, error: itemError } = await supabase
        .from('order_items')
        .update({ 
          product_variant_id: selectedSubstitute.id, 
          unit_price: newUnitPrice, 
          line_total: newLineTotal,
          total_base_units: qty
        })
        .eq('id', item.id)
        .select(); 
      
      if (itemError) throw itemError;
      if (!data || data.length === 0) throw new Error("Action Blocked: Check Supabase Permissions.");
      
      const { error: orderError } = await supabase.from('orders').update({ subtotal: newSubtotal, tax_amount: newTaxAmount, total_amount: newTotalAmount, updated_at: new Date().toISOString() }).eq('id', order.id);
      if (orderError) throw orderError;

      setOrders(prevOrders => prevOrders.map(o => {
        if (o.id === order.id) {
          const updatedItems = o.order_items.map(oi => oi.id === item.id ? { ...oi, unit_price: newUnitPrice, line_total: newLineTotal, product_variants: selectedSubstitute } : oi);
          return { ...o, subtotal: newSubtotal, tax_amount: newTaxAmount, total_amount: newTotalAmount, order_items: updatedItems };
        }
        return o;
      }));

      setNotification({ show: true, isError: false, message: 'Product successfully substituted!' });
      setItemAction({ show: false, type: '', order: null, item: null, reason: '', newQty: '', newVariantId: '' });
      setSelectedSubstitute(null);
      setSubstituteSearch('');
    } catch (error) { setNotification({ show: true, isError: true, message: error.message }); }
  };

  const executeMarkAsPaid = async (orderId) => {
    try {
      const { error } = await supabase.from('orders').update({ payment_status: 'paid', updated_at: new Date().toISOString() }).eq('id', orderId);
      if (error) throw error;
      setNotification({ show: true, isError: false, message: 'Order successfully marked as Paid!' });
      window.dispatchEvent(new Event('orderStatusChanged'));
    } catch (error) { setNotification({ show: true, isError: true, message: `Failed to update: ${error.message}` }); }
  };

  const handleMarkAsPaid = (orderId) => {
    setConfirmAction({
      show: true, title: 'Mark as Paid?', message: 'Confirming this will mark the invoice as Paid and replenish the credit limit.',
      onConfirm: () => { setConfirmAction({ show: false, title: '', message: '', onConfirm: null }); executeMarkAsPaid(orderId); }
    });
  };

  const getBase64ImageFromUrl = (imageUrl) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0);
        resolve({ dataURL: canvas.toDataURL("image/png"), width: img.width, height: img.height });
      };
      img.onerror = () => resolve(null);
      img.src = imageUrl;
    });
  };

  const generatePDF = async (order, docType = 'invoice') => {
    const doc = new jsPDF();
    const orderNum = order.id.substring(0, 8).toUpperCase();
    const datePlaced = new Date(order.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // 🚀 PDF CALCULATIONS
    const rejectedItemsSum = order.order_items?.filter(item => item.status === 'cancelled' || item.status === 'rejected').reduce((sum, item) => sum + (Number(item.line_total) || 0), 0) || 0;
    const grossSubtotal = order.order_items?.reduce((sum, item) => sum + (Number(item.line_total) || 0), 0) || 0;
    
    const finalTax = Number(order.tax_amount || 0);
    const finalTotal = Number(order.total_amount || 0);

    const logoData = await getBase64ImageFromUrl('/images/tricore-logo2.png');
    if (logoData) {
      const imgWidth = 45; const imgHeight = (logoData.height * imgWidth) / logoData.width; 
      doc.addImage(logoData.dataURL, 'PNG', 14, 12, imgWidth, imgHeight); 
    } else {
      doc.setFontSize(18); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42); doc.text("TRICORE MEDICAL SUPPLY", 14, 20);
    }
    
    doc.setFontSize(18); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42); 
    doc.text(docType === 'receipt' ? "PAYMENT RECEIPT" : "INVOICE", 140, 18);
    
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.setFont("helvetica", "bold"); doc.text(`${docType === 'receipt' ? 'Receipt' : 'Invoice'} #: INV-${orderNum}`, 140, 24);
    doc.setFont("helvetica", "normal"); doc.text(`Date: ${datePlaced}`, 140, 29);
    
    if (docType === 'receipt') { doc.setFont("helvetica", "bold"); doc.setTextColor(16, 185, 129); doc.text("Status: PAID IN FULL", 140, 34); doc.setTextColor(15, 23, 42); } 
    else { doc.text(`Status: ${order.payment_status === 'paid' ? 'PAID' : 'UNPAID'}`, 140, 34); }

    const isB2B = !!order.company_id;
    const up = Array.isArray(order.user_profiles) ? order.user_profiles[0] : order.user_profiles;

    const billName = isB2B ? (order.companies?.name || 'Agency') : (up?.full_name || order.shipping_name || 'Retail Customer');
    const billAddress = isB2B ? (order.companies?.address || '') : (order.shipping_address || '');
    const billCityState = isB2B ? (`${order.companies?.city || ''}, ${order.companies?.state || ''} ${order.companies?.zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '')) : (`${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, ''));
    const billPhone = isB2B ? (order.companies?.phone || '') : (order.shipping_phone || up?.contact_number || '');
    const billEmail = isB2B ? (order.companies?.email || '') : (order.shipping_email || up?.email || '');

    const shipName = order.shipping_name || (isB2B ? 'Patient' : billName);
    const shipAddress = order.shipping_address || 'No shipping address provided';
    const shipCityState = `${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '');
    const shipPhone = order.shipping_phone || order.agency_patients?.contact_number || up?.contact_number || '';
    const shipEmail = order.shipping_email || order.agency_patients?.email || up?.email || '';

    doc.setFont("helvetica", "bold"); doc.text("BILL TO:", 14, 50); doc.text("SHIP TO:", 110, 50); doc.setFont("helvetica", "normal");
    
    let currentYBill = 56;
    doc.setFont("helvetica", "bold"); doc.text(billName, 14, currentYBill); currentYBill += 5; doc.setFont("helvetica", "normal");
    if (billAddress && billAddress !== 'No billing address provided') { doc.text(billAddress, 14, currentYBill); currentYBill += 5; }
    if (billCityState) { doc.text(billCityState, 14, currentYBill); currentYBill += 5; }
    if (billPhone) { doc.text(`Phone: ${billPhone}`, 14, currentYBill); currentYBill += 5; }
    if (billEmail) { doc.text(`Email: ${billEmail}`, 14, currentYBill); currentYBill += 5; }

    let currentYShip = 56;
    doc.setFont("helvetica", "bold"); doc.text(shipName, 110, currentYShip); currentYShip += 5; doc.setFont("helvetica", "normal");
    if (shipAddress && shipAddress !== 'No shipping address provided') { doc.text(shipAddress, 110, currentYShip); currentYShip += 5; }
    if (shipCityState) { doc.text(shipCityState, 110, currentYShip); currentYShip += 5; }
    if (shipPhone) { doc.text(`Phone: ${shipPhone}`, 110, currentYShip); currentYShip += 5; }
    if (shipEmail) { doc.text(`Email: ${shipEmail}`, 110, currentYShip); currentYShip += 5; }

    const maxAddressY = Math.max(currentYBill, currentYShip);
    const activeItems = order.order_items?.filter(item => item.status !== 'cancelled' && item.status !== 'rejected') || [];
    const tableRows = activeItems.map(item => [
      `${item.product_variants?.products?.name || item.product_variants?.name || 'Item'}\nSKU: ${item.product_variants?.sku || item.product_variants?.products?.base_sku || 'N/A'}`,
      item.quantity_variants, `$${Number(item.unit_price || 0).toFixed(2)}`, `$${Number(item.line_total || 0).toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: maxAddressY + 10,
      head: [["DESCRIPTION", "QTY", "UNIT PRICE", "TOTAL"]],
      body: tableRows,
      theme: 'striped', headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 5 }, columnStyles: { 0: { cellWidth: 100 }, 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } }
    });

    const finalY = doc.lastAutoTable.finalY || maxAddressY + 10;
    doc.setFont("helvetica", "normal");
    
    let currentY = finalY + 10;

    doc.text("Subtotal (Gross):", 140, currentY); doc.text(`$${grossSubtotal.toFixed(2)}`, 180, currentY, { align: 'right' });
    currentY += 6;
    
    if (rejectedItemsSum > 0) {
      doc.setTextColor(220, 38, 38);
      doc.text("Adjustments:", 140, currentY); doc.text(`-$${rejectedItemsSum.toFixed(2)}`, 180, currentY, { align: 'right' });
      doc.setTextColor(15, 23, 42); 
      currentY += 6;
    }

    doc.text("Shipping:", 140, currentY); doc.text(`$${Number(order.shipping_amount || 0).toFixed(2)}`, 180, currentY, { align: 'right' });
    currentY += 6;

    doc.text("Tax:", 140, currentY); doc.text(`$${finalTax.toFixed(2)}`, 180, currentY, { align: 'right' });
    currentY += 10;
    
    if (docType === 'receipt') {
      doc.text(`Payment Method: ${order.payment_method?.replace(/_/g, ' ').toUpperCase() || 'CARD'}`, 14, currentY);
      doc.setFont("helvetica", "bold");
      doc.text("Total Paid:", 140, currentY); doc.text(`$${finalTotal.toFixed(2)}`, 180, currentY, { align: 'right' });
      currentY += 6;
      doc.text("Balance Due:", 140, currentY); doc.text("$0.00", 180, currentY, { align: 'right' });
    } else {
      doc.setFont("helvetica", "bold");
      doc.text("Grand Total:", 140, currentY); doc.text(`$${finalTotal.toFixed(2)}`, 180, currentY, { align: 'right' });
    }

    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text("Thank you for your business!", 105, pageHeight - 30, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text("TRICORE MEDICAL SUPPLY", 105, pageHeight - 24, { align: "center" });
    doc.text("2169 Harbor St, Pittsburg CA 94565, United States", 105, pageHeight - 19, { align: "center" });
    doc.text("info@tricoremedicalsupply.com", 105, pageHeight - 14, { align: "center" });
    doc.text("www.tricoremedicalsupply.com", 105, pageHeight - 9, { align: "center" });

    doc.save(`${docType === 'receipt' ? 'Invoice' : 'Invoice'}_${orderNum}.pdf`);
  };

  const getDisplayName = (order) => {
    if (order.companies?.name) return order.companies.name;
    const up = Array.isArray(order.user_profiles) ? order.user_profiles[0] : order.user_profiles;
    return up?.full_name || order.shipping_name || 'Retail Customer';
  };

  const getStatusBadge = (status) => {
    const displayStatus = status === 'delivered_partial' ? 'delivered' : status;
    const styles = { pending: 'bg-yellow-50 text-yellow-700 border-yellow-200', processing: 'bg-blue-50 text-blue-700 border-blue-200', ready_for_delivery: 'bg-purple-50 text-purple-700 border-purple-200', shipped: 'bg-indigo-50 text-indigo-700 border-indigo-200', delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200', delivered_partial: 'bg-emerald-50 text-emerald-700 border-emerald-200', cancelled: 'bg-red-50 text-red-700 border-red-200', attempted: 'bg-amber-50 text-amber-700 border-amber-200', restocked: 'bg-slate-100 text-slate-700 border-slate-300' };
    const icons = { pending: <Clock size={12}/>, processing: <Package size={12}/>, ready_for_delivery: <PackageCheck size={12}/>, shipped: <Truck size={12}/>, delivered: <CheckCircle2 size={12}/>, delivered_partial: <CheckCircle2 size={12}/>, cancelled: <XCircle size={12}/>, attempted: <AlertTriangle size={12}/>, restocked: <RefreshCw size={12}/> };
    return (<span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border shadow-sm flex items-center gap-1.5 w-fit whitespace-nowrap ${styles[status] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>{icons[status]} {displayStatus.replace(/_/g, ' ')}</span>);
  };

  const getPaymentBadge = (paymentStatus, orderStatus) => {
    if (['cancelled', 'restocked', 'attempted'].includes(orderStatus)) return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-400 border border-slate-200 shadow-sm">Voided</span>;
    if (paymentStatus === 'paid') return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm">Paid</span>;
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200 shadow-sm">Unpaid</span>;
  };

  const format12hr = (dateString) => dateString ? new Date(dateString).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }) : '';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 relative">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 pb-2">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-md"><ShieldAlert size={28} strokeWidth={1.5} /></div>
          <div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Order Management</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">Review, approve, and track incoming orders.</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
        <div className="w-full xl:w-auto overflow-x-auto scrollbar-hide rounded-xl">
          <div className="flex gap-2 p-1 bg-slate-100/50 border border-slate-200 w-max rounded-xl">
            <button onClick={() => setActiveTab('all')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'all' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'}`}>All</button>
            <button onClick={() => setActiveTab('pending')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'pending' ? 'bg-red-500 text-white shadow-md' : 'text-red-600 hover:bg-red-50'}`}>{newPendingCount > 0 && <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>}Pending ({tabCounts.pending})</button>
            <button onClick={() => setActiveTab('processing')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'processing' ? 'bg-blue-600 text-white shadow-md' : 'text-blue-600 hover:bg-blue-50'}`}>Processing ({tabCounts.processing})</button>
            <button onClick={() => setActiveTab('shipped')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'shipped' ? 'bg-purple-600 text-white shadow-md' : 'text-purple-600 hover:bg-purple-50'}`}>Shipped ({tabCounts.shipped})</button>
            
            <button onClick={() => setActiveTab('attempted')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'attempted' ? 'bg-amber-600 text-white shadow-md' : 'text-amber-600 hover:bg-amber-50'}`}>Attempted ({tabCounts.attempted})</button>

            <button onClick={() => setActiveTab('completed')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'completed' ? 'bg-emerald-600 text-white shadow-md' : 'text-emerald-600 hover:bg-emerald-50'}`}>Completed ({tabCounts.completed})</button>
            
            {!isWarehouse && (
              <>
                <button onClick={() => setActiveTab('due')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'due' ? 'bg-amber-500 text-white shadow-md' : 'text-amber-600 hover:bg-amber-50'}`}>{tabCounts.due > 0 && <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse"></span>}Due ({tabCounts.due})</button>
                <button onClick={() => setActiveTab('paid')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'paid' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-600 hover:bg-slate-200'}`}><Receipt size={14}/> Paid ({tabCounts.paid})</button>
              </>
            )}

            <button onClick={() => setActiveTab('cancelled')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'cancelled' ? 'bg-red-600 text-white shadow-md' : 'text-red-600 hover:bg-red-50'}`}>Cancelled ({tabCounts.cancelled})</button>
            
            <button onClick={() => setActiveTab('restocked')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'restocked' ? 'bg-slate-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-200/50'}`}>Restocked ({tabCounts.restocked})</button>
          </div>
        </div>
        <div className="relative w-full xl:w-64 shrink-0"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-transparent rounded-xl focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-900 outline-none text-sm font-medium transition-all" /></div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 flex justify-center"><div className="w-8 h-8 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div></div>
      ) : orders.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-3xl border border-slate-200 mt-6"><Package size={56} strokeWidth={1} className="mx-auto text-slate-300 mb-5" /><h3 className="text-xl font-bold text-slate-900 mb-2">No orders found</h3></div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 mt-6 flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-bold tracking-tight rounded-tl-3xl">Order Details</th>
                  <th className="px-6 py-4 font-bold tracking-tight">Date</th>
                  <th className="px-6 py-4 font-bold tracking-tight">Customer / Agency</th>
                  <th className="px-6 py-4 font-bold tracking-tight">Amount</th>
                  <th className="px-6 py-4 font-bold tracking-tight">Status</th>
                  <th className="px-6 py-4 font-bold tracking-tight text-right rounded-tr-3xl"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map(order => {
                  const isExpanded = expandedOrderId === order.id;
                  const isB2B = !!order.company_id;
                  const shortId = order.id.substring(0, 8).toUpperCase();
                  const up = Array.isArray(order.user_profiles) ? order.user_profiles[0] : order.user_profiles;

                  const billName = isB2B ? (order.companies?.name || 'Agency') : (up?.full_name || order.shipping_name || 'Retail Customer');
                  const billEmail = isB2B ? order.companies?.email : (order.shipping_email || up?.email);
                  const billPhone = isB2B ? order.companies?.phone : (order.shipping_phone || up?.contact_number);
                  const billAddress = isB2B ? (order.companies?.address || '') : (order.shipping_address || '');
                  const billCityState = isB2B ? (`${order.companies?.city || ''}, ${order.companies?.state || ''} ${order.companies?.zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '')) : (`${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, ''));

                  const shipName = order.shipping_name || (isB2B ? 'Patient' : billName);
                  const shipEmail = order.shipping_email || order.agency_patients?.email || up?.email;
                  const shipPhone = order.shipping_phone || order.agency_patients?.contact_number || up?.contact_number;
                  const shipAddress = order.shipping_address || 'No shipping address provided';
                  const shipCityState = `${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '');

                  const rawDriverName = order.driver_name || '';
                  const driverParts = rawDriverName.split(' | ');
                  const displayDriverName = driverParts[0];
                  let displayDriverPhone = driverParts[1] || '';

                  if (!displayDriverPhone && displayDriverName) {
                    const assignedDriverObj = drivers.find(d => d.full_name === displayDriverName);
                    displayDriverPhone = assignedDriverObj?.contact_number || '';
                  }

                  const isNet30 = order.payment_method === 'net_30';
                  let isOverdue = false; let isDueSoon = false; let dueDateDisplay = '';

                  if (isNet30) {
                    const placedDate = new Date(order.created_at);
                    const dueDate = new Date(placedDate); dueDate.setDate(dueDate.getDate() + 30);
                    dueDateDisplay = dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                    const diffDays = (dueDate - new Date()) / (1000 * 60 * 60 * 24);
                    if (order.payment_status === 'unpaid' && !['cancelled', 'restocked', 'attempted'].includes(order.status)) {
                      if (diffDays < 0) isOverdue = true; else if (diffDays <= 5) isDueSoon = true;
                    }
                  }

                  // 🚀 DYNAMIC CALCULATIONS FOR SUMMARY (Gross vs Deductions)
                  const rejectedItemsSum = order.order_items?.filter(item => item.status === 'cancelled' || item.status === 'rejected').reduce((sum, item) => sum + (Number(item.line_total) || 0), 0) || 0;
                  const grossSubtotal = order.order_items?.reduce((sum, item) => sum + (Number(item.line_total) || 0), 0) || 0;
                  const finalTax = Number(order.tax_amount || 0);
                  const finalTotal = Number(order.total_amount || 0);

                  return (
                    <React.Fragment key={order.id}>
                      <tr onClick={() => toggleOrderDetails(order.id)} className={`group cursor-pointer transition-colors ${isExpanded ? 'bg-slate-50 border-l-4 border-l-slate-900' : 'hover:bg-slate-50/80 border-l-4 border-transparent'}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors shadow-sm ${isExpanded ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-100 text-slate-500 border-slate-200'}`}><Package size={18} /></div>
                            <div>
                              <p className="font-mono font-bold text-slate-900 text-sm tracking-tight">{shortId}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 flex items-center gap-1"><Hash size={10}/> Order ID</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-slate-700">{new Date(order.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 flex items-center gap-1"><Calendar size={10}/> Placed at {format12hr(order.created_at)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-bold text-slate-900">{getDisplayName(order)}</p>
                          <span className={`inline-flex mt-1 px-1.5 py-0.5 text-[9px] uppercase tracking-widest font-bold rounded shadow-sm ${isB2B ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>{isB2B ? 'B2B Agency' : 'Retail'}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col items-start gap-1">
                            <p className={`font-extrabold text-base ${['cancelled', 'restocked', 'attempted'].includes(order.status) ? 'text-slate-400 line-through' : 'text-slate-900'}`}>${finalTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                            <div className="flex items-center gap-2">
                              {getPaymentBadge(order.payment_status, order.status)}
                              {isOverdue && <span className="text-[9px] font-bold text-red-600 uppercase tracking-widest flex items-center gap-1"><AlertCircle size={10} /> Overdue</span>}
                              {isDueSoon && <span className="text-[9px] font-bold text-amber-600 uppercase tracking-widest flex items-center gap-1"><Clock size={10} /> Due Soon</span>}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col items-start gap-1.5">
                            {getStatusBadge(order.status)}
                            {['delivered', 'delivered_partial'].includes(order.status) && (order.delivered_at || order.updated_at) && (<span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 mt-0.5"><CheckCircle2 size={10} /> {new Date(order.delivered_at || order.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at {format12hr(order.delivered_at || order.updated_at)}</span>)}
                            {order.status === 'cancelled' && (order.cancelled_at || order.updated_at) && (<span className="text-[9px] font-bold text-red-400 uppercase tracking-widest flex items-center gap-1 mt-0.5"><XCircle size={10} /> {new Date(order.cancelled_at || order.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at {format12hr(order.cancelled_at || order.updated_at)}</span>)}
                            
                            {order.status === 'attempted' && (order.updated_at) && (<span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest flex items-center gap-1 mt-0.5"><AlertTriangle size={10} /> {new Date(order.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at {format12hr(order.updated_at)}</span>)}
                            {order.status === 'restocked' && (order.updated_at) && (<span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1 mt-0.5"><RefreshCw size={10} /> {new Date(order.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at {format12hr(order.updated_at)}</span>)}

                            {['processing', 'ready_for_delivery', 'shipped'].includes(order.status) && (<span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 mt-0.5"><Clock size={10} /> Updated at {format12hr(order.shipped_at || order.processing_at || order.updated_at)}</span>)}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button className={`p-1.5 rounded-lg transition-transform duration-200 ${isExpanded ? 'bg-slate-200 text-slate-900 rotate-180' : 'text-slate-400 group-hover:bg-slate-200 group-hover:text-slate-900'}`}><ChevronDown size={20} /></button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50 shadow-inner">
                          <td colSpan="6" className="p-0 border-b border-slate-200">
                            <div className="p-6 sm:p-8 pl-[72px] animate-in slide-in-from-top-2 fade-in duration-200">
                              
                              {(order.status === 'cancelled' || order.status === 'attempted') && order.cancellation_reason && (
                                <div className={`mb-6 p-4 border rounded-2xl flex items-start gap-3 shadow-sm ${order.status === 'attempted' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                                  <AlertTriangle size={20} className={`${order.status === 'attempted' ? 'text-amber-600' : 'text-red-600'} mt-0.5 shrink-0`} />
                                  <div>
                                    <h4 className={`text-sm font-black tracking-tight ${order.status === 'attempted' ? 'text-amber-900' : 'text-red-900'}`}>
                                      {order.status === 'attempted' ? 'Delivery Attempted (Failed)' : 'Order Cancelled'}
                                    </h4>
                                    <p className={`text-sm mt-1 font-medium leading-relaxed ${order.status === 'attempted' ? 'text-amber-700' : 'text-red-700'}`}>
                                      {order.cancellation_reason}
                                    </p>
                                  </div>
                                </div>
                              )}

                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-6 border-b border-slate-200 pb-4">
                                <div>
                                  <h3 className="text-xl font-bold text-slate-900 tracking-tight">Order Management Panel</h3>
                                  <p className="text-sm text-slate-500 font-medium">Review details and process fulfillment</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {order.status === 'pending' && (
                                    <>
                                      <button onClick={(e) => { e.stopPropagation(); handleStatusChangeClick(order.id, 'cancelled'); }} className="px-5 py-2 bg-white border border-red-200 text-red-600 text-sm font-bold rounded-xl shadow-sm hover:bg-red-50 active:scale-95 transition-all">Reject</button>
                                      <button onClick={(e) => { e.stopPropagation(); handleStatusChangeClick(order.id, 'processing'); }} className="px-5 py-2 bg-slate-900 text-white text-sm font-bold rounded-xl shadow-sm hover:bg-slate-800 active:scale-95 transition-all flex items-center gap-2"><CheckCircle2 size={16} /> Approve to Warehouse</button>
                                    </>
                                  )}
                                  
                                  {['delivered', 'delivered_partial'].includes(order.status) && (
                                    <>
                                      {!isWarehouse && (
                                        <button onClick={() => generatePDF(order, order.payment_status === 'paid' ? 'receipt' : 'invoice')} className="px-5 py-2 bg-white border border-slate-200 text-slate-900 text-sm font-bold rounded-xl shadow-sm hover:bg-slate-50 active:scale-95 transition-all flex items-center gap-2"><FileDown size={16} className="text-slate-400" /> {order.payment_status === 'paid' ? 'Download Receipt' : 'Download Invoice'}</button>
                                      )}
                                      {order.payment_status === 'unpaid' && !isWarehouse && (
                                        <button onClick={() => handleMarkAsPaid(order.id)} className="px-5 py-2 bg-emerald-600 text-white text-sm font-bold rounded-xl shadow-sm hover:bg-emerald-700 active:scale-95 transition-all flex items-center gap-2"><CheckCircle2 size={16} /> Mark as Paid</button>
                                      )}
                                    </>
                                  )}

                                  {order.status === 'cancelled' && order.payment_status === 'paid' && !isWarehouse && (
                                      <button onClick={() => generatePDF(order, 'receipt')} className="px-5 py-2 bg-white border border-slate-200 text-slate-900 text-sm font-bold rounded-xl shadow-sm hover:bg-slate-50 active:scale-95 transition-all flex items-center gap-2"><FileDown size={16} className="text-slate-400" /> Download Receipt</button>
                                  )}
                                </div>
                              </div>
                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                <div className="lg:col-span-2 space-y-6">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm group hover:border-slate-300 transition-colors">
                                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><CreditCard size={14}/> Bill To</h4>
                                      <p className="font-bold text-slate-900 text-base mb-2 flex items-center gap-2"><User size={16} className="text-slate-400"/> {billName}</p>
                                      <div className="space-y-2 text-sm font-medium text-slate-600">
                                        <div className="flex flex-col gap-1.5 text-xs text-slate-500">
                                          {billEmail ? (<p className="flex items-center gap-2"><Mail size={14} className="text-slate-400"/> {billEmail}</p>) : (<p className="flex items-center gap-2 text-slate-400 italic"><Mail size={14} className="opacity-50"/> No email saved</p>)}
                                          {billPhone ? (<p className="flex items-center gap-2"><Phone size={14} className="text-slate-400"/> {billPhone}</p>) : (<p className="flex items-center gap-2 text-slate-400 italic"><Phone size={14} className="opacity-50"/> No phone saved</p>)}
                                        </div>
                                        <div className="flex items-start gap-2 pt-2 border-t border-slate-100 mt-2">
                                          <MapPin size={14} className="text-slate-400 mt-0.5 shrink-0"/>
                                          <div className="whitespace-normal leading-relaxed text-sm"><p>{billAddress}</p>{billCityState && <p>{billCityState}</p>}</div>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm group hover:border-slate-300 transition-colors">
                                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Package size={14}/> Ship To</h4>
                                      <p className="font-bold text-slate-900 text-base mb-2 flex items-center gap-2"><User size={16} className="text-slate-400"/> {shipName}</p>
                                      <div className="space-y-2 text-sm font-medium text-slate-600">
                                        <div className="flex flex-col gap-1.5 text-xs text-slate-500">
                                          {shipEmail ? (<p className="flex items-center gap-2"><Mail size={14} className="text-slate-400"/> {shipEmail}</p>) : (<p className="flex items-center gap-2 text-slate-400 italic"><Mail size={14} className="opacity-50"/> No email saved</p>)}
                                          {shipPhone ? (<p className="flex items-center gap-2"><Phone size={14} className="text-slate-400"/> {shipPhone}</p>) : (<p className="flex items-center gap-2 text-slate-400 italic"><Phone size={14} className="opacity-50"/> No phone saved</p>)}
                                        </div>
                                        <div className="flex items-start gap-2 pt-2 border-t border-slate-100 mt-2">
                                          <MapPin size={14} className="text-slate-400 mt-0.5 shrink-0"/>
                                          <div className="whitespace-normal leading-relaxed text-sm"><p>{shipAddress}</p>{shipCityState && <p>{shipCityState}</p>}</div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div className="space-y-3">
                                    <div className="flex items-center justify-between mb-3">
                                      <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider">
                                        <FileText size={16} className="text-slate-400" /> Order Items
                                      </h4>
                                      {order.status === 'pending' && (
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); setItemAction({ show: true, type: 'add', order, item: null, reason: '', newQty: '1', newVariantId: '' }); }} 
                                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-slate-800 active:scale-95 transition-all"
                                        >
                                          <Plus size={14} /> Add Product
                                        </button>
                                      )}
                                    </div>

                                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                      <table className="w-full text-left text-sm whitespace-normal">
                                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-widest">
                                          <tr><th className="px-5 py-3 font-bold w-full">Product</th><th className="px-5 py-3 font-bold text-center">Qty</th><th className="px-5 py-3 font-bold text-right">Total</th>{order.status === 'pending' && <th className="px-5 py-3"></th>}</tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {order.order_items?.map((item) => {
                                            const isItemCancelled = item.status?.toLowerCase() === 'cancelled';
                                            const isItemRejected = item.status?.toLowerCase() === 'rejected';
                                            const isVoided = isItemCancelled || isItemRejected;

                                            return (
                                              <tr key={item.id} className={`hover:bg-slate-50 transition-colors group ${isVoided ? 'opacity-60 bg-slate-50/50' : ''}`}>
                                                <td className="px-5 py-4">
                                                  <p className={`font-bold leading-snug ${isVoided ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{item.product_variants?.products?.name || item.product_variants?.name}</p>
                                                  <p className="text-xs text-slate-500 mt-1 font-medium">Variant: <span className="text-slate-700">{item.product_variants?.name}</span> <span className="mx-1.5 text-slate-300">|</span> SKU: <span className="font-mono text-slate-600">{item.product_variants?.sku || item.product_variants?.products?.base_sku || 'N/A'}</span></p>
                                                  {isItemCancelled && <p className="text-[10px] text-red-600 font-bold mt-1 uppercase tracking-widest">Cancelled: {item.cancellation_reason}</p>}
                                                  {isItemRejected && <p className="text-[10px] text-orange-600 font-bold mt-1 uppercase tracking-widest">Rejected at Delivery</p>}
                                                </td>
                                                <td className="px-5 py-4 text-center">
                                                  <span className={`px-2.5 py-1 font-bold rounded-lg border shadow-sm ${isVoided ? 'bg-slate-100 text-slate-400 border-slate-200 line-through' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>{item.quantity_variants}</span>
                                                </td>
                                                <td className={`px-5 py-4 text-right font-extrabold ${isVoided ? 'text-slate-400 line-through' : 'text-slate-900'}`}>${Number(item.line_total).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                                
                                                {order.status === 'pending' && !isVoided && (
                                                  <td className="px-5 py-4 text-right w-10">
                                                    <div className="flex items-center justify-end gap-1 transition-opacity">
                                                      <button title="Edit Quantity" onClick={(e) => { e.stopPropagation(); setItemAction({ show: true, type: 'edit', order, item, reason: '', newQty: item.quantity_variants, newVariantId: '' })}} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit3 size={16} /></button>
                                                      <button title="Substitute" onClick={(e) => { e.stopPropagation(); setItemAction({ show: true, type: 'substitute', order, item, reason: '', newQty: '', newVariantId: '' })}} className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"><RefreshCw size={16} /></button>
                                                      <button title="Cancel Item" onClick={(e) => { e.stopPropagation(); setItemAction({ show: true, type: 'cancel', order, item, reason: '', newQty: '', newVariantId: '' })}} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><XCircle size={16} /></button>
                                                    </div>
                                                  </td>
                                                )}
                                                {order.status === 'pending' && isVoided && <td className="px-5 py-4 w-10"></td>}
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </div>
                                <div className="space-y-4">
                                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                                    <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider mb-2"><DollarSign size={16} className="text-slate-400" /> Summary</h4>
                                    
                                    <div className="space-y-3 text-sm font-medium">
                                      <div className="flex justify-between text-slate-500">
                                        <span>Subtotal (Gross)</span>
                                        <span className="text-slate-900">${grossSubtotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                                      </div>
                                      
                                      {rejectedItemsSum > 0 && (
                                        <div className="flex justify-between text-red-500 font-bold">
                                          <span>Adjustments (Rejected/Cancelled)</span>
                                          <span>-${rejectedItemsSum.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                                        </div>
                                      )}

                                      <div className="flex justify-between text-slate-500"><span>Shipping</span><span className="text-slate-900">${Number(order.shipping_amount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></div>
                                      <div className="flex justify-between text-slate-500"><span>Tax</span><span className="text-slate-900">${finalTax.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></div>
                                      
                                      <div className="h-px w-full bg-slate-200/60 my-2"></div>
                                      
                                      <div className="flex justify-between items-end">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Grand Total</span>
                                        <span className={`text-2xl font-extrabold tracking-tight leading-none ${['cancelled', 'restocked', 'attempted'].includes(order.status) ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                                          ${finalTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-500">
                                      <div className="flex items-center gap-2"><CreditCard size={14} className="text-slate-400 shrink-0" /><span className="font-bold text-slate-700 capitalize">{order.payment_method.replace('_', ' ')}</span></div>
                                      {getPaymentBadge(order.payment_status, order.status)}
                                    </div>
                                    {isNet30 && (<div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100"><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Due Date</span><span className={`text-xs font-bold px-2 py-0.5 rounded ${isOverdue ? 'bg-red-100 text-red-700 border border-red-200 shadow-sm' : isDueSoon ? 'bg-amber-100 text-amber-700 border border-amber-200 shadow-sm' : 'text-slate-700 bg-slate-100 border border-slate-200'}`}>{dueDateDisplay}</span></div>)}
                                  </div>
                                  {(order.status === 'ready_for_delivery' || order.status === 'shipped' || ['delivered', 'delivered_partial'].includes(order.status)) && order.driver_name && (
                                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                                      <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider mb-2"><Truck size={16} className="text-slate-400" /> Dispatch Info</h4>
                                      <div className="space-y-3 text-sm">
                                        <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Assigned Driver</p><p className="font-bold text-slate-900 flex items-center gap-1.5"><User size={14} className="text-slate-400"/> {displayDriverName}</p></div>
                                        {displayDriverPhone && (<div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Contact Number</p><p className="font-medium text-blue-600 flex items-center gap-1.5"><Phone size={14} className="text-slate-400"/> {displayDriverPhone}</p></div>)}
                                        <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Vehicle</p><p className="font-medium text-slate-700 flex items-center gap-1.5"><Car size={14} className="text-slate-400"/> {order.vehicle_name || 'Assigned Vehicle'}</p></div>
                                        {order.vehicle_license && (<div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">License Plate</p><p className="font-mono font-bold text-slate-700 flex items-center gap-1.5"><Hash size={14} className="text-slate-400"/> {order.vehicle_license}</p></div>)}
                                      </div>
                                    </div>
                                  )}
                                  {['delivered', 'delivered_partial'].includes(order.status) && (order.photo_url || order.signature_url || order.received_by) && (
                                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                                      <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider mb-2"><PackageCheck size={16} className="text-slate-400" /> Proof of Delivery</h4>
                                      {order.received_by && (<div className="mb-4 p-3 bg-emerald-50 rounded-xl border border-emerald-100"><p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Received By</p><p className="font-bold text-slate-900 flex items-center gap-2 text-sm"><User size={14} className="text-emerald-500" /> {order.received_by}</p></div>)}
                                      <div className="grid grid-cols-2 gap-3">
                                        {order.photo_url && (<div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Photo</p><a href={order.photo_url} target="_blank" rel="noreferrer" className="block relative group rounded-xl overflow-hidden border border-slate-200 shadow-sm"><img src={order.photo_url} alt="Delivery Proof" className="w-full h-24 object-cover group-hover:scale-105 transition-transform duration-300" /><div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors"></div></a></div>)}
                                        {order.signature_url && (<div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Signature</p><a href={order.signature_url} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border border-slate-200 bg-white p-2 hover:border-slate-300 transition-colors shadow-sm"><img src={order.signature_url} alt="Customer Signature" className="w-full h-20 object-contain mix-blend-multiply" /></a></div>)}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalCount > pageSize && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-3xl">
              <span className="text-sm font-medium text-slate-500">Showing <span className="font-bold text-slate-900">{page * pageSize + 1}</span> to <span className="font-bold text-slate-900">{Math.min((page + 1) * pageSize, totalCount)}</span> of <span className="font-bold text-slate-900">{totalCount}</span> entries</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"><ChevronLeft size={18} /></button>
                <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * pageSize >= totalCount} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"><ChevronRight size={18} /></button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* MODALS */}
      {confirmAction.show && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center border border-slate-100">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border shadow-sm ${confirmAction.title.includes('Reject') ? 'bg-red-50 text-red-600 border-red-100' : 'bg-slate-50 text-slate-900 border-slate-200'}`}>{confirmAction.title.includes('Reject') ? <XCircle size={32} /> : <CheckCircle2 size={32} />}</div>
            <h4 className="text-xl font-bold text-slate-900 tracking-tight">{confirmAction.title}</h4>
            <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">{confirmAction.message}</p>
            
            {confirmAction.title.includes('Reject') && (
              <div className="mt-4 text-left">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">Cancellation Reason</label>
                <textarea 
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g., 0 Inventory, Out of Stock..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 outline-none resize-none h-20"
                />
              </div>
            )}

            <div className="flex gap-3 pt-5">
              <button onClick={() => { setConfirmAction({ show: false, title: '', message: '', onConfirm: null }); setCancelReason(''); }} className="w-full py-3 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 active:bg-slate-100 active:scale-95 transition-all">Cancel</button>
              <button 
                onClick={() => { confirmAction.onConfirm(cancelReason); setCancelReason(''); }} 
                disabled={confirmAction.title.includes('Reject') && !cancelReason.trim()}
                className={`w-full py-3 text-sm text-white font-bold rounded-xl shadow-md active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${confirmAction.title.includes('Reject') ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800'}`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {itemAction.show && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center border border-slate-100">
            
            {itemAction.type === 'add' && (
              <>
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border shadow-sm bg-emerald-50 text-emerald-600 border-emerald-100"><Plus size={32} /></div>
                <h4 className="text-xl font-bold text-slate-900 tracking-tight">Add Product</h4>
                <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">Search and add a new product to this order.</p>
                
                <div className="mt-4 text-left">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">Search Product</label>
                  
                  {!selectedSubstitute ? (
                    <div className="relative">
                      <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" value={substituteSearch} onChange={(e) => setSubstituteSearch(e.target.value)} placeholder="Search by name or SKU..." className="w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                      </div>
                      
                      {substituteSearch.trim() !== '' && (
                        <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100 text-left">
                          {availableVariants.filter(v => {
                            const searchLower = substituteSearch.toLowerCase();
                            return (v.name && v.name.toLowerCase().includes(searchLower)) ||
                                   (v.sku && v.sku.toLowerCase().includes(searchLower)) ||
                                   (v.products?.name && v.products.name.toLowerCase().includes(searchLower)) ||
                                   (v.products?.base_sku && v.products.base_sku.toLowerCase().includes(searchLower));
                          }).map(variant => (
                            <button key={variant.id} onClick={() => setSelectedSubstitute(variant)} className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 transition-colors flex flex-col gap-0.5">
                              <span className="text-sm font-bold text-slate-900">{variant.products?.name} - {variant.name}</span>
                              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">SKU: <span className="text-slate-700 font-mono">{variant.sku || variant.products?.base_sku || 'N/A'}</span> | Price: ${Number(variant.price).toFixed(2)}</span>
                            </button>
                          ))}
                          {availableVariants.filter(v => {
                            const searchLower = substituteSearch.toLowerCase();
                            return (v.name && v.name.toLowerCase().includes(searchLower)) || (v.sku && v.sku.toLowerCase().includes(searchLower)) || (v.products?.name && v.products.name.toLowerCase().includes(searchLower)) || (v.products?.base_sku && v.products.base_sku.toLowerCase().includes(searchLower));
                          }).length === 0 && (
                            <div className="px-4 py-3 text-sm text-slate-500 text-center italic">No products found.</div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between shadow-sm">
                        <div>
                          <p className="font-bold text-emerald-900 text-sm leading-tight">{selectedSubstitute.products?.name} - {selectedSubstitute.name}</p>
                          <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest mt-1">SKU: {selectedSubstitute.sku || selectedSubstitute.products?.base_sku || 'N/A'} | ${Number(selectedSubstitute.price).toFixed(2)}</p>
                        </div>
                        <button onClick={() => { setSelectedSubstitute(null); setSubstituteSearch(''); }} className="p-1.5 bg-white rounded-lg text-emerald-400 hover:text-emerald-600 hover:bg-emerald-100 transition-colors shrink-0 shadow-sm"><X size={16} /></button>
                      </div>
                      
                      <div>
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">Quantity</label>
                        <input type="number" min="1" value={itemAction.newQty} onChange={(e) => setItemAction({...itemAction, newQty: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-3 font-medium">The order subtotal and total amount will recalculate automatically.</p>
                </div>

                <div className="flex gap-3 pt-5">
                  <button onClick={() => { setItemAction({ show: false, type: '', order: null, item: null, reason: '', newQty: '', newVariantId: '' }); setSelectedSubstitute(null); setSubstituteSearch(''); }} className="w-full py-3 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 active:scale-95 transition-all">Cancel</button>
                  <button onClick={executeItemAdd} disabled={!selectedSubstitute || !itemAction.newQty || itemAction.newQty <= 0} className="w-full py-3 text-sm text-white font-bold rounded-xl shadow-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 active:scale-95 transition-all">Add to Order</button>
                </div>
              </>
            )}

            {itemAction.type === 'cancel' && (
              <>
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border shadow-sm bg-red-50 text-red-600 border-red-100"><XCircle size={32} /></div>
                <h4 className="text-xl font-bold text-slate-900 tracking-tight">Cancel Item</h4>
                <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">Remove <span className="font-bold text-slate-700">{itemAction.item?.product_variants?.name}</span> from the order?</p>
                <div className="mt-4 text-left">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">Cancellation Reason</label>
                  <textarea value={itemAction.reason} onChange={(e) => setItemAction({...itemAction, reason: e.target.value})} placeholder="Reason for canceling this item..." className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 outline-none resize-none h-20"/>
                </div>
                <div className="flex gap-3 pt-5">
                  <button onClick={() => setItemAction({ show: false, type: '', order: null, item: null, reason: '', newQty: '', newVariantId: '' })} className="w-full py-3 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 transition-all">Go Back</button>
                  <button onClick={executeItemCancel} disabled={!itemAction.reason.trim()} className="w-full py-3 text-sm text-white font-bold rounded-xl shadow-md bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-all">Confirm Cancel</button>
                </div>
              </>
            )}

            {itemAction.type === 'edit' && (
              <>
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border shadow-sm bg-blue-50 text-blue-600 border-blue-100"><Edit3 size={32} /></div>
                <h4 className="text-xl font-bold text-slate-900 tracking-tight">Edit Quantity</h4>
                <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">Update the quantity for <span className="font-bold text-slate-700">{itemAction.item?.product_variants?.name}</span>.</p>
                <div className="mt-4 text-left">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">New Quantity</label>
                  <input type="number" min="1" value={itemAction.newQty} onChange={(e) => setItemAction({...itemAction, newQty: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  <p className="text-xs text-slate-400 mt-2">The order subtotal and total amount will recalculate automatically.</p>
                </div>
                <div className="flex gap-3 pt-5">
                  <button onClick={() => setItemAction({ show: false, type: '', order: null, item: null, reason: '', newQty: '', newVariantId: '' })} className="w-full py-3 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 transition-all">Cancel</button>
                  <button onClick={executeItemEdit} disabled={!itemAction.newQty || itemAction.newQty <= 0} className="w-full py-3 text-sm text-white font-bold rounded-xl shadow-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-all">Update Quantity</button>
                </div>
              </>
            )}

            {itemAction.type === 'substitute' && (
              <>
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border shadow-sm bg-purple-50 text-purple-600 border-purple-100"><RefreshCw size={32} /></div>
                <h4 className="text-xl font-bold text-slate-900 tracking-tight">Substitute Product</h4>
                <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">Replace <span className="font-bold text-slate-700">{itemAction.item?.product_variants?.name}</span> with a different item.</p>
                
                <div className="mt-4 text-left">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">Search Replacement</label>
                  
                  {!selectedSubstitute ? (
                    <div className="relative">
                      <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" value={substituteSearch} onChange={(e) => setSubstituteSearch(e.target.value)} placeholder="Search by name or SKU..." className="w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
                      </div>
                      
                      {substituteSearch.trim() !== '' && (
                        <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100 text-left">
                          {availableVariants.filter(v => {
                            const searchLower = substituteSearch.toLowerCase();
                            return (v.name && v.name.toLowerCase().includes(searchLower)) ||
                                   (v.sku && v.sku.toLowerCase().includes(searchLower)) ||
                                   (v.products?.name && v.products.name.toLowerCase().includes(searchLower)) ||
                                   (v.products?.base_sku && v.products.base_sku.toLowerCase().includes(searchLower));
                          }).map(variant => (
                            <button key={variant.id} onClick={() => setSelectedSubstitute(variant)} className="w-full text-left px-4 py-2.5 hover:bg-purple-50 transition-colors flex flex-col gap-0.5">
                              <span className="text-sm font-bold text-slate-900">{variant.products?.name} - {variant.name}</span>
                              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">SKU: <span className="text-slate-700 font-mono">{variant.sku || variant.products?.base_sku || 'N/A'}</span> | Price: ${Number(variant.price).toFixed(2)}</span>
                            </button>
                          ))}
                          {availableVariants.filter(v => {
                            const searchLower = substituteSearch.toLowerCase();
                            return (v.name && v.name.toLowerCase().includes(searchLower)) || (v.sku && v.sku.toLowerCase().includes(searchLower)) || (v.products?.name && v.products.name.toLowerCase().includes(searchLower)) || (v.products?.base_sku && v.products.base_sku.toLowerCase().includes(searchLower));
                          }).length === 0 && (
                            <div className="px-4 py-3 text-sm text-slate-500 text-center italic">No products found.</div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between shadow-sm">
                      <div>
                        <p className="font-bold text-purple-900 text-sm leading-tight">{selectedSubstitute.products?.name} - {selectedSubstitute.name}</p>
                        <p className="text-[11px] font-bold text-purple-600 uppercase tracking-widest mt-1">SKU: {selectedSubstitute.sku || selectedSubstitute.products?.base_sku || 'N/A'} | ${Number(selectedSubstitute.price).toFixed(2)}</p>
                      </div>
                      <button onClick={() => { setSelectedSubstitute(null); setSubstituteSearch(''); }} className="p-1.5 bg-white rounded-lg text-purple-400 hover:text-purple-600 hover:bg-purple-100 transition-colors shrink-0 shadow-sm"><X size={16} /></button>
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-3 font-medium">The order subtotal and total amount will recalculate automatically based on the new item's price.</p>
                </div>

                <div className="flex gap-3 pt-5">
                  <button onClick={() => { setItemAction({ show: false, type: '', order: null, item: null, reason: '', newQty: '', newVariantId: '' }); setSelectedSubstitute(null); setSubstituteSearch(''); }} className="w-full py-3 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 active:scale-95 transition-all">Cancel</button>
                  <button onClick={executeItemSubstitute} disabled={!selectedSubstitute} className="w-full py-3 text-sm text-white font-bold rounded-xl shadow-md bg-purple-600 hover:bg-purple-700 disabled:opacity-50 active:scale-95 transition-all">Confirm Swap</button>
                </div>
              </>
            )}

          </div>
        </div>
      )}

      {notification.show && (
        <div className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 z-[120] flex items-center gap-3 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className={`p-1.5 rounded-full ${notification.isError ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{notification.isError ? <XCircle size={18} strokeWidth={2.5} /> : <CheckCircle2 size={18} strokeWidth={2.5} />}</div>
          <p className="text-sm font-medium pr-2">{notification.message}</p>
        </div>
      )}
    </div>
  );
}