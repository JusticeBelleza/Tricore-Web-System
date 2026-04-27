import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { useQuery, keepPreviousData } from '@tanstack/react-query'; // 🚀 IMPORT REACT QUERY
import { ShoppingCart, PackageOpen, Plus, Minus, X, CheckCircle2, Search, Wallet, ChevronLeft, ChevronRight, AlertTriangle, ChevronDown, Building2 } from 'lucide-react';

function ProductFamilyCard({ familyName, familyProducts, globalVariants, getVariantPrice, onClick }) {
  const [selectedProductId, setSelectedProductId] = useState(familyProducts[0].id);
  const activeProduct = familyProducts.find(p => p.id === selectedProductId) || familyProducts[0];
  const activeVariants = globalVariants.filter(v => v.product_id === activeProduct.id);

  const [selectedVariantId, setSelectedVariantId] = useState(activeVariants[0]?.id || '');

  useEffect(() => {
    const newVariants = globalVariants.filter(v => v.product_id === selectedProductId);
    if (newVariants.length > 0) setSelectedVariantId(newVariants[0].id);
    else setSelectedVariantId('');
  }, [selectedProductId, globalVariants]);

  const activeVariant = activeVariants.find(v => v.id === selectedVariantId) || activeVariants[0];
  
  const { finalPrice: displayPrice } = getVariantPrice(activeProduct, activeVariant);

  let stockAmount = 0;
  if (Array.isArray(activeProduct?.inventory)) {
    stockAmount = activeProduct.inventory.reduce((sum, item) => sum + (Number(item.base_units_on_hand) || 0), 0);
  } else if (activeProduct?.inventory) {
    stockAmount = Number(activeProduct.inventory.base_units_on_hand) || 0;
  }

  const continueSelling = activeProduct?.continue_selling || false;
  const isOutOfStock = stockAmount <= 0;
  const preventPurchase = isOutOfStock && !continueSelling;

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all flex flex-row sm:flex-col overflow-hidden group ${preventPurchase ? 'opacity-80' : ''}`}>
      
      <div onClick={onClick} className="w-[120px] sm:w-full shrink-0 aspect-[3/4] sm:aspect-[4/3] bg-slate-50/50 relative p-2 sm:p-4 border-r sm:border-r-0 sm:border-b border-slate-100 flex items-center justify-center cursor-pointer overflow-hidden">
        
        {/* Top Left Badges */}
        <div className="absolute top-2 left-2 sm:top-3 sm:left-3 z-10 flex flex-col gap-1.5">
          {!isOutOfStock ? (
            <span className="px-1.5 py-0.5 sm:px-2 sm:py-1 bg-emerald-50 text-emerald-700 text-[8px] sm:text-[9px] font-bold uppercase tracking-widest rounded shadow-sm border border-emerald-200 w-fit">In Stock</span>
          ) : continueSelling ? (
            <span className="px-1.5 py-0.5 sm:px-2 sm:py-1 bg-amber-50 text-amber-700 text-[8px] sm:text-[9px] font-bold uppercase tracking-widest rounded shadow-sm border border-amber-200 w-fit">Backorder</span>
          ) : (
            <span className="px-1.5 py-0.5 sm:px-2 sm:py-1 bg-red-50 text-red-700 text-[8px] sm:text-[9px] font-bold uppercase tracking-widest rounded shadow-sm border border-red-200 flex items-center gap-1 w-fit">Out <span className="hidden sm:inline">of Stock</span></span>
          )}
        </div>

        {activeProduct.image_urls?.[0] ? (
          <img src={activeProduct.image_urls[0]} alt="" className={`w-full h-full object-contain mix-blend-multiply transition-transform duration-500 ${!preventPurchase && 'group-hover:scale-105'} ${preventPurchase && 'grayscale'}`} />
        ) : (
          <div className="text-slate-300 flex flex-col items-center gap-1 sm:gap-2">
            <PackageOpen size={24} strokeWidth={1.5} className="sm:w-8 sm:h-8" />
            <span className="text-[8px] sm:text-[10px] font-semibold uppercase tracking-widest">No Image</span>
          </div>
        )}
      </div>

      <div className="p-3 sm:p-5 flex flex-col flex-1 min-w-0">
        <div onClick={onClick} className="cursor-pointer mb-2 sm:mb-4 flex-1">
          <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 sm:mb-1 truncate">{activeProduct.category || 'General'}</p>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-snug mb-1 sm:mb-2 line-clamp-2">{familyName}</h3>
          
          <div className="hidden sm:block space-y-0.5">
            {activeProduct.manufacturer && <p className="text-[11px] text-slate-500"><span className="text-slate-400 mr-1">Brand:</span>{activeProduct.manufacturer}</p>}
            <p className="text-[11px] text-slate-500"><span className="text-slate-400 mr-1">SKU:</span><span className="font-mono text-slate-600">{activeVariant?.sku || activeProduct.base_sku}</span></p>
          </div>
          <div className="block sm:hidden text-[10px] text-slate-500 font-mono truncate">
            {activeVariant?.sku || activeProduct.base_sku}
          </div>
        </div>

        <div className="mt-auto pt-2 sm:pt-4 flex items-center sm:items-end justify-between border-t border-slate-100">
          <div>
            <p className="text-base sm:text-xl font-bold text-slate-900 tracking-tight leading-none">${displayPrice.toFixed(2)}</p>
          </div>
          <button onClick={onClick} className="px-3 py-1.5 sm:px-3.5 sm:py-1.5 bg-slate-900 text-white sm:bg-white sm:border sm:border-slate-200 sm:text-slate-900 text-[10px] sm:text-[11px] font-bold rounded-lg sm:hover:bg-slate-50 active:scale-95 transition-all shadow-sm">
            {preventPurchase ? 'Details' : 'View Options'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Catalog() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  
  const [page, setPage] = useState(0);
  const pageSize = 12; 
  const [searchTerm, setSearchTerm] = useState('');
  
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const categoryDropdownRef = useRef(null);

  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  const [cart, setCart] = useState([]);
  const [cartLoaded, setCartLoaded] = useState(false);

  const cartKey = profile?.company_id ? `tricore_cart_agency_${profile.company_id}` : `tricore_cart_user_${profile?.id}`;

  // Close custom dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target)) {
        setIsCategoryOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounce Search
  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedSearch(searchTerm); setPage(0); }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Reset page when category changes
  useEffect(() => { setPage(0); }, [selectedCategory]);

  // Cart Local Storage Sync
  useEffect(() => {
    if (profile?.id) {
      const savedCart = localStorage.getItem(cartKey);
      if (savedCart) setCart(JSON.parse(savedCart));
      else setCart([]); 
      setCartLoaded(true);
    }
  }, [profile?.id, cartKey]);

  useEffect(() => {
    if (cartLoaded && profile?.id) {
      localStorage.setItem(cartKey, JSON.stringify(cart));
    }
  }, [cart, cartLoaded, profile?.id, cartKey]);


  // ==========================================
  // 🚀 REACT QUERY 1: FETCH CATEGORIES
  // ==========================================
  const { data: categories = [] } = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('category').neq('category', null);
      if (data) return Array.from(new Set(data.map(d => d.category).filter(Boolean))).sort();
      return [];
    },
    staleTime: 1000 * 60 * 60, // Cache for 1 Hour
  });

  // ==========================================
  // 🚀 REACT QUERY 2: FETCH B2B FINANCIALS & RULES
  // ==========================================
  const { data: b2bData } = useQuery({
    queryKey: ['b2b-financials', profile?.company_id],
    enabled: !!(profile?.company_id && profile?.role?.toLowerCase() === 'b2b'), // Only runs if user is B2B
    queryFn: async () => {
      const [rulesRes, unpaidRes] = await Promise.all([
        supabase.from('pricing_rules').select('*').eq('company_id', profile.company_id),
        supabase.from('orders').select('total_amount').eq('company_id', profile.company_id).eq('payment_status', 'unpaid')
      ]);
      if (rulesRes.error) throw rulesRes.error;
      
      const limit = Number(profile?.companies?.credit_limit || 0);
      const outstanding = unpaidRes.data?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
      
      return {
        rules: rulesRes.data || [],
        financials: { limit, outstanding, available: limit - outstanding }
      };
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 mins
  });

  const pricingRules = b2bData?.rules || [];
  const financials = b2bData?.financials || { limit: 0, outstanding: 0, available: 0 };


  // ==========================================
  // 🚀 REACT QUERY 3: FETCH CATALOG PRODUCTS
  // ==========================================
  const { data: catalogData, isPending: loading } = useQuery({
    queryKey: ['catalog-products', debouncedSearch, selectedCategory, page, pageSize],
    queryFn: async () => {
      let query = supabase.from('products').select(`*, product_variants (*), inventory (*)`, { count: 'exact' });

      if (debouncedSearch) {
        query = query.or(`name.ilike.%${debouncedSearch}%,base_sku.ilike.%${debouncedSearch}%`);
      }
      if (selectedCategory && selectedCategory !== 'All Categories') {
        query = query.eq('category', selectedCategory);
      }

      query = query.order('name');
      const from = page * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;

      // Extract all variants flatly
      const fetchedVariants = (data || []).flatMap(p => p.product_variants || []);
      
      return { products: data || [], variants: fetchedVariants, totalCount: count || 0 };
    },
    placeholderData: keepPreviousData, // 🚀 Prevents white screen flashes while paginating
    staleTime: 1000 * 60 * 5, // Cache for 5 mins
  });

  const products = catalogData?.products || [];
  const variants = catalogData?.variants || [];
  const totalCount = catalogData?.totalCount || 0;


  // --- PRICING CALCULATOR ---
  const getVariantPrice = (product, variant) => {
    if (!product) return { finalPrice: 0, hasRule: false };
    
    const baseRetail = Number(product.retail_base_price || 0);
    const variantRetail = (variant && Number(variant.price) > 0) ? Number(variant.price) : (baseRetail * (variant?.multiplier || 1));
    
    if (!profile?.company_id || pricingRules.length === 0) {
      return { finalPrice: variantRetail, hasRule: false };
    }

    let applicableRule = pricingRules.find(r => r.variant_id === variant?.id);

    if (!applicableRule) return { finalPrice: variantRetail, hasRule: false };

    let finalPrice = variantRetail;
    const ruleValue = Number(applicableRule.value);

    if (applicableRule.rule_type === 'percentage') {
      finalPrice = variantRetail * (1 - (ruleValue / 100));
    } else if (applicableRule.rule_type === 'fixed') {
      finalPrice = ruleValue;
    }

    return { 
      finalPrice: finalPrice, 
      hasRule: finalPrice < variantRetail 
    };
  };

  // --- GROUP PRODUCTS INTO FAMILIES ---
  const groupedProducts = useMemo(() => {
    const groups = {};
    products.forEach(p => {
      const familyName = p.name.split(' - ')[0].trim();
      if (!groups[familyName]) groups[familyName] = [];
      groups[familyName].push(p);
    });
    const getSizeWeight = (name) => {
      const parts = name.split(' - ');
      const sizeName = parts.length > 1 ? parts[1].trim().toLowerCase() : '';
      if (sizeName === 'xs' || sizeName === 'extra small') return 1;
      if (sizeName === 'small' || sizeName === 's') return 2;
      if (sizeName === 'medium' || sizeName === 'm') return 3;
      if (sizeName === 'large' || sizeName === 'l') return 4;
      if (sizeName === 'xl' || sizeName === 'extra large') return 5;
      if (sizeName === 'xxl' || sizeName === '2xl') return 6;
      return 99; 
    };
    Object.values(groups).forEach(familyArray => {
      familyArray.sort((a, b) => {
        const weightA = getSizeWeight(a.name);
        const weightB = getSizeWeight(b.name);
        if (weightA !== weightB) return weightA - weightB;
        return a.name.localeCompare(b.name); 
      });
    });
    return Object.entries(groups);
  }, [products]);


  // --- MODAL LOGIC ---
  const [viewingFamily, setViewingFamily] = useState(null); 
  const [isClosing, setIsClosing] = useState(false); 
  const [toast, setToast] = useState({ show: false, message: '' });
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);

  const openProductModal = (familyName, familyProducts) => {
    const defaultProduct = familyProducts[0];
    const defaultVariants = variants.filter(v => v.product_id === defaultProduct.id);
    setViewingFamily({ familyName, familyProducts });
    setSelectedProductId(defaultProduct.id);
    setSelectedVariantId(defaultVariants[0]?.id || '');
    setQuantity(1);
    setIsAddingToCart(false); 
    setIsClosing(false); 
  };

  const handleCloseModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setViewingFamily(null);
      setIsClosing(false);
    }, 300); 
  };

  const handleSizeChange = (newProductId) => {
    setSelectedProductId(newProductId);
    const newVariants = variants.filter(v => v.product_id === newProductId);
    setSelectedVariantId(newVariants[0]?.id || '');
    setQuantity(1);
  };

  const handleAddToCart = () => {
    if (!selectedVariantId || quantity < 1) return;
    const product = products.find(p => p.id === selectedProductId);
    const variant = variants.find(v => v.id === selectedVariantId);
    const { finalPrice: unitPrice } = getVariantPrice(product, variant);

    setIsAddingToCart(true);

    setCart(prev => {
      const existing = prev.find(item => item.variant_id === selectedVariantId);
      if (existing) {
        return prev.map(item => 
          item.variant_id === selectedVariantId 
            ? { ...item, quantity: item.quantity + quantity, line_total: (item.quantity + quantity) * unitPrice }
            : item
        );
      }
      return [...prev, {
        product_id: product.id, variant_id: variant.id, name: `${product.name} (${variant.name})`,
        quantity: quantity, unit_price: unitPrice, line_total: unitPrice * quantity
      }];
    });

    setTimeout(() => {
      handleCloseModal(); 
      setIsAddingToCart(false);
      setToast({ show: true, message: `Added ${quantity}x ${variant.name} to cart.` });
      setTimeout(() => { setToast({ show: false, message: '' }); }, 3000);
    }, 600); 
  };

  // Active state derived from selected IDs
  const activeProduct = viewingFamily ? viewingFamily.familyProducts.find(p => p.id === selectedProductId) : null;
  const activeVariants = activeProduct ? variants.filter(v => v.product_id === activeProduct.id) : [];
  const activeVariant = activeVariants.find(v => v.id === selectedVariantId) || activeVariants[0];
  const { finalPrice: displayPrice } = getVariantPrice(activeProduct, activeVariant);

  let modalStockAmount = 0;
  if (Array.isArray(activeProduct?.inventory)) {
    modalStockAmount = activeProduct.inventory.reduce((sum, item) => sum + (Number(item.base_units_on_hand) || 0), 0);
  } else if (activeProduct?.inventory) {
    modalStockAmount = Number(activeProduct.inventory.base_units_on_hand) || 0;
  }

  const modalContinueSelling = activeProduct?.continue_selling || false;
  const modalIsOutOfStock = modalStockAmount <= 0;
  const modalPreventPurchase = modalIsOutOfStock && !modalContinueSelling;

  // 🚀 NUMBERED PAGINATION CALCULATOR
  const totalPages = Math.ceil(totalCount / pageSize);
  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 5) {
      for (let i = 0; i < totalPages; i++) pages.push(i);
    } else {
      if (page <= 2) {
        pages.push(0, 1, 2, '...', totalPages - 1);
      } else if (page >= totalPages - 3) {
        pages.push(0, '...', totalPages - 3, totalPages - 2, totalPages - 1);
      } else {
        pages.push(0, '...', page - 1, page, page + 1, '...', totalPages - 1);
      }
    }
    return pages;
  };


  return (
    <div className="space-y-4 sm:space-y-6 pb-20 relative max-w-7xl mx-auto px-4 sm:px-6">
      
      {/* CSS ANIMATIONS */}
      <style>
        {`
          /* Opening Animations */
          @keyframes modalOverlayFade { from { opacity: 0; } to { opacity: 1; } }
          @keyframes modalSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
          @keyframes modalZoomIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
          
          /* Closing Animations */
          @keyframes modalOverlayFadeOut { from { opacity: 1; } to { opacity: 0; } }
          @keyframes modalSlideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
          @keyframes modalZoomOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.95); } }

          /* Toast Animation */
          @keyframes toastSlide { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
          
          /* Classes */
          .modal-overlay-anim { animation: modalOverlayFade 0.3s ease-out forwards; }
          .modal-overlay-close-anim { animation: modalOverlayFadeOut 0.3s ease-in forwards; }
          
          .modal-content-anim { animation: modalSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
          .modal-content-close-anim { animation: modalSlideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
          
          .toast-slide-anim { animation: toastSlide 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

          /* Desktop Zoom overrides instead of sliding */
          @media (min-width: 640px) {
            .modal-content-anim { animation: modalZoomIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
            .modal-content-close-anim { animation: modalZoomOut 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
          }
        `}
      </style>

      {/* Header Area */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 sm:gap-6 pb-2 pt-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Catalog</h2>
          {profile?.role?.toLowerCase() === 'b2b' ? (
            <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest rounded-lg border border-blue-100 flex items-center gap-1.5">
                <Building2 size={12}/> B2B Portal
              </span>
              <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-medium text-slate-500 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-sm">
                <Wallet size={14} className="text-slate-400" />
                Credit: 
                <span className={`font-bold ${financials.available <= 0 ? 'text-red-600' : 'text-slate-900'}`}>
                  ${financials.available.toLocaleString(undefined, {minimumFractionDigits: 2})}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs sm:text-sm text-slate-500 mt-1 sm:mt-2">Browse our complete catalog of clinical products.</p>
          )}
        </div>
        
        {/* Mobile-optimized Cart Box */}
        <div className="flex items-center gap-4 sm:gap-6 bg-white p-2.5 pl-4 sm:pl-5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm w-full sm:w-auto justify-between sm:justify-end shrink-0">
          <div className="text-left sm:text-right">
            <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cart ({cart.reduce((acc, item) => acc + item.quantity, 0)})</p>
            <p className="text-base sm:text-lg font-bold text-slate-900 leading-none mt-1 tracking-tight">
              ${cart.reduce((acc, item) => acc + item.line_total, 0).toFixed(2)}
            </p>
          </div>
          <button 
            onClick={() => navigate('/checkout')}
            disabled={cart.length === 0}
            className="px-4 py-2 sm:px-5 sm:py-2.5 bg-slate-900 text-white text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl hover:bg-slate-800 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center gap-2"
          >
            <ShoppingCart size={16}/> Checkout
          </button>
        </div>
      </div>

      {/* Filters Row - Sticky */}
      <div className="sticky top-0 z-30 py-2 sm:py-0 bg-slate-50 sm:bg-transparent -mx-4 sm:mx-0 px-4 sm:px-0">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 bg-white p-2 sm:p-3 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm w-full">
          
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
            <input 
              type="text" 
              placeholder="Search product or SKU..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-transparent rounded-lg sm:rounded-xl focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-100 outline-none text-xs sm:text-sm transition-all placeholder:text-slate-400" 
            />
          </div>

          <div className="relative w-full sm:w-64 shrink-0" ref={categoryDropdownRef}>
            <button 
              onClick={() => setIsCategoryOpen(!isCategoryOpen)}
              className="w-full flex items-center justify-between pl-4 pr-3 py-2.5 bg-slate-50 border border-transparent rounded-lg sm:rounded-xl hover:bg-slate-100 focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-100 outline-none text-xs sm:text-sm transition-all cursor-pointer font-medium text-slate-700"
            >
              <span className="truncate">{selectedCategory}</span>
              <ChevronDown className={`text-slate-400 transition-transform duration-200 ${isCategoryOpen ? 'rotate-180' : ''}`} size={16} />
            </button>

            {isCategoryOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 shadow-xl rounded-xl z-[70] max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                {['All Categories', ...categories.filter(c => c !== 'All Categories')].map(c => (
                  <button
                    key={c}
                    onClick={() => {
                      setSelectedCategory(c);
                      setIsCategoryOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3 text-xs sm:text-sm transition-colors border-b border-slate-50 last:border-0 ${selectedCategory === c ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50 font-medium'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Product Grid / List Wrapper */}
      <div className="min-h-[500px] relative">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
            {[1,2,3,4,5,6,7,8].map(n => (
              <div key={n} className="bg-white rounded-2xl border border-slate-100 shadow-sm h-32 sm:h-80 animate-pulse flex flex-row sm:flex-col">
                <div className="w-32 sm:w-full sm:aspect-[4/3] bg-slate-100 shrink-0"></div>
                <div className="p-4 sm:p-5 flex-1 space-y-3"><div className="w-1/3 h-3 bg-slate-100 rounded"></div><div className="w-3/4 h-5 bg-slate-100 rounded"></div><div className="w-1/2 h-3 bg-slate-100 rounded"></div></div>
              </div>
            ))}
          </div>
        ) : groupedProducts.length === 0 ? (
          <div className="p-10 sm:p-16 text-center bg-white rounded-2xl sm:rounded-3xl border border-slate-100 shadow-sm">
            <PackageOpen size={36} strokeWidth={1.5} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-2 tracking-tight">No products found</h3>
            <p className="text-slate-500 text-xs sm:text-sm">Try adjusting your search or category filter.</p>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
              {groupedProducts.map(([familyName, familyProducts]) => (
                <ProductFamilyCard key={familyName} familyName={familyName} familyProducts={familyProducts} globalVariants={variants} getVariantPrice={getVariantPrice} onClick={() => openProductModal(familyName, familyProducts)} />
              ))}
            </div>
            
            {/* 🚀 UPGRADED NUMBERED PAGINATION CONTROLS */}
            {totalCount > pageSize && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 sm:px-6 py-4 bg-white border border-slate-200 shadow-sm rounded-xl sm:rounded-2xl mt-4 sm:mt-6">
                <span className="text-xs sm:text-sm font-medium text-slate-500">
                  Showing <span className="font-bold text-slate-900">{page * pageSize + 1}</span> to <span className="font-bold text-slate-900">{Math.min((page + 1) * pageSize, totalCount)}</span> of <span className="font-bold text-slate-900">{totalCount}</span>
                </span>
                
                <div className="flex items-center gap-1 sm:gap-2 w-full sm:w-auto justify-center">
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-2 sm:px-4 sm:py-2.5 rounded-xl border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 active:scale-95 disabled:opacity-50 disabled:active:scale-100 shadow-sm transition-all flex items-center justify-center">
                    <ChevronLeft size={16} /> <span className="hidden sm:inline ml-1 font-bold text-sm">Prev</span>
                  </button>

                  {getPageNumbers().map((p, index) => (
                    p === '...' ? (
                      <span key={`dots-${index}`} className="px-1 sm:px-2 text-slate-400 font-bold">...</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl font-bold text-sm transition-all flex items-center justify-center ${
                          page === p ? 'bg-blue-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm'
                        }`}
                      >
                        {p + 1}
                      </button>
                    )
                  ))}

                  <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * pageSize >= totalCount} className="p-2 sm:px-4 sm:py-2.5 rounded-xl border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 active:scale-95 disabled:opacity-50 disabled:active:scale-100 shadow-sm transition-all flex items-center justify-center">
                    <span className="hidden sm:inline mr-1 font-bold text-sm">Next</span> <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* PRODUCT MODAL: Perfect iOS-style Slide Up for Mobile */}
      {viewingFamily && activeProduct && (
        <div className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm sm:p-4 pb-0 sm:pb-4 ${isClosing ? 'modal-overlay-close-anim' : 'modal-overlay-anim'}`} onClick={handleCloseModal}>
          
          {/* Main Modal Container */}
          <div className={`bg-white w-full max-w-4xl h-[90dvh] sm:h-auto sm:max-h-[85dvh] flex flex-col sm:flex-row rounded-t-[2rem] sm:rounded-3xl shadow-2xl overflow-hidden relative border-t sm:border border-slate-100 ${isClosing ? 'modal-content-close-anim' : 'modal-content-anim'}`} onClick={e => e.stopPropagation()}>
            
            {/* Close Button */}
            <button onClick={handleCloseModal} className="absolute top-3 right-3 sm:top-4 sm:right-4 z-[60] w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-white/90 backdrop-blur border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-full shadow-md transition-all active:scale-95">
              <X size={18} />
            </button>
            
            {/* Left/Top: Image Side */}
            <div className="w-full sm:w-1/2 bg-slate-50/50 flex flex-col justify-center items-center p-6 sm:p-8 border-b sm:border-b-0 sm:border-r border-slate-100 h-[35dvh] sm:h-auto sm:min-h-[400px] shrink-0 relative">
              {activeProduct.image_urls?.[0] ? (
                <img src={activeProduct.image_urls[0]} alt="" className={`max-w-full max-h-full object-contain mix-blend-multiply ${modalPreventPurchase ? 'grayscale opacity-75' : ''}`} />
              ) : (
                <div className="text-slate-300 flex flex-col items-center gap-2 sm:gap-3">
                  <PackageOpen size={40} strokeWidth={1.5} className="sm:w-16 sm:h-16" />
                  <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest">No Image</span>
                </div>
              )}
            </div>

            {/* Right/Bottom: Scrolling Content Side */}
            <div className="w-full sm:w-1/2 flex flex-col flex-1 overflow-y-auto min-h-0 bg-white">
              <div className="p-5 sm:p-8 flex-1 space-y-5 sm:space-y-6">
                
                <div>
                  <div className="flex items-center gap-2 sm:gap-3 mb-2">
                    <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">{activeProduct.category || 'General'}</p>
                    
                    {!modalIsOutOfStock ? (
                      <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[8px] sm:text-[9px] font-bold uppercase tracking-widest rounded border border-emerald-200">In Stock</span>
                    ) : modalContinueSelling ? (
                      <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[8px] sm:text-[9px] font-bold uppercase tracking-widest rounded border border-amber-200">On Backorder</span>
                    ) : (
                      <span className="px-1.5 py-0.5 bg-red-50 text-red-700 text-[8px] sm:text-[9px] font-bold uppercase tracking-widest rounded border border-red-200 flex items-center gap-1"><AlertTriangle size={10}/> Out of Stock</span>
                    )}
                  </div>
                  
                  <h3 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-tight pr-6">{viewingFamily.familyName}</h3>
                  <div className="mt-2 sm:mt-3 space-y-0.5 sm:space-y-1">
                    {activeProduct.manufacturer && <p className="text-xs sm:text-sm text-slate-600"><span className="text-slate-400 mr-1 sm:mr-2">Brand:</span>{activeProduct.manufacturer}</p>}
                    <p className="text-xs sm:text-sm text-slate-600"><span className="text-slate-400 mr-1 sm:mr-2">SKU:</span><span className="font-mono text-slate-900">{activeVariant?.sku || activeProduct.base_sku}</span></p>
                  </div>
                </div>

                {activeProduct.description && (<div className="text-xs sm:text-sm text-slate-600 leading-relaxed [&_ul]:list-disc [&_ul]:pl-4 sm:[&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-4 sm:[&_ol]:pl-5 [&_li]:mt-1" dangerouslySetInnerHTML={{ __html: activeProduct.description }} />)}

                <div className="h-px w-full bg-slate-100"></div>

                <div className="space-y-4 sm:space-y-5">
                  {(viewingFamily.familyProducts.length > 1 || viewingFamily.familyProducts[0].name.includes(' - ')) && (
                    <div>
                      <label className="block text-[9px] sm:text-[10px] font-bold text-slate-400 mb-1.5 sm:mb-2 uppercase tracking-widest">Size / Option</label>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {viewingFamily.familyProducts.map(p => {
                          const parts = p.name.split(' - '); const sizeName = parts.length > 1 ? parts[1].trim() : 'Standard'; const isActive = selectedProductId === p.id;
                          return (<button key={p.id} onClick={() => handleSizeChange(p.id)} className={`px-2.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-semibold rounded-md sm:rounded-lg border transition-all duration-200 ${isActive ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-900 hover:text-slate-900'}`}>{sizeName}</button>);
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-[9px] sm:text-[10px] font-bold text-slate-400 mb-1.5 sm:mb-2 uppercase tracking-widest">Packaging Unit</label>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {activeVariants.map(v => {
                        const isActive = selectedVariantId === v.id;
                        return (<button key={v.id} onClick={() => setSelectedVariantId(v.id)} className={`px-2.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-semibold rounded-md sm:rounded-lg border transition-all duration-200 ${isActive ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-900 hover:text-slate-900'}`}>{v.name}</button>);
                      })}
                      {activeVariants.length === 0 && <span className="text-xs sm:text-sm text-slate-400 italic">No variants available</span>}
                    </div>
                  </div>
                </div>

                <div className="h-px w-full bg-slate-100"></div>

                <div className="space-y-4 sm:space-y-6 pb-4 sm:pb-2">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 sm:mb-1.5">Unit Price</p>
                      <p className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">${displayPrice.toFixed(2)}</p>
                    </div>
                    
                    <div className={`flex items-center p-0.5 sm:p-1 rounded-xl border shadow-sm ${modalPreventPurchase ? 'bg-slate-50 border-slate-100 opacity-50' : 'bg-white border-slate-200'}`}>
                      <button type="button" disabled={modalPreventPurchase} onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-slate-500 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors active:scale-95"><Minus size={14} strokeWidth={2.5} /></button>
                      <input type="number" disabled={modalPreventPurchase} value={quantity} onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))} className="w-10 sm:w-12 h-8 sm:h-10 bg-transparent text-center text-sm sm:text-base font-bold text-slate-900 outline-none focus:ring-0" />
                      <button type="button" disabled={modalPreventPurchase} onClick={() => setQuantity(quantity + 1)} className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-slate-500 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors active:scale-95"><Plus size={14} strokeWidth={2.5} /></button>
                    </div>
                  </div>

                  <button 
                    onClick={handleAddToCart} 
                    disabled={!selectedVariantId || isAddingToCart || modalPreventPurchase} 
                    className={`w-full flex items-center justify-center gap-2 py-3.5 sm:py-4 text-sm font-bold rounded-xl transition-all shadow-md 
                      ${modalPreventPurchase ? 'bg-slate-200 text-slate-400 shadow-none cursor-not-allowed' : 
                        isAddingToCart ? 'bg-emerald-500 text-white scale-[0.98] shadow-emerald-500/30' : 'bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98]'}`}
                  >
                    {modalPreventPurchase ? (
                      <><AlertTriangle size={16} /> Out of Stock</>
                    ) : isAddingToCart ? (
                      <><CheckCircle2 size={18} className="animate-bounce" /> Added to Cart</>
                    ) : (
                      <><ShoppingCart size={16} /> Add to Cart — ${(displayPrice * quantity).toFixed(2)}</>
                    )}
                  </button>
                  {modalIsOutOfStock && modalContinueSelling && (
                    <p className="text-center text-[10px] sm:text-xs font-bold text-amber-600 mt-2">Item is on backorder. It will ship when available.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- TOAST NOTIFICATION --- */}
      {toast.show && (
        <div className="fixed bottom-20 sm:bottom-8 right-4 sm:right-8 z-[110] flex items-center gap-2 sm:gap-3 bg-slate-900 text-white px-4 py-3 sm:px-5 sm:py-3.5 rounded-xl sm:rounded-2xl shadow-2xl toast-slide-anim">
          <div className="bg-emerald-500/20 text-emerald-400 p-1 sm:p-1.5 rounded-full"><CheckCircle2 size={16} strokeWidth={2.5} className="sm:w-5 sm:h-5" /></div>
          <p className="text-xs sm:text-sm font-medium pr-1 sm:pr-2">{toast.message}</p>
        </div>
      )}

    </div>
  );
}