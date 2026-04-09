import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Calendar, Download, DollarSign, ShoppingCart, 
  TrendingUp, FileText, Search, ArrowRight, Package, FileDown, FileBarChart,
  ChevronLeft, ChevronRight, Loader2, ChevronDown, Percent, CreditCard, Lock
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Reports() {
  const [reportType, setReportType] = useState('itemized'); 
  const [staffName, setStaffName] = useState('Staff Member');
  const [userRole, setUserRole] = useState(null); 
  const [authLoading, setAuthLoading] = useState(true); 
  
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const [tableData, setTableData] = useState([]);
  const [kpis, setKpis] = useState({ rev: 0, tax: 0, ship: 0, gross: 0, caS: 0, outS: 0, caT: 0, orderCount: 0 });
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  
  const [topProductsData, setTopProductsData] = useState([]);
  const [analyticsKpis, setAnalyticsKpis] = useState({ revenue: 0, itemsSold: 0, totalOrders: 0 });

  const [profitabilityData, setProfitabilityData] = useState([]);
  const [profitabilityKpis, setProfitabilityKpis] = useState({ revenue: 0, cogs: 0, profit: 0, avgMargin: 0 });

  const [warehouseData, setWarehouseData] = useState([]);

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  const adminReportOptions = [
    { value: 'itemized', label: 'Itemized Sales Summary' },
    { value: 'ca_tax', label: 'California Sales Tax Report' },
    { value: 'top_products', label: 'Top 100 Products Analytics' },
    { value: 'profitability', label: 'Product Profitability Report' },
    { value: 'warehouse_summary', label: 'Warehouse Order Summary' }
  ];

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('user_profiles').select('full_name, role').eq('id', user.id).single();
        if (data?.full_name) setStaffName(data.full_name);
        if (data?.role) {
          setUserRole(data.role);
          if (data.role === 'warehouse') {
            setReportType('warehouse_summary');
          }
        }
      }
      setAuthLoading(false);
    };
    fetchUser();
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); 
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [reportType, startDate, endDate, pageSize]);

  useEffect(() => {
    if (authLoading) return;

    fetchKPIs();
    if (reportType === 'top_products') {
      fetchTopProductsAnalytics();
    } else if (reportType === 'profitability') {
      fetchProfitabilityReport();
    } else if (reportType === 'warehouse_summary') {
      fetchWarehouseSummary();
    } else {
      fetchTableData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, reportType, debouncedSearch, currentPage, pageSize, authLoading]);

  const fetchKPIs = async () => {
    const adjustedEndDate = new Date(endDate);
    adjustedEndDate.setHours(23, 59, 59, 999);

    let query = supabase.from('orders')
      .select('id, total_amount, tax_amount, shipping_amount, subtotal, shipping_state, shipping_name, status')
      .neq('status', 'cancelled')
      .gte('created_at', new Date(startDate).toISOString())
      .lte('created_at', adjustedEndDate.toISOString());

    if (debouncedSearch) {
      query = query.or(`id.ilike.%${debouncedSearch}%,shipping_name.ilike.%${debouncedSearch}%`);
    }

    const { data, error } = await query;
    if (error) return console.error('Error fetching KPIs:', error);

    let rev = 0, tax = 0, ship = 0, gross = 0, caS = 0, outS = 0, caT = 0;
    (data || []).forEach(o => {
      rev += Number(o.total_amount || 0);
      tax += Number(o.tax_amount || 0);
      ship += Number(o.shipping_amount || 0);
      gross += Number(o.total_amount || 0);
      const state = (o.shipping_state || '').trim().toLowerCase();
      if (state === 'ca' || state === 'california') {
        caS += Number(o.subtotal || 0) + Number(o.shipping_amount || 0); 
        caT += Number(o.tax_amount || 0);
      } else {
        outS += Number(o.total_amount || 0);
      }
    });

    setKpis({ rev, tax, ship, gross, caS, outS, caT, orderCount: (data || []).length });
  };

  const fetchTableData = async () => {
    setLoading(true);
    try {
      const adjustedEndDate = new Date(endDate);
      adjustedEndDate.setHours(23, 59, 59, 999);

      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase.from('orders').select(`
        id, created_at, status, subtotal, shipping_amount, tax_amount, total_amount, company_id,
        shipping_name, shipping_address, shipping_city, shipping_state, shipping_zip,
        companies ( name )
        ${reportType === 'itemized' ? `, order_items ( quantity_variants, unit_price, line_total, product_variants ( name, sku, products ( name, base_sku ) ) )` : ''}
      `, { count: 'exact' })
      .neq('status', 'cancelled')
      .gte('created_at', new Date(startDate).toISOString())
      .lte('created_at', adjustedEndDate.toISOString())
      .order('created_at', { ascending: false });

      if (debouncedSearch) {
        query = query.or(`id.ilike.%${debouncedSearch}%,shipping_name.ilike.%${debouncedSearch}%`);
      }

      const { data, count, error } = await query.range(from, to);
      if (error) throw error;

      let formatted = formatData(data || []);

      setTableData(formatted);
      setTotalCount(count || 0); 
    } catch (error) {
      console.error('Error fetching table data:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTopProductsAnalytics = async () => {
    setLoading(true);
    try {
      const adjustedEndDate = new Date(endDate);
      adjustedEndDate.setHours(23, 59, 59, 999);

      let query = supabase.from('order_items').select(`
        quantity_variants, line_total, status, product_variant_id,
        orders!inner ( id, created_at, status, shipping_name, companies(name), user_profiles(full_name) ),
        product_variants ( name, sku, products(name) )
      `)
      .neq('status', 'cancelled')
      .neq('orders.status', 'cancelled')
      .gte('orders.created_at', new Date(startDate).toISOString())
      .lte('orders.created_at', adjustedEndDate.toISOString());

      let allData = [];
      let currentOffset = 0;
      const chunk = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await query.range(currentOffset, currentOffset + chunk - 1);
        if (error) throw error;
        allData = [...allData, ...data];
        if (data.length < chunk) hasMore = false;
        currentOffset += chunk;
      }

      let rev = 0;
      let items = 0;
      const uniqueOrders = new Set();
      const productMap = {};

      allData.forEach(row => {
        const isB2B = !!row.orders.companies?.name;
        const up = Array.isArray(row.orders.user_profiles) ? row.orders.user_profiles[0] : row.orders.user_profiles;
        const buyerName = isB2B ? row.orders.companies.name : (up?.full_name || row.orders.shipping_name || 'Retail Customer');
        const pName = row.product_variants?.products?.name || row.product_variants?.name || 'Unknown';
        const pSku = row.product_variants?.sku || '';

        uniqueOrders.add(row.orders.id);
        const qty = Number(row.quantity_variants || 0);
        const lineTotal = Number(row.line_total || 0);
        rev += lineTotal;
        items += qty;

        const vId = row.product_variant_id;
        if (!productMap[vId]) {
          productMap[vId] = { id: vId, name: pName, sku: pSku, totalQty: 0, totalRevenue: 0, buyers: {} };
        }

        productMap[vId].totalQty += qty;
        productMap[vId].totalRevenue += lineTotal;
        
        if (!productMap[vId].buyers[buyerName]) productMap[vId].buyers[buyerName] = 0;
        productMap[vId].buyers[buyerName] += qty;
      });

      setAnalyticsKpis({ revenue: rev, itemsSold: items, totalOrders: uniqueOrders.size });

      let sortedProducts = Object.values(productMap).map(p => {
        p.topBuyersArray = Object.entries(p.buyers)
          .sort((a, b) => b[1] - a[1]) 
          .slice(0, 3) 
          .map(b => ({ name: b[0], qty: b[1] }));
        return p;
      }).sort((a, b) => b.totalQty - a.totalQty);

      if (debouncedSearch) {
        const s = debouncedSearch.toLowerCase();
        sortedProducts = sortedProducts.filter(p => 
          p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s)
        );
      }

      setTopProductsData(sortedProducts.slice(0, 100)); 
      setTotalCount(Math.min(sortedProducts.length, 100));
    } catch (error) {
      console.error('Error generating analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfitabilityReport = async () => {
    setLoading(true);
    try {
      const adjustedEndDate = new Date(endDate);
      adjustedEndDate.setHours(23, 59, 59, 999);

      let query = supabase.from('order_items').select(`
        quantity_variants, line_total, status, product_variant_id,
        orders!inner ( id, created_at, status, shipping_name, companies(name), user_profiles(full_name) ),
        product_variants ( name, sku, unit_cost, products(name) )
      `)
      .neq('status', 'cancelled')
      .neq('orders.status', 'cancelled')
      .gte('orders.created_at', new Date(startDate).toISOString())
      .lte('orders.created_at', adjustedEndDate.toISOString());

      let allData = [];
      let currentOffset = 0;
      const chunk = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await query.range(currentOffset, currentOffset + chunk - 1);
        if (error) throw error;
        allData = [...allData, ...data];
        if (data.length < chunk) hasMore = false;
        currentOffset += chunk;
      }

      let rev = 0;
      let cogs = 0;
      const productMap = {};

      allData.forEach(row => {
        const pName = row.product_variants?.products?.name || row.product_variants?.name || 'Unknown';
        const pSku = row.product_variants?.sku || '';

        const qty = Number(row.quantity_variants || 0);
        const lineTotal = Number(row.line_total || 0);
        const unitCost = Number(row.product_variants?.unit_cost || 0);
        const lineCogs = qty * unitCost;

        rev += lineTotal;
        cogs += lineCogs;

        const vId = row.product_variant_id;
        if (!productMap[vId]) {
          productMap[vId] = { id: vId, name: pName, sku: pSku, totalQty: 0, totalRevenue: 0, totalCogs: 0 };
        }

        productMap[vId].totalQty += qty;
        productMap[vId].totalRevenue += lineTotal;
        productMap[vId].totalCogs += lineCogs;
      });

      const profit = rev - cogs;
      const avgMargin = rev > 0 ? ((profit / rev) * 100) : 0;
      
      setProfitabilityKpis({ revenue: rev, cogs, profit, avgMargin });

      let sortedProducts = Object.values(productMap).map(p => {
        p.grossProfit = p.totalRevenue - p.totalCogs;
        p.margin = p.totalRevenue > 0 ? ((p.grossProfit / p.totalRevenue) * 100) : 0;
        return p;
      }).sort((a, b) => b.grossProfit - a.grossProfit);

      if (debouncedSearch) {
        const s = debouncedSearch.toLowerCase();
        sortedProducts = sortedProducts.filter(p => 
          p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s)
        );
      }

      setProfitabilityData(sortedProducts);
      setTotalCount(sortedProducts.length);
    } catch (error) {
      console.error('Error generating profitability:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWarehouseSummary = async () => {
    setLoading(true);
    try {
      const adjustedEndDate = new Date(endDate);
      adjustedEndDate.setHours(23, 59, 59, 999);

      let query = supabase.from('orders').select(`
        id, status, company_id, created_at,
        shipping_name, shipping_address, shipping_city, shipping_state, shipping_zip,
        companies ( name, address, city, state, zip ),
        order_items ( quantity_variants, status, product_variant_id, product_variants ( name, sku, products ( name ) ) )
      `)
      .neq('status', 'cancelled')
      .gte('created_at', new Date(startDate).toISOString())
      .lte('created_at', adjustedEndDate.toISOString())
      .order('created_at', { ascending: false });

      let allData = [];
      let currentOffset = 0;
      const chunk = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await query.range(currentOffset, currentOffset + chunk - 1);
        if (error) throw error;
        allData = [...allData, ...data];
        if (data.length < chunk) hasMore = false;
        currentOffset += chunk;
      }

      const customerMap = {};

      allData.forEach(order => {
        const isB2B = !!order.company_id;
        const custName = isB2B ? (order.companies?.name || 'Agency') : (order.shipping_name || 'Retail Customer');
        const address = isB2B ? order.companies?.address : order.shipping_address;
        const city = isB2B ? order.companies?.city : order.shipping_city;
        const state = isB2B ? order.companies?.state : order.shipping_state;
        const zip = isB2B ? order.companies?.zip : order.shipping_zip;
        
        const fullAddress = `${address || ''} ${city || ''} ${state || ''} ${zip || ''}`.replace(/\s+/g, ' ').trim() || 'No Address Provided';
        const custKey = `${custName}_${fullAddress}`;

        if (!customerMap[custKey]) {
          customerMap[custKey] = { 
            name: custName, 
            address: fullAddress, 
            items: {}, 
            latestOrder: order.created_at
          };
        } else {
          if (new Date(order.created_at) > new Date(customerMap[custKey].latestOrder)) {
            customerMap[custKey].latestOrder = order.created_at;
          }
        }

        const patientName = order.shipping_name ? String(order.shipping_name).trim().toUpperCase() : '';

        order.order_items?.forEach(item => {
          if (item.status === 'cancelled') return;

          const qty = Number(item.quantity_variants || 0);
          const pName = item.product_variants?.products?.name || 'Unknown Item';
          const vName = item.product_variants?.name || '';
          const sku = item.product_variants?.sku || '';
          
          const itemKey = `${sku}_${pName}_${patientName}`; 

          if (!customerMap[custKey].items[itemKey]) {
            customerMap[custKey].items[itemKey] = { name: pName, variant: vName, sku, qty: 0, patientName };
          }
          customerMap[custKey].items[itemKey].qty += qty;
        });
      });

      let finalData = Object.values(customerMap).map(c => ({
        ...c,
        items: Object.values(c.items).sort((a, b) => {
          if (a.patientName === '' && b.patientName !== '') return -1;
          if (b.patientName === '' && a.patientName !== '') return 1;
          return a.patientName.localeCompare(b.patientName) || a.name.localeCompare(b.name);
        })
      })).sort((a, b) => new Date(b.latestOrder) - new Date(a.latestOrder));

      if (debouncedSearch) {
        const s = debouncedSearch.toLowerCase();
        finalData = finalData.filter(cust => 
          cust.name.toLowerCase().includes(s) || cust.address.toLowerCase().includes(s)
        );
      }

      const structuredData = finalData.map(c => {
        const patientsMap = {};
        c.items.forEach(item => {
          if (!patientsMap[item.patientName]) patientsMap[item.patientName] = [];
          patientsMap[item.patientName].push(item);
        });

        const patientsArray = Object.entries(patientsMap).map(([pName, items]) => ({
          patientName: pName,
          items: items
        })).sort((a, b) => {
          if (a.patientName === '') return -1;
          if (b.patientName === '') return 1;
          return a.patientName.localeCompare(b.patientName);
        });

        return { ...c, patients: patientsArray };
      });

      setWarehouseData(structuredData);
      setTotalCount(structuredData.length); 

    } catch (error) {
      console.error('Error generating warehouse summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatData = (rawData) => {
    const formatted = [];
    rawData.forEach(order => {
      const customer = order.company_id ? (order.companies?.name || 'Agency') : (order.shipping_name || 'Retail Customer');
      const streetAddress = order.shipping_address || 'N/A';
      const city = order.shipping_city || 'N/A';
      const state = (order.shipping_state || 'N/A').trim();
      const zipCode = order.shipping_zip || 'N/A';

      if (reportType === 'itemized') {
        (order.order_items || []).forEach(item => {
          formatted.push({
            orderId: order.id.substring(0, 8).toUpperCase(),
            date: new Date(order.created_at).toLocaleDateString(),
            customer,
            patientName: order.shipping_name || 'N/A',
            product: item.product_variants?.products?.name || item.product_variants?.name || 'Unknown Product',
            variant: item.product_variants?.name || 'N/A',
            sku: item.product_variants?.sku || item.product_variants?.products?.base_sku || 'N/A',
            qty: item.quantity_variants || 0,
            streetAddress, city, state, zipCode
          });
        });
      } else {
        formatted.push({
          id: order.id.substring(0, 8).toUpperCase(),
          date: new Date(order.created_at).toLocaleDateString(),
          customer, streetAddress, city, state, zipCode,
          isCA: ['ca', 'california'].includes(state.toLowerCase()),
          subtotal: Number(order.subtotal || 0),
          shipping: Number(order.shipping_amount || 0),
          tax: Number(order.tax_amount || 0),
          total: Number(order.total_amount || 0),
        });
      }
    });
    return formatted;
  };

  const fetchFullDataForExport = async () => {
    const adjustedEndDate = new Date(endDate);
    adjustedEndDate.setHours(23, 59, 59, 999);

    let query = supabase.from('orders').select(`
      id, created_at, status, subtotal, shipping_amount, tax_amount, total_amount, company_id,
      shipping_name, shipping_address, shipping_city, shipping_state, shipping_zip,
      companies ( name, address, city, state, zip )
      ${reportType === 'itemized' ? `, order_items ( quantity_variants, unit_price, line_total, product_variants ( name, sku, products ( name, base_sku ) ) )` : ''}
    `)
    .neq('status', 'cancelled')
    .gte('created_at', new Date(startDate).toISOString())
    .lte('created_at', adjustedEndDate.toISOString())
    .order('created_at', { ascending: false });

    if (debouncedSearch) {
      query = query.or(`id.ilike.%${debouncedSearch}%,shipping_name.ilike.%${debouncedSearch}%`);
    }

    let allData = [];
    let currentOffset = 0;
    const chunk = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await query.range(currentOffset, currentOffset + chunk - 1);
      if (error) throw error;
      allData = [...allData, ...data];
      if (data.length < chunk) hasMore = false;
      currentOffset += chunk;
    }

    return formatData(allData);
  };

  // 🚀 FIXED: Added back the paginated slices for the analytical reports!
  const paginatedTopProducts = topProductsData.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const paginatedProfitability = profitabilityData.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const paginatedWarehouse = warehouseData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const exportToCSV = async () => {
    setIsExporting(true);
    try {
      let csvContent = "";
      let fileName = "";

      if (reportType === 'top_products') {
        const headers = ["Rank", "Product", "SKU", "Units Sold", "Gross Revenue", "Top Buyers"];
        const rows = topProductsData.map((p, i) => {
          const topBuyersString = p.topBuyersArray.map(b => `${b.name} (${b.qty})`).join(' | ');
          return [ i + 1, `"${p.name}"`, `"${p.sku}"`, p.totalQty, p.totalRevenue.toFixed(2), `"${topBuyersString}"` ];
        });
        csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        fileName = `Tricore_Top_Products_${startDate}_to_${endDate}.csv`;
        
      } else if (reportType === 'profitability') {
        const headers = ["Rank", "Product", "SKU", "Units Sold", "Total COGS", "Gross Revenue", "Gross Profit", "Margin %"];
        const rows = profitabilityData.map((p, i) => [
          i + 1, `"${p.name}"`, `"${p.sku}"`, p.totalQty, p.totalCogs.toFixed(2), p.totalRevenue.toFixed(2), p.grossProfit.toFixed(2), `${p.margin.toFixed(1)}%`
        ]);
        csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        fileName = `Tricore_Profitability_Report_${startDate}_to_${endDate}.csv`;
        
      } else if (reportType === 'warehouse_summary') {
        const headers = ["Customer/Agency", "Address", "Patient Name", "Item Qty", "Variant", "Product Name", "SKU"];
        const rows = [];
        warehouseData.forEach(cust => {
          cust.patients.forEach(p => {
            p.items.forEach(item => {
              const variantStr = (item.variant && item.variant !== 'Default') ? item.variant : '';
              rows.push([
                `"${cust.name}"`, `"${cust.address}"`, `"${p.patientName}"`,
                item.qty, `"${variantStr}"`, `"${item.name}"`, `"${item.sku}"`
              ]);
            });
          });
        });
        csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        fileName = `Tricore_Warehouse_Order_Summary_${startDate}_to_${endDate}.csv`;

      } else {
        const fullExportData = await fetchFullDataForExport();

        const headers = reportType === 'itemized' 
          ? ["Order ID", "Date", "Agency/Customer", "Patient Name", "Product", "Variant", "SKU", "Qty", "Street", "City", "State", "Zip"]
          : ["Order ID", "Date", "Customer", "Street", "City", "State", "Zip", "CA?", "Subtotal", "Shipping", "Tax", "Total"];
        
        const rows = fullExportData.map(r => reportType === 'itemized'
          ? [`"${r.orderId}"`, `"${r.date}"`, `"${r.customer}"`, `"${r.patientName}"`, `"${r.product}"`, `"${r.variant}"`, `"${r.sku}"`, r.qty, `"${r.streetAddress}"`, `"${r.city}"`, `"${r.state}"`, `"${r.zipCode}"`]
          : [`"${r.id}"`, `"${r.date}"`, `"${r.customer}"`, `"${r.streetAddress}"`, `"${r.city}"`, `"${r.state}"`, `"${r.zipCode}"`, r.isCA ? 'Yes' : 'No', r.subtotal, r.shipping, r.tax, r.total]
        );

        csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        fileName = `Tricore_${reportType}_Report_${startDate}_to_${endDate}.csv`;
      }

      if (csvContent) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to generate CSV.");
    } finally {
      setIsExporting(false);
    }
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

  const exportToPDF = async () => {
    setIsExporting(true);
    
    const isWarehouse = reportType === 'warehouse_summary';
    const doc = new jsPDF(isWarehouse ? 'portrait' : 'landscape');
    
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const logoData = await getBase64ImageFromUrl('/images/tricore-logo2.png');
    
    let tableStartY = 45; 

    const drawHeader = () => {
      let textStartY = 25;
      if (logoData) {
        const imgWidth = 40; 
        const imgHeight = (logoData.height * imgWidth) / logoData.width; 
        doc.addImage(logoData.dataURL, 'PNG', 14, 10, imgWidth, imgHeight); 
        textStartY = 10 + imgHeight + 6; 
      } else {
        doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42); 
        doc.text("TRICORE MEDICAL SUPPLY", 14, 18);
      }

      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100);
      doc.text("2169 Harbor St, Pittsburg CA 94565, United States", 14, textStartY);
      doc.text("info@tricoremedicalsupply.com | www.tricoremedicalsupply.com", 14, textStartY + 5);

      doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42);
      
      let title = "ITEMIZED ORDER SUMMARY";
      if (reportType === 'ca_tax') title = "CALIFORNIA SALES TAX REPORT";
      if (reportType === 'top_products') title = "TOP 100 PRODUCTS ANALYTICS";
      if (reportType === 'profitability') title = "PRODUCT PROFITABILITY REPORT";
      if (reportType === 'warehouse_summary') title = "ORDER SUMMARY";
      
      doc.text(title, pageWidth - 14, 18, { align: "right" });
      
      doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100);
      const startStr = new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const endStr = new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      doc.text(`Period: ${startStr} - ${endStr}`, pageWidth - 14, 25, { align: "right" });
      doc.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth - 14, 30, { align: "right" });
      
      tableStartY = textStartY + 12; 
    };

    const drawFooter = () => {
      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(150, 150, 150);
      doc.text(`Generated by: ${staffName}`, 14, pageHeight - 10);
      doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageWidth - 14, pageHeight - 10, { align: "right" });
      doc.text("TRICORE MEDICAL SUPPLY | CONFIDENTIAL REPORT", pageWidth / 2, pageHeight - 10, { align: "center" });
    };

    drawHeader();
    drawFooter();

    if (reportType === 'warehouse_summary') {
      const tableRows = [];
      warehouseData.forEach(cust => {
        tableRows.push([{ 
          content: `${cust.name.toUpperCase()} \n${cust.address}`, 
          colSpan: 4, 
          styles: { fontStyle: 'bold', fontSize: 10, fillColor: [240, 245, 250], textColor: [15, 23, 42] } 
        }]);
        
        cust.patients.forEach(p => {
          if (p.items.length === 0) return;
          
          if (p.patientName !== '') {
            tableRows.push([{ content: `  ${p.patientName.toUpperCase()}`, colSpan: 4, styles: { fontStyle: 'bold', fontSize: 9, textColor: [15, 23, 42] } }]);
          }
          
          p.items.forEach(item => {
            const variantText = (item.variant && item.variant !== 'Default') ? item.variant : '';
            tableRows.push([
              item.qty.toString(),
              variantText,
              item.name,
              item.sku || ''
            ]);
          });
        });
        tableRows.push([{ content: ' ', colSpan: 4, styles: { minCellHeight: 6 } }]); 
      });

      autoTable(doc, {
        startY: tableStartY,
        head: [["QTY", "VARIANT", "PRODUCT", "SKU"]],
        body: tableRows,
        theme: 'plain', 
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 2.5 }, 
        columnStyles: { 
          0: { cellWidth: 15, halign: 'center', fontStyle: 'bold' }, 
          1: { cellWidth: 30, halign: 'center', textColor: [100, 100, 100] } 
        },
        didDrawPage: (data) => { if (data.pageNumber > 1) { drawHeader(); drawFooter(); } },
        margin: { top: tableStartY, bottom: 20 } 
      });
      doc.save(`Tricore_Warehouse_Order_Summary_${startDate}_to_${endDate}.pdf`);

    } else if (reportType === 'top_products') {
      const tableRows = topProductsData.map((p, i) => [ 
        i + 1, `${p.name}\nSKU: ${p.sku}`, p.totalQty, `$${Number(p.totalRevenue).toFixed(2)}`, p.topBuyersArray.map(b => `${b.name} (${b.qty})`).join('\n') 
      ]);
      autoTable(doc, {
        startY: tableStartY,
        head: [["RANK", "PRODUCT", "UNITS SOLD", "REVENUE", "TOP BUYERS"]],
        body: tableRows,
        theme: 'striped', headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 4 }, 
        columnStyles: { 0: { cellWidth: 15, halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'right' } },
        didDrawPage: (data) => { if (data.pageNumber > 1) { drawHeader(); drawFooter(); } },
        margin: { top: tableStartY } 
      });
      doc.save(`Tricore_Top_Products_${startDate}_to_${endDate}.pdf`);

    } else if (reportType === 'profitability') {
      const tableRows = profitabilityData.map((p, i) => [ 
        i + 1, `${p.name}\nSKU: ${p.sku}`, p.totalQty, `$${p.totalCogs.toFixed(2)}`, `$${p.totalRevenue.toFixed(2)}`, `$${p.grossProfit.toFixed(2)}`, `${p.margin.toFixed(1)}%` 
      ]);
      autoTable(doc, {
        startY: tableStartY,
        head: [["RANK", "PRODUCT", "UNITS SOLD", "TOTAL COGS", "GROSS REVENUE", "GROSS PROFIT", "MARGIN %"]],
        body: tableRows,
        theme: 'striped', headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 4 }, 
        columnStyles: { 0: { cellWidth: 15, halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' } },
        didDrawPage: (data) => { if (data.pageNumber > 1) { drawHeader(); drawFooter(); } },
        margin: { top: tableStartY } 
      });
      doc.save(`Tricore_Profitability_Report_${startDate}_to_${endDate}.pdf`);

    } else {
      const fullExportData = await fetchFullDataForExport();
      
      let tableRows = [];
      if (reportType === 'ca_tax') {
        tableRows = fullExportData.map(r => [ r.id, r.date, r.customer, r.streetAddress, r.city, r.state, r.zipCode, r.isCA ? 'Yes' : 'No', `$${Number(r.subtotal || 0).toFixed(2)}`, `$${Number(r.shipping || 0).toFixed(2)}`, `$${Number(r.tax || 0).toFixed(2)}`, `$${Number(r.total || 0).toFixed(2)}` ]);
        autoTable(doc, {
          startY: tableStartY,
          head: [["ORDER ID", "DATE", "AGENCY", "STREET", "CITY", "ST", "ZIP", "CA?", "SUBTOTAL", "SHIPPING", "TAX", "TOTAL"]],
          body: tableRows,
          theme: 'striped', headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
          styles: { fontSize: 7, cellPadding: 3 }, 
          columnStyles: { 8: { halign: 'right' }, 9: { halign: 'right' }, 10: { halign: 'right' }, 11: { halign: 'right' } },
          didDrawPage: (data) => { if (data.pageNumber > 1) { drawHeader(); drawFooter(); } },
          margin: { top: tableStartY } 
        });
        doc.save(`Tricore_CA_Tax_Report_${startDate}_to_${endDate}.pdf`);
      } else {
        tableRows = fullExportData.map(r => [ r.orderId, r.date, r.customer, r.patientName, r.product, r.variant, r.sku, r.qty, r.streetAddress, r.city, r.state, r.zipCode ]);
        autoTable(doc, {
          startY: tableStartY,
          head: [["ORDER ID", "DATE", "AGENCY", "PATIENT NAME", "PRODUCT", "VARIANT", "SKU", "QTY", "STREET", "CITY", "ST", "ZIP"]],
          body: tableRows,
          theme: 'striped', headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
          styles: { fontSize: 7, cellPadding: 3 }, 
          columnStyles: { 7: { halign: 'center' } },
          didDrawPage: (data) => { if (data.pageNumber > 1) { drawHeader(); drawFooter(); } },
          margin: { top: tableStartY } 
        });
        doc.save(`Tricore_Itemized_Summary_${startDate}_to_${endDate}.pdf`);
      }
    }
    
    setIsExporting(false);
  };

  const maxPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 relative px-4 sm:px-6">
      
      {/* --- HEADER --- */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 pb-2">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-md shrink-0">
            <FileBarChart size={28} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">System Reports</h2>
            <p className="text-xs md:text-sm text-slate-500 mt-1 font-medium">Manage and generate location-based order summaries.</p>
          </div>
        </div>
      </div>

      {/* --- CONTROL PANEL --- */}
      <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
          
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center w-full xl:w-auto">
            
            {/* 🚀 CONDITIONAL REPORT DROPDOWN/BADGE */}
            {authLoading ? (
              // Loading Skeleton to prevent Dropdown FOUC
              <div className="w-full md:w-72 lg:w-80 h-[46px] bg-slate-100 animate-pulse rounded-2xl shrink-0"></div>
            ) : (
              <div className="w-full md:w-72 lg:w-80 shrink-0 relative z-20">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">
                  Report Type
                </label>
                
                {userRole === 'warehouse' ? (
                  // 🚀 Perfectly aligned locked badge
                  <div className="relative w-full flex items-center justify-between pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 shadow-sm cursor-not-allowed">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 flex items-center justify-center">
                      <FileText size={18} />
                    </div>
                    <span className="truncate pr-2">Warehouse Order Summary</span>
                    <div className="text-slate-400 shrink-0 flex items-center justify-center">
                      <Lock size={16} />
                    </div>
                  </div>
                ) : (
                  <>
                    <button 
                      type="button"
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className={`
                        relative w-full flex items-center justify-between pl-11 pr-4 py-3 
                        bg-blue-50 border border-blue-200 
                        rounded-2xl outline-none transition-all 
                        focus:ring-4 focus:ring-blue-100 focus:border-blue-400
                        text-sm font-bold text-blue-900 shadow-sm cursor-pointer hover:bg-blue-100/50
                      `}
                    >
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-500 pointer-events-none">
                        <FileText size={18} />
                      </div>
                      
                      <span className="truncate pr-2">
                        {adminReportOptions.find(o => o.value === reportType)?.label || 'Select Report'}
                      </span>
                      
                      <div className="text-blue-400 pointer-events-none shrink-0">
                        <ChevronDown size={18} className={`transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    {isDropdownOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-30" 
                          onClick={() => setIsDropdownOpen(false)}
                        ></div>
                        
                        <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-blue-100 rounded-2xl shadow-xl overflow-hidden z-40 py-1">
                          {adminReportOptions.map((option) => (
                            <button
                              key={option.value}
                              onClick={() => {
                                setTableData([]); 
                                setWarehouseData([]);
                                setTopProductsData([]);
                                setProfitabilityData([]);
                                setReportType(option.value); 
                                setSearchTerm(''); 
                                setIsDropdownOpen(false);
                              }}
                              className={`
                                w-full text-left px-4 py-3 text-sm font-bold transition-colors
                                ${reportType === option.value 
                                  ? 'bg-blue-600 text-white' 
                                  : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'
                                }
                              `}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="hidden md:block w-px h-12 bg-slate-100 mx-2"></div>

            <div className="flex flex-col sm:flex-row gap-4 items-center w-full md:w-auto">
              <div className="w-full sm:w-auto">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Start Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full sm:w-40 pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold text-slate-700" />
                </div>
              </div>
              <ArrowRight className="hidden sm:block text-slate-300 mt-5" size={18} />
              <div className="w-full sm:w-auto">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">End Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full sm:w-40 pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold text-slate-700" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 w-full xl:w-auto shrink-0">
            <button onClick={exportToCSV} disabled={totalCount === 0 || loading || isExporting} className="flex-1 xl:flex-none px-5 py-3 bg-white text-slate-700 border border-slate-200 text-sm font-bold rounded-2xl hover:bg-slate-50 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 min-w-[100px] disabled:opacity-50">
              {isExporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />} CSV
            </button>
            <button onClick={exportToPDF} disabled={totalCount === 0 || loading || isExporting} className="flex-1 xl:flex-none px-5 py-3 bg-slate-900 text-white text-sm font-bold rounded-2xl hover:bg-slate-800 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 min-w-[130px] disabled:opacity-50">
              {isExporting ? <Loader2 className="animate-spin" size={16} /> : <FileDown size={16} />} Print PDF
            </button>
          </div>
        </div>

        <div className="pt-2 relative z-10">
          <div className="relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder={
                reportType === 'top_products' ? "Filter by product, SKU, or buyer..." : 
                reportType === 'profitability' ? "Filter by product or SKU..." :
                reportType === 'warehouse_summary' ? "Search for an Agency or Address..." :
                reportType === 'itemized' ? "Search patient names, order IDs, or customers..." : "Search orders or customers..."
              }
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-slate-900 focus:bg-white outline-none text-sm font-medium transition-all shadow-sm" 
            />
          </div>
        </div>
      </div>

      {/* --- DYNAMIC KPI CARDS --- */}
      {reportType !== 'warehouse_summary' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 relative z-0">
          {reportType === 'top_products' ? (
            <>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-emerald-300">
                <div className="flex justify-between items-start mb-4 relative">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Filtered Revenue</h4>
                  <div className="p-2 rounded-xl bg-emerald-100 text-emerald-600 shadow-sm"><DollarSign size={18} /></div>
                </div>
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight relative">${analyticsKpis.revenue.toLocaleString(undefined, {minimumFractionDigits: 2})}</h2>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-blue-300">
                <div className="flex justify-between items-start mb-4 relative">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Total Units Sold</h4>
                  <div className="p-2 rounded-xl bg-blue-100 text-blue-600 shadow-sm"><Package size={18} /></div>
                </div>
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight relative">{analyticsKpis.itemsSold.toLocaleString()}</h2>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-purple-300">
                <div className="flex justify-between items-start mb-4 relative">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Orders Counted</h4>
                  <div className="p-2 rounded-xl bg-purple-100 text-purple-600 shadow-sm"><ShoppingCart size={18} /></div>
                </div>
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight relative">{analyticsKpis.totalOrders.toLocaleString()}</h2>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-slate-300 flex items-center justify-center">
                 <p className="text-sm font-bold text-slate-400">Displaying Top 100</p>
              </div>
            </>
          ) : reportType === 'profitability' ? (
            <>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-emerald-300">
                <div className="flex justify-between items-start mb-4 relative">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Gross Revenue</h4>
                  <div className="p-2 rounded-xl bg-emerald-100 text-emerald-600 shadow-sm"><DollarSign size={18} /></div>
                </div>
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight relative">${profitabilityKpis.revenue.toLocaleString(undefined, {minimumFractionDigits: 2})}</h2>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-red-300">
                <div className="flex justify-between items-start mb-4 relative">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Total COGS</h4>
                  <div className="p-2 rounded-xl bg-red-100 text-red-600 shadow-sm"><CreditCard size={18} /></div>
                </div>
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight relative">${profitabilityKpis.cogs.toLocaleString(undefined, {minimumFractionDigits: 2})}</h2>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-blue-300">
                <div className="flex justify-between items-start mb-4 relative">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Gross Profit</h4>
                  <div className="p-2 rounded-xl bg-blue-100 text-blue-600 shadow-sm"><TrendingUp size={18} /></div>
                </div>
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight relative">${profitabilityKpis.profit.toLocaleString(undefined, {minimumFractionDigits: 2})}</h2>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-purple-300">
                <div className="flex justify-between items-start mb-4 relative">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Average Margin</h4>
                  <div className="p-2 rounded-xl bg-purple-100 text-purple-600 shadow-sm"><Percent size={18} /></div>
                </div>
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight relative">{profitabilityKpis.avgMargin.toFixed(1)}%</h2>
              </div>
            </>
          ) : reportType === 'itemized' ? (
            <>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-emerald-50 transition-transform group-hover:scale-110"></div>
                <div className="flex justify-between items-start mb-4 relative">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Filtered Revenue</h4>
                  <div className="p-2 rounded-xl bg-emerald-100 text-emerald-600 shadow-sm"><DollarSign size={18} /></div>
                </div>
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight relative">${kpis.rev.toLocaleString(undefined, {minimumFractionDigits: 2})}</h2>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-blue-50 transition-transform group-hover:scale-110"></div>
                <div className="flex justify-between items-start mb-4 relative">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Unique Orders</h4>
                  <div className="p-2 rounded-xl bg-blue-100 text-blue-600 shadow-sm"><ShoppingCart size={18} /></div>
                </div>
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight relative">{kpis.orderCount}</h2>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-amber-50 transition-transform group-hover:scale-110"></div>
                <div className="flex justify-between items-start mb-4 relative">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Filtered Tax</h4>
                  <div className="p-2 rounded-xl bg-amber-100 text-amber-600 shadow-sm"><TrendingUp size={18} /></div>
                </div>
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight relative">${kpis.tax.toLocaleString(undefined, {minimumFractionDigits: 2})}</h2>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-purple-50 transition-transform group-hover:scale-110"></div>
                <div className="flex justify-between items-start mb-4 relative">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Filtered Shipping</h4>
                  <div className="p-2 rounded-xl bg-purple-100 text-purple-600 shadow-sm"><Package size={18} /></div>
                </div>
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight relative">${kpis.ship.toLocaleString(undefined, {minimumFractionDigits: 2})}</h2>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-slate-100 transition-transform group-hover:scale-110"></div>
                <div className="flex justify-between items-start mb-4 relative">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Gross Sales (All)</h4>
                  <div className="p-2 rounded-xl bg-slate-200 text-slate-700 shadow-sm"><DollarSign size={18} /></div>
                </div>
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight relative">${kpis.gross.toLocaleString(undefined, {minimumFractionDigits: 2})}</h2>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-blue-50 transition-transform group-hover:scale-110"></div>
                <div className="flex justify-between items-start mb-4 relative">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">In-State (CA) Sales</h4>
                  <div className="p-2 rounded-xl bg-blue-100 text-blue-600 shadow-sm"><ShoppingCart size={18} /></div>
                </div>
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight relative">${kpis.caS.toLocaleString(undefined, {minimumFractionDigits: 2})}</h2>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-amber-50 transition-transform group-hover:scale-110"></div>
                <div className="flex justify-between items-start mb-4 relative">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Out-of-State (Exempt)</h4>
                  <div className="p-2 rounded-xl bg-amber-100 text-amber-600 shadow-sm"><Package size={18} /></div>
                </div>
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight relative">${kpis.outS.toLocaleString(undefined, {minimumFractionDigits: 2})}</h2>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-emerald-50 transition-transform group-hover:scale-110"></div>
                <div className="flex justify-between items-start mb-4 relative">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">CA Tax Collected</h4>
                  <div className="p-2 rounded-xl bg-emerald-100 text-emerald-600 shadow-sm"><TrendingUp size={18} /></div>
                </div>
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight relative">${kpis.caT.toLocaleString(undefined, {minimumFractionDigits: 2})}</h2>
              </div>
            </>
          )}
        </div>
      )}

      {/* --- DYNAMIC REPORT TABLE --- */}
      <div className={`bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden relative z-0`}>
        
        {reportType !== 'warehouse_summary' && (
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h3 className="font-bold text-slate-900">
              {
                reportType === 'itemized' ? 'Itemized Order Summary' : 
                reportType === 'ca_tax' ? 'California Tax Breakdown' : 
                reportType === 'profitability' ? 'Product Profitability Report' : 
                'Top 100 Products Sold'
              }
            </h3>
          </div>
        )}

        {reportType === 'warehouse_summary' && (
          <div className="px-6 py-5 border-b border-slate-100 bg-white flex justify-between items-center">
            <div>
              <h3 className="font-black text-slate-900 text-xl tracking-tight">Warehouse Order Summary</h3>
              <p className="text-xs font-medium text-slate-500 mt-0.5">Grouped by delivery location for easy picking.</p>
            </div>
            <span className="bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-widest font-bold shadow-sm border border-slate-200">
              {totalCount} Locations
            </span>
          </div>
        )}
        
        <div className="overflow-x-auto min-h-[400px]">
          {loading ? (
            <div className="p-12 text-center text-slate-400 font-medium flex flex-col items-center gap-3">
              <Loader2 className="animate-spin text-slate-300" size={32} />
              Loading database records...
            </div>
          ) : totalCount === 0 ? (
            <div className="p-16 text-center">
              <Search size={48} strokeWidth={1.5} className="mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-bold text-slate-900 mb-1">No data found</h3>
              <p className="text-slate-500 text-sm">Try adjusting your date range or clearing your search.</p>
            </div>
          ) : reportType === 'warehouse_summary' ? (
            
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4 font-bold text-center w-24">Qty</th>
                  <th className="px-6 py-4 font-bold text-center w-32">Variant</th>
                  <th className="px-6 py-4 font-bold">Product</th>
                  <th className="px-6 py-4 font-bold font-mono">SKU</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedWarehouse.map((cust, i) => (
                  <React.Fragment key={i}>
                    <tr className="bg-slate-100/80 border-t-2 border-slate-200">
                      <td colSpan="4" className="px-6 py-4">
                        <div className="font-black text-slate-900 text-base tracking-tight uppercase">{cust.name}</div>
                        <div className="text-xs font-medium text-slate-500 mt-0.5">{cust.address}</div>
                      </td>
                    </tr>
                    
                    {cust.patients.map((p, pIdx) => (
                      <React.Fragment key={`${i}-${pIdx}`}>
                        {p.patientName !== '' && (
                          <tr className="bg-white border-b border-slate-50">
                            <td colSpan="4" className="px-6 pt-4 pb-2">
                              <span className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5 text-blue-600">
                                {p.patientName}
                              </span>
                            </td>
                          </tr>
                        )}
                        {p.items.map((item, itemIdx) => (
                          <tr key={`${i}-${pIdx}-${itemIdx}`} className="hover:bg-slate-50/50 transition-colors group cursor-pointer border-b border-slate-50 last:border-0">
                            <td className="px-6 py-2.5 text-center">
                              <span className="inline-flex items-center justify-center px-2.5 py-1 rounded bg-white text-slate-900 font-extrabold text-sm shadow-sm border border-slate-200 min-w-[2.5rem]">
                                {item.qty}
                              </span>
                            </td>
                            <td className="px-6 py-2.5 text-center">
                              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                {(item.variant && item.variant !== 'Default') ? item.variant : '-'}
                              </span>
                            </td>
                            <td className="px-6 py-2.5">
                              <span className="font-bold text-slate-900">{item.name}</span>
                            </td>
                            <td className="px-6 py-2.5 font-mono text-xs font-bold text-slate-500">
                              {item.sku || 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            
          ) : reportType === 'profitability' ? (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4 font-bold text-center w-16">Rank</th>
                  <th className="px-6 py-4 font-bold">Product Details</th>
                  <th className="px-6 py-4 font-bold text-center">Units Sold</th>
                  <th className="px-6 py-4 font-bold text-right text-slate-400">Total COGS</th>
                  <th className="px-6 py-4 font-bold text-right text-emerald-600">Gross Revenue</th>
                  <th className="px-6 py-4 font-bold text-right text-slate-900">Gross Profit</th>
                  <th className="px-6 py-4 font-bold text-right">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedProfitability.map((product, index) => (
                  <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-black text-xs shadow-sm border ${index === 0 ? 'bg-amber-100 text-amber-700 border-amber-200' : index === 1 ? 'bg-slate-200 text-slate-700 border-slate-300' : index === 2 ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                        #{index + 1}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-900 leading-snug max-w-[300px] truncate" title={product.name}>{product.name}</p>
                      <p className="text-[11px] font-bold text-slate-400 uppercase mt-0.5 tracking-wider flex items-center gap-1">SKU: <span className="font-mono text-slate-600">{product.sku}</span></p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="px-3 py-1 bg-slate-100 text-slate-800 font-black rounded-lg border border-slate-200 shadow-inner">
                        {product.totalQty}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-slate-400 font-medium">
                      ${product.totalCogs.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </td>
                    <td className="px-6 py-4 text-right text-emerald-600 font-bold">
                      ${product.totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="font-extrabold text-slate-900 text-base">${product.grossProfit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`px-2 py-1 rounded text-[11px] font-black tracking-wider shadow-sm border ${product.margin >= 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                        {product.margin.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : reportType === 'top_products' ? (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4 font-bold text-center w-16">Rank</th>
                  <th className="px-6 py-4 font-bold">Product Details</th>
                  <th className="px-6 py-4 font-bold text-center">Units Sold</th>
                  <th className="px-6 py-4 font-bold text-right">Gross Revenue</th>
                  <th className="px-6 py-4 font-bold">Top Buyers (Qty)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedTopProducts.map((product, index) => (
                  <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-black text-xs shadow-sm border ${index === 0 ? 'bg-amber-100 text-amber-700 border-amber-200' : index === 1 ? 'bg-slate-200 text-slate-700 border-slate-300' : index === 2 ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                        #{index + 1}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-900 leading-snug">{product.name}</p>
                      <p className="text-[11px] font-bold text-slate-400 uppercase mt-0.5 tracking-wider flex items-center gap-1">SKU: <span className="font-mono text-slate-600">{product.sku}</span></p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="px-3 py-1 bg-slate-100 text-slate-800 font-black rounded-lg border border-slate-200 shadow-inner">
                        {product.totalQty}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="font-extrabold text-emerald-600">${product.totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-normal min-w-[280px]">
                      <div className="flex flex-col gap-1.5">
                        {product.topBuyersArray.map((buyer, i) => (
                          <div key={i} className="flex items-center justify-between bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-lg shadow-sm">
                            <div className="flex items-center gap-2 overflow-hidden pr-2">
                              <span className={`text-[10px] font-black w-4 h-4 flex items-center justify-center rounded-full shrink-0 ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-700' : 'bg-orange-100 text-orange-700'}`}>
                                {i + 1}
                              </span>
                              <span className="text-xs font-bold text-slate-700 truncate" title={buyer.name}>
                                {buyer.name}
                              </span>
                            </div>
                            <span className="text-xs font-black text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-sm shrink-0">
                              {buyer.qty}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : reportType === 'itemized' ? (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4 font-bold">Order ID</th>
                  <th className="px-6 py-4 font-bold">Date</th>
                  <th className="px-6 py-4 font-bold">Customer / Agency</th>
                  <th className="px-6 py-4 font-bold">Patient Name</th>
                  <th className="px-6 py-4 font-bold">Product</th>
                  <th className="px-6 py-4 font-bold">Variant</th>
                  <th className="px-6 py-4 font-bold">SKU</th>
                  <th className="px-6 py-4 font-bold text-center bg-slate-50/50">Qty</th>
                  <th className="px-6 py-4 font-bold">Street Address</th>
                  <th className="px-6 py-4 font-bold">City</th>
                  <th className="px-6 py-4 font-bold">State</th>
                  <th className="px-6 py-4 font-bold">Zip Code</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tableData.map((row, index) => (
                  <tr key={`item-${row.orderId}-${index}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-mono font-bold text-slate-900">{row.orderId}</td>
                    <td className="px-6 py-3 font-medium text-slate-600">{row.date}</td>
                    <td className="px-6 py-3 font-bold text-slate-900">{row.customer}</td>
                    <td className="px-6 py-3 font-medium text-slate-700">{row.patientName}</td>
                    <td className="px-6 py-3 text-slate-700 font-medium max-w-[250px] truncate" title={row.product}>{row.product}</td>
                    <td className="px-6 py-3 text-slate-600">{row.variant}</td>
                    <td className="px-6 py-3 font-mono text-slate-500 text-xs">{row.sku}</td>
                    <td className="px-6 py-3 text-center">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded bg-slate-100 text-slate-700 font-extrabold text-xs shadow-sm border border-slate-200">
                        {row.qty}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-600 text-xs max-w-[200px] truncate" title={row.streetAddress}>{row.streetAddress}</td>
                    <td className="px-6 py-3 text-slate-600 text-xs">{row.city}</td>
                    <td className="px-6 py-3 text-slate-600 text-xs uppercase">{row.state}</td>
                    <td className="px-6 py-3 text-slate-600 text-xs">{row.zipCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4 font-bold">Order ID</th>
                  <th className="px-6 py-4 font-bold">Date</th>
                  <th className="px-6 py-4 font-bold">Customer / Agency</th>
                  <th className="px-6 py-4 font-bold">Street Address</th>
                  <th className="px-6 py-4 font-bold">City</th>
                  <th className="px-6 py-4 font-bold">State</th>
                  <th className="px-6 py-4 font-bold">Zip Code</th>
                  <th className="px-6 py-4 font-bold text-center">CA Sale?</th>
                  <th className="px-6 py-4 font-bold text-right">Subtotal</th>
                  <th className="px-6 py-4 font-bold text-right">Shipping</th>
                  <th className="px-6 py-4 font-bold text-right text-emerald-600">Tax Collected</th>
                  <th className="px-6 py-4 font-bold text-right text-slate-900">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tableData.map((row, index) => (
                  <tr key={`tax-${row.id}-${index}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-mono font-bold text-slate-900">{row.id}</td>
                    <td className="px-6 py-3 font-medium text-slate-600">{row.date}</td>
                    <td className="px-6 py-3 font-bold text-slate-900">{row.customer}</td>
                    <td className="px-6 py-3 text-slate-600 text-xs max-w-[200px] truncate" title={row.streetAddress}>{row.streetAddress}</td>
                    <td className="px-6 py-3 text-slate-600 text-xs">{row.city}</td>
                    <td className="px-6 py-3 text-slate-600 text-xs uppercase">{row.state}</td>
                    <td className="px-6 py-3 text-slate-600 text-xs">{row.zipCode}</td>
                    <td className="px-6 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${row.isCA ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                        {row.isCA ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right font-medium text-slate-600">${Number(row.subtotal || 0).toFixed(2)}</td>
                    <td className="px-6 py-3 text-right font-medium text-slate-600">${Number(row.shipping || 0).toFixed(2)}</td>
                    <td className="px-6 py-3 text-right font-bold text-emerald-600">${Number(row.tax || 0).toFixed(2)}</td>
                    <td className="px-6 py-3 text-right font-black text-slate-900">${Number(row.total || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* SERVER-SIDE PAGINATION UI */}
        {!loading && totalCount > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-slate-200 bg-slate-50/80 rounded-b-3xl">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-slate-500">
                Showing <span className="font-bold text-slate-900">{(currentPage - 1) * pageSize + 1}</span> to <span className="font-bold text-slate-900">{Math.min(currentPage * pageSize, totalCount)}</span> of <span className="font-bold text-slate-900">{totalCount}</span>
              </span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="pl-3 pr-8 py-1.5 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold text-slate-700 cursor-pointer shadow-sm appearance-none"
              >
                <option value={10}>10 items/page</option>
                <option value={20}>20 items/page</option>
                <option value={30}>30 items/page</option>
              </select>
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                disabled={currentPage === 1} 
                className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all active:scale-95"
              >
                <ChevronLeft size={18} />
              </button>
              
              <div className="flex items-center px-4 font-bold text-sm text-slate-700">
                Page {currentPage} of {maxPages}
              </div>

              <button 
                onClick={() => setCurrentPage(p => Math.min(maxPages, p + 1))} 
                disabled={currentPage === maxPages} 
                className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all active:scale-95"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}