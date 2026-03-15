import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Calendar, Download, DollarSign, ShoppingCart, 
  TrendingUp, FileText, Search, ArrowRight, Package, FileDown, FileBarChart,
  ChevronLeft, ChevronRight, Loader2, ChevronDown
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Reports() {
  const [reportType, setReportType] = useState('itemized'); // 'itemized' or 'ca_tax'
  
  const [tableData, setTableData] = useState([]);
  const [kpis, setKpis] = useState({ rev: 0, tax: 0, ship: 0, gross: 0, caS: 0, outS: 0, caT: 0, orderCount: 0 });
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  
  // Date Filters
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Search & Pagination States
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  // 1. Handle Search Debouncing (Prevents spamming the database while typing)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); // Reset to page 1 on new search
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Reset to page 1 if dates or report type changes
  useEffect(() => {
    setCurrentPage(1);
  }, [reportType, startDate, endDate, pageSize]);

  // 2. Fetch Lightweight KPIs (Runs when dates or search change)
  useEffect(() => {
    fetchKPIs();
  }, [startDate, endDate, debouncedSearch]);

  // 3. Fetch Heavy Table Data (Runs when page, dates, or search change)
  useEffect(() => {
    fetchTableData();
  }, [startDate, endDate, reportType, debouncedSearch, currentPage, pageSize]);

  const fetchKPIs = async () => {
    const adjustedEndDate = new Date(endDate);
    adjustedEndDate.setHours(23, 59, 59, 999);

    let query = supabase.from('orders')
      .select('id, total_amount, tax_amount, shipping_amount, subtotal, shipping_state, shipping_name, patient_name')
      .gte('created_at', new Date(startDate).toISOString())
      .lte('created_at', adjustedEndDate.toISOString());

    if (debouncedSearch) {
      query = query.or(`id.ilike.%${debouncedSearch}%,shipping_name.ilike.%${debouncedSearch}%,patient_name.ilike.%${debouncedSearch}%`);
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
        caS += Number(o.subtotal || 0) + Number(o.shipping_amount || 0); // Taxable basis
        caT += Number(o.tax_amount || 0);
      } else {
        outS += Number(o.total_amount || 0);
      }
    });

    setKpis({ rev, tax, ship, gross, caS, outS, caT, orderCount: data.length });
  };

  const fetchTableData = async () => {
    setLoading(true);
    try {
      const adjustedEndDate = new Date(endDate);
      adjustedEndDate.setHours(23, 59, 59, 999);

      let query = supabase.from('orders').select(`
        id, created_at, status, subtotal, shipping_amount, tax_amount, total_amount, company_id, patient_name,
        shipping_name, shipping_address, shipping_city, shipping_state, shipping_zip,
        companies ( name )
        ${reportType === 'itemized' ? `, order_items ( quantity_variants, unit_price, line_total, product_variants ( name, sku, products ( name, base_sku ) ) )` : ''}
      `, { count: 'exact' })
      .gte('created_at', new Date(startDate).toISOString())
      .lte('created_at', adjustedEndDate.toISOString())
      .order('created_at', { ascending: false });

      if (debouncedSearch) {
        query = query.or(`id.ilike.%${debouncedSearch}%,shipping_name.ilike.%${debouncedSearch}%,patient_name.ilike.%${debouncedSearch}%`);
      }

      // Server-Side Pagination Logic
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;

      setTableData(formatData(data || []));
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error fetching table data:', error.message);
    } finally {
      setLoading(false);
    }
  };

  // Helper to structure the deep nested data into flat rows
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
            patientName: order.patient_name || order.shipping_name || 'N/A',
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

  // --- CSV EXPORT LOGIC (Uses Edge Function) ---
  const exportToCSV = async () => {
    setIsExporting(true);
    try {
      const adjustedEndDate = new Date(endDate);
      adjustedEndDate.setHours(23, 59, 59, 999);

      // Call the powerful Edge Function to generate the massive file
      const { data, error } = await supabase.functions.invoke('generate-report', {
        body: { 
          startDate: new Date(startDate).toISOString(), 
          endDate: adjustedEndDate.toISOString(), 
          reportType: reportType, 
          searchTerm: debouncedSearch 
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // The server gives us a secure link to the finished file. Trigger the download!
      const link = document.createElement("a");
      link.setAttribute("href", data.url);
      link.setAttribute("download", `Tricore_${reportType}_Report.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to generate report. Please ensure the Edge Function is deployed successfully.");
    } finally {
      setIsExporting(false);
    }
  };

  // --- PDF EXPORT LOGIC (Uses Client-side fetch since PDFs are visual) ---
  const fetchExportDataForPDF = async () => {
    const adjustedEndDate = new Date(endDate);
    adjustedEndDate.setHours(23, 59, 59, 999);

    let query = supabase.from('orders').select(`
      id, created_at, status, subtotal, shipping_amount, tax_amount, total_amount, company_id, patient_name,
      shipping_name, shipping_address, shipping_city, shipping_state, shipping_zip, companies ( name )
      ${reportType === 'itemized' ? `, order_items ( quantity_variants, unit_price, line_total, product_variants ( name, sku, products ( name, base_sku ) ) )` : ''}
    `)
    .gte('created_at', new Date(startDate).toISOString())
    .lte('created_at', adjustedEndDate.toISOString())
    .order('created_at', { ascending: false });

    if (debouncedSearch) {
      query = query.or(`id.ilike.%${debouncedSearch}%,shipping_name.ilike.%${debouncedSearch}%,patient_name.ilike.%${debouncedSearch}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Export Fetch Error:', error);
      return [];
    }
    return formatData(data || []);
  };

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
        resolve({ dataURL: canvas.toDataURL("image/png"), width: img.width, height: img.height });
      };
      img.onerror = () => resolve(null);
      img.src = imageUrl;
    });
  };

  const exportToPDF = async () => {
    setIsExporting(true);
    const exportData = await fetchExportDataForPDF();
    
    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const logoData = await getBase64ImageFromUrl('/images/tricore-logo2.png');
    
    let tableStartY = 45; 
    const isTaxReport = reportType === 'ca_tax';

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
      doc.text(isTaxReport ? "CALIFORNIA SALES TAX REPORT" : "ITEMIZED ORDER SUMMARY", pageWidth - 14, 18, { align: "right" });
      
      doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100);
      const startStr = new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const endStr = new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      doc.text(`Period: ${startStr} - ${endStr}`, pageWidth - 14, 25, { align: "right" });
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, pageWidth - 14, 30, { align: "right" });
      
      tableStartY = textStartY + 12; 
    };

    const drawFooter = () => {
      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(150, 150, 150);
      doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageWidth - 14, pageHeight - 10, { align: "right" });
      doc.text("TRICORE MEDICAL SUPPLY | CONFIDENTIAL REPORT", pageWidth / 2, pageHeight - 10, { align: "center" });
    };

    drawHeader();
    drawFooter();

    if (isTaxReport) {
      // 🚀 FAILSAFE INCLUDED
      const tableRows = exportData.map(r => [ r.id, r.date, r.customer, r.streetAddress, r.city, r.state, r.zipCode, r.isCA ? 'Yes' : 'No', `$${Number(r.subtotal || 0).toFixed(2)}`, `$${Number(r.shipping || 0).toFixed(2)}`, `$${Number(r.tax || 0).toFixed(2)}`, `$${Number(r.total || 0).toFixed(2)}` ]);
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
      const tableRows = exportData.map(r => [ r.orderId, r.date, r.customer, r.patientName, r.product, r.variant, r.sku, r.qty, r.streetAddress, r.city, r.state, r.zipCode ]);
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
    
    setIsExporting(false);
  };

  const maxPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 relative">
      
      {/* --- HEADER --- */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 pb-2">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-md">
            <FileBarChart size={28} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">System Reports</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">Generate itemized summaries and California tax reports.</p>
          </div>
        </div>
      </div>

      {/* --- CONTROL PANEL --- */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          
          <div className="flex flex-col md:flex-row gap-4 items-center w-full lg:w-auto">
            {/* 🚀 EXPANDED WIDTH TO w-72 */}
            <div className="w-full md:w-72 shrink-0">
              <label className="block text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1.5 ml-1">Report Type</label>
              <div className="relative">
                <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-500" size={16} />
                <select 
                  value={reportType} 
                  onChange={(e) => { 
                    setTableData([]); // 🚀 WIPES DATA INSTANTLY TO PREVENT CRASHES
                    setReportType(e.target.value); 
                    setSearchTerm(''); 
                  }} 
                  className="w-full pl-10 pr-10 py-2.5 bg-blue-50 border border-blue-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold text-blue-900 transition-all cursor-pointer shadow-sm appearance-none"
                >
                  <option value="itemized">Itemized Sales Summary</option>
                  <option value="ca_tax">California Sales Tax Report</option>
                </select>
                <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="hidden md:block w-px h-10 bg-slate-200 mx-2"></div>

            {/* Date Pickers */}
            <div className="flex flex-col sm:flex-row gap-4 items-center w-full md:w-auto">
              <div className="w-full sm:w-auto">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Start Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full sm:w-40 pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold text-slate-700 transition-all cursor-pointer" />
                </div>
              </div>
              <ArrowRight className="hidden sm:block text-slate-300 mt-5" size={20} />
              <div className="w-full sm:w-auto">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">End Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full sm:w-40 pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold text-slate-700 transition-all cursor-pointer" />
                </div>
              </div>
            </div>
          </div>

          {/* Export Buttons */}
          <div className="flex gap-3 w-full lg:w-auto">
            <button onClick={exportToCSV} disabled={totalCount === 0 || loading || isExporting} className="flex-1 lg:flex-none px-6 py-2.5 bg-white text-slate-700 border border-slate-200 text-sm font-bold rounded-xl hover:bg-slate-50 active:scale-95 disabled:opacity-50 transition-all shadow-sm flex items-center justify-center gap-2 w-32">
              {isExporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />} 
              {isExporting ? 'Preparing...' : 'CSV'}
            </button>
            <button onClick={exportToPDF} disabled={totalCount === 0 || loading || isExporting} className="flex-1 lg:flex-none px-6 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 active:scale-95 disabled:opacity-50 transition-all shadow-md flex items-center justify-center gap-2 w-36">
              {isExporting ? <Loader2 className="animate-spin" size={16} /> : <FileDown size={16} />} 
              {isExporting ? 'Generating...' : 'Print PDF'}
            </button>
          </div>
        </div>

        <div className="h-px w-full bg-slate-100 my-2"></div>

        {/* Unified Search Filter */}
        <div className="flex items-center">
          <div className="relative w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder={reportType === 'itemized' ? "Search patient names, order IDs, or customers..." : "Search orders or customers..."}
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none text-sm font-medium transition-all shadow-sm" 
            />
          </div>
        </div>
      </div>

      {/* --- DYNAMIC KPI CARDS --- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {reportType === 'itemized' ? (
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

      {/* --- DYNAMIC SUMMARY TABLE --- */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-900">
            {reportType === 'itemized' ? 'Itemized Order Summary' : 'California Tax Breakdown'}
          </h3>
        </div>
        
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
                Showing Orders <span className="font-bold text-slate-900">{(currentPage - 1) * pageSize + 1}</span> to <span className="font-bold text-slate-900">{Math.min(currentPage * pageSize, totalCount)}</span> of <span className="font-bold text-slate-900">{totalCount}</span>
              </span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="pl-3 pr-8 py-1.5 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold text-slate-700 cursor-pointer shadow-sm appearance-none"
              >
                <option value={10}>10 Orders/page</option>
                <option value={20}>20 Orders/page</option>
                <option value={30}>30 Orders/page</option>
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