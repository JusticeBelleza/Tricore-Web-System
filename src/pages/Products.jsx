import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Bold, Italic, Underline, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, 
  Upload, X, Plus, Image as ImageIcon, Download, FileUp, FileDown, CheckCircle2, 
  Eye, Pencil, Trash2, Search, ChevronRight, ChevronDown, Images, Trash, Check, 
  PackageOpen, Layers, Tag, Box, Hash, ChevronLeft, XCircle
} from 'lucide-react';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // 🚀 SERVER-SIDE PAGINATION & SEARCH
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  // Media Library
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [mediaLibraryFiles, setMediaLibraryFiles] = useState([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [uploadingToLibrary, setUploadingToLibrary] = useState(false);
  const [mediaOffset, setMediaOffset] = useState(0);
  const [hasMoreMedia, setHasMoreMedia] = useState(false);
  const MEDIA_LIMIT = 30; 
  const [selectedMediaFiles, setSelectedMediaFiles] = useState([]); 

  const [expandedRows, setExpandedRows] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [viewingProduct, setViewingProduct] = useState(null);
  const [notification, setNotification] = useState({ show: false, title: '', message: '', isError: false });
  const [confirmAction, setConfirmAction] = useState({ show: false, title: '', message: '', onConfirm: null });

  // Form State
  const [formData, setFormData] = useState({
    name: '', description: '', base_sku: '', retail_base_price: '',
    base_unit_name: '', manufacturer: '', category: '', continue_selling: false, initial_stock: 0
  });

  const [existingPhotos, setExistingPhotos] = useState([]); 
  const [variants, setVariants] = useState([]);
  const [deletedVariantIds, setDeletedVariantIds] = useState([]); 
  
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const [activeFormats, setActiveFormats] = useState({
    bold: false, italic: false, underline: false, 
    unorderedList: false, orderedList: false,
    alignLeft: false, alignCenter: false, alignRight: false
  });

  // Debouncer
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(0);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => {
    setPage(0);
  }, [selectedCategory]);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [debouncedSearch, selectedCategory, page]);

  useEffect(() => {
    if (showForm && editorRef.current) {
      if (editorRef.current.innerHTML !== formData.description) {
        editorRef.current.innerHTML = formData.description || '';
      }
    }
  }, [showForm]); 

  const fetchCategories = async () => {
    try {
      const { data } = await supabase.from('products').select('category').neq('category', null);
      if (data) {
        const unique = Array.from(new Set(data.map(d => d.category).filter(Boolean))).sort();
        setCategories(unique);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      let query = supabase.from('products').select(`
          *,
          inventory ( base_units_on_hand, base_units_reserved ),
          product_variants ( id, name, multiplier, sku, price )
        `, { count: 'exact' });

      if (debouncedSearch) {
        // Search by Name or SKU
        query = query.or(`name.ilike.%${debouncedSearch}%,base_sku.ilike.%${debouncedSearch}%`);
      }

      if (selectedCategory) {
        query = query.eq('category', selectedCategory);
      }

      query = query.order('name');

      // Pagination
      const from = page * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;
      
      setProducts(data || []);
      setTotalCount(count || 0);

    } catch (error) {
      console.error('Error fetching products:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleRow = (id) => setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));

  const showToast = (title, message, isError = false) => {
    setNotification({ show: true, title, message, isError });
    setTimeout(() => setNotification({ show: false, title: '', message: '', isError: false }), 4000);
  };

  const downloadTemplate = () => {
    const headers = "Name,Base_SKU,Retail_Price,Base_Unit,Category,Manufacturer,Initial_Stock\n";
    const sample = "Premium Nitrile Gloves,GLV-NIT-01,15.99,Each,PPE,Tricore,100\n";
    const blob = new Blob([headers + sample], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "product_import_template.csv"; a.click();
    showToast('Template Downloaded', 'The CSV import template has been saved.');
  };

  // 🚀 REWRITTEN: Forces a full fetch to guarantee a complete CSV Export!
  const exportCSV = async () => {
    setExporting(true);
    showToast('Exporting...', 'Gathering all catalog data for export.');
    try {
      const { data, error } = await supabase.from('products').select('*, inventory(base_units_on_hand)').order('name');
      if (error) throw error;

      const headers = ["Name", "Base SKU", "Category", "Manufacturer", "Retail Price", "Stock On Hand"];
      const rows = data.map(p => [
        `"${p.name.replace(/"/g, '""')}"`, p.base_sku, `"${(p.category || '').replace(/"/g, '""')}"`,
        `"${(p.manufacturer || '').replace(/"/g, '""')}"`, p.retail_base_price, p.inventory?.base_units_on_hand || 0
      ]);
      const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "tricore_catalog_export.csv"; a.click();
      showToast('Export Successful', `Exported ${data.length} products.`);
    } catch (error) {
      showToast('Export Failed', error.message, true);
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim() !== '');
      for (let i = 1; i < lines.length; i++) {
        const [name, base_sku, price, unit, category, manufacturer, stock] = lines[i].split(',');
        if (!name || !base_sku) continue;

        const { data: newProduct, error: productError } = await supabase.from('products').insert({
          name: name.trim(), base_sku: base_sku.trim(), retail_base_price: Number(price) || 0,
          base_unit_name: unit?.trim() || 'Each', category: category?.trim() || '',
          manufacturer: manufacturer?.trim() || '', continue_selling: false
        }).select().single();

        if (productError) continue;

        await supabase.from('inventory').insert({ product_id: newProduct.id, base_units_on_hand: Number(stock) || 0, base_units_reserved: 0 });
        await supabase.from('product_variants').insert({ product_id: newProduct.id, name: `1x ${unit?.trim() || 'Each'}`, sku: `${base_sku.trim()}-1`, multiplier: 1, price: Number(price) || 0 });
      }
      showToast('Import Complete', 'Products imported successfully!');
      fetchProducts();
      fetchCategories(); // Refresh categories
    } catch (error) {
      showToast('Import Failed', 'Failed to parse CSV.', true);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openCreateForm = () => {
    setEditingId(null);
    setFormData({ name: '', description: '', base_sku: '', retail_base_price: '', base_unit_name: '', manufacturer: '', category: '', continue_selling: false, initial_stock: 0 });
    setExistingPhotos([]); setVariants([]); setDeletedVariantIds([]);
    setActiveFormats({ bold: false, italic: false, underline: false, unorderedList: false, orderedList: false, alignLeft: false, alignCenter: false, alignRight: false });
    setShowForm(true);
  };

  const openEditForm = (product) => {
    setEditingId(product.id);
    setFormData({
      name: product.name, description: product.description || '', base_sku: product.base_sku,
      retail_base_price: product.retail_base_price, base_unit_name: product.base_unit_name,
      manufacturer: product.manufacturer || '', category: product.category || '',
      continue_selling: product.continue_selling, initial_stock: product.inventory?.base_units_on_hand || 0
    });
    setExistingPhotos(product.image_urls || []);
    setVariants(product.product_variants || []);
    setDeletedVariantIds([]);
    setActiveFormats({ bold: false, italic: false, underline: false, unorderedList: false, orderedList: false, alignLeft: false, alignCenter: false, alignRight: false });
    setShowForm(true);
  };

  const loadMedia = async (offset = 0) => {
    setLoadingMedia(true);
    try {
      const { data, error } = await supabase.storage.from('product_images').list('', {
        limit: MEDIA_LIMIT, offset: offset, sortBy: { column: 'created_at', order: 'desc' }
      });
      if (error) throw error;
      const validFiles = data.filter(f => f.name !== '.emptyFolderPlaceholder' && f.id).map(file => {
        const { data: { publicUrl } } = supabase.storage.from('product_images').getPublicUrl(file.name);
        return { name: file.name, url: publicUrl, id: file.id };
      });
      if (offset === 0) setMediaLibraryFiles(validFiles);
      else setMediaLibraryFiles(prev => [...prev, ...validFiles]);
      setHasMoreMedia(data.length === MEDIA_LIMIT);
      setMediaOffset(offset);
    } catch (error) {
      showToast('Media Error', 'Failed to load Media Library.', true);
    } finally {
      setLoadingMedia(false);
    }
  };

  const handleLibraryUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setUploadingToLibrary(true);
    try {
      const newUploads = [];
      for (const file of files) {
        const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '')}`;
        const { error: uploadError } = await supabase.storage.from('product_images').upload(fileName, file, { contentType: file.type });
        if (uploadError) throw new Error(`Upload failed for ${file.name}`);
        const { data } = supabase.storage.from('product_images').getPublicUrl(fileName);
        newUploads.push({ name: fileName, url: data.publicUrl, id: `new-${Date.now()}` });
      }
      setMediaLibraryFiles(prev => [...newUploads, ...prev]);
      setSelectedMediaFiles(prev => [...prev, ...newUploads]);
    } catch (error) {
      showToast('Upload Failed', error.message, true);
    } finally {
      setUploadingToLibrary(false);
      if (e.target) e.target.value = '';
    }
  };

  const openMediaLibrary = () => { setSelectedMediaFiles([]); setShowMediaLibrary(true); loadMedia(0); };
  const handleMediaClick = (file) => setSelectedMediaFiles(prev => prev.find(f => f.name === file.name) ? prev.filter(f => f.name !== file.name) : [...prev, file]);
  const handleAttachSelected = () => { if (selectedMediaFiles.length > 0) setExistingPhotos(prev => [...new Set([...prev, ...selectedMediaFiles.map(f => f.url)])]); setShowMediaLibrary(false); setSelectedMediaFiles([]); };

  const confirmDeleteMedia = (filesToDelete) => {
    if (filesToDelete.length === 0) return;
    const fileNames = filesToDelete.map(f => f.name);
    setConfirmAction({
      show: true, title: 'Delete Permanently?',
      message: `Are you sure you want to delete ${fileNames.length} image(s) from storage? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmAction({ show: false, title: '', message: '', onConfirm: null });
        try {
          const { error } = await supabase.storage.from('product_images').remove(fileNames);
          if (error) throw error;
          setMediaLibraryFiles(prev => prev.filter(f => !fileNames.includes(f.name)));
          setSelectedMediaFiles([]);
          const urlsToDelete = filesToDelete.map(f => f.url);
          setExistingPhotos(prev => prev.filter(url => !urlsToDelete.includes(url)));
          showToast('Images Deleted', `Successfully removed ${fileNames.length} image(s).`);
        } catch (error) {
          showToast('Delete Failed', error.message, true);
        }
      }
    });
  };

  const addVariant = () => setVariants([...variants, { name: '', sku: '', multiplier: '', price: '' }]);
  const updateVariant = (index, field, value) => { const newVariants = [...variants]; newVariants[index][field] = value; setVariants(newVariants); };
  const removeVariant = (index) => { const v = variants[index]; if (v.id) setDeletedVariantIds(prev => [...prev, v.id]); setVariants(variants.filter((_, i) => i !== index)); };

  const checkFormats = () => {
    setActiveFormats({
      bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic'), underline: document.queryCommandState('underline'),
      unorderedList: document.queryCommandState('insertUnorderedList'), orderedList: document.queryCommandState('insertOrderedList'),
      alignLeft: document.queryCommandState('justifyLeft'), alignCenter: document.queryCommandState('justifyCenter'), alignRight: document.queryCommandState('justifyRight')
    });
  };

  const formatText = (command, value = null) => { document.execCommand(command, false, value); if (editorRef.current) editorRef.current.focus(); checkFormats(); };
  const handleEditorKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault(); 
      const isList = document.queryCommandState('insertUnorderedList') || document.queryCommandState('insertOrderedList');
      if (e.shiftKey) { if (isList) document.execCommand('outdent'); } 
      else { if (isList) document.execCommand('indent'); else document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;'); }
      checkFormats();
    }
  };
  const handleEditorInput = () => { setFormData(prev => ({ ...prev, description: editorRef.current.innerHTML })); checkFormats(); };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    setConfirmAction({
      show: true, title: editingId ? 'Save Changes' : 'Create Product',
      message: editingId ? 'Save these changes to the catalog?' : 'Add this new product to the catalog?',
      onConfirm: () => { setConfirmAction({ show: false, title: '', message: '', onConfirm: null }); executeSaveProduct(); }
    });
  };

  const executeSaveProduct = async () => {
    setSaving(true);
    try {
      let productId = editingId;

      if (editingId) {
        const { error: updateError } = await supabase.from('products').update({
          name: formData.name, description: formData.description, base_sku: formData.base_sku,
          retail_base_price: Number(formData.retail_base_price), base_unit_name: formData.base_unit_name,
          manufacturer: formData.manufacturer, category: formData.category, continue_selling: formData.continue_selling, image_urls: existingPhotos
        }).eq('id', editingId);
        if (updateError) throw new Error(updateError.message);
        await supabase.from('inventory').update({ base_units_on_hand: Number(formData.initial_stock) }).eq('product_id', editingId);
      } else {
        const { data: newProduct, error: productError } = await supabase.from('products').insert({
          name: formData.name, description: formData.description, base_sku: formData.base_sku,
          retail_base_price: Number(formData.retail_base_price), base_unit_name: formData.base_unit_name,
          manufacturer: formData.manufacturer, category: formData.category, continue_selling: formData.continue_selling, image_urls: existingPhotos
        }).select().single();
        if (productError) throw new Error(productError.message);
        productId = newProduct.id;
        await supabase.from('inventory').insert({ product_id: productId, base_units_on_hand: Number(formData.initial_stock), base_units_reserved: 0 });
      }

      if (deletedVariantIds.length > 0) await supabase.from('product_variants').delete().in('id', deletedVariantIds);

      if (variants.length > 0) {
        const existingVariants = variants.filter(v => v.id).map(v => ({ id: v.id, product_id: productId, name: v.name, sku: v.sku, multiplier: Number(v.multiplier), price: v.price ? Number(v.price) : 0 }));
        const newVariants = variants.filter(v => !v.id).map(v => ({ product_id: productId, name: v.name, sku: v.sku, multiplier: Number(v.multiplier), price: v.price ? Number(v.price) : 0 }));
        if (existingVariants.length > 0) {
          const { error: existingError } = await supabase.from('product_variants').upsert(existingVariants);
          if (existingError) throw new Error(existingError.message);
        }
        if (newVariants.length > 0) {
          const { error: newError } = await supabase.from('product_variants').insert(newVariants);
          if (newError) throw new Error(newError.message);
        }
      } else if (!editingId) {
        const { error: variantError } = await supabase.from('product_variants').insert({
          product_id: productId, name: `1x ${formData.base_unit_name || 'Unit'}`, sku: `${formData.base_sku}-1`, multiplier: 1, price: formData.retail_base_price ? Number(formData.retail_base_price) : 0
        });
        if (variantError) throw new Error(variantError.message);
      }

      setShowForm(false); 
      fetchProducts();
      fetchCategories();
      showToast(editingId ? 'Product Updated' : 'Product Created', 'Catalog has been successfully updated.');
    } catch (error) {
      showToast('Save Failed', error.message, true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id) => {
    setConfirmAction({
      show: true, title: 'Delete Product', 
      message: 'Are you sure you want to completely remove this product? This action cannot be undone.',
      onConfirm: async () => {
        setConfirmAction({ show: false, title: '', message: '', onConfirm: null });
        try {
          const { error } = await supabase.from('products').delete().eq('id', id);
          if (error) throw error;
          fetchProducts();
          showToast('Product Deleted', 'The product was successfully removed.');
        } catch (error) {
          showToast('Delete Error', 'Cannot delete this product. It is likely linked to an existing customer order.', true);
        }
      }
    });
  };

  const inputClass = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none text-sm font-medium transition-all placeholder:text-slate-400";
  const labelClass = "block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5";
  const getFormatClass = (isActive) => `p-1.5 rounded-lg transition-all ${isActive ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-900'}`;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 relative">
      
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-4 pb-2">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-md">
            <PackageOpen size={28} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Catalog Management</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">Add, edit, and organize inventory products.</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <button onClick={() => setConfirmAction({ show: true, title: 'Download Template', message: 'Download CSV Template?', onConfirm: () => { downloadTemplate(); setConfirmAction({show:false}) } })} className="flex-1 sm:flex-none px-4 py-2 bg-white text-slate-700 border border-slate-200 text-sm font-bold rounded-xl hover:bg-slate-50 hover:text-slate-900 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm"><Download size={16} /> Template</button>
          <label className="flex-1 sm:flex-none px-4 py-2 bg-white text-slate-700 border border-slate-200 text-sm font-bold rounded-xl hover:bg-slate-50 hover:text-slate-900 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm">
            <FileUp size={16} /> {importing ? '...' : 'Import'}
            <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleImport} disabled={importing} />
          </label>
          <button disabled={exporting} onClick={() => setConfirmAction({ show: true, title: 'Export Catalog', message: 'Export all products to a CSV file?', onConfirm: () => { exportCSV(); setConfirmAction({show:false}) } })} className="flex-1 sm:flex-none px-4 py-2 bg-white text-slate-700 border border-slate-200 text-sm font-bold rounded-xl hover:bg-slate-50 hover:text-slate-900 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"><FileDown size={16} /> Export</button>
          <button onClick={openCreateForm} className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2"><Plus size={16} /> Add Product</button>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder="Search by Name or SKU..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-transparent rounded-xl focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-100 outline-none text-sm font-medium transition-all" />
        </div>
        <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full sm:w-56 px-4 py-2.5 bg-slate-50 border border-transparent rounded-xl focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-100 outline-none text-sm transition-all cursor-pointer font-bold text-slate-700">
          <option value="">All Categories</option>
          {categories.map(c => (<option key={c} value={c}>{c}</option>))}
        </select>
      </div>

      {/* Main Table */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mt-6">
          <div className="w-full h-14 bg-slate-50/80 border-b border-slate-200"></div>
          {[1,2,3,4,5].map(n => (<div key={n} className="w-full h-20 bg-white border-b border-slate-100 flex items-center px-6 gap-6 animate-pulse"><div className="w-10 h-10 bg-slate-100 rounded-xl shrink-0"></div><div className="w-48 h-4 bg-slate-100 rounded shrink-0"></div><div className="w-32 h-4 bg-slate-100 rounded shrink-0 ml-auto"></div></div>))}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm mt-6 flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-bold tracking-tight rounded-tl-3xl">Product Details</th>
                  <th className="px-6 py-4 font-bold tracking-tight">Category</th>
                  <th className="px-6 py-4 font-bold tracking-tight">Retail Price</th>
                  <th className="px-6 py-4 font-bold tracking-tight">Stock</th>
                  <th className="px-6 py-4 font-bold tracking-tight text-right rounded-tr-3xl">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map(product => {
                  const stock = product.inventory?.base_units_on_hand || 0;
                  const isExpanded = expandedRows[product.id];
                  
                  return (
                    <React.Fragment key={product.id}>
                      <tr className={`group transition-colors ${isExpanded ? 'bg-slate-50 border-l-4 border-l-slate-900' : 'hover:bg-slate-50/80 border-l-4 border-transparent'}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <button onClick={() => toggleRow(product.id)} className={`p-1.5 rounded-lg transition-transform duration-200 ${isExpanded ? 'bg-slate-200 text-slate-900 rotate-90' : 'text-slate-400 group-hover:bg-slate-200 group-hover:text-slate-900'}`} title={isExpanded ? "Hide Variants" : "Show Variants"}>
                              <ChevronRight size={18} />
                            </button>
                            {product.image_urls?.[0] ? (
                              <img src={product.image_urls[0]} className="w-12 h-12 rounded-xl object-cover border border-slate-200 shadow-sm" alt="" />
                            ) : (
                              <div className="w-12 h-12 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center shadow-sm"><ImageIcon size={20} className="text-slate-400"/></div>
                            )}
                            <div>
                              <p className="font-bold text-slate-900 text-base">{product.name}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 flex items-center gap-1.5"><Hash size={12}/> {product.base_sku}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-700">{product.category || '—'}</td>
                        <td className="px-6 py-4 font-extrabold text-slate-900">${Number(product.retail_base_price).toFixed(2)}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] uppercase tracking-widest font-bold shadow-sm border ${stock <= 10 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                            {stock} {product.base_unit_name}s
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => setViewingProduct(product)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 active:scale-95 rounded-xl transition-all shadow-sm border border-transparent hover:border-blue-100" title="View Details"><Eye size={18} /></button>
                            <button onClick={() => openEditForm(product)} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 active:scale-95 rounded-xl transition-all shadow-sm border border-transparent hover:border-emerald-100" title="Edit Product"><Pencil size={18} /></button>
                            <button onClick={() => handleDelete(product.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 active:scale-95 rounded-xl transition-all shadow-sm border border-transparent hover:border-red-100" title="Delete"><Trash2 size={18} /></button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50 shadow-inner">
                          <td colSpan="5" className="p-0 border-b border-slate-200">
                            <div className="p-6 sm:p-8 pl-[84px] animate-in slide-in-from-top-2 fade-in duration-200">
                              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Layers size={14}/> Product Variants & Pricing</h4>
                              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm inline-block min-w-full lg:min-w-[60%]">
                                <table className="w-full text-left text-sm">
                                  <thead className="bg-slate-50/80 border-b border-slate-200">
                                    <tr className="text-slate-500 text-[10px] uppercase tracking-widest">
                                      <th className="px-5 py-3 font-bold">Packaging / Variant</th>
                                      <th className="px-5 py-3 font-bold">SKU Identifier</th>
                                      <th className="px-5 py-3 font-bold text-center">Base Multiplier</th>
                                      <th className="px-5 py-3 font-bold text-right">Selling Price</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {product.product_variants?.map(v => (
                                      <tr key={v.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-5 py-4 font-bold text-slate-900 flex items-center gap-2"><Box size={14} className="text-slate-400"/> {v.name}</td>
                                        <td className="px-5 py-4 font-mono text-xs font-medium text-slate-600">{v.sku}</td>
                                        <td className="px-5 py-4 text-center"><span className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-bold shadow-sm">{v.multiplier}</span> <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider ml-1">{product.base_unit_name}s</span></td>
                                        <td className="px-5 py-4 text-right font-extrabold text-slate-900 text-base">${Number(v.price).toFixed(2)}</td>
                                      </tr>
                                    ))}
                                    {(!product.product_variants || product.product_variants.length === 0) && (
                                      <tr><td colSpan="4" className="px-5 py-6 text-slate-400 italic text-center font-medium">No variants configured for this product.</td></tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {products.length === 0 && (
                  <tr><td colSpan="5" className="px-6 py-16 text-center text-slate-500 font-medium">No products found matching your search criteria.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 🚀 PAGINATION CONTROLS */}
          {totalCount > pageSize && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-3xl">
              <span className="text-sm font-medium text-slate-500">
                Showing <span className="font-bold text-slate-900">{page * pageSize + 1}</span> to <span className="font-bold text-slate-900">{Math.min((page + 1) * pageSize, totalCount)}</span> of <span className="font-bold text-slate-900">{totalCount}</span> products
              </span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"><ChevronLeft size={18} /></button>
                <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * pageSize >= totalCount} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"><ChevronRight size={18} /></button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* --- ADD / EDIT PRODUCT MODAL --- */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <form onSubmit={handleFormSubmit} className="bg-white w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden border border-slate-100">
            
            <div className="shrink-0 px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <PackageOpen size={24} className="text-blue-600"/> {editingId ? 'Edit Product' : 'Add New Product'}
                </h3>
                <p className="text-sm text-slate-500 mt-1 font-medium">{editingId ? 'Update details, variants, and stock.' : 'Create a new entry in the catalog.'}</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 active:scale-95 p-2 rounded-full transition-all shadow-sm"><X size={20}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              
              {/* Basic Details */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Tag size={14}/> Core Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div><label className={labelClass}>Product Name</label><input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className={inputClass} /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className={labelClass}>Base SKU</label><input type="text" required value={formData.base_sku} onChange={e => setFormData({...formData, base_sku: e.target.value})} className={`${inputClass} font-mono uppercase`} /></div>
                    <div><label className={labelClass}>Retail Price ($)</label><input type="number" step="0.01" required value={formData.retail_base_price} onChange={e => setFormData({...formData, retail_base_price: e.target.value})} className={inputClass} /></div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-5">
                  <div><label className={labelClass}>Base Unit (e.g. Box, Each)</label><input type="text" required value={formData.base_unit_name} onChange={e => setFormData({...formData, base_unit_name: e.target.value})} className={inputClass} /></div>
                  <div><label className={labelClass}>Category</label><input type="text" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className={inputClass} /></div>
                  <div><label className={labelClass}>Manufacturer</label><input type="text" value={formData.manufacturer} onChange={e => setFormData({...formData, manufacturer: e.target.value})} className={inputClass} /></div>
                </div>
              </div>

              <div className="h-px w-full bg-slate-100"></div>

              {/* Description Editor */}
              <div>
                <label className={labelClass}>Rich Description</label>
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-100 transition-all shadow-sm">
                  <div className="flex flex-wrap gap-1 p-2 border-b border-slate-100 bg-slate-50 items-center">
                    <select onChange={(e) => formatText('fontSize', e.target.value)} defaultValue="3" className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none cursor-pointer hover:bg-slate-100 transition-colors shadow-sm">
                      <option value="1">Smallest</option><option value="3">Normal</option><option value="5">Larger</option><option value="7">Huge</option>
                    </select>
                    <div className="w-px h-5 bg-slate-200 mx-2"></div>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('bold'); }} className={getFormatClass(activeFormats.bold)}><Bold size={16}/></button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('italic'); }} className={getFormatClass(activeFormats.italic)}><Italic size={16}/></button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('underline'); }} className={getFormatClass(activeFormats.underline)}><Underline size={16}/></button>
                    <div className="w-px h-5 bg-slate-200 mx-2"></div>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('justifyLeft'); }} className={getFormatClass(activeFormats.alignLeft)}><AlignLeft size={16}/></button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('justifyCenter'); }} className={getFormatClass(activeFormats.alignCenter)}><AlignCenter size={16}/></button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('justifyRight'); }} className={getFormatClass(activeFormats.alignRight)}><AlignRight size={16}/></button>
                    <div className="w-px h-5 bg-slate-200 mx-2"></div>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('insertUnorderedList'); }} className={getFormatClass(activeFormats.unorderedList)}><List size={16}/></button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('insertOrderedList'); }} className={getFormatClass(activeFormats.orderedList)}><ListOrdered size={16}/></button>
                  </div>
                  <div ref={editorRef} contentEditable onInput={handleEditorInput} onKeyDown={handleEditorKeyDown} onKeyUp={checkFormats} onMouseUp={checkFormats} onClick={checkFormats} className="p-4 min-h-[100px] max-h-[250px] overflow-y-auto outline-none text-sm text-slate-700 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1 leading-relaxed" />
                </div>
              </div>

              <div className="h-px w-full bg-slate-100"></div>

              {/* Photos Section */}
              <div>
                <label className={labelClass}>Product Media</label>
                <div className="flex flex-wrap gap-4 items-center mt-2">
                  <button type="button" onClick={openMediaLibrary} className="w-24 h-24 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 bg-slate-50 text-slate-500 rounded-2xl cursor-pointer hover:bg-slate-100 hover:border-slate-900 hover:text-slate-900 active:scale-95 transition-all shadow-sm">
                    <Images size={24} className="mb-2" />
                    <span className="text-[10px] font-bold uppercase text-center leading-tight">Add<br/>Media</span>
                  </button>
                  {existingPhotos.map((url, i) => (
                    <div key={`ext-${i}`} className="relative w-24 h-24 rounded-2xl border border-slate-200 overflow-hidden group shadow-sm">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setExistingPhotos(existingPhotos.filter((_, idx) => idx !== i))} className="absolute top-1.5 right-1.5 bg-red-500 text-white rounded-lg p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all shadow-md"><X size={14}/></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="h-px w-full bg-slate-100"></div>

              {/* Variants Section */}
              <div>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-4 gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Layers size={14}/> Product Variants</h4>
                    <p className="text-xs text-slate-500 mt-1 font-medium">Define packaging options (e.g., Box of 50). Multiplier = total base units per variant.</p>
                  </div>
                  <button type="button" onClick={addVariant} className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 border border-slate-200 text-slate-900 text-xs font-bold rounded-xl hover:bg-slate-200 active:scale-95 transition-all shadow-sm"><Plus size={14} /> Add Variant</button>
                </div>
                <div className="space-y-3">
                  {variants.map((v, i) => (
                    <div key={i} className="grid grid-cols-2 sm:grid-cols-12 gap-4 items-end bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-sm w-full">
                      <div className="col-span-2 sm:col-span-4">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Variant Name</label>
                        <input type="text" placeholder="Variant Name (e.g. Box of 50)" value={v.name} onChange={e => updateVariant(i, 'name', e.target.value)} required className={inputClass} />
                      </div>
                      <div className="col-span-2 sm:col-span-3">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Variant SKU</label>
                        <input type="text" placeholder="Variant SKU" value={v.sku} onChange={e => updateVariant(i, 'sku', e.target.value)} required className={`${inputClass} font-mono uppercase`} />
                      </div>
                      <div className="col-span-1 sm:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Qty Multiplier</label>
                        <input type="number" placeholder="Qty Multiplier" value={v.multiplier} onChange={e => updateVariant(i, 'multiplier', e.target.value)} required min="1" className={inputClass} />
                      </div>
                      <div className="col-span-1 sm:col-span-3">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">$ Selling Price</label>
                        <div className="flex gap-2">
                          <input type="number" step="0.01" placeholder="$ Selling Price" value={v.price} onChange={e => updateVariant(i, 'price', e.target.value)} required className={`${inputClass} w-full`} />
                          <button type="button" onClick={() => removeVariant(i)} className="shrink-0 px-3 text-red-500 bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 active:scale-90 rounded-xl transition-all shadow-sm flex items-center justify-center"><Trash2 size={16}/></button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {variants.length === 0 && <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 text-center"><p className="text-sm text-slate-500 font-medium">No variants added. A default 1x unit will be generated automatically.</p></div>}
                </div>
              </div>

              {/* Stock & Settings */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <label className="flex items-center gap-3 cursor-pointer w-full sm:w-auto">
                  <input type="checkbox" checked={formData.continue_selling} onChange={e => setFormData({...formData, continue_selling: e.target.checked})} className="w-5 h-5 text-slate-900 border-slate-300 rounded focus:ring-slate-900 cursor-pointer transition-all shrink-0" />
                  <span className="text-sm font-bold text-slate-700">Continue selling even if out of stock</span>
                </label>
                <div className="flex items-center gap-3 w-full sm:w-auto bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-2">{editingId ? 'Update Stock' : 'Starting Stock'}</span>
                  <input type="number" required min="0" value={formData.initial_stock} onChange={e => setFormData({...formData, initial_stock: e.target.value})} className="w-24 px-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 text-center font-bold transition-all bg-slate-50 text-sm" />
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-100 p-6 flex justify-end gap-3 bg-white">
              <button type="button" onClick={() => setShowForm(false)} className="w-full sm:w-auto px-6 py-3 text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 active:scale-95 rounded-xl transition-all border border-slate-200 shadow-sm">Cancel</button>
              <button type="submit" disabled={saving} className="w-full sm:w-auto px-8 py-3 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 active:scale-95 shadow-md disabled:opacity-50 transition-all">{saving ? 'Saving...' : 'Save Product'}</button>
            </div>
          </form>
        </div>
      )}

      {/* --- PROFESSIONAL MEDIA LIBRARY MODAL --- */}
      {showMediaLibrary && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-6xl h-full max-h-[85vh] rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
            
            {/* Left Content */}
            <div className="flex-1 flex flex-col h-full bg-slate-50/50 relative">
              <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-white z-10 shrink-0 gap-4 shadow-sm">
                <div>
                  <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">Media Library</h3>
                  <p className="hidden sm:block text-sm text-slate-500 mt-1 font-medium">Select existing files or upload new ones.</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="px-5 py-2.5 text-sm font-bold text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition-all active:scale-95 shadow-md cursor-pointer flex items-center gap-2">
                    {uploadingToLibrary ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Upload size={16} />}
                    <span className="hidden sm:inline">{uploadingToLibrary ? 'Uploading...' : 'Upload Files'}</span>
                    <input type="file" multiple accept="image/*" className="hidden" onChange={handleLibraryUpload} disabled={uploadingToLibrary} />
                  </label>
                  <button type="button" onClick={() => setShowMediaLibrary(false)} className="md:hidden text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-all"><X size={20}/></button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6">
                {loadingMedia && mediaLibraryFiles.length === 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (<div key={n} className="aspect-square bg-slate-200/50 animate-pulse rounded-2xl border border-slate-100"></div>))}
                  </div>
                ) : mediaLibraryFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 py-20">
                    <Images size={64} strokeWidth={1} className="mb-4 text-slate-300" />
                    <p className="text-lg font-bold text-slate-500">No images found.</p>
                    <p className="text-sm mt-1 font-medium">Upload images to populate your library.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {mediaLibraryFiles.map((file, i) => {
                        const isSelected = selectedMediaFiles.some(f => f.name === file.name);
                        return (
                          <div key={i} onClick={() => handleMediaClick(file)} className={`aspect-square rounded-2xl overflow-hidden cursor-pointer group relative transition-all border-2 ${isSelected ? 'border-slate-900 scale-[0.96] shadow-md' : 'border-slate-200 shadow-sm hover:border-slate-400'}`}>
                            <img src={file.url} alt={file.name} className={`w-full h-full object-cover transition-transform duration-500 ${isSelected ? 'scale-110' : 'group-hover:scale-105'}`} />
                            <div className={`absolute inset-0 transition-all ${isSelected ? 'bg-slate-900/10' : 'bg-slate-900/0 group-hover:bg-slate-900/10'}`}>
                              <div className="absolute top-2 left-2">
                                {isSelected ? (
                                  <div className="bg-slate-900 text-white rounded-lg w-7 h-7 flex items-center justify-center shadow-md"><Check size={16} strokeWidth={3} /></div>
                                ) : (
                                  <div className="bg-white/90 backdrop-blur-sm border border-slate-200 text-slate-400 rounded-lg w-7 h-7 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"><Check size={14} strokeWidth={2} className="opacity-50" /></div>
                                )}
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); confirmDeleteMedia([file]); }} className="absolute top-2 right-2 p-1.5 bg-white text-red-500 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all shadow-md" title="Delete Image"><Trash size={14} /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {hasMoreMedia && (
                      <div className="mt-10 mb-4 flex justify-center">
                        <button onClick={() => loadMedia(mediaOffset + MEDIA_LIMIT)} disabled={loadingMedia} className="px-8 py-3 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-full hover:bg-slate-50 active:scale-95 transition-all shadow-sm flex items-center gap-2">{loadingMedia ? 'Loading...' : 'Load More Images'}</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Right Side Panel */}
            <div className="w-full md:w-80 bg-white border-t md:border-t-0 md:border-l border-slate-100 flex flex-col shrink-0 shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.05)] z-20">
              <div className="hidden md:flex justify-end p-4 pb-0 shrink-0">
                <button type="button" onClick={() => setShowMediaLibrary(false)} className="text-slate-400 hover:text-slate-900 hover:bg-slate-100 p-2 rounded-full transition-all"><X size={20}/></button>
              </div>

              {selectedMediaFiles.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                  <ImageIcon size={48} strokeWidth={1} className="mb-4 text-slate-300" />
                  <p className="text-sm font-medium">Select images from the grid to attach them to your product.</p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col p-6 overflow-y-auto">
                  {selectedMediaFiles.length === 1 ? (
                    <div className="mb-6 animate-in fade-in duration-200">
                      <div className="aspect-square rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 mb-4 shadow-sm relative group"><img src={selectedMediaFiles[0].url} className="w-full h-full object-cover" /></div>
                      <h4 className="font-bold text-slate-900 truncate text-base mb-1" title={selectedMediaFiles[0].name}>{selectedMediaFiles[0].name}</h4>
                      <p className="text-[10px] text-slate-400 font-mono break-all">{selectedMediaFiles[0].id}</p>
                    </div>
                  ) : (
                    <div className="mb-6 animate-in fade-in duration-200">
                      <div className="flex flex-wrap gap-2 mb-4">
                        {selectedMediaFiles.slice(0, 5).map((f, i) => (<div key={i} className="w-14 h-14 rounded-xl overflow-hidden border border-slate-200 shadow-sm shrink-0"><img src={f.url} className="w-full h-full object-cover" /></div>))}
                        {selectedMediaFiles.length > 5 && (<div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-sm font-bold text-slate-600 shrink-0">+{selectedMediaFiles.length - 5}</div>)}
                      </div>
                      <h4 className="font-extrabold text-slate-900 text-3xl tracking-tight">{selectedMediaFiles.length} Selected</h4>
                      <p className="text-sm text-slate-500 mt-1 font-medium">Ready to attach to product.</p>
                    </div>
                  )}

                  <div className="mt-auto space-y-3 pt-4 border-t border-slate-100">
                    <button onClick={handleAttachSelected} className="w-full py-3.5 bg-slate-900 text-white text-sm font-bold rounded-xl shadow-md hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center gap-2"><Plus size={16} /> Select {selectedMediaFiles.length} Image{selectedMediaFiles.length > 1 ? 's' : ''}</button>
                    <button onClick={() => confirmDeleteMedia(selectedMediaFiles)} className="w-full py-3.5 bg-white text-red-600 text-sm font-bold rounded-xl border border-red-200 hover:bg-red-50 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm"><Trash2 size={16} /> Delete from Storage</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- VIEW PRODUCT MODAL --- */}
      {viewingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] border border-slate-100 overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex justify-between items-start bg-slate-50 shrink-0">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{viewingProduct.category || 'Uncategorized'}</p>
                <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight leading-tight">{viewingProduct.name}</h3>
                <p className="text-sm font-mono text-slate-500 mt-1">{viewingProduct.base_sku}</p>
              </div>
              <button onClick={() => setViewingProduct(null)} className="text-slate-400 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 active:scale-95 p-2 rounded-full transition-all shadow-sm"><X size={20}/></button>
            </div>
            
            <div className="p-8 overflow-y-auto flex-1 space-y-8 bg-white">
              {viewingProduct.image_urls?.length > 0 && (
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {viewingProduct.image_urls.map((url, i) => (
                    <img key={i} src={url} alt="" className="w-32 h-32 object-cover rounded-2xl border border-slate-200 shadow-sm shrink-0" />
                  ))}
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <div><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Manufacturer</p><p className="font-bold text-slate-900">{viewingProduct.manufacturer || 'N/A'}</p></div>
                <div><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Base Price</p><p className="font-extrabold text-slate-900 text-lg leading-none">${Number(viewingProduct.retail_base_price).toFixed(2)}</p></div>
                <div className="col-span-2 pt-4 border-t border-slate-200 mt-2"><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Current Stock on Hand</p><p className={`font-extrabold text-lg leading-none ${viewingProduct.inventory?.base_units_on_hand <= 10 ? 'text-red-600' : 'text-emerald-600'}`}>{viewingProduct.inventory?.base_units_on_hand || 0} <span className="text-sm font-bold text-slate-500">{viewingProduct.base_unit_name}s</span></p></div>
              </div>

              {viewingProduct.description && (
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Product Description</h4>
                  <div className="text-sm text-slate-600 bg-slate-50/50 border border-slate-100 p-5 rounded-2xl [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 leading-relaxed" dangerouslySetInnerHTML={{ __html: viewingProduct.description }} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- CONFIRM MODAL --- */}
      {confirmAction.show && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border shadow-sm ${confirmAction.title.includes('Delete') ? 'bg-red-50 text-red-600 border-red-100' : 'bg-slate-50 text-slate-900 border-slate-200'}`}>
              {confirmAction.title.includes('Delete') ? <Trash2 size={32} /> : <CheckCircle2 size={32} />}
            </div>
            <h4 className="text-xl font-extrabold text-slate-900 tracking-tight">{confirmAction.title}</h4>
            <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">{confirmAction.message}</p>
            <div className="flex gap-3 pt-6">
              <button onClick={() => setConfirmAction({ show: false })} className="w-full py-3.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 active:scale-95 transition-all shadow-sm">Cancel</button>
              <button onClick={confirmAction.onConfirm} className={`w-full py-3.5 text-white font-bold rounded-xl active:scale-95 transition-all shadow-md ${confirmAction.title.includes('Delete') ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800'}`}>{confirmAction.title.includes('Delete') ? 'Delete' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {/* --- SLEEK TOAST NOTIFICATION --- */}
      {notification.show && (
        <div className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 z-[120] flex items-center gap-3 bg-slate-900 text-white px-5 py-4 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className={`p-1.5 rounded-full ${notification.isError ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
            {notification.isError ? <XCircle size={18} strokeWidth={2.5} /> : <CheckCircle2 size={18} strokeWidth={2.5} />}
          </div>
          <div>
            <h4 className="text-sm font-bold leading-tight">{notification.title}</h4>
            {notification.message && <p className="text-xs font-medium text-slate-300 mt-0.5 pr-4">{notification.message}</p>}
          </div>
        </div>
      )}

    </div>
  );
}