import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Bold, Italic, Underline, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, 
  Upload, X, Plus, Image as ImageIcon, Download, FileUp, FileDown, CheckCircle2, 
  Eye, Pencil, Trash2, Search, ChevronRight, ChevronDown, Images, Trash, Check
} from 'lucide-react';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  
  // --- Professional Media Library States ---
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [mediaLibraryFiles, setMediaLibraryFiles] = useState([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [uploadingToLibrary, setUploadingToLibrary] = useState(false);
  const [mediaOffset, setMediaOffset] = useState(0);
  const [hasMoreMedia, setHasMoreMedia] = useState(false);
  const MEDIA_LIMIT = 30; 
  const [selectedMediaFiles, setSelectedMediaFiles] = useState([]); 

  // Filter & UI States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [expandedRows, setExpandedRows] = useState({});

  // App States
  const [editingId, setEditingId] = useState(null);
  const [viewingProduct, setViewingProduct] = useState(null);
  const [notification, setNotification] = useState({ show: false, title: '', message: '' });
  const [confirmAction, setConfirmAction] = useState({ show: false, title: '', message: '', onConfirm: null });

  // Form State
  const [formData, setFormData] = useState({
    name: '', description: '', base_sku: '', retail_base_price: '',
    base_unit_name: '', manufacturer: '', category: '', continue_selling: false, initial_stock: 0
  });

  const [existingPhotos, setExistingPhotos] = useState([]); 
  const [variants, setVariants] = useState([]);
  const [deletedVariantIds, setDeletedVariantIds] = useState([]); 
  
  // Editor States
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const [activeFormats, setActiveFormats] = useState({
    bold: false, italic: false, underline: false, 
    unorderedList: false, orderedList: false,
    alignLeft: false, alignCenter: false, alignRight: false
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    if (showForm && editorRef.current) {
      if (editorRef.current.innerHTML !== formData.description) {
        editorRef.current.innerHTML = formData.description || '';
      }
    }
  }, [showForm]); 

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          inventory ( base_units_on_hand, base_units_reserved ),
          product_variants ( id, name, multiplier, sku, price )
        `)
        .order('name');
      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort();

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.base_sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory ? p.category === selectedCategory : true;
    return matchesSearch && matchesCategory;
  });

  const toggleRow = (id) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const downloadTemplate = () => {
    const headers = "Name,Base_SKU,Retail_Price,Base_Unit,Category,Manufacturer,Initial_Stock\n";
    const sample = "Premium Nitrile Gloves,GLV-NIT-01,15.99,Each,PPE,Tricore,100\n";
    const blob = new Blob([headers + sample], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "product_import_template.csv"; a.click();
    setNotification({ show: true, title: 'Template Downloaded', message: 'The CSV import template has been saved.' });
  };

  const exportCSV = () => {
    const headers = ["Name", "Base SKU", "Category", "Manufacturer", "Retail Price", "Stock On Hand"];
    const rows = filteredProducts.map(p => [
      `"${p.name.replace(/"/g, '""')}"`, p.base_sku, `"${(p.category || '').replace(/"/g, '""')}"`,
      `"${(p.manufacturer || '').replace(/"/g, '""')}"`, p.retail_base_price, p.inventory?.base_units_on_hand || 0
    ]);
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "tricore_products_export.csv"; a.click();
    setNotification({ show: true, title: 'Export Successful', message: 'Your product catalog has been exported.' });
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
      setNotification({ show: true, title: 'Import Complete', message: 'Products imported successfully!' });
      fetchProducts();
    } catch (error) {
      alert('Failed to parse CSV.');
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

  // --- MEDIA LIBRARY: LOAD ---
  const loadMedia = async (offset = 0) => {
    setLoadingMedia(true);
    try {
      const { data, error } = await supabase.storage.from('product_images').list('', {
        limit: MEDIA_LIMIT,
        offset: offset,
        sortBy: { column: 'created_at', order: 'desc' }
      });
      
      if (error) throw error;

      const validFiles = data.filter(f => f.name !== '.emptyFolderPlaceholder' && f.id).map(file => {
        const { data: { publicUrl } } = supabase.storage.from('product_images').getPublicUrl(file.name);
        return { name: file.name, url: publicUrl, id: file.id };
      });
      
      if (offset === 0) {
        setMediaLibraryFiles(validFiles);
      } else {
        setMediaLibraryFiles(prev => [...prev, ...validFiles]);
      }

      setHasMoreMedia(data.length === MEDIA_LIMIT);
      setMediaOffset(offset);
    } catch (error) {
      console.error('Error loading media:', error);
      alert('Failed to load Media Library.');
    } finally {
      setLoadingMedia(false);
    }
  };

  // --- MEDIA LIBRARY: INSTANT UPLOAD ---
  const handleLibraryUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploadingToLibrary(true);
    try {
      const newUploads = [];
      
      for (const file of files) {
        const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '')}`;
        const { error: uploadError } = await supabase.storage
          .from('product_images')
          .upload(fileName, file, { contentType: file.type });

        if (uploadError) throw new Error(`Upload failed for ${file.name}: ${uploadError.message}`);

        const { data } = supabase.storage.from('product_images').getPublicUrl(fileName);
        
        newUploads.push({
          name: fileName,
          url: data.publicUrl,
          id: `new-${Date.now()}` // Temporary UI ID
        });
      }

      // Add to front of the grid
      setMediaLibraryFiles(prev => [...newUploads, ...prev]);
      
      // Magically auto-select them so the user just has to click "Select Image"
      setSelectedMediaFiles(prev => [...prev, ...newUploads]);

    } catch (error) {
      console.error('Library upload error:', error);
      alert(error.message);
    } finally {
      setUploadingToLibrary(false);
      if (e.target) e.target.value = ''; // Reset input
    }
  };

  const openMediaLibrary = () => {
    setSelectedMediaFiles([]);
    setShowMediaLibrary(true);
    loadMedia(0); 
  };

  const handleMediaClick = (file) => {
    setSelectedMediaFiles(prev => {
      const exists = prev.find(f => f.name === file.name);
      if (exists) return prev.filter(f => f.name !== file.name); // Deselect
      return [...prev, file]; // Select
    });
  };

  const handleAttachSelected = () => {
    if (selectedMediaFiles.length === 0) return;
    
    const newUrls = selectedMediaFiles.map(f => f.url);
    setExistingPhotos(prev => {
      const combined = [...prev, ...newUrls];
      return [...new Set(combined)]; // Removes duplicates
    });
    
    setShowMediaLibrary(false);
    setSelectedMediaFiles([]);
  };

  const confirmDeleteMedia = (filesToDelete) => {
    if (filesToDelete.length === 0) return;
    const fileNames = filesToDelete.map(f => f.name);
    
    setConfirmAction({
      show: true,
      title: 'Delete Permanently?',
      message: `Are you sure you want to delete ${fileNames.length} image(s) from your storage? This action cannot be undone and will break products currently using them!`,
      onConfirm: async () => {
        setConfirmAction({ show: false, title: '', message: '', onConfirm: null });
        try {
          const { error } = await supabase.storage.from('product_images').remove(fileNames);
          if (error) throw error;
          
          setMediaLibraryFiles(prev => prev.filter(f => !fileNames.includes(f.name)));
          setSelectedMediaFiles([]);
          
          const urlsToDelete = filesToDelete.map(f => f.url);
          setExistingPhotos(prev => prev.filter(url => !urlsToDelete.includes(url)));

          setNotification({ show: true, title: 'Images Deleted', message: `Successfully removed ${fileNames.length} image(s) from your storage.` });
        } catch (error) {
          alert(`Failed to delete images: ${error.message}`);
        }
      }
    });
  };

  const addVariant = () => {
    setVariants([...variants, { name: '', sku: '', multiplier: '', price: '' }]);
  };

  const updateVariant = (index, field, value) => {
    const newVariants = [...variants];
    newVariants[index][field] = value;
    setVariants(newVariants);
  };

  const removeVariant = (index) => {
    const v = variants[index];
    if (v.id) setDeletedVariantIds(prev => [...prev, v.id]);
    setVariants(variants.filter((_, i) => i !== index));
  };

  const checkFormats = () => {
    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      unorderedList: document.queryCommandState('insertUnorderedList'),
      orderedList: document.queryCommandState('insertOrderedList'),
      alignLeft: document.queryCommandState('justifyLeft'),
      alignCenter: document.queryCommandState('justifyCenter'),
      alignRight: document.queryCommandState('justifyRight')
    });
  };

  const formatText = (command, value = null) => {
    document.execCommand(command, false, value);
    if (editorRef.current) editorRef.current.focus();
    checkFormats(); 
  };

  const handleEditorKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault(); 
      const isList = document.queryCommandState('insertUnorderedList') || document.queryCommandState('insertOrderedList');
      if (e.shiftKey) {
        if (isList) document.execCommand('outdent');
      } else {
        if (isList) {
          document.execCommand('indent');
        } else {
          document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
        }
      }
      checkFormats();
    }
  };

  const handleEditorInput = () => {
    setFormData(prev => ({ ...prev, description: editorRef.current.innerHTML }));
    checkFormats();
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    setConfirmAction({
      show: true,
      title: editingId ? 'Save Changes' : 'Create Product',
      message: editingId 
        ? 'Are you sure you want to save these changes to the catalog?' 
        : 'Are you sure you want to add this new product to the catalog?',
      onConfirm: () => {
        setConfirmAction({ show: false, title: '', message: '', onConfirm: null });
        executeSaveProduct();
      }
    });
  };

  const executeSaveProduct = async () => {
    setSaving(true);
    try {
      let productId = editingId;

      // 1. SAVE MAIN PRODUCT DATA
      if (editingId) {
        const { error: updateError } = await supabase.from('products').update({
          name: formData.name, description: formData.description, base_sku: formData.base_sku,
          retail_base_price: Number(formData.retail_base_price), base_unit_name: formData.base_unit_name,
          manufacturer: formData.manufacturer, category: formData.category,
          continue_selling: formData.continue_selling, 
          image_urls: existingPhotos // Directly save the URLs from the media library!
        }).eq('id', editingId);
        
        if (updateError) throw new Error(`Product Update Error: ${updateError.message}`);

        await supabase.from('inventory').update({ base_units_on_hand: Number(formData.initial_stock) }).eq('product_id', editingId);
      } else {
        const { data: newProduct, error: productError } = await supabase.from('products').insert({
          name: formData.name, description: formData.description, base_sku: formData.base_sku,
          retail_base_price: Number(formData.retail_base_price), base_unit_name: formData.base_unit_name,
          manufacturer: formData.manufacturer, category: formData.category,
          continue_selling: formData.continue_selling, 
          image_urls: existingPhotos
        }).select().single();

        if (productError) throw new Error(`Product Creation Error: ${productError.message}`);
        productId = newProduct.id;

        await supabase.from('inventory').insert({ product_id: productId, base_units_on_hand: Number(formData.initial_stock), base_units_reserved: 0 });
      }

      // 2. CLEAN UP AND SAVE VARIANTS 
      if (deletedVariantIds.length > 0) {
        await supabase.from('product_variants').delete().in('id', deletedVariantIds);
      }

      if (variants.length > 0) {
        const existingVariants = variants.filter(v => v.id).map(v => ({
          id: v.id, product_id: productId, name: v.name, sku: v.sku,
          multiplier: Number(v.multiplier), price: v.price ? Number(v.price) : 0
        }));

        const newVariants = variants.filter(v => !v.id).map(v => ({
          product_id: productId, name: v.name, sku: v.sku,
          multiplier: Number(v.multiplier), price: v.price ? Number(v.price) : 0
        }));
        
        if (existingVariants.length > 0) {
          const { error: existingError } = await supabase.from('product_variants').upsert(existingVariants);
          if (existingError) throw new Error(`Existing Variant Error: ${existingError.message}`);
        }

        if (newVariants.length > 0) {
          const { error: newError } = await supabase.from('product_variants').insert(newVariants);
          if (newError) throw new Error(`New Variant Error: ${newError.message}`);
        }
      } else if (!editingId) {
        const { error: variantError } = await supabase.from('product_variants').insert({
          product_id: productId, name: `1x ${formData.base_unit_name || 'Unit'}`,
          sku: `${formData.base_sku}-1`, multiplier: 1, 
          price: formData.retail_base_price ? Number(formData.retail_base_price) : 0
        });
        if (variantError) throw new Error(`Default Variant Error: ${variantError.message}`);
      }

      setShowForm(false);
      fetchProducts();
      setNotification({ show: true, title: editingId ? 'Product Updated' : 'Product Created', message: 'Catalog has been successfully updated.' });
      
    } catch (error) {
      console.error('Save error:', error);
      alert(`Save Failed: ${error.message}`); 
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id) => {
    setConfirmAction({
      show: true, 
      title: 'Delete Product', 
      message: 'Are you sure you want to completely remove this product? This action cannot be undone.',
      onConfirm: async () => {
        setConfirmAction({ show: false, title: '', message: '', onConfirm: null });
        try {
          const { error } = await supabase.from('products').delete().eq('id', id);
          if (error) throw error;
          fetchProducts();
          setNotification({ show: true, title: 'Product Deleted', message: 'The product was successfully removed from the catalog.' });
        } catch (error) {
          console.error('Delete error:', error);
          alert('Cannot delete this product. It is likely linked to an existing customer order.');
        }
      }
    });
  };

  const inputClass = "w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm transition-all placeholder:text-slate-400";
  const labelClass = "block text-sm font-bold text-slate-700 mb-1";
  const getFormatClass = (isActive) => `p-1.5 rounded transition-all ${isActive ? 'bg-blue-100 text-blue-700 shadow-inner ring-1 ring-blue-300' : 'text-slate-700 hover:bg-slate-200 active:scale-90'}`;

  if (loading) return <div className="text-slate-500">Loading catalog...</div>;

  return (
    <div className="space-y-6 mx-auto relative">
      
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Products</h2>
          <p className="text-sm text-slate-500 mt-1">Catalog and inventory overview.</p>
        </div>
        
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-3 w-full lg:w-auto">
          <button onClick={() => setConfirmAction({ show: true, title: 'Download Template', message: 'Download CSV Template?', onConfirm: () => { downloadTemplate(); setConfirmAction({show:false}) } })} className="w-full sm:w-auto px-3 py-2 bg-white text-slate-700 border border-slate-300 text-sm font-bold rounded-lg hover:bg-slate-50 hover:text-slate-900 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm"><Download size={16} /> Template</button>
          <label className="w-full sm:w-auto px-3 py-2 bg-white text-slate-700 border border-slate-300 text-sm font-bold rounded-lg hover:bg-slate-50 hover:text-slate-900 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm">
            <FileUp size={16} /> {importing ? '...' : 'Import'}
            <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleImport} disabled={importing} />
          </label>
          <button onClick={() => setConfirmAction({ show: true, title: 'Export Catalog', message: 'Export all products?', onConfirm: () => { exportCSV(); setConfirmAction({show:false}) } })} className="w-full sm:w-auto px-3 py-2 bg-white text-slate-700 border border-slate-300 text-sm font-bold rounded-lg hover:bg-slate-50 hover:text-slate-900 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm"><FileDown size={16} /> Export</button>
          <button onClick={openCreateForm} className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2"><Plus size={16} /> Add Product</button>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search by Name or SKU..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm transition-all"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="w-full sm:w-48 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm transition-all cursor-pointer font-medium text-slate-700"
        >
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto w-full">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50/50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-6 py-4 font-bold">Product</th>
              <th className="px-6 py-4 font-bold">Category</th>
              <th className="px-6 py-4 font-bold">Retail Price</th>
              <th className="px-6 py-4 font-bold">Stock</th>
              <th className="px-6 py-4 font-bold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredProducts.map(product => {
              const stock = product.inventory?.base_units_on_hand || 0;
              const isExpanded = expandedRows[product.id];
              
              return (
                <React.Fragment key={product.id}>
                  {/* Main Product Row */}
                  <tr className={`hover:bg-slate-50 transition-colors ${isExpanded ? 'bg-slate-50' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <button onClick={() => toggleRow(product.id)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-md transition-colors" title={isExpanded ? "Hide Variants" : "Show Variants"}>
                          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </button>
                        {product.image_urls?.[0] ? <img src={product.image_urls[0]} className="w-10 h-10 rounded-md object-cover border border-slate-200" alt="" /> : <div className="w-10 h-10 bg-slate-100 border border-slate-200 rounded-md flex items-center justify-center"><ImageIcon size={16} className="text-slate-400"/></div>}
                        <div>
                          <p className="font-bold text-slate-900">{product.name}</p>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">{product.base_sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{product.category || '—'}</td>
                    <td className="px-6 py-4 font-medium text-slate-900">${Number(product.retail_base_price).toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${stock <= 10 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {stock} {product.base_unit_name}s
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setViewingProduct(product)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 active:scale-90 rounded-lg transition-all" title="View"><Eye size={18} /></button>
                        <button onClick={() => openEditForm(product)} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 active:scale-90 rounded-lg transition-all" title="Edit"><Pencil size={18} /></button>
                        <button onClick={() => handleDelete(product.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 active:scale-90 rounded-lg transition-all" title="Delete"><Trash2 size={18} /></button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Variants Row */}
                  {isExpanded && (
                    <tr className="bg-slate-50/50 border-b border-slate-200">
                      <td colSpan="5" className="px-6 py-4">
                        <div className="pl-[72px]">
                          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm inline-block min-w-full lg:min-w-[60%]">
                            <table className="w-full text-left text-sm">
                              <thead className="bg-slate-100 border-b border-slate-200">
                                <tr className="text-slate-500">
                                  <th className="px-4 py-2.5 font-bold">Variant Name</th>
                                  <th className="px-4 py-2.5 font-bold">Variant SKU</th>
                                  <th className="px-4 py-2.5 font-bold">Multiplier</th>
                                  <th className="px-4 py-2.5 font-bold text-right">Price</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {product.product_variants?.map(v => (
                                  <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-2 font-semibold text-slate-900">{v.name}</td>
                                    <td className="px-4 py-2 font-mono text-xs text-slate-500">{v.sku}</td>
                                    <td className="px-4 py-2 font-medium text-slate-700">{v.multiplier} <span className="text-slate-400 font-normal text-xs">{product.base_unit_name}s</span></td>
                                    <td className="px-4 py-2 text-right font-bold text-blue-600">${Number(v.price).toFixed(2)}</td>
                                  </tr>
                                ))}
                                {(!product.product_variants || product.product_variants.length === 0) && (
                                  <tr>
                                    <td colSpan="4" className="px-4 py-4 text-slate-400 italic text-center">No variants created for this product.</td>
                                  </tr>
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
            {filteredProducts.length === 0 && (
              <tr><td colSpan="5" className="px-6 py-12 text-center text-slate-500">No products found matching your search criteria.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* --- ADD / EDIT PRODUCT MODAL --- */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm sm:p-4">
          <form onSubmit={handleFormSubmit} className="bg-white w-full max-w-4xl max-h-[100dvh] sm:max-h-[90vh] flex flex-col sm:rounded-2xl shadow-2xl animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
            
            <div className="shrink-0 p-4 sm:p-5 border-b border-slate-100 flex justify-between items-center sm:rounded-t-2xl z-10 bg-white shadow-sm">
              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">{editingId ? 'Edit Product' : 'Add New Product'}</h3>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 active:scale-90 p-1.5 rounded-full transition-all"><X size={20}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Product Name</label>
                  <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className={inputClass} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Base SKU</label>
                    <input type="text" required value={formData.base_sku} onChange={e => setFormData({...formData, base_sku: e.target.value})} className={`${inputClass} font-mono uppercase`} />
                  </div>
                  <div>
                    <label className={labelClass}>Retail Price ($)</label>
                    <input type="number" step="0.01" required value={formData.retail_base_price} onChange={e => setFormData({...formData, retail_base_price: e.target.value})} className={inputClass} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Base Unit</label>
                  <input type="text" required value={formData.base_unit_name} onChange={e => setFormData({...formData, base_unit_name: e.target.value})} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Category</label>
                  <input type="text" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Manufacturer</label>
                  <input type="text" value={formData.manufacturer} onChange={e => setFormData({...formData, manufacturer: e.target.value})} className={inputClass} />
                </div>
              </div>

              {/* DYNAMIC RICH TEXT EDITOR */}
              <div>
                <label className={labelClass}>Description</label>
                <div className="bg-white border border-slate-300 rounded-lg overflow-hidden focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200 transition-all">
                  <div className="flex flex-wrap gap-1 p-1.5 border-b border-slate-200 bg-slate-50 items-center">
                    <select onChange={(e) => formatText('fontSize', e.target.value)} defaultValue="3" className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-medium outline-none focus:border-blue-500 hover:bg-slate-100 transition-colors">
                      <option value="1">Smallest</option><option value="3">Normal</option><option value="5">Larger</option><option value="7">Huge</option>
                    </select>
                    <div className="w-px h-4 bg-slate-300 my-auto mx-1"></div>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('bold'); }} className={getFormatClass(activeFormats.bold)}><Bold size={15}/></button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('italic'); }} className={getFormatClass(activeFormats.italic)}><Italic size={15}/></button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('underline'); }} className={getFormatClass(activeFormats.underline)}><Underline size={15}/></button>
                    <div className="w-px h-4 bg-slate-300 my-auto mx-1"></div>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('justifyLeft'); }} className={getFormatClass(activeFormats.alignLeft)}><AlignLeft size={15}/></button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('justifyCenter'); }} className={getFormatClass(activeFormats.alignCenter)}><AlignCenter size={15}/></button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('justifyRight'); }} className={getFormatClass(activeFormats.alignRight)}><AlignRight size={15}/></button>
                    <div className="w-px h-4 bg-slate-300 my-auto mx-1"></div>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('insertUnorderedList'); }} className={getFormatClass(activeFormats.unorderedList)}><List size={15}/></button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('insertOrderedList'); }} className={getFormatClass(activeFormats.orderedList)}><ListOrdered size={15}/></button>
                  </div>
                  <div 
                    ref={editorRef} 
                    contentEditable 
                    onInput={handleEditorInput} 
                    onKeyDown={handleEditorKeyDown}
                    onKeyUp={checkFormats}
                    onMouseUp={checkFormats}
                    onClick={checkFormats}
                    className="p-3 min-h-[80px] max-h-[200px] overflow-y-auto outline-none text-sm text-slate-800 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1 leading-relaxed" 
                  />
                </div>
              </div>

              {/* REDESIGNED PHOTOS SECTION */}
              <div>
                <label className={labelClass}>Product Images</label>
                <div className="flex flex-wrap gap-3 items-center mt-1">
                  
                  {/* MEDIA LIBRARY BUTTON */}
                  <button type="button" onClick={openMediaLibrary} className="w-24 h-24 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 bg-slate-50 text-slate-600 rounded-xl cursor-pointer hover:bg-slate-100 hover:border-blue-400 hover:text-blue-600 active:scale-95 transition-all shadow-sm">
                    <Images size={24} className="mb-2" />
                    <span className="text-[11px] font-bold uppercase text-center leading-tight">Add<br/>Media</span>
                  </button>

                  {/* Attached Photos */}
                  {existingPhotos.map((url, i) => (
                    <div key={`ext-${i}`} className="relative w-24 h-24 rounded-xl border border-slate-200 overflow-hidden group shadow-sm">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setExistingPhotos(existingPhotos.filter((_, idx) => idx !== i))} className="absolute top-1.5 right-1.5 bg-red-500 text-white rounded-md p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all shadow-sm"><X size={14}/></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-5">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-3 gap-2">
                  <div>
                    <label className="block text-sm font-bold text-slate-900">Product Variants</label>
                    <p className="text-xs text-slate-500 mt-0.5">Multiplier = base units per variant.</p>
                  </div>
                  <button type="button" onClick={addVariant} className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-md hover:bg-emerald-700 active:scale-95 transition-all shadow-sm"><Plus size={14} /> Add Variant</button>
                </div>
                <div className="space-y-3">
                  {variants.map((v, i) => (
                    <div key={i} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-center bg-slate-50/80 p-3 rounded-lg border border-slate-200 shadow-sm w-full">
                      <div className="col-span-2 sm:col-span-4"><input type="text" placeholder="Name" value={v.name} onChange={e => updateVariant(i, 'name', e.target.value)} required className={inputClass} /></div>
                      <div className="col-span-2 sm:col-span-3"><input type="text" placeholder="SKU" value={v.sku} onChange={e => updateVariant(i, 'sku', e.target.value)} required className={`${inputClass} font-mono uppercase`} /></div>
                      <div className="col-span-1 sm:col-span-2"><input type="number" placeholder="Qty" value={v.multiplier} onChange={e => updateVariant(i, 'multiplier', e.target.value)} required min="1" className={inputClass} /></div>
                      <div className="col-span-1 sm:col-span-3 flex gap-2">
                        <input type="number" step="0.01" placeholder="$ Price" value={v.price} onChange={e => updateVariant(i, 'price', e.target.value)} required className={`${inputClass} w-full`} />
                        <button type="button" onClick={() => removeVariant(i)} className="shrink-0 p-1.5 text-white bg-red-500 hover:bg-red-600 active:scale-90 rounded-md transition-all shadow-sm flex items-center justify-center"><X size={16}/></button>
                      </div>
                    </div>
                  ))}
                  {variants.length === 0 && <p className="text-sm text-slate-500 italic font-medium">No variants added. A default unit will be generated.</p>}
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                <label className="flex items-center gap-2.5 cursor-pointer w-full sm:w-auto">
                  <input type="checkbox" checked={formData.continue_selling} onChange={e => setFormData({...formData, continue_selling: e.target.checked})} className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer transition-all shrink-0" />
                  <span className="text-sm font-bold text-slate-700">Continue selling even if out of stock</span>
                </label>
                <div className="flex items-center gap-2 w-full sm:w-auto bg-white p-1.5 rounded-md border border-slate-200">
                  <span className="text-sm font-bold text-slate-700 pl-2">{editingId ? 'Update Stock:' : 'Starting Stock:'}</span>
                  <input type="number" required min="0" value={formData.initial_stock} onChange={e => setFormData({...formData, initial_stock: e.target.value})} className="w-20 px-2 py-1 border border-slate-300 rounded outline-none focus:border-blue-500 focus:ring-2 text-center font-bold transition-all" />
                </div>
              </div>
            </div>

            <div className="shrink-0 bg-slate-50 border-t border-slate-200 p-4 sm:p-5 flex justify-end gap-3 sm:rounded-b-2xl pb-6 sm:pb-5">
              <button type="button" onClick={() => setShowForm(false)} className="w-full sm:w-auto px-5 py-2 text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 active:scale-95 rounded-lg transition-all border border-slate-300 shadow-sm">Cancel</button>
              <button type="submit" disabled={saving} className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 active:scale-95 shadow-md disabled:opacity-50 transition-all">{saving ? 'Saving...' : 'Save Product'}</button>
            </div>

          </form>
        </div>
      )}

      {/* --- PROFESSIONAL MEDIA LIBRARY MODAL --- */}
      {showMediaLibrary && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-6xl h-full max-h-[85vh] rounded-2xl shadow-2xl flex flex-col md:flex-row overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
            
            {/* Main Content Area (Left) */}
            <div className="flex-1 flex flex-col h-full bg-white relative">
              
              {/* Header with UPLOAD Button */}
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white z-10 shrink-0 gap-4">
                <div>
                  <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">Media Library</h3>
                  <p className="hidden sm:block text-sm text-slate-500 mt-0.5">Select existing files or upload new ones.</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="px-4 py-2 text-sm font-bold text-white bg-blue-600 border border-blue-700 rounded-lg hover:bg-blue-700 transition-all active:scale-95 shadow-sm cursor-pointer flex items-center gap-2">
                    {uploadingToLibrary ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Upload size={16} />}
                    <span className="hidden sm:inline">{uploadingToLibrary ? 'Uploading...' : 'Upload Files'}</span>
                    <input type="file" multiple accept="image/*" className="hidden" onChange={handleLibraryUpload} disabled={uploadingToLibrary} />
                  </label>
                  <button type="button" onClick={() => setShowMediaLibrary(false)} className="md:hidden text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 p-2 rounded-lg transition-all"><X size={20}/></button>
                </div>
              </div>
              
              {/* Image Grid */}
              <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                {loadingMedia && mediaLibraryFiles.length === 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <div key={n} className="aspect-square bg-slate-200/50 animate-pulse rounded-xl border border-slate-100"></div>
                    ))}
                  </div>
                ) : mediaLibraryFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 py-20">
                    <Images size={64} strokeWidth={1} className="mb-4 text-slate-300" />
                    <p className="text-lg font-medium text-slate-500">No images found.</p>
                    <p className="text-sm mt-1">Upload images to populate your library.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {mediaLibraryFiles.map((file, i) => {
                        const isSelected = selectedMediaFiles.some(f => f.name === file.name);
                        return (
                          <div 
                            key={i} 
                            onClick={() => handleMediaClick(file)}
                            className={`aspect-square rounded-xl overflow-hidden cursor-pointer group relative transition-all border-2 ${
                              isSelected ? 'border-blue-600 scale-[0.96] shadow-md' : 'border-slate-200 shadow-sm hover:border-blue-400'
                            }`}
                          >
                            <img src={file.url} alt={file.name} className={`w-full h-full object-cover transition-transform duration-500 ${isSelected ? 'scale-110' : 'group-hover:scale-105'}`} />
                            
                            {/* Hover & Active Overlay */}
                            <div className={`absolute inset-0 transition-all ${isSelected ? 'bg-blue-900/10' : 'bg-slate-900/0 group-hover:bg-slate-900/10'}`}>
                              
                              {/* Top Left Selection Indicator */}
                              <div className="absolute top-2 left-2">
                                {isSelected ? (
                                  <div className="bg-blue-600 text-white rounded-md w-6 h-6 flex items-center justify-center shadow-sm">
                                    <Check size={16} strokeWidth={3} />
                                  </div>
                                ) : (
                                  <div className="bg-white/90 backdrop-blur-sm border border-slate-300 text-slate-400 rounded-md w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                                    <Check size={14} strokeWidth={2} className="opacity-50" />
                                  </div>
                                )}
                              </div>

                              {/* Top Right Quick Delete */}
                              <button 
                                onClick={(e) => { e.stopPropagation(); confirmDeleteMedia([file]); }}
                                className="absolute top-2 right-2 p-1.5 bg-white text-red-500 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all shadow-sm"
                                title="Delete Image"
                              >
                                <Trash size={14} />
                              </button>

                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Load More Button */}
                    {hasMoreMedia && (
                      <div className="mt-10 mb-4 flex justify-center">
                        <button 
                          onClick={() => loadMedia(mediaOffset + MEDIA_LIMIT)}
                          disabled={loadingMedia}
                          className="px-8 py-2.5 bg-white border border-slate-300 text-slate-700 text-sm font-bold rounded-full hover:bg-slate-50 hover:text-slate-900 active:scale-95 transition-all shadow-sm flex items-center gap-2"
                        >
                          {loadingMedia ? 'Loading...' : 'Load More Images'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Side Action Panel (Right) */}
            <div className="w-full md:w-80 bg-slate-50 border-t md:border-t-0 md:border-l border-slate-200 flex flex-col shrink-0">
              <div className="hidden md:flex justify-end p-4 pb-0 shrink-0">
                <button type="button" onClick={() => setShowMediaLibrary(false)} className="text-slate-400 hover:text-slate-900 hover:bg-slate-200 p-1.5 rounded-full transition-all"><X size={20}/></button>
              </div>

              {selectedMediaFiles.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                  <ImageIcon size={48} strokeWidth={1} className="mb-4 text-slate-300" />
                  <p className="text-sm font-medium">Select images from the grid to attach them to your product.</p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col p-6 overflow-y-auto">
                  
                  {/* Single File Detail View */}
                  {selectedMediaFiles.length === 1 ? (
                    <div className="mb-6 animate-in fade-in duration-200">
                      <div className="aspect-square rounded-xl overflow-hidden bg-slate-200 border border-slate-200 mb-4 shadow-sm relative group">
                        <img src={selectedMediaFiles[0].url} className="w-full h-full object-cover" />
                      </div>
                      <h4 className="font-bold text-slate-900 truncate text-base mb-1" title={selectedMediaFiles[0].name}>
                        {selectedMediaFiles[0].name}
                      </h4>
                      <p className="text-xs text-slate-500 font-mono break-all">{selectedMediaFiles[0].id}</p>
                    </div>
                  ) : (
                    /* Multi-File Detail View */
                    <div className="mb-6 animate-in fade-in duration-200">
                      <div className="flex flex-wrap gap-2 mb-4">
                        {selectedMediaFiles.slice(0, 5).map((f, i) => (
                          <div key={i} className="w-14 h-14 rounded-lg overflow-hidden border border-slate-200 shadow-sm shrink-0">
                            <img src={f.url} className="w-full h-full object-cover" />
                          </div>
                        ))}
                        {selectedMediaFiles.length > 5 && (
                          <div className="w-14 h-14 rounded-lg bg-slate-200 border border-slate-300 flex items-center justify-center text-sm font-bold text-slate-600 shrink-0">
                            +{selectedMediaFiles.length - 5}
                          </div>
                        )}
                      </div>
                      <h4 className="font-extrabold text-slate-900 text-2xl tracking-tight">{selectedMediaFiles.length} Selected</h4>
                      <p className="text-sm text-slate-500 mt-1">Ready to attach to product.</p>
                    </div>
                  )}

                  {/* Actions Area */}
                  <div className="mt-auto space-y-2 pt-4 border-t border-slate-200">
                    <button 
                      onClick={handleAttachSelected} 
                      className="w-full py-2 bg-blue-600 text-white text-sm font-bold rounded-lg shadow-sm hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      <Plus size={16} /> Select {selectedMediaFiles.length} Image{selectedMediaFiles.length > 1 ? 's' : ''}
                    </button>
                    <button 
                      onClick={() => confirmDeleteMedia(selectedMediaFiles)} 
                      className="w-full py-2 bg-white text-red-600 text-sm font-bold rounded-lg border border-red-200 hover:bg-red-50 hover:border-red-300 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      <Trash2 size={16} /> Delete from Storage
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* --- VIEW PRODUCT MODAL --- */}
      {viewingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl shrink-0">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900">{viewingProduct.name}</h3>
                <p className="text-sm font-mono text-slate-500">{viewingProduct.base_sku}</p>
              </div>
              <button onClick={() => setViewingProduct(null)} className="text-slate-500 hover:text-slate-900 bg-slate-200 hover:bg-slate-300 p-1.5 rounded-full transition-all"><X size={20}/></button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {viewingProduct.image_urls?.length > 0 && (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {viewingProduct.image_urls.map((url, i) => (
                    <img key={i} src={url} alt="" className="w-24 h-24 object-cover rounded-lg border border-slate-200 shadow-sm shrink-0" />
                  ))}
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div><p className="text-xs text-slate-500 font-bold uppercase">Category</p><p className="font-semibold text-slate-900">{viewingProduct.category || 'N/A'}</p></div>
                <div><p className="text-xs text-slate-500 font-bold uppercase">Manufacturer</p><p className="font-semibold text-slate-900">{viewingProduct.manufacturer || 'N/A'}</p></div>
                <div><p className="text-xs text-slate-500 font-bold uppercase">Base Price</p><p className="font-semibold text-blue-600">${Number(viewingProduct.retail_base_price).toFixed(2)}</p></div>
                <div><p className="text-xs text-slate-500 font-bold uppercase">Stock on Hand</p><p className="font-bold text-slate-900">{viewingProduct.inventory?.base_units_on_hand || 0} {viewingProduct.base_unit_name}s</p></div>
              </div>

              {viewingProduct.description && (
                <div>
                  <h4 className="text-sm font-bold text-slate-900 mb-2">Description</h4>
                  <div className="text-sm text-slate-700 bg-white border border-slate-200 p-4 rounded-xl [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5" dangerouslySetInnerHTML={{ __html: viewingProduct.description }} />
                </div>
              )}

              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-2">Available Variants</h4>
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200"><tr className="text-slate-500"><th className="px-4 py-2 font-bold">Name</th><th className="px-4 py-2 font-bold">SKU</th><th className="px-4 py-2 font-bold">Qty</th><th className="px-4 py-2 font-bold text-right">Price</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewingProduct.product_variants?.map(v => (
                        <tr key={v.id}><td className="px-4 py-2 font-semibold text-slate-900">{v.name}</td><td className="px-4 py-2 font-mono text-xs">{v.sku}</td><td className="px-4 py-2">{v.multiplier}</td><td className="px-4 py-2 text-right font-medium">${Number(v.price).toFixed(2)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- CONFIRM MODAL --- */}
      {confirmAction.show && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div><h4 className="text-lg font-extrabold text-slate-900">{confirmAction.title}</h4><p className="text-sm text-slate-500 mt-2 font-medium">{confirmAction.message}</p></div>
            <div className="flex gap-3 pt-4">
              <button onClick={() => setConfirmAction({ show: false })} className="w-full py-2.5 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-50 active:scale-95 transition-all">Cancel</button>
              <button onClick={confirmAction.onConfirm} className="w-full py-2.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 active:scale-95 transition-all">{confirmAction.title.includes('Delete') ? 'Confirm Delete' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {/* --- SUCCESS NOTIFICATION MODAL --- */}
      {notification.show && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner"><CheckCircle2 size={32} /></div>
            <div><h4 className="text-xl font-extrabold text-slate-900">{notification.title}</h4><p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">{notification.message}</p></div>
            <button onClick={() => setNotification({ show: false })} className="w-full mt-6 py-3 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 active:scale-95 transition-all shadow-md">Okay</button>
          </div>
        </div>
      )}
    </div>
  );
}