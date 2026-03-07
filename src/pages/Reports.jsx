import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Calendar, Download, DollarSign, ShoppingCart, 
  TrendingUp, FileText, Search, ArrowRight, Package, FileDown, Filter
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Reports() {
  const [flattenedData, setFlattenedData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Date Filters
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Table Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');

  useEffect(() => {
    fetchReportData();
  }, [startDate, endDate]);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      const adjustedEndDate = new Date(endDate);
      adjustedEndDate.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, created_at, status, payment_status, payment_method, 
          subtotal, shipping_amount, tax_amount, total_amount, company_id, patient_name,
          shipping_name, shipping_address, shipping_city, shipping_state, shipping_zip,
          companies ( name, address, city, state, zip ),
          order_items (
            quantity_variants,
            unit_price,
            line_total,
            product_variants (
              name,
              sku,
              products ( name, base_sku )
            )
          )
        `)
        .gte('created_at', new Date(startDate).toISOString())
        .lte('created_at', adjustedEndDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Flatten the orders into line items
      const itemsList = [];
      (data || []).forEach(order => {
        const isB2B = !!order.company_id;
        
        // Logic for Customer vs Patient
        const customer = isB2B ? (order.companies?.name || 'Agency') : (order.shipping_name || 'Retail Customer');
        const patientName = isB2B ? (order.patient_name || order.shipping_name || 'N/A') : 'N/A';
        
        // Address is ALWAYS the shipping address (which is the patient for B2B, or the customer for Retail)
        const address = [order.shipping_address, order.shipping_city, order.shipping_state, order.shipping_zip].filter(Boolean).join(', ') || 'No Address Provided';

        if (order.order_items && order.order_items.length > 0) {
          order.order_items.forEach(item => {
            itemsList.push({
              orderId: order.id.substring(0, 8).toUpperCase(),
              date: new Date(order.created_at).toLocaleDateString(),
              customer: customer,
              patientName: patientName,
              product: item.product_variants?.products?.name || item.product_variants?.name || 'Unknown Product',
              variant: item.product_variants?.name || 'N/A',
              sku: item.product_variants?.sku || item.product_variants?.products?.base_sku || 'N/A',
              address: address,
              rawOrder: order // Keep raw order data for KPI calculations
            });
          });
        }
      });

      setFlattenedData(itemsList);
      setSelectedCustomer(''); // Reset customer filter when dates change
    } catch (error) {
      console.error('Error fetching report data:', error.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Filtering Logic ---
  const uniqueCustomers = Array.from(new Set(flattenedData.map(item => item.customer))).sort();

  const filteredRows = flattenedData.filter(row => {
    const searchString = `${row.orderId} ${row.customer} ${row.patientName} ${row.product} ${row.variant} ${row.sku} ${row.address}`.toLowerCase();
    const matchesSearch = searchString.includes(searchTerm.toLowerCase());
    const matchesCustomer = selectedCustomer ? row.customer === selectedCustomer : true;
    return matchesSearch && matchesCustomer;
  });

  // --- KPI Calculations (Calculated dynamically based on filtered rows) ---
  let totalRevenue = 0, totalTax = 0, totalShipping = 0;
  const processedOrders = new Set();

  filteredRows.forEach(row => {
    if (!processedOrders.has(row.rawOrder.id)) {
      processedOrders.add(row.rawOrder.id);
      totalRevenue += Number(row.rawOrder.total_amount || 0);
      totalTax += Number(row.rawOrder.tax_amount || 0);
      totalShipping += Number(row.rawOrder.shipping_amount || 0);
    }
  });
  
  const totalOrdersCount = processedOrders.size;

  // --- Export to CSV ---
  const exportToCSV = () => {
    const headers = ["Order ID", "Date", "Customer / Agency", "Patient Name", "Product", "Variant", "SKU", "Address"];
    
    const rows = filteredRows.map(r => [
      r.orderId,
      r.date,
      `"${r.customer}"`,
      `"${r.patientName}"`,
      `"${r.product}"`,
      `"${r.variant}"`,
      r.sku,
      `"${r.address}"`
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(e => e.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Tricore_Itemized_Summary_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- 100% RELIABLE CANVAS IMAGE LOADER FOR jsPDF ---
  const getBase64ImageFromUrl = (imageUrl) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const dataURL = canvas.toDataURL("image/png");
        resolve({ dataURL, width: img.width, height: img.height });
      };
      img.onerror = () => resolve(null);
      img.src = imageUrl;
    });
  };

  // --- Export to PDF (Landscape Itemized Summary) ---
  const exportToPDF = async () => {
    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    const logoData = await getBase64ImageFromUrl('/images/tricore-logo2.png');
    
    let tableStartY = 45; 

    const drawHeader = (data) => {
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
      doc.text("ITEMIZED ORDER SUMMARY", pageWidth - 14, 18, { align: "right" });
      
      doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100);
      const startStr = new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const endStr = new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      doc.text(`Period: ${startStr} - ${endStr}`, pageWidth - 14, 25, { align: "right" });
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, pageWidth - 14, 30, { align: "right" });
      
      tableStartY = textStartY + 12; 
    };

    const drawFooter = (data) => {
      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(150, 150, 150);
      const pageStr = `Page ${doc.internal.getNumberOfPages()}`;
      doc.text(pageStr, pageWidth - 14, pageHeight - 10, { align: "right" });
      doc.text("TRICORE MEDICAL SUPPLY | CONFIDENTIAL REPORT", pageWidth / 2, pageHeight - 10, { align: "center" });
    };

    const tableRows = filteredRows.map(r => [
      r.orderId,
      r.date,
      r.customer,
      r.patientName,
      r.product,
      r.variant,
      r.sku,
      r.address
    ]);

    drawHeader();
    drawFooter();

    autoTable(doc, {
      startY: tableStartY,
      head: [["ORDER ID", "DATE", "AGENCY/CUSTOMER", "PATIENT NAME", "PRODUCT", "VARIANT", "SKU", "ADDRESS"]],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 4 },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 18 },
        2: { cellWidth: 30 },
        3: { cellWidth: 30 },
        4: { cellWidth: 35 },
        5: { cellWidth: 25 },
        6: { cellWidth: 20 },
        7: { cellWidth: 'auto' } // Address scales automatically
      },
      didDrawPage: (data) => {
        if (data.pageNumber > 1) {
          drawHeader(data);
          drawFooter(data);
        }
      },
      margin: { top: tableStartY } 
    });

    doc.save(`Tricore_Itemized_Summary_${startDate}_to_${endDate}.pdf`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 relative">
      
      {/* --- HEADER --- */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 pb-2">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-md">
            <FileText size={28} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Financial Reports</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">Generate itemized order summaries and exports.</p>
          </div>
        </div>
      </div>

      {/* --- CONTROL PANEL (DATES & FILTERS) --- */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          
          {/* Date Pickers */}
          <div className="flex flex-col sm:flex-row gap-4 items-center w-full md:w-auto">
            <div className="w-full sm:w-auto">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Start Date</label>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full sm:w-40 pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold text-slate-700 transition-all cursor-pointer"
                />
              </div>
            </div>
            <ArrowRight className="hidden sm:block text-slate-300 mt-5" size={20} />
            <div className="w-full sm:w-auto">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">End Date</label>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full sm:w-40 pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold text-slate-700 transition-all cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Export Buttons */}
          <div className="flex gap-3 w-full md:w-auto">
            <button onClick={exportToCSV} disabled={filteredRows.length === 0 || loading} className="flex-1 md:flex-none px-6 py-2.5 bg-white text-slate-700 border border-slate-200 text-sm font-bold rounded-xl hover:bg-slate-50 active:scale-95 disabled:opacity-50 transition-all shadow-sm flex items-center justify-center gap-2">
              <Download size={16} /> CSV
            </button>
            <button onClick={exportToPDF} disabled={filteredRows.length === 0 || loading} className="flex-1 md:flex-none px-6 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 active:scale-95 disabled:opacity-50 transition-all shadow-md flex items-center justify-center gap-2">
              <FileDown size={16} /> Print PDF
            </button>
          </div>
        </div>

        <div className="h-px w-full bg-slate-100 my-2"></div>

        {/* Table Filters */}
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Search patients, agencies, products, SKUs, or addresses..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none text-sm font-medium transition-all shadow-sm" 
            />
          </div>
          <div className="relative w-full sm:w-72 shrink-0">
            <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <select 
              value={selectedCustomer} 
              onChange={(e) => setSelectedCustomer(e.target.value)} 
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none text-sm font-bold text-slate-700 transition-all cursor-pointer shadow-sm appearance-none"
            >
              <option value="">All Customers / Agencies</option>
              {uniqueCustomers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* --- KPI CARDS --- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-emerald-50 transition-transform group-hover:scale-110"></div>
          <div className="flex justify-between items-start mb-4 relative">
            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Filtered Revenue</h4>
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-600 shadow-sm"><DollarSign size={18} /></div>
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight relative">${totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}</h2>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-blue-50 transition-transform group-hover:scale-110"></div>
          <div className="flex justify-between items-start mb-4 relative">
            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Unique Orders</h4>
            <div className="p-2 rounded-xl bg-blue-100 text-blue-600 shadow-sm"><ShoppingCart size={18} /></div>
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight relative">{totalOrdersCount}</h2>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-amber-50 transition-transform group-hover:scale-110"></div>
          <div className="flex justify-between items-start mb-4 relative">
            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Filtered Tax</h4>
            <div className="p-2 rounded-xl bg-amber-100 text-amber-600 shadow-sm"><TrendingUp size={18} /></div>
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight relative">${totalTax.toLocaleString(undefined, {minimumFractionDigits: 2})}</h2>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-purple-50 transition-transform group-hover:scale-110"></div>
          <div className="flex justify-between items-start mb-4 relative">
            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Filtered Shipping</h4>
            <div className="p-2 rounded-xl bg-purple-100 text-purple-600 shadow-sm"><Package size={18} /></div>
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight relative">${totalShipping.toLocaleString(undefined, {minimumFractionDigits: 2})}</h2>
        </div>
      </div>

      {/* --- SUMMARY TABLE --- */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-900">Itemized Report <span className="text-slate-400 font-medium ml-2">({filteredRows.length} line items)</span></h3>
        </div>
        
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto relative">
          {loading ? (
            <div className="p-12 text-center text-slate-400 font-medium">Loading summary...</div>
          ) : filteredRows.length === 0 ? (
            <div className="p-16 text-center">
              <Search size={48} strokeWidth={1.5} className="mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-bold text-slate-900 mb-1">No items found</h3>
              <p className="text-slate-500 text-sm">Try adjusting your date range or clearing your filters.</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-widest sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-4 font-bold">Order ID</th>
                  <th className="px-6 py-4 font-bold">Date</th>
                  <th className="px-6 py-4 font-bold">Customer / Agency</th>
                  <th className="px-6 py-4 font-bold">Patient Name</th>
                  <th className="px-6 py-4 font-bold">Product</th>
                  <th className="px-6 py-4 font-bold">Variant</th>
                  <th className="px-6 py-4 font-bold">SKU</th>
                  <th className="px-6 py-4 font-bold">Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row, index) => (
                  <tr key={`${row.orderId}-${index}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-mono font-bold text-slate-900">{row.orderId}</td>
                    <td className="px-6 py-3 font-medium text-slate-600">{row.date}</td>
                    <td className="px-6 py-3 font-bold text-slate-900">{row.customer}</td>
                    <td className="px-6 py-3 font-medium text-slate-700">{row.patientName}</td>
                    <td className="px-6 py-3 text-slate-700 font-medium max-w-[250px] truncate" title={row.product}>{row.product}</td>
                    <td className="px-6 py-3 text-slate-600">{row.variant}</td>
                    <td className="px-6 py-3 font-mono text-slate-500 text-xs">{row.sku}</td>
                    <td className="px-6 py-3 text-slate-600 text-xs max-w-[300px] truncate" title={row.address}>{row.address}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  );
}