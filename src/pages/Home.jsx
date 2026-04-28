import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { 
  Truck, ShieldCheck, Clock, ArrowRight, Package, Lock, 
  ShoppingCart, Search, UserPlus, ChevronLeft, ChevronRight, 
  User, LayoutDashboard, ChevronDown, MapPin, Mail, Phone, Users,
  Menu, X, ArrowUp, PackageOpen, Plus, Minus, CheckCircle2, AlertTriangle, Building2
} from 'lucide-react';

// 🚀 SHADCN UI IMPORTS
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// =========================================
// REUSABLE MOBILE AUTO-SLIDER COMPONENT
// =========================================
const MobileCarousel = ({ items, renderItem, desktopGridClass, autoPlayInterval = 3500 }) => {
  const scrollRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const scrollPosition = scrollRef.current.scrollLeft;
    const children = scrollRef.current.children;
    let closestIndex = 0;
    let minDiff = Infinity;

    for (let i = 0; i < children.length; i++) {
      const childOffset = children[i].offsetLeft - 24;
      const diff = Math.abs(childOffset - scrollPosition);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }
    setActiveIndex(closestIndex);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (!scrollRef.current || !scrollRef.current.children.length) return;
      if (scrollRef.current.scrollWidth <= scrollRef.current.clientWidth + 10) return;

      let nextIndex = activeIndex + 1;
      if (nextIndex >= items.length) nextIndex = 0;

      const targetChild = scrollRef.current.children[nextIndex];
      if (targetChild) {
        scrollRef.current.scrollTo({ left: targetChild.offsetLeft - 24, behavior: 'smooth' });
      }
    }, autoPlayInterval);
    return () => clearInterval(interval);
  }, [activeIndex, items.length, autoPlayInterval]);

  return (
    <div className="relative w-full">
      <div ref={scrollRef} onScroll={handleScroll} className={`flex sm:grid overflow-x-auto sm:overflow-visible snap-x snap-mandatory sm:snap-none gap-6 pb-2 sm:pb-0 -mx-6 px-6 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${desktopGridClass}`}>
        {items.map((item, idx) => (
          <div key={idx} className="w-[85vw] sm:w-auto shrink-0 snap-center sm:snap-align-none flex h-full">
            {renderItem(item, idx)}
          </div>
        ))}
      </div>
      <div className="flex sm:hidden justify-center items-center gap-2 mt-6">
        {items.map((_, idx) => (
          <div key={idx} className={`h-2 rounded-full transition-all duration-300 ${activeIndex === idx ? 'w-6 bg-blue-600' : 'w-2 bg-slate-300'}`} />
        ))}
      </div>
    </div>
  );
};

// =========================================
// PRODUCT FAMILY CARD COMPONENT
// =========================================
function ProductFamilyCard({ familyName, familyProducts, globalVariants, getVariantPrice, onClick, session }) {
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
    <Card 
      onClick={onClick}
      className={`group cursor-pointer hover:shadow-xl hover:-translate-y-1 active:scale-[0.98] transition-all duration-200 overflow-hidden flex flex-col ${preventPurchase ? 'opacity-80' : ''}`}
    >
      <div className="w-full h-40 sm:h-48 bg-slate-50 relative p-4 border-b border-slate-100 flex items-center justify-center overflow-hidden">
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
          {!isOutOfStock ? (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">In Stock</Badge>
          ) : continueSelling ? (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50">Backorder</Badge>
          ) : (
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 hover:bg-red-50 flex items-center gap-1"><AlertTriangle size={10}/> Out of Stock</Badge>
          )}
        </div>

        {activeProduct.image_urls?.[0] ? (
          <img src={activeProduct.image_urls[0]} alt="" className={`w-full h-full object-contain mix-blend-multiply transition-transform duration-500 ${!preventPurchase && 'group-hover:scale-105'} ${preventPurchase && 'grayscale'}`} />
        ) : (
          <div className="text-slate-300 flex flex-col items-center gap-2">
            <PackageOpen size={48} strokeWidth={1.5} />
            <span className="text-[10px] font-semibold uppercase tracking-widest">No Image</span>
          </div>
        )}
      </div>

      <CardContent className="p-4 sm:p-5 flex-1 flex flex-col min-w-0 pb-0">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 truncate">{activeProduct.category || 'General'}</p>
        <h3 className="text-base font-bold text-slate-900 tracking-tight leading-snug mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">{familyName}</h3>
        <div className="space-y-0.5">
          {activeProduct.manufacturer && <p className="text-[11px] text-slate-500"><span className="text-slate-400 mr-1">Brand:</span>{activeProduct.manufacturer}</p>}
          <p className="text-[11px] text-slate-500"><span className="text-slate-400 mr-1">SKU:</span><span className="font-mono text-slate-600">{activeVariant?.sku || activeProduct.base_sku}</span></p>
        </div>
      </CardContent>

      <CardFooter className="p-4 sm:p-5 pt-4 mt-auto border-t border-slate-100 flex items-center justify-between">
        <div>
          {session ? (
            <>
              <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Starting At</span>
              <p className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight leading-none">${displayPrice.toFixed(2)}</p>
            </>
          ) : (
            <p className="text-[10px] sm:text-xs font-bold text-slate-500 flex items-center gap-1 mt-2"><Lock size={12}/> Login for price</p>
          )}
        </div>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-xs shadow-sm">
          {preventPurchase ? 'Details' : 'Options'}
        </Button>
      </CardFooter>
    </Card>
  );
}

// =========================================
// MAIN HOME PAGE COMPONENT
// =========================================
export default function Home() {
  const { profile, session } = useAuth();
  const navigate = useNavigate();
  
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  
  // Pagination State
  const [page, setPage] = useState(0);

  const [activeSection, setActiveSection] = useState('home');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  
  const [cart, setCart] = useState([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const cartKey = profile?.company_id ? `tricore_cart_agency_${profile.company_id}` : `tricore_cart_user_${profile?.id}`;
  
  // Original Modal State
  const [viewingFamily, setViewingFamily] = useState(null); 
  const [isClosing, setIsClosing] = useState(false); 
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);

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

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getInitialPageSize = () => window.innerWidth < 1024 ? 4 : 8;
  const [pageSize, setPageSize] = useState(getInitialPageSize());

  useEffect(() => {
    const handleResize = () => {
      const newSize = window.innerWidth < 1024 ? 4 : 8;
      setPageSize(prevSize => {
        if (prevSize !== newSize) { setPage(0); return newSize; }
        return prevSize;
      });
      if (window.innerWidth >= 1024) setIsMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedSearch(searchQuery); setPage(0); }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => { setPage(0); }, [activeCategory]);


  // 🚀 REACT QUERY 1: Fetch Categories
  const { data: categories = ['All'] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('category').neq('category', null);
      if (data) return ['All', ...new Set(data.map(d => d.category).filter(Boolean))].sort();
      return ['All'];
    },
    staleTime: 1000 * 60 * 60,
  });

  // 🚀 REACT QUERY 2: B2B Financials & Pricing Rules
  const { data: b2bData } = useQuery({
    queryKey: ['b2b-financials', profile?.company_id],
    enabled: !!(profile?.company_id && profile?.role?.toLowerCase() === 'b2b'),
    queryFn: async () => {
      const [rulesRes, unpaidRes] = await Promise.all([
        supabase.from('pricing_rules').select('*').eq('company_id', profile.company_id),
        supabase.from('orders').select('total_amount').eq('company_id', profile.company_id).eq('payment_status', 'unpaid')
      ]);
      const limit = Number(profile?.companies?.credit_limit || 0);
      const outstanding = unpaidRes.data?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
      return { rules: rulesRes.data || [], financials: { limit, outstanding, available: limit - outstanding } };
    },
    staleTime: 1000 * 60 * 5,
  });

  const pricingRules = b2bData?.rules || [];

  // 🚀 REACT QUERY 3: Fetch ALL MATCHING Catalog Products
  const { data: catalogData, isPending: loading } = useQuery({
    queryKey: ['products', activeCategory, debouncedSearch],
    queryFn: async () => {
      let query = supabase.from('products').select('*, product_variants (*), inventory (*)');
      if (activeCategory !== 'All') query = query.eq('category', activeCategory);
      if (debouncedSearch) query = query.or(`name.ilike.%${debouncedSearch}%,base_sku.ilike.%${debouncedSearch}%`);
      
      query = query.order('name', { ascending: true });
      
      const { data, error } = await query;
      if (error) throw error;
      
      const fetchedVariants = (data || []).flatMap(p => p.product_variants || []);
      return { products: data || [], variants: fetchedVariants };
    },
    staleTime: 1000 * 60 * 5,
  });

  const products = catalogData?.products || [];
  const variants = catalogData?.variants || [];


  // --- PRICING CALCULATOR ---
  const getVariantPrice = (product, variant) => {
    if (!product) return { finalPrice: 0, hasRule: false };
    const baseRetail = Number(product.retail_base_price || 0);
    const variantRetail = (variant && Number(variant.price) > 0) ? Number(variant.price) : (baseRetail * (variant?.multiplier || 1));
    if (!profile?.company_id || pricingRules.length === 0) return { finalPrice: variantRetail, hasRule: false };
    let applicableRule = pricingRules.find(r => r.variant_id === variant?.id);
    if (!applicableRule) return { finalPrice: variantRetail, hasRule: false };
    let finalPrice = variantRetail;
    const ruleValue = Number(applicableRule.value);
    if (applicableRule.rule_type === 'percentage') finalPrice = variantRetail * (1 - (ruleValue / 100));
    else if (applicableRule.rule_type === 'fixed') finalPrice = ruleValue;
    return { finalPrice: finalPrice, hasRule: finalPrice < variantRetail };
  };

  // 🚀 GROUP ALL PRODUCTS INTO FAMILIES FIRST
  const allGroupedFamilies = useMemo(() => {
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

  // 🚀 PAGINATE THE FAMILIES LOCALLY
  const totalCount = allGroupedFamilies.length;
  const totalPages = Math.ceil(totalCount / pageSize);

  const displayedFamilies = useMemo(() => {
    const startIndex = page * pageSize;
    return allGroupedFamilies.slice(startIndex, startIndex + pageSize);
  }, [allGroupedFamilies, page, pageSize]);

  // Anti-Jump Scroll Lock
  useEffect(() => {
    if (viewingFamily) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [viewingFamily]);

  // MODAL HANDLERS (ORIGINAL)
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
      toast.success(`Added ${quantity}x ${variant.name} to cart.`);
    }, 600); 
  };

  // Scroll Spy Logic
  useEffect(() => {
    const observerOptions = { root: null, rootMargin: '-100px 0px -60% 0px', threshold: 0 };
    const observerCallback = (entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) setActiveSection(entry.target.id); });
    };
    const observer = new IntersectionObserver(observerCallback, observerOptions);
    const sections = ['home', 'catalog', 'brands', 'about'];
    sections.forEach((id) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    const handleScroll = () => { if (window.scrollY > 400) setShowBackToTop(true); else setShowBackToTop(false); };
    window.addEventListener('scroll', handleScroll);
    return () => { observer.disconnect(); window.removeEventListener('scroll', handleScroll); };
  }, [products]);

  const scrollToSection = (e, id) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      const y = element.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
    setIsMobileMenuOpen(false); 
  };

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 5) {
      for (let i = 0; i < totalPages; i++) pages.push(i);
    } else {
      if (page <= 2) pages.push(0, 1, 2, '...', totalPages - 1);
      else if (page >= totalPages - 3) pages.push(0, '...', totalPages - 3, totalPages - 2, totalPages - 1);
      else pages.push(0, '...', page - 1, page, page + 1, '...', totalPages - 1);
    }
    return pages;
  };

  const navLinks = [
    { id: 'home', label: 'Home' }, { id: 'catalog', label: 'Catalog' }, 
    { id: 'brands', label: 'Brands' }, { id: 'about', label: 'About Us' }
  ];

  const whyChooseItems = [
    { icon: <ShieldCheck size={24} className="sm:w-7 sm:h-7" />, colorClass: "bg-blue-50 text-blue-600 border-blue-100", title: "Uncompromising Product Quality", text: "Industry-standard equipment rigorously vetted for safety and peak performance." },
    { icon: <Package size={24} className="sm:w-7 sm:h-7" />, colorClass: "bg-emerald-50 text-emerald-600 border-emerald-100", title: "Reliable Supply, Always Available", text: "Consistent inventory levels to ensure you never run out of critical supplies." },
    { icon: <Users size={24} className="sm:w-7 sm:h-7" />, colorClass: "bg-indigo-50 text-indigo-600 border-indigo-100", title: "Trusted by Medical Professionals", text: "The preferred logistical partner for healthcare facilities across California." },
    { icon: <Truck size={24} className="sm:w-7 sm:h-7" />, colorClass: "bg-amber-50 text-amber-600 border-amber-100", title: "Efficient and Timely Delivery", text: "Fast, accurate shipping to keep your clinical operations running smoothly." }
  ];

  const brandItems = [
    { img: "/images/drylock-logo.png", name: "Drylock Technologies", text: "Drylock Technologies is a global innovator in the hygiene industry, dedicated to producing high-quality, sustainable absorbent products." },
    { img: "/images/dynarex-logo.png", name: "Dynarex", text: "Dynarex is a leading supplier of medical supplies and equipment worldwide. Known for its wide range of top-quality products." },
    { img: "/images/secure-logo.png", name: "Secure Personal Care", text: "Secure Personal Care offers a wide range of high-quality medical and personal care products designed to enhance comfort." }
  ];

  const valuePropItems = [
    { icon: <Truck size={28} />, title: "Dedicated CA Fleet", text: "Direct to your facility anywhere in California with our private, reliable drivers." },
    { icon: <ShieldCheck size={28} />, title: "Flexible Net Terms", text: "Custom credit limits and negotiated pricing for approved partner accounts." },
    { icon: <Clock size={28} />, title: "Real-Time Tracking", text: "Track your fleet deliveries instantly and manage patient orders from your dashboard." }
  ];

  // Active Modal Data
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col relative transition-all duration-300">
      
      {/* 🚀 RESTORED ORIGINAL CSS ANIMATIONS FOR MODAL */}
      <style>
        {`
          @keyframes modalOverlayFade { from { opacity: 0; } to { opacity: 1; } }
          @keyframes modalSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
          @keyframes modalZoomIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
          @keyframes modalOverlayFadeOut { from { opacity: 1; } to { opacity: 0; } }
          @keyframes modalSlideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
          @keyframes modalZoomOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.95); } }
          
          .modal-overlay-anim { animation: modalOverlayFade 0.3s ease-out forwards; }
          .modal-overlay-close-anim { animation: modalOverlayFadeOut 0.3s ease-in forwards; }
          .modal-content-anim { animation: modalSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
          .modal-content-close-anim { animation: modalSlideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

          @media (min-width: 640px) {
            .modal-content-anim { animation: modalZoomIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
            .modal-content-close-anim { animation: modalZoomOut 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
          }
        `}
      </style>

      {/* 1. STICKY NAVIGATION BAR */}
      <nav className="sticky top-0 z-40 w-full bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer shrink-0" onClick={(e) => scrollToSection(e, 'home')}>
            <img src="/images/tricore-logo2.png" alt="Tricore Medical Logo" className="h-9 sm:h-10 md:h-12 w-auto object-contain" />
          </div>
          <div className="hidden lg:flex items-center gap-8 font-bold text-sm">
            {navLinks.map((link) => {
              const isActive = activeSection === link.id;
              return (
                <a key={link.id} href={`#${link.id}`} onClick={(e) => scrollToSection(e, link.id)} className={`relative py-2 transition-colors duration-300 ${isActive ? 'text-blue-600' : 'text-slate-600 hover:text-blue-600'}`}>
                  {link.label}
                  <span className={`absolute bottom-0 left-0 h-[3px] bg-blue-600 rounded-t-full transition-all duration-300 ease-out ${isActive ? 'w-full opacity-100' : 'w-0 opacity-0'}`}></span>
                </a>
              );
            })}
          </div>
          <div className="flex items-center gap-4 sm:gap-6">
            
            {/* CART INDICATOR IN NAVBAR */}
            {session && (
              <div className="hidden sm:flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Cart ({cart.reduce((a, b) => a + b.quantity, 0)})</p>
                  <p className="text-sm font-black text-slate-900 leading-none mt-1">${cart.reduce((a, b) => a + b.line_total, 0).toFixed(2)}</p>
                </div>
                <button onClick={() => navigate('/checkout')} disabled={cart.length === 0} className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center hover:bg-blue-700 active:scale-95 disabled:opacity-50 transition-all">
                  <ShoppingCart size={16} />
                </button>
              </div>
            )}

            {!session ? (
              <Link to="/login">
                <Button className="font-bold rounded-xl h-10 px-4 sm:px-6 shadow-md"><User size={16} className="mr-2 hidden sm:block" /> Login</Button>
              </Link>
            ) : (
              <Link to="/dashboard">
                <Button className="font-bold rounded-xl h-10 px-4 sm:px-6 shadow-md"><LayoutDashboard size={16} className="mr-2 hidden sm:block" /> Dashboard</Button>
              </Link>
            )}
            <button className="lg:hidden relative w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-900 rounded-xl transition-colors active:scale-95 overflow-hidden" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
              <Menu className={`absolute transition-all duration-300 ease-out ${isMobileMenuOpen ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100'}`} size={24} />
              <X className={`absolute transition-all duration-300 ease-out ${isMobileMenuOpen ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0'}`} size={24} />
            </button>
          </div>
        </div>

        <div className={`lg:hidden absolute top-20 left-0 w-full bg-white shadow-2xl flex flex-col px-4 gap-2 z-50 overflow-hidden transition-all duration-300 ease-in-out ${isMobileMenuOpen ? 'max-h-[500px] py-4 border-b border-slate-200 opacity-100 visible' : 'max-h-0 py-0 border-transparent opacity-0 invisible pointer-events-none'}`}>
          {navLinks.map((link) => {
            const isActive = activeSection === link.id;
            return (
              <a key={link.id} href={`#${link.id}`} onClick={(e) => scrollToSection(e, link.id)} className={`px-5 py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-between ${isActive ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'}`}>
                {link.label}
                {isActive && <div className="w-2 h-2 rounded-full bg-blue-600"></div>}
              </a>
            );
          })}
          {session && (
            <button onClick={() => { setIsMobileMenuOpen(false); navigate('/checkout'); }} className="px-5 py-3.5 mt-2 rounded-xl font-bold text-sm transition-all flex items-center justify-between bg-slate-900 text-white">
              <span className="flex items-center gap-2"><ShoppingCart size={16}/> Checkout (${cart.reduce((a, b) => a + b.line_total, 0).toFixed(2)})</span>
              <div className="bg-white/20 px-2 py-0.5 rounded-md text-xs">{cart.reduce((a, b) => a + b.quantity, 0)} Items</div>
            </button>
          )}
        </div>
      </nav>

      {/* 2. HERO SECTION */}
      <section id="home" className="bg-white border-b border-slate-200 relative overflow-hidden scroll-mt-24">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="max-w-7xl mx-auto px-6 py-16 sm:py-24 md:py-28 lg:py-32 relative z-10 flex flex-col items-center text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-slate-900 mb-6 max-w-4xl leading-[1.1]">
            Tricore Medical Supply <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500 block mt-2 text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold pb-2">built on reliability, driven by quality.</span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-slate-500 mb-10 max-w-2xl leading-relaxed font-medium px-2">Supplying premium medical equipment throughout California. Browse our complete selection and discover more by logging in.</p>
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <Button size="lg" className="h-14 px-8 text-base rounded-xl bg-slate-900 hover:bg-slate-800 shadow-xl" onClick={(e) => scrollToSection(e, 'catalog')}>Explore Catalog <ArrowRight size={18} className="ml-2"/></Button>
            {!session && (<Link to="/login"><Button variant="outline" size="lg" className="w-full sm:w-auto h-14 px-8 text-base rounded-xl border-slate-200 text-slate-700">Create Account</Button></Link>)}
          </div>
        </div>
      </section>

      {/* 3. WHY CHOOSE US */}
      <section className="bg-slate-50 py-16 sm:py-20 md:py-28 border-b border-slate-200 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Why Choose Tricore?</h2>
            <div className="w-20 h-1.5 bg-blue-600 mx-auto mt-6 rounded-full"></div>
          </div>
          <MobileCarousel items={whyChooseItems} desktopGridClass="sm:grid-cols-2 lg:grid-cols-4" autoPlayInterval={3500} renderItem={(item) => (
            <Card className="p-6 sm:p-8 rounded-3xl border-slate-200 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group w-full text-left cursor-default shadow-sm">
              <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center mb-5 sm:mb-6 border group-hover:scale-110 transition-transform ${item.colorClass}`}>{item.icon}</div>
              <h3 className="font-bold text-lg sm:text-xl text-slate-900 mb-2 sm:mb-3 leading-tight">{item.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed font-medium">{item.text}</p>
            </Card>
          )} />
        </div>
      </section>

      {/* 4. CATALOG */}
      <section id="catalog" className="max-w-7xl mx-auto px-6 py-16 sm:py-20 w-full flex-grow flex flex-col scroll-mt-24 border-b border-slate-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 shrink-0">
          <div className="w-full md:w-auto">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Catalog</h2>
            <p className="text-slate-500 mt-1 font-medium">Browse our comprehensive medical catalog.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
            <div className="relative w-full sm:w-64 shrink-0" ref={dropdownRef}>
              <button type="button" onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="w-full flex justify-between items-center bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-bold py-3 pl-5 pr-4 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all text-left z-10 relative h-12">
                <span className="truncate pr-2">{activeCategory === 'All' ? 'All Categories' : activeCategory}</span>
                <ChevronDown className={`text-slate-400 shrink-0 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} size={18} />
              </button>
              <div className={`absolute z-50 w-full mt-2 bg-white border border-slate-100 rounded-xl shadow-xl overflow-hidden transition-all duration-200 origin-top ${isDropdownOpen ? 'opacity-100 translate-y-0 scale-100 visible pointer-events-auto' : 'opacity-0 -translate-y-2 scale-95 invisible pointer-events-none'}`}>
                <ul className="max-h-64 overflow-y-auto divide-y divide-slate-50 py-1">
                  {categories.map((category, idx) => (
                    <li key={idx}><button type="button" onClick={() => { setActiveCategory(category); setIsDropdownOpen(false); }} className={`w-full text-left px-5 py-3 text-sm font-bold transition-colors ${activeCategory === category ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>{category === 'All' ? 'All Categories' : category}</button></li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="relative w-full sm:w-72 shrink-0">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <Input 
                type="text" 
                placeholder="Search products..." 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                className="w-full pl-11 pr-4 py-3 h-12 rounded-xl text-sm font-medium shadow-sm" 
              />
            </div>
          </div>
        </div>

        {/* PRODUCT GRID USING PAGINATED FAMILIES */}
        <div className="flex-grow min-h-[600px] lg:min-h-[750px] relative">
          {loading ? (
            <div className="absolute inset-0 flex justify-center items-center"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
          ) : displayedFamilies.length === 0 ? (
            <div className="text-center py-24 bg-white rounded-3xl border border-slate-200 shadow-sm mx-2">
              <Package size={48} className="mx-auto text-slate-300 mb-4" strokeWidth={1.5} />
              <h3 className="text-xl font-bold text-slate-900 mb-2">No products found</h3>
              <p className="text-slate-500">Adjust your search or category filters to try again.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {displayedFamilies.map(([familyName, familyProducts]) => (
                <ProductFamilyCard 
                  key={familyName} 
                  familyName={familyName} 
                  familyProducts={familyProducts} 
                  globalVariants={variants} 
                  getVariantPrice={getVariantPrice} 
                  onClick={() => openProductModal(familyName, familyProducts)} 
                  session={session} 
                />
              ))}
            </div>
          )}
        </div>

        {!loading && totalCount > 0 && (
          <div className="mt-8 sm:mt-12 flex flex-col md:flex-row justify-between items-center gap-4 border-t border-slate-200 pt-6 shrink-0">
            <p className="text-xs sm:text-sm text-slate-500 font-medium text-center md:text-left mb-2 md:mb-0">Showing <span className="font-bold text-slate-900">{page * pageSize + 1}</span> to <span className="font-bold text-slate-900">{Math.min((page + 1) * pageSize, totalCount)}</span> of <span className="font-bold text-slate-900">{totalCount}</span> items</p>
            <div className="flex items-center gap-1 sm:gap-2 w-full md:w-auto justify-center">
              <Button variant="outline" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="rounded-xl shadow-sm"><ChevronLeft size={18} /> <span className="hidden sm:inline ml-1">Prev</span></Button>
              {getPageNumbers().map((p, index) => p === '...' ? (<span key={`dots-${index}`} className="px-1 sm:px-2 text-slate-400 font-bold">...</span>) : (<Button key={p} variant={page === p ? "default" : "outline"} onClick={() => setPage(p)} className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl p-0 shadow-sm ${page === p ? 'bg-blue-600 text-white hover:bg-blue-700' : ''}`}>{p + 1}</Button>))}
              <Button variant="outline" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1} className="rounded-xl shadow-sm"><span className="hidden sm:inline mr-1">Next</span> <ChevronRight size={18} /></Button>
            </div>
          </div>
        )}
      </section>

      {/* 5. BRANDS */}
      <section id="brands" className="bg-white py-16 sm:py-20 md:py-24 border-b border-slate-200 scroll-mt-24 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10 sm:mb-16 max-w-3xl mx-auto">
            <h2 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight mb-4">Brands We Carry</h2>
            <div className="w-20 h-1.5 bg-blue-600 mx-auto mt-2 mb-6 rounded-full"></div>
            <p className="text-base sm:text-lg text-slate-500 leading-relaxed font-medium px-2">Partnering with leading manufacturers to bring you reliable products.</p>
          </div>
          <MobileCarousel items={brandItems} desktopGridClass="sm:grid-cols-3" autoPlayInterval={4000} renderItem={(item) => (
            <div className="flex flex-col items-center text-center p-6 sm:p-8 rounded-3xl hover:bg-slate-50 transition-colors border border-slate-200 sm:border-transparent sm:hover:border-slate-100 shadow-sm sm:shadow-none group w-full h-full cursor-default">
              <div className="h-16 sm:h-20 md:h-24 w-full flex items-center justify-center mb-6"><img src={item.img} alt={item.name} className="max-h-full max-w-[160px] sm:max-w-[200px] object-contain group-hover:scale-105 transition-transform duration-500" /></div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-3">{item.name}</h3>
              <p className="text-sm text-slate-500 leading-relaxed font-medium">{item.text}</p>
            </div>
          )} />
        </div>
      </section>

      {/* 6. ABOUT US */}
      <section id="about" className="bg-white border-t border-slate-200 py-16 sm:py-24 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-16 items-center">
            <div>
              <Badge variant="secondary" className="bg-blue-50 text-blue-700 text-[10px] font-extrabold uppercase tracking-widest mb-4 hover:bg-blue-50 border-blue-100">About Tricore</Badge>
              <h2 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight mb-4 sm:mb-6 leading-tight">Committed to Healthcare Excellence.</h2>
              <p className="text-base sm:text-lg text-slate-500 leading-relaxed mb-6 font-medium">Outfitting healthcare facilities, medical professionals, and individual patients with top-tier supplies.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="flex sm:flex-col items-center sm:items-start gap-4 text-left"><div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100"><ShieldCheck size={24} /></div><div><h4 className="font-bold text-slate-900 text-base sm:text-lg">Certified Quality</h4></div></div>
                <div className="flex sm:flex-col items-center sm:items-start gap-4 text-left"><div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100"><Truck size={24} /></div><div><h4 className="font-bold text-slate-900 text-base sm:text-lg">Direct Delivery</h4></div></div>
              </div>
            </div>
            <div className="relative mt-4 lg:mt-0"><div className="absolute -inset-4 bg-slate-100 rounded-3xl transform rotate-3 hidden sm:block"></div><img src="https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=1000&q=80" alt="Tricore Medical Logistics" className="relative rounded-2xl shadow-xl object-cover w-full h-[300px] sm:h-[400px] lg:h-[450px] border border-slate-200"/></div>
          </div>
        </div>
      </section>

      {/* 7. VALUE PROPS */}
      <section className="bg-slate-50 border-t border-slate-200 py-16 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <MobileCarousel items={valuePropItems} desktopGridClass="sm:grid-cols-3 text-center" autoPlayInterval={4500} renderItem={(item) => (
            <div className="flex flex-col items-center text-center bg-white sm:bg-transparent p-6 sm:p-0 rounded-3xl border border-slate-200 sm:border-none shadow-sm sm:shadow-none w-full h-full cursor-default">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-5 border border-blue-100 text-blue-600">{item.icon}</div>
              <h3 className="font-bold text-slate-900 text-xl mb-2 tracking-tight">{item.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed max-w-xs">{item.text}</p>
            </div>
          )} />
        </div>
      </section>

      {/* 8. CTA */}
      <section className="bg-blue-600 relative overflow-hidden shrink-0 border-t border-blue-700">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff1a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff1a_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="max-w-7xl mx-auto px-6 py-12 sm:py-16 md:py-20 relative z-10 flex flex-col lg:flex-row items-center justify-between text-center lg:text-left gap-8 sm:gap-10">
          <div className="max-w-2xl"><h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight mb-3 sm:mb-4">Partner with a supply you can rely on.</h2><p className="text-blue-100 text-base sm:text-lg md:text-xl font-medium">Secure your medical supply with confidence.</p></div>
          <div className="shrink-0 w-full sm:w-auto"><a href="mailto:info@tricoremedicalsupply.com?subject=Wholesale%20Quote%20Request" className="flex w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 bg-white text-blue-600 font-extrabold rounded-xl hover:bg-slate-50 transition-all shadow-xl hover:shadow-2xl active:scale-95 items-center justify-center gap-2 text-base sm:text-lg border border-blue-50"><Mail size={20} strokeWidth={2.5} /> Request a Quote</a></div>
        </div>
      </section>

      {/* 9. FOOTER */}
      <footer className="bg-slate-900 text-slate-300 py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 sm:gap-12 mb-10 sm:mb-12">
            <div className="lg:col-span-2">
              <img src="/images/tricore-logo2.png" alt="Tricore Medical Logo" className="h-10 sm:h-12 w-auto object-contain mb-5 sm:mb-6 brightness-0 invert" />
              <p className="text-sm leading-relaxed max-w-md">Equipping California's healthcare facilities with reliable medical supplies.</p>
              <div className="mt-8 flex items-center gap-4 bg-white p-4 rounded-2xl w-fit shadow-md border border-slate-200 group"><img src="/images/accreditation.webp" alt="ACHC Accredited" className="h-12 sm:h-14 w-auto object-contain group-hover:scale-105 transition-transform" /><div className="text-xs text-slate-600 max-w-[200px] leading-snug"><span className="font-black text-slate-900 block mb-0.5 text-sm">ACHC Accredited</span>Upholding highest national standards.</div></div>
            </div>
            <div><h4 className="text-white font-bold text-lg mb-5 sm:mb-6">Contact Us</h4><ul className="space-y-3 sm:space-y-4 text-sm"><li className="flex items-start gap-3"><MapPin size={18} className="text-blue-500 shrink-0 mt-0.5" /><span>2169 Harbor St.<br />Pittsburg, CA 94565</span></li><li className="flex items-center gap-3"><Mail size={18} className="text-blue-500 shrink-0" /><a href="mailto:info@tricoremedicalsupply.com" className="hover:text-white transition-colors">info@tricoremedicalsupply.com</a></li><li className="flex items-center gap-3"><Phone size={18} className="text-blue-500 shrink-0" /><a href="tel:5106912694" className="hover:text-white transition-colors">510-691-2694</a></li></ul></div>
            <div><h4 className="text-white font-bold text-lg mb-5 sm:mb-6">Quick Links</h4><ul className="space-y-3 text-sm flex flex-col items-start"><li><Link to="/login" className="hover:text-white transition-colors">Login</Link></li><li><a href="#about" onClick={(e) => scrollToSection(e, 'about')} className="hover:text-white transition-colors cursor-pointer">About Us</a></li><li><a href="#catalog" onClick={(e) => scrollToSection(e, 'catalog')} className="hover:text-white transition-colors cursor-pointer">Catalog</a></li><li><a href="#brands" onClick={(e) => scrollToSection(e, 'brands')} className="hover:text-white transition-colors cursor-pointer">Our Brands</a></li></ul></div>
          </div>
          <div className="pt-6 sm:pt-8 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs sm:text-sm font-medium text-center sm:text-left"><p>© {new Date().getFullYear()} Tricore Medical Supply. All rights reserved.</p></div>
        </div>
      </footer>

      <button onClick={scrollToTop} className={`fixed bottom-6 right-6 sm:bottom-8 sm:right-8 p-3 sm:p-4 bg-slate-900 text-white rounded-full shadow-2xl hover:bg-blue-600 hover:-translate-y-1 transition-all duration-300 z-50 flex items-center justify-center group ${showBackToTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}><ArrowUp size={24} className="group-hover:animate-bounce" /></button>

      {/* 🚀 RESTORED ORIGINAL CUSTOM HTML PRODUCT DETAILS MODAL */}
      {viewingFamily && activeProduct && (
        <div className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm sm:p-4 pb-0 sm:pb-4 ${isClosing ? 'modal-overlay-close-anim' : 'modal-overlay-anim'}`} onClick={handleCloseModal}>
          <div className={`bg-white w-full max-w-4xl h-[90dvh] sm:h-auto sm:max-h-[85dvh] flex flex-col sm:flex-row rounded-t-[2rem] sm:rounded-3xl shadow-2xl overflow-hidden relative border-t sm:border border-slate-100 ${isClosing ? 'modal-content-close-anim' : 'modal-content-anim'}`} onClick={e => e.stopPropagation()}>
            <button onClick={handleCloseModal} className="absolute top-3 right-3 sm:top-4 sm:right-4 z-[60] w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-white/90 backdrop-blur border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-full shadow-md transition-all">
              <X size={18} />
            </button>
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
                  {session ? (
                    <>
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 sm:mb-1.5">Unit Price</p>
                          <p className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">${displayPrice.toFixed(2)}</p>
                        </div>
                        <div className={`flex items-center p-0.5 sm:p-1 rounded-xl border shadow-sm ${modalPreventPurchase ? 'bg-slate-50 border-slate-100 opacity-50' : 'bg-white border-slate-200'}`}>
                          <button type="button" disabled={modalPreventPurchase} onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-slate-500 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors"><Minus size={14} strokeWidth={2.5} /></button>
                          <input type="number" disabled={modalPreventPurchase} value={quantity} onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))} className="w-10 sm:w-12 h-8 sm:h-10 bg-transparent text-center text-sm sm:text-base font-bold text-slate-900 outline-none focus:ring-0" />
                          <button type="button" disabled={modalPreventPurchase} onClick={() => setQuantity(quantity + 1)} className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-slate-500 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors"><Plus size={14} strokeWidth={2.5} /></button>
                        </div>
                      </div>
                      <button onClick={handleAddToCart} disabled={!selectedVariantId || isAddingToCart || modalPreventPurchase} className={`w-full flex items-center justify-center gap-2 py-3.5 sm:py-4 text-sm font-bold rounded-xl transition-all shadow-md ${modalPreventPurchase ? 'bg-slate-200 text-slate-400 shadow-none cursor-not-allowed' : isAddingToCart ? 'bg-emerald-500 text-white scale-[0.98] shadow-emerald-500/30' : 'bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98]'}`}>
                        {modalPreventPurchase ? (<><AlertTriangle size={16} /> Out of Stock</>) : isAddingToCart ? (<><CheckCircle2 size={18} className="animate-bounce" /> Added to Cart</>) : (<><ShoppingCart size={16} /> Add to Cart — ${(displayPrice * quantity).toFixed(2)}</>)}
                      </button>
                      {modalIsOutOfStock && modalContinueSelling && <p className="text-center text-[10px] sm:text-xs font-bold text-amber-600 mt-2">Item is on backorder. It will ship when available.</p>}
                    </>
                  ) : (
                    <div className="w-full text-center bg-slate-50 p-6 sm:p-8 rounded-2xl border border-slate-200 relative overflow-hidden mt-4">
                      <Lock size={28} className="mx-auto text-slate-300 mb-3" />
                      <p className="text-base font-bold text-slate-900 mb-1">Pricing is Hidden</p>
                      <p className="text-sm text-slate-500 mb-6 font-medium max-w-[250px] mx-auto">Please log in to view wholesale pricing and purchase products.</p>
                      <Link to="/login" className="inline-flex w-full sm:w-auto px-8 py-3.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-all active:scale-95 justify-center shadow-md">
                        Log In / Register
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}