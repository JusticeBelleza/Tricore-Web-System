import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { ShoppingCart, PackageOpen, Plus, Minus, X, CheckCircle2, Search } from 'lucide-react';

// --- SUB-COMPONENT: Minimalist Catalog Card ---
function ProductFamilyCard({ familyName, familyProducts, globalVariants, getFinalBasePrice, onClick }) {
  const [selectedProductId, setSelectedProductId] = useState(familyProducts[0].id);
  const activeProduct = familyProducts.find(p => p.id === selectedProductId) || familyProducts[0];
  const activeVariants = globalVariants.filter(v => v.product_id === activeProduct.id);

  const [selectedVariantId, setSelectedVariantId] = useState(activeVariants[0]?.id || '');

  // Reset variant selection when size changes
  useEffect(() => {
    const newVariants = globalVariants.filter(v => v.product_id === selectedProductId);
    if (newVariants.length > 0) setSelectedVariantId(newVariants[0].id);
    else setSelectedVariantId('');
  }, [selectedProductId, globalVariants]);

  const activeVariant = activeVariants.find(v => v.id === selectedVariantId) || activeVariants[0];

  // Calculate prices
  const finalBasePrice = getFinalBasePrice(activeProduct);
  const isDiscounted = finalBasePrice < Number(activeProduct.retail_base_price);
  const displayPrice = activeVariant ? (finalBasePrice * activeVariant.multiplier) : finalBasePrice;
  const originalDisplayPrice = activeVariant ? (Number(activeProduct.retail_base_price) * activeVariant.multiplier) : Number(activeProduct.retail_base_price);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden group">
      
      {/* Image (Clicking image opens modal) */}
      <div 
        onClick={onClick}
        className="aspect-[4/3] bg-slate-50/50 relative p-4 border-b border-slate-50 flex items-center justify-center cursor-pointer overflow-hidden"
      >
        {activeProduct.image_urls?.[0] ? (
          <img src={activeProduct.image_urls[0]} alt="" className="w-full h-full object-contain mix-blend-multiply transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="text-slate-300 flex flex-col items-center gap-2">
            <PackageOpen size={32} strokeWidth={1.5} />
            <span className="text-[10px] font-semibold uppercase tracking-widest">No Image</span>
          </div>
        )}
      </div>

      <div className="p-5 flex flex-col flex-1">
        {/* Title Area */}
        <div onClick={onClick} className="cursor-pointer mb-4">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{activeProduct.category || 'General'}</p>
          <h3 className="text-base font-bold text-slate-900 tracking-tight leading-snug mb-2 line-clamp-2">
            {familyName}
          </h3>
          <div className="space-y-0.5">
            {activeProduct.manufacturer && (
              <p className="text-[11px] text-slate-500"><span className="text-slate-400 mr-1">Brand:</span>{activeProduct.manufacturer}</p>
            )}
            <p className="text-[11px] text-slate-500"><span className="text-slate-400 mr-1">SKU:</span><span className="font-mono text-slate-600">{activeVariant?.sku || activeProduct.base_sku}</span></p>
          </div>
        </div>

        {/* --- SMALLER MINIMALIST OPTION BUTTONS --- */}
        <div className="space-y-4 mb-6 flex-1">
          
          {/* Size / Option Buttons */}
          {(familyProducts.length > 1 || familyProducts[0].name.includes(' - ')) && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 mb-1.5 uppercase tracking-widest">Size</p>
              <div className="flex flex-wrap gap-1.5">
                {familyProducts.map(p => {
                  const parts = p.name.split(' - ');
                  const sizeName = parts.length > 1 ? parts[1].trim() : 'Standard';
                  const isActive = selectedProductId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProductId(p.id)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-all duration-200 ${
                        isActive 
                          ? 'border-slate-900 bg-slate-900 text-white shadow-sm' 
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-900 hover:text-slate-900'
                      }`}
                    >
                      {sizeName}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Packaging Unit Buttons */}
          {activeVariants.length > 0 && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 mb-1.5 uppercase tracking-widest">Packaging</p>
              <div className="flex flex-wrap gap-1.5">
                {activeVariants.map(v => {
                  const isActive = selectedVariantId === v.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVariantId(v.id)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-all duration-200 ${
                        isActive 
                          ? 'border-slate-900 bg-slate-900 text-white shadow-sm' 
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-900 hover:text-slate-900'
                      }`}
                    >
                      {v.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Price & View Button */}
        <div className="mt-auto pt-4 flex items-end justify-between border-t border-slate-50">
          <div>
            {isDiscounted && (
              <p className="text-[10px] font-medium line-through text-slate-400 mb-0.5">
                ${originalDisplayPrice.toFixed(2)}
              </p>
            )}
            <p className="text-xl font-bold text-slate-900 tracking-tight leading-none">
              ${displayPrice.toFixed(2)}
            </p>
          </div>
          <button 
            onClick={onClick}
            className="px-3.5 py-1.5 bg-white border border-slate-200 text-slate-900 text-[11px] font-bold rounded-lg hover:bg-slate-50 hover:border-slate-300 active:scale-95 transition-all"
          >
            View Details
          </button>
        </div>
      </div>
    </div>
  );
}

// --- MAIN COMPONENT ---
export default function Catalog() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);
  const [pricingRules, setPricingRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  // Modal States
  const [viewingFamily, setViewingFamily] = useState(null); 
  const [notification, setNotification] = useState({ show: false, message: '' });

  // Modal Local States
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);

  // Track primitive values to prevent Alt-Tab re-fetching
  useEffect(() => {
    fetchCatalogData();
  }, [profile?.id, profile?.companies?.account_type, profile?.company_id]);

  const fetchCatalogData = async () => {
    setLoading(true);
    try {
      const { data: productsData, error: productsError } = await supabase.from('products').select('*').order('name');
      if (productsError) throw productsError;

      // FIXED: Ordered product variants by multiplier so smallest packaging is always first!
      const { data: variantsData, error: variantsError } = await supabase.from('product_variants').select('*').order('multiplier', { ascending: true });
      if (variantsError) throw variantsError;

      let rulesData = [];
      if (profile?.companies?.account_type === 'B2B' && profile.company_id) {
        const { data, error } = await supabase.from('pricing_rules').select('*').eq('company_id', profile.company_id);
        if (error) throw error;
        rulesData = data;
      }

      setProducts(productsData || []);
      setVariants(variantsData || []);
      setPricingRules(rulesData || []);
    } catch (error) {
      console.error('Error fetching catalog:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const getFinalBasePrice = (product) => {
    const rule = pricingRules.find(r => r.product_id === product.id);
    const basePrice = Number(product.retail_base_price);
    if (!rule) return basePrice;
    if (rule.rule_type === 'fixed') return Number(rule.value);
    if (rule.rule_type === 'percentage') return basePrice * (1 - (Number(rule.value) / 100));
    return basePrice;
  };

  // --- Filtering Logic ---
  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort();

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = p.name.toLowerCase().includes(searchLower) || p.base_sku.toLowerCase().includes(searchLower);
      const matchesCategory = selectedCategory ? p.category === selectedCategory : true;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  // --- Grouping & Smart Sorting Logic ---
  const groupedProducts = useMemo(() => {
    const groups = {};
    filteredProducts.forEach(p => {
      const familyName = p.name.split(' - ')[0].trim();
      if (!groups[familyName]) groups[familyName] = [];
      groups[familyName].push(p);
    });

    // Smart Sorter to force correct size order (Small, Medium, Large)
    const getSizeWeight = (name) => {
      const parts = name.split(' - ');
      const sizeName = parts.length > 1 ? parts[1].trim().toLowerCase() : '';
      
      if (sizeName === 'xs' || sizeName === 'extra small') return 1;
      if (sizeName === 'small' || sizeName === 's') return 2;
      if (sizeName === 'medium' || sizeName === 'm') return 3;
      if (sizeName === 'large' || sizeName === 'l') return 4;
      if (sizeName === 'xl' || sizeName === 'extra large') return 5;
      if (sizeName === 'xxl' || sizeName === '2xl') return 6;
      
      return 99; // Default weight for non-standard sizes, forces them to the end
    };

    // Apply the sorting to every product family group
    Object.values(groups).forEach(familyArray => {
      familyArray.sort((a, b) => {
        const weightA = getSizeWeight(a.name);
        const weightB = getSizeWeight(b.name);
        if (weightA !== weightB) return weightA - weightB;
        return a.name.localeCompare(b.name); // Fallback to alphabetical if same weight
      });
    });

    return Object.entries(groups);
  }, [filteredProducts]);

  const openProductModal = (familyName, familyProducts) => {
    const defaultProduct = familyProducts[0];
    const defaultVariants = variants.filter(v => v.product_id === defaultProduct.id);
    
    setViewingFamily({ familyName, familyProducts });
    setSelectedProductId(defaultProduct.id);
    setSelectedVariantId(defaultVariants[0]?.id || '');
    setQuantity(1);
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
    
    const basePrice = getFinalBasePrice(product);
    const unitPrice = variant.price ? Number(variant.price) : (basePrice * variant.multiplier);

    setCart(prev => {
      const existing = prev.find(item => item.variant_id === selectedVariantId);
      if (existing) {
        return prev.map(item => 
          item.variant_id === selectedVariantId 
            ? { ...item, quantity: item.quantity + quantity, line_total: (item.quantity + quantity) * item.unit_price }
            : item
        );
      }
      return [...prev, {
        product_id: product.id,
        variant_id: variant.id,
        name: `${product.name} (${variant.name})`,
        quantity: quantity,
        unit_price: unitPrice,
        line_total: unitPrice * quantity
      }];
    });

    setViewingFamily(null); 
    setNotification({ show: true, message: `Added ${quantity}x ${variant.name} to your cart.` }); 
  };

  if (loading) return <div className="text-slate-500 font-medium">Loading catalog...</div>;

  const activeProduct = viewingFamily ? viewingFamily.familyProducts.find(p => p.id === selectedProductId) : null;
  const activeVariants = activeProduct ? variants.filter(v => v.product_id === activeProduct.id) : [];
  const activeVariant = activeVariants.find(v => v.id === selectedVariantId) || activeVariants[0];
  
  const finalBasePrice = activeProduct ? getFinalBasePrice(activeProduct) : 0;
  const displayPrice = activeVariant ? (finalBasePrice * activeVariant.multiplier) : finalBasePrice;

  return (
    <div className="space-y-6 pb-12 relative max-w-7xl mx-auto">
      
      {/* Minimalist Header Area */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-6 pb-2">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Catalog</h2>
          {profile?.companies?.account_type === 'B2B' ? (
            <p className="text-sm text-slate-900 font-semibold mt-2">
              B2B Pricing Applied for {profile.companies.name}
            </p>
          ) : (
            <p className="text-sm text-slate-500 mt-2">
              Browse our complete catalog of clinical products.
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-4 sm:gap-6 bg-white p-2.5 pl-5 rounded-2xl border border-slate-200 shadow-sm w-full sm:w-auto justify-between sm:justify-end">
          <div className="text-right">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cart ({cart.reduce((acc, item) => acc + item.quantity, 0)})</p>
            <p className="text-lg font-bold text-slate-900 leading-none mt-1 tracking-tight">
              ${cart.reduce((acc, item) => acc + item.line_total, 0).toFixed(2)}
            </p>
          </div>
          <button 
            onClick={() => navigate('/checkout', { state: { cart } })}
            disabled={cart.length === 0}
            className="px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            Checkout
          </button>
        </div>
      </div>

      {/* --- Search & Category Filters --- */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="Search Product Name or SKU..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-transparent rounded-xl focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-100 outline-none text-sm transition-all placeholder:text-slate-400"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="w-full sm:w-56 px-4 py-2 bg-slate-50 border border-transparent rounded-xl focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-100 outline-none text-sm transition-all cursor-pointer font-medium text-slate-700"
        >
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Product Grid */}
      {groupedProducts.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-3xl border border-slate-100 shadow-sm">
          <PackageOpen size={40} strokeWidth={1.5} className="mx-auto text-slate-300 mb-5" />
          <h3 className="text-lg font-bold text-slate-900 mb-2 tracking-tight">No products found</h3>
          <p className="text-slate-500 text-sm">Try adjusting your search or category filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {groupedProducts.map(([familyName, familyProducts]) => (
            <ProductFamilyCard 
              key={familyName}
              familyName={familyName}
              familyProducts={familyProducts}
              globalVariants={variants}
              getFinalBasePrice={getFinalBasePrice}
              onClick={() => openProductModal(familyName, familyProducts)}
            />
          ))}
        </div>
      )}

      {/* --- MINIMALIST PRODUCT MODAL --- */}
      {viewingFamily && activeProduct && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-md sm:p-4">
          <div className="bg-white w-full max-w-4xl max-h-[90dvh] flex flex-col sm:flex-row sm:rounded-3xl shadow-2xl animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200 overflow-hidden relative border border-slate-100">
            
            {/* Mobile Close Button */}
            <button onClick={() => setViewingFamily(null)} className="absolute top-4 right-4 z-10 p-2 bg-white/80 backdrop-blur-md rounded-full text-slate-900 shadow-sm sm:hidden hover:bg-slate-100">
              <X size={20} />
            </button>

            {/* Left: Image Area */}
            <div className="w-full sm:w-1/2 bg-slate-50/50 flex flex-col justify-center items-center p-8 border-b sm:border-b-0 sm:border-r border-slate-100 shrink-0 min-h-[30vh]">
              {activeProduct.image_urls?.[0] ? (
                <img src={activeProduct.image_urls[0]} alt="" className="w-full max-h-[45vh] object-contain mix-blend-multiply" />
              ) : (
                <div className="text-slate-300 flex flex-col items-center gap-3">
                  <PackageOpen size={48} strokeWidth={1.5} />
                  <span className="text-xs font-semibold uppercase tracking-widest">No Image</span>
                </div>
              )}
            </div>

            {/* Right: Details & Actions Area */}
            <div className="w-full sm:w-1/2 flex flex-col overflow-y-auto bg-white">
              <div className="p-6 sm:p-8 flex-1 space-y-6">
                
                {/* Title, Manufacturer, SKU & Close */}
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{activeProduct.category || 'General'}</p>
                    <h3 className="text-2xl font-bold text-slate-900 tracking-tight leading-tight">
                      {viewingFamily.familyName}
                    </h3>
                    <div className="mt-3 space-y-1">
                      {activeProduct.manufacturer && (
                        <p className="text-sm text-slate-600"><span className="text-slate-400 mr-2">Brand:</span>{activeProduct.manufacturer}</p>
                      )}
                      <p className="text-sm text-slate-600"><span className="text-slate-400 mr-2">SKU:</span><span className="font-mono text-slate-900">{activeVariant?.sku || activeProduct.base_sku}</span></p>
                    </div>
                  </div>
                  <button onClick={() => setViewingFamily(null)} className="hidden sm:flex items-center justify-center w-8 h-8 text-slate-400 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-full transition-all">
                    <X size={18} />
                  </button>
                </div>

                {/* Description */}
                {activeProduct.description && (
                  <div className="text-sm text-slate-600 leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1" dangerouslySetInnerHTML={{ __html: activeProduct.description }} />
                )}

                <div className="h-px w-full bg-slate-100"></div>

                {/* --- SMALLER MODAL OPTION BUTTONS --- */}
                <div className="space-y-5">
                  
                  {/* Size / Attribute Buttons */}
                  {(viewingFamily.familyProducts.length > 1 || viewingFamily.familyProducts[0].name.includes(' - ')) && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-widest">Size / Option</label>
                      <div className="flex flex-wrap gap-2">
                        {viewingFamily.familyProducts.map(p => {
                          const parts = p.name.split(' - ');
                          const sizeName = parts.length > 1 ? parts[1].trim() : 'Standard';
                          const isActive = selectedProductId === p.id;
                          return (
                            <button
                              key={p.id}
                              onClick={() => handleSizeChange(p.id)}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all duration-200 ${
                                isActive 
                                  ? 'border-slate-900 bg-slate-900 text-white shadow-sm' 
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-900 hover:text-slate-900'
                              }`}
                            >
                              {sizeName}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Packaging Unit Buttons */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-widest">Packaging Unit</label>
                    <div className="flex flex-wrap gap-2">
                      {activeVariants.map(v => {
                        const isActive = selectedVariantId === v.id;
                        return (
                          <button
                            key={v.id}
                            onClick={() => setSelectedVariantId(v.id)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all duration-200 ${
                              isActive 
                                ? 'border-slate-900 bg-slate-900 text-white shadow-sm' 
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-900 hover:text-slate-900'
                            }`}
                          >
                            {v.name}
                          </button>
                        );
                      })}
                      {activeVariants.length === 0 && <span className="text-sm text-slate-400 italic">No variants available</span>}
                    </div>
                  </div>

                </div>

                <div className="h-px w-full bg-slate-100"></div>

                {/* Price & Add to Cart Section */}
                <div className="space-y-6 pb-2">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Unit Price</p>
                      <p className="text-3xl font-bold text-slate-900 tracking-tight">${displayPrice.toFixed(2)}</p>
                    </div>

                    {/* Quantity Selector */}
                    <div className="flex items-center p-1 rounded-xl border border-slate-200 bg-white shadow-sm">
                      <button 
                        type="button"
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        className="w-8 h-8 flex items-center justify-center text-slate-500 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors"
                      >
                        <Minus size={14} strokeWidth={2.5} />
                      </button>
                      <input 
                        type="number" 
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-10 h-8 bg-transparent text-center text-sm font-semibold text-slate-900 outline-none focus:ring-0"
                      />
                      <button 
                        type="button"
                        onClick={() => setQuantity(quantity + 1)}
                        className="w-8 h-8 flex items-center justify-center text-slate-500 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors"
                      >
                        <Plus size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>

                  <button 
                    onClick={handleAddToCart}
                    disabled={!selectedVariantId}
                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ShoppingCart size={16} /> Add to Cart — ${(displayPrice * quantity).toFixed(2)}
                  </button>
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

      {/* --- ADD TO CART SUCCESS NOTIFICATION --- */}
      {notification.show && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center space-y-4 animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className="w-16 h-16 bg-slate-50 text-slate-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} strokeWidth={2} />
            </div>
            <div>
              <h4 className="text-xl font-bold text-slate-900 tracking-tight">Added to Cart</h4>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed">{notification.message}</p>
            </div>
            <div className="flex flex-col gap-3 mt-8">
              <button
                onClick={() => {
                  setNotification({ show: false, message: '' });
                  navigate('/checkout', { state: { cart } });
                }}
                className="w-full py-3 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-sm"
              >
                Go to Checkout
              </button>
              <button
                onClick={() => setNotification({ show: false, message: '' })}
                className="w-full py-3 bg-white text-slate-700 font-semibold rounded-xl hover:bg-slate-50 active:scale-95 transition-all border border-slate-200"
              >
                Keep Shopping
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}