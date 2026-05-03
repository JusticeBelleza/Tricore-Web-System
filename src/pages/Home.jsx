import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { 
  Truck, ShieldCheck, Clock, ArrowRight, Package, Lock, 
  ShoppingCart, Search, ChevronLeft, ChevronRight, 
  User, LayoutDashboard, ChevronDown, MapPin, Mail, Phone, Users,
  Menu, X, ArrowUp, PackageOpen, Plus, Minus, CheckCircle2, AlertTriangle, HeadphonesIcon, Building2, Sparkles
} from 'lucide-react';

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const banners = [
  '/images/banner-1.png',
  '/images/banner-2.webp',
  '/images/banner-3.webp',
  '/images/banner-4.webp'
];

const placeholders = [
  { id: 1, title: 'Front of the Warehouse', color: 'from-blue-600 to-cyan-500', icon: <Building2 size={56} className="text-white"/> },
  { id: 2, title: 'Operations', color: 'from-indigo-600 to-purple-500', icon: <HeadphonesIcon size={56} className="text-white"/> },
  { id: 3, title: 'Products', color: 'from-emerald-600 to-teal-500', icon: <Package size={56} className="text-white"/> },
  { id: 4, title: 'Shelves', color: 'from-slate-700 to-slate-500', icon: <LayoutDashboard size={56} className="text-white"/> }
];

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
  const inventoryData = activeProduct?.inventory;

  if (Array.isArray(inventoryData) && inventoryData.length > 0) {
    stockAmount = inventoryData.reduce((sum, item) => sum + (parseInt(item.base_units_on_hand) || parseInt(item.quantity) || parseInt(item.stock) || 0), 0);
  } else if (inventoryData && !Array.isArray(inventoryData)) {
    stockAmount = parseInt(inventoryData.base_units_on_hand) || parseInt(inventoryData.quantity) || parseInt(inventoryData.stock) || 0;
  } else {
    stockAmount = parseInt(activeVariant?.base_units_on_hand) || parseInt(activeProduct?.base_units_on_hand) || parseInt(activeVariant?.quantity) || parseInt(activeProduct?.quantity) || 0;
  }

  const continueSelling = activeProduct?.continue_selling === true || activeProduct?.continue_selling === 'true' || activeProduct?.continue_selling === 'TRUE';
  const isOutOfStock = stockAmount <= 0;
  const preventPurchase = isOutOfStock && !continueSelling;

  return (
    <Card 
      onClick={onClick}
      // 🚀 UI FIX: Added w-full and h-full to the base card so it expands properly inside sliders and grids
      className={`group cursor-pointer hover:shadow-xl hover:-translate-y-1 active:scale-[0.98] transition-all duration-200 overflow-hidden flex flex-col w-full h-full ${preventPurchase ? 'opacity-80' : ''}`}
    >
      <div className="w-full h-40 sm:h-48 bg-slate-50 relative p-4 border-b border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
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

      <CardFooter className="p-4 sm:p-5 pt-4 mt-auto border-t border-slate-100 flex items-center justify-between shrink-0">
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
  
  const [page, setPage] = useState(0);
  const [activeSection, setActiveSection] = useState('home');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  
  const [cart, setCart] = useState([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const cartKey = profile?.company_id ? `tricore_cart_agency_${profile.company_id}` : `tricore_cart_user_${profile?.id}`;
  
  const [viewingFamily, setViewingFamily] = useState(null); 
  const [isClosing, setIsClosing] = useState(false); 
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);

  const [currentHeroSlide, setCurrentHeroSlide] = useState(0);
  const [currentAboutSlide, setCurrentAboutSlide] = useState(0);

  useEffect(() => {
    const heroTimer = setInterval(() => {
      setCurrentHeroSlide((prev) => (prev === banners.length - 1 ? 0 : prev + 1));
    }, 4000); 
    const aboutTimer = setInterval(() => {
      setCurrentAboutSlide((prev) => (prev === placeholders.length - 1 ? 0 : prev + 1));
    }, 4000);
    return () => { clearInterval(heroTimer); clearInterval(aboutTimer); }
  }, []);

  const nextHeroSlide = () => setCurrentHeroSlide((prev) => (prev === banners.length - 1 ? 0 : prev + 1));
  const prevHeroSlide = () => setCurrentHeroSlide((prev) => (prev === 0 ? banners.length - 1 : prev - 1));

  const nextAboutSlide = () => setCurrentAboutSlide((prev) => (prev === placeholders.length - 1 ? 0 : prev + 1));
  const prevAboutSlide = () => setCurrentAboutSlide((prev) => (prev === 0 ? placeholders.length - 1 : prev - 1));

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

  const { data: categories = ['All'] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('category').neq('category', null);
      if (data) return ['All', ...new Set(data.map(d => d.category).filter(Boolean))].sort();
      return ['All'];
    },
    staleTime: 1000 * 60 * 60,
  });

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

  // 🚀 FETCH FEATURED PRODUCTS QUERY
  const { data: featuredData } = useQuery({
    queryKey: ['featured-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, product_variants (*), inventory (*)')
        .or('name.ilike.%UltraShield%,name.ilike.%SoftCore%,category.ilike.%Incontinence%')
        .limit(30);
      if (error) throw error;
      const fetchedVariants = (data || []).flatMap(p => p.product_variants || []);
      return { products: data || [], variants: fetchedVariants };
    },
    staleTime: 1000 * 60 * 60,
  });

  // Map featured products to families
  const featuredFamilies = useMemo(() => {
    const prods = featuredData?.products || [];
    const groups = {};
    prods.forEach(p => {
      const familyName = p.name.split(' - ')[0].trim();
      if (!groups[familyName]) groups[familyName] = [];
      groups[familyName].push(p);
    });
    
    // Ensure UltraShield and SoftCore appear first
    const entries = Object.entries(groups);
    entries.sort((a, b) => {
        const aName = a[0].toLowerCase();
        const bName = b[0].toLowerCase();
        const aIsPriority = aName.includes('ultrashield') || aName.includes('softcore') ? 1 : 0;
        const bIsPriority = bName.includes('ultrashield') || bName.includes('softcore') ? 1 : 0;
        return bIsPriority - aIsPriority;
    });
    return entries.slice(0, 4); // Keep it to 1 clean row of 4
  }, [featuredData]);


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

  const totalCount = allGroupedFamilies.length;
  const totalPages = Math.ceil(totalCount / pageSize);

  const displayedFamilies = useMemo(() => {
    const startIndex = page * pageSize;
    return allGroupedFamilies.slice(startIndex, startIndex + pageSize);
  }, [allGroupedFamilies, page, pageSize]);

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

  // 🚀 UI FIX: Now dynamically accepts sourceVariants so it works for both the Catalog and the Featured grid!
  const openProductModal = (familyName, familyProducts, sourceVariants = variants) => {
    const defaultProduct = familyProducts[0];
    const defaultVariants = sourceVariants.filter(v => v.product_id === defaultProduct.id);
    setViewingFamily({ familyName, familyProducts, sourceVariants });
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
    const newVariants = (viewingFamily?.sourceVariants || variants).filter(v => v.product_id === newProductId);
    setSelectedVariantId(newVariants[0]?.id || '');
    setQuantity(1);
  };

  const handleAddToCart = () => {
    if (!selectedVariantId || quantity < 1) return;
    const currentVariants = viewingFamily?.sourceVariants || variants;
    
    // We look up the product within the passed-in family logic
    const product = viewingFamily.familyProducts.find(p => p.id === selectedProductId);
    const variant = currentVariants.find(v => v.id === selectedVariantId);
    
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
    { icon: <Clock size={28} />, title: "Real-Time Tracking", text: "Track your fleet deliveries instantly and manage patient orders from your dashboard." },
    { icon: <HeadphonesIcon size={28} />, title: "Dedicated Support", text: "Receive personalized assistance from our expert team for all your facility's needs." }
  ];

  const activeProduct = viewingFamily ? viewingFamily.familyProducts.find(p => p.id === selectedProductId) : null;
  const activeVariants = activeProduct ? (viewingFamily.sourceVariants || variants).filter(v => v.product_id === activeProduct.id) : [];
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
    <div className="min-h-screen bg-white flex flex-col relative transition-all duration-300">
      
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
      {/* 🚀 UI Z-INDEX FIX: Ensuring this stays above EVERYTHING (z-50) */}
      <nav className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer shrink-0" onClick={(e) => scrollToSection(e, 'home')}>
            <img src="/images/tricore-logo2.png" alt="Tricore Medical Logo" className="h-10 sm:h-12 md:h-14 lg:h-16 w-auto object-contain drop-shadow-sm" />
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

            <a 
              href="mailto:info@tricoremedicalsupply.com?subject=Wholesale Quote Request" 
              className="hidden sm:flex items-center justify-center px-4 py-2.5 text-sm border-2 border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 active:scale-95 transition-all"
            >
              Request a Quote
            </a>

            {!session ? (
              <Link to="/login">
                <Button className="font-bold rounded-xl h-10 px-4 sm:px-6 shadow-md bg-blue-600 hover:bg-blue-700 text-white"><User size={16} className="mr-2 hidden sm:block" /> Login</Button>
              </Link>
            ) : (
              <Link to="/dashboard">
                <Button className="font-bold rounded-xl h-10 px-4 sm:px-6 shadow-md bg-blue-600 hover:bg-blue-700 text-white"><LayoutDashboard size={16} className="mr-2 hidden sm:block" /> Dashboard</Button>
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

      {/* 2. SPLIT LAYOUT HERO SECTION WITH BANNERS */}
      <section id="home" className="w-full bg-[#0B2447] scroll-mt-24 flex flex-col lg:flex-row lg:h-[550px] xl:h-[650px] overflow-hidden">
        
        {/* IMAGE BANNERS SIDE */}
        <div className="w-full lg:w-[70%] relative h-[300px] sm:h-[450px] lg:h-full bg-[#0B2447] lg:p-6 xl:p-8 lg:pr-2 order-1 lg:order-1">
          <div className="relative w-full h-full rounded-b-3xl lg:rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-[#061833]">
            {banners.map((src, index) => (
              <div 
                key={index}
                className={`absolute inset-0 w-full h-full transition-opacity duration-1000 ease-in-out ${index === currentHeroSlide ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
              >
                <img 
                  src={src} 
                  alt={`Tricore Medical Supply Banner ${index + 1}`} 
                  className="absolute inset-0 w-full h-full object-contain object-center"
                />
              </div>
            ))}

            <div className="absolute bottom-6 right-6 z-30 hidden sm:flex gap-2">
              <button onClick={prevHeroSlide} className="p-2.5 rounded-full bg-slate-900/60 hover:bg-slate-900/80 text-white backdrop-blur-md transition-colors border border-white/20"><ChevronLeft size={18} /></button>
              <button onClick={nextHeroSlide} className="p-2.5 rounded-full bg-slate-900/60 hover:bg-slate-900/80 text-white backdrop-blur-md transition-colors border border-white/20"><ChevronRight size={18} /></button>
            </div>
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex gap-2">
              {banners.map((_, idx) => (
                <button 
                  key={idx} 
                  onClick={() => setCurrentHeroSlide(idx)}
                  className={`h-2.5 rounded-full transition-all ${idx === currentHeroSlide ? 'bg-blue-500 w-8 shadow-sm' : 'bg-white/50 w-2.5 hover:bg-white shadow-sm'}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* TEXT SIDE */}
        <div className="w-full lg:w-[30%] flex flex-col justify-center px-6 py-12 sm:py-16 lg:px-8 xl:px-12 z-20 bg-[#0B2447] order-2 lg:order-2">
          <div className="max-w-md mx-auto w-full animate-in slide-in-from-bottom-8 fade-in duration-700 text-center lg:text-left">
            <h1 className="text-4xl sm:text-5xl lg:text-[42px] xl:text-[50px] font-black tracking-tight text-white mb-4 sm:mb-6 leading-[1.05]">
              Tricore Medical Supply <br className="hidden sm:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-cyan-200 block mt-2 text-3xl sm:text-4xl lg:text-[32px] xl:text-[40px] font-extrabold pb-2">built on reliability, driven by quality.</span>
            </h1>
            <p className="text-sm sm:text-base text-blue-100/90 mb-8 sm:mb-10 leading-relaxed font-medium">
              Supplying premium medical equipment throughout California. Browse our complete selection and discover more by logging in.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto justify-center lg:justify-start">
              <Button size="lg" className="w-full sm:w-auto h-12 sm:h-14 px-6 text-sm sm:text-base rounded-xl bg-blue-500 hover:bg-blue-400 text-white shadow-xl shadow-blue-900/20 border-0" onClick={(e) => scrollToSection(e, 'catalog')}>
                Explore Catalog <ArrowRight size={18} className="ml-2"/>
              </Button>
              {!session && (
                <Link to="/login" className="w-full sm:w-auto">
                  <Button variant="outline" size="lg" className="w-full h-12 sm:h-14 px-6 text-sm sm:text-base rounded-xl border-blue-700 bg-blue-800 text-white hover:bg-blue-700 hover:text-white transition-colors">
                    Create Account
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>

      </section>

      {/* 3. WHY CHOOSE US */}
      <section className="bg-slate-50 py-16 sm:py-20 md:py-28 border-b border-slate-200 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Why Choose Tricore?</h2>
            <div className="w-20 h-1.5 bg-blue-600 mx-auto mt-6 rounded-full"></div>
          </div>
          <MobileCarousel items={whyChooseItems} desktopGridClass="sm:grid-cols-2 lg:grid-cols-4" autoPlayInterval={3500} renderItem={(item) => (
            <Card className="p-6 sm:p-8 rounded-3xl border-slate-200 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group w-full text-left cursor-default shadow-sm bg-white">
              <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center mb-5 sm:mb-6 border group-hover:scale-110 transition-transform ${item.colorClass}`}>{item.icon}</div>
              <h3 className="font-bold text-lg sm:text-xl text-slate-900 mb-2 sm:mb-3 leading-tight">{item.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed font-medium">{item.text}</p>
            </Card>
          )} />
        </div>
      </section>

      {/* 🚀 NEW SECTION: 3.5 FEATURED PRODUCTS (NOW A MOBILE SLIDER) */}
      {featuredFamilies.length > 0 && (
        <section className="bg-white py-16 sm:py-20 border-b border-slate-200 relative z-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-col md:flex-row justify-between items-end gap-6 mb-10">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="secondary" className="bg-orange-50 text-orange-600 border-orange-200 uppercase tracking-widest text-[10px] font-black flex items-center gap-1.5 shadow-sm">
                    <Sparkles size={12} /> Featured Products
                  </Badge>
                </div>
                <h2 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Premium Care Selections</h2>
                <p className="text-slate-500 mt-2 font-medium">Top-rated clinical supplies requested most by healthcare professionals.</p>
              </div>
              <Button variant="outline" className="hidden md:flex bg-white hover:bg-slate-50 border-slate-200 rounded-xl font-bold shadow-sm" onClick={(e) => scrollToSection(e, 'catalog')}>
                View Full Catalog <ArrowRight size={16} className="ml-2" />
              </Button>
            </div>
            
            {/* 🚀 Wrapped the Featured Products loop inside the MobileCarousel component */}
            <MobileCarousel 
              items={featuredFamilies} 
              desktopGridClass="sm:grid-cols-2 lg:grid-cols-4" 
              autoPlayInterval={5000} 
              renderItem={(item) => {
                const [familyName, familyProducts] = item;
                return (
                  <ProductFamilyCard 
                    key={`featured-${familyName}`} 
                    familyName={familyName} 
                    familyProducts={familyProducts} 
                    globalVariants={featuredData?.variants || []} 
                    getVariantPrice={getVariantPrice} 
                    onClick={() => openProductModal(familyName, familyProducts, featuredData?.variants || [])} 
                    session={session} 
                  />
                );
              }} 
            />

            <Button variant="outline" className="w-full mt-6 md:hidden bg-white hover:bg-slate-50 border-slate-200 rounded-xl font-bold shadow-sm" onClick={(e) => scrollToSection(e, 'catalog')}>
              View Full Catalog <ArrowRight size={16} className="ml-2" />
            </Button>
          </div>
        </section>
      )}

      {/* 4. CATALOG */}
      <section id="catalog" className="bg-slate-50/50 py-16 sm:py-20 w-full flex-grow flex flex-col scroll-mt-24 border-b border-slate-200 relative">
        <div className="max-w-7xl mx-auto px-6 w-full flex-grow flex flex-col">
          
          {/* 🚀 UI Z-INDEX FIX: Header wrapper is z-40 so the dropdown covers the z-10 grid, but safely tucks under the z-50 nav bar! */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 shrink-0 relative z-40">
            <div className="w-full md:w-auto">
              <h2 className="text-3xl font-black text-slate-900 tracking-tight bg-slate-50/50 inline-block pr-4">Catalog</h2>
              <p className="text-slate-500 mt-1 font-medium bg-slate-50/80 inline-block pr-4">Browse our comprehensive medical catalog.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
              <div className="relative w-full sm:w-64 shrink-0" ref={dropdownRef}>
                <button type="button" onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="w-full flex justify-between items-center bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-bold py-3 pl-5 pr-4 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all text-left z-10 relative h-12">
                  <span className="truncate pr-2">{activeCategory === 'All' ? 'All Categories' : activeCategory}</span>
                  <ChevronDown className={`text-slate-400 shrink-0 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} size={18} />
                </button>
                <div className={`absolute z-50 w-full mt-2 bg-white border border-slate-100 rounded-xl shadow-2xl overflow-hidden transition-all duration-200 origin-top ${isDropdownOpen ? 'opacity-100 translate-y-0 scale-100 visible pointer-events-auto' : 'opacity-0 -translate-y-2 scale-95 invisible pointer-events-none'}`}>
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
                  className="w-full pl-11 pr-4 py-3 h-12 bg-white rounded-xl text-sm font-medium shadow-sm" 
                />
              </div>
            </div>
          </div>

          {/* 🚀 UI Z-INDEX FIX: Grid is z-10, lower than the z-40 dropdown parent */}
          <div className="flex-grow min-h-[600px] lg:min-h-[750px] relative z-10">
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
                    onClick={() => openProductModal(familyName, familyProducts, variants)} 
                    session={session} 
                  />
                ))}
              </div>
            )}
          </div>

          {!loading && totalCount > 0 && (
            <div className="mt-8 sm:mt-12 flex flex-col md:flex-row justify-between items-center gap-4 border-t border-slate-200 pt-6 shrink-0 relative z-10">
              <p className="text-xs sm:text-sm text-slate-500 font-medium text-center md:text-left mb-2 md:mb-0">Showing <span className="font-bold text-slate-900">{page * pageSize + 1}</span> to <span className="font-bold text-slate-900">{Math.min((page + 1) * pageSize, totalCount)}</span> of <span className="font-bold text-slate-900">{totalCount}</span> items</p>
              <div className="flex items-center gap-1 sm:gap-2 w-full md:w-auto justify-center">
                <Button variant="outline" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="rounded-xl shadow-sm bg-white"><ChevronLeft size={18} /> <span className="hidden sm:inline ml-1">Prev</span></Button>
                {getPageNumbers().map((p, index) => p === '...' ? (<span key={`dots-${index}`} className="px-1 sm:px-2 text-slate-400 font-bold">...</span>) : (<Button key={p} variant={page === p ? "default" : "outline"} onClick={() => setPage(p)} className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl p-0 shadow-sm ${page === p ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-white'}`}>{p + 1}</Button>))}
                <Button variant="outline" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1} className="rounded-xl shadow-sm bg-white"><span className="hidden sm:inline mr-1">Next</span> <ChevronRight size={18} /></Button>
              </div>
            </div>
          )}

        </div>
      </section>

      {/* 5. BRANDS */}
      <section id="brands" className="bg-slate-50 py-16 sm:py-20 md:py-24 border-b border-slate-200 scroll-mt-24 overflow-hidden relative">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-10 sm:mb-16 max-w-3xl mx-auto">
            <h2 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight mb-4">Brands We Carry</h2>
            <div className="w-20 h-1.5 bg-blue-600 mx-auto mt-2 mb-6 rounded-full"></div>
            <p className="text-base sm:text-lg text-slate-500 leading-relaxed font-medium px-2">Partnering with leading manufacturers to bring you reliable products.</p>
          </div>
          <MobileCarousel items={brandItems} desktopGridClass="sm:grid-cols-3" autoPlayInterval={4000} renderItem={(item) => (
            <div className="flex flex-col items-center text-center p-6 sm:p-8 rounded-3xl hover:bg-slate-100 transition-colors border border-slate-200 sm:border-transparent sm:hover:border-slate-200 shadow-sm sm:shadow-none group w-full h-full cursor-default bg-white sm:bg-transparent">
              <div className="h-16 sm:h-20 md:h-24 w-full flex items-center justify-center mb-6"><img src={item.img} alt={item.name} className="max-h-full max-w-[160px] sm:max-w-[200px] object-contain group-hover:scale-105 transition-transform duration-500" /></div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-3">{item.name}</h3>
              <p className="text-sm text-slate-500 leading-relaxed font-medium">{item.text}</p>
            </div>
          )} />
        </div>
      </section>

      {/* 6. ABOUT US */}
      <section id="about" className="bg-white border-t border-slate-200 py-16 sm:py-24 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-16 items-center">
            <div className="lg:pr-8 bg-white/80 p-4 sm:p-6 rounded-3xl backdrop-blur-sm shadow-sm border border-slate-100/50">
              <Badge variant="secondary" className="bg-blue-50 text-blue-700 text-[10px] font-extrabold uppercase tracking-widest mb-4 hover:bg-blue-50 border-blue-100">About Tricore</Badge>
              <h2 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight mb-4 sm:mb-6 leading-tight">Committed to Healthcare Excellence.</h2>
              <p className="text-base sm:text-lg text-slate-600 leading-relaxed mb-6 font-medium">
                At TriCore Medical Supply, we pride ourselves on offering a wide range of high-quality medical products to meet your needs. Our curated selection includes items from top brands known for their reliability and effectiveness. We understand that when it comes to health, only the best will do. That’s why we meticulously choose each product to ensure it meets our high standards.
              </p>
              <p className="text-base sm:text-lg text-slate-600 leading-relaxed mb-8 font-medium">
                <strong className="text-slate-900">More than just a distributor, we are a dedicated partner in your care journey.</strong> Based in California, our mission is to streamline your supply chain so you can focus entirely on what matters most—your patients. From our private delivery fleet to our exceptional customer support, we are committed to delivering not just supplies, but absolute peace of mind directly to your door.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4">
                <div className="flex flex-col sm:items-start gap-3 text-left p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100"><ShieldCheck size={24} /></div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-base">Certified Quality</h4>
                    <p className="text-sm text-slate-500 mt-1 font-medium leading-relaxed">All products meet stringent safety and clinical standards before they reach your facility.</p>
                  </div>
                </div>
                <div className="flex flex-col sm:items-start gap-3 text-left p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100"><Truck size={24} /></div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-base">Direct Delivery</h4>
                    <p className="text-sm text-slate-500 mt-1 font-medium leading-relaxed">Our dedicated California fleet ensures fast, secure, and fully trackable shipments.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 3D Stack Card Slider */}
            {/* 🚀 UI FIX: Increased container height to allow for bigger cards */}
            <div className="relative mt-8 lg:mt-0 h-[320px] sm:h-[450px] lg:h-[500px] w-full flex items-center justify-center overflow-hidden rounded-3xl bg-slate-100 border border-slate-200 shadow-inner">
              
              {/* 🚀 UI FIX: Expanded the max-width and height of the actual cards inside the slider */}
              <div className="relative w-[90%] max-w-[360px] sm:max-w-[450px] lg:max-w-[480px] h-[240px] sm:h-[320px] lg:h-[360px] z-20 perspective-[1000px]">
                {placeholders.map((item, index) => {
                  const diff = (index - currentAboutSlide + placeholders.length) % placeholders.length;
                  
                  let cardClasses = "";
                  if (diff === 0) cardClasses = "translate-y-0 scale-100 opacity-100 z-30 shadow-2xl";
                  else if (diff === 1) cardClasses = "translate-y-6 sm:translate-y-8 scale-[0.92] opacity-80 z-20 shadow-xl";
                  else if (diff === 2) cardClasses = "translate-y-12 sm:translate-y-16 scale-[0.84] opacity-50 z-10 shadow-md";
                  else cardClasses = "translate-y-16 sm:translate-y-20 scale-[0.76] opacity-0 z-0";

                  return (
                    <div 
                      key={item.id}
                      className={`absolute inset-0 w-full h-full rounded-3xl transition-all duration-700 ease-in-out transform origin-top flex flex-col items-center justify-center text-center p-6 sm:p-8 border border-white/20 ${cardClasses} bg-gradient-to-br ${item.color}`}
                    >
                      {/* 🚀 UI FIX: Enlarged the background circle so the size-56 icons breathe */}
                      <div className="w-20 h-20 sm:w-24 sm:h-24 bg-white/20 rounded-full flex items-center justify-center mb-6 backdrop-blur-sm border border-white/30 shadow-inner">
                        {item.icon}
                      </div>
                      {/* 🚀 UI FIX: Increased title text size to match the bigger icons */}
                      <h3 className="text-2xl sm:text-3xl font-black text-white drop-shadow-md tracking-tight leading-tight">
                        {item.title}
                      </h3>
                    </div>
                  );
                })}
              </div>
              
              <div className="absolute bottom-4 right-4 z-30 hidden sm:flex gap-2">
                <button onClick={prevAboutSlide} className="p-2.5 rounded-full bg-white/50 hover:bg-white/80 text-slate-800 backdrop-blur-md transition-colors shadow-sm"><ChevronLeft size={20} /></button>
                <button onClick={nextAboutSlide} className="p-2.5 rounded-full bg-white/50 hover:bg-white/80 text-slate-800 backdrop-blur-md transition-colors shadow-sm"><ChevronRight size={20} /></button>
              </div>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex gap-2">
                {placeholders.map((_, idx) => (
                  <button 
                    key={idx} 
                    onClick={() => setCurrentAboutSlide(idx)}
                    className={`h-2.5 rounded-full transition-all ${idx === currentAboutSlide ? 'bg-blue-600 w-8 shadow-sm' : 'bg-slate-300 hover:bg-slate-400 w-2.5 shadow-sm'}`}
                  />
                ))}
              </div>
            </div>
            
          </div>
        </div>
      </section>

      {/* 7. VALUE PROPS */}
      <section className="bg-slate-50 border-t border-slate-200 py-16 overflow-hidden relative">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <MobileCarousel items={valuePropItems} desktopGridClass="sm:grid-cols-3 text-center" autoPlayInterval={4500} renderItem={(item) => (
            <div className="flex flex-col items-center text-center bg-white p-6 rounded-3xl border border-slate-200 shadow-sm w-full h-full cursor-default">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-5 border border-blue-100 text-blue-600">{item.icon}</div>
              <h3 className="font-bold text-slate-900 text-xl mb-2 tracking-tight">{item.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed max-w-xs">{item.text}</p>
            </div>
          )} />
        </div>
      </section>

      {/* 9. CLINICAL MEDICAL THEME FOOTER */}
      <footer className="bg-[#0f172a] text-slate-300 mt-auto border-t-4 border-blue-600">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12 sm:py-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 sm:gap-12 lg:gap-8">
            
            <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
              <Link to="/" className="block mb-6 sm:mb-8">
                <img src="/images/tricore-logo2.png" alt="Tricore Medical Logo" className="h-12 sm:h-17 w-auto object-contain" />
              </Link>
              <div className="flex items-center gap-3 sm:gap-4 group">
                <img src="/images/accreditation.webp" alt="ACHC Accredited" className="h-14 sm:h-16 w-auto object-contain drop-shadow-md group-hover:scale-105 transition-transform duration-300 shrink-0" />
                <div className="text-[11px] sm:text-xs text-slate-400 leading-relaxed border-l border-slate-700 pl-3 sm:pl-4 py-1 text-left">
                  <span className="font-bold text-white block text-[13px] sm:text-sm tracking-wide mb-0.5">ACHC Accredited</span>
                  Upholding highest<br className="hidden sm:block"/>national standards.
                </div>
              </div>
            </div>

            <div className="text-center sm:text-left">
              <h4 className="text-white font-bold mb-4 sm:mb-6 tracking-wide">Company</h4>
              <ul className="space-y-3 text-sm font-medium">
                <li><Link to="/about" className="hover:text-blue-400 transition-colors">About Us</Link></li>
                <li><a href="#catalog" onClick={(e) => scrollToSection(e, 'catalog')} className="hover:text-blue-400 transition-colors cursor-pointer">Catalog</a></li>
                <li><Link to="/login" className="hover:text-blue-400 transition-colors">Client Portal</Link></li>
              </ul>
            </div>

            <div className="text-center sm:text-left">
              <h4 className="text-white font-bold mb-4 sm:mb-6 tracking-wide">Support</h4>
              <ul className="space-y-3 text-sm font-medium">
                <li><Link to="/faq" className="hover:text-blue-400 transition-colors">FAQ</Link></li>
                <li><Link to="/shipping" className="hover:text-blue-400 transition-colors">Shipping & Returns</Link></li>
                <li><Link to="/privacy" className="hover:text-blue-400 transition-colors">Privacy Policy</Link></li>
                <li><Link to="/terms" className="hover:text-blue-400 transition-colors">Terms of Service</Link></li>
              </ul>
            </div>

            <div className="text-center sm:text-left flex flex-col items-center sm:items-start">
              <h4 className="text-white font-bold mb-4 sm:mb-6 tracking-wide">Contact Us</h4>
              <ul className="space-y-4 text-sm font-medium w-full max-w-[250px] sm:max-w-none">
                <li className="flex items-start justify-center sm:justify-start gap-3">
                  <MapPin size={18} className="text-blue-500 shrink-0 mt-0.5" />
                  <span className="text-slate-400">2169 Harbor St,<br />Pittsburg CA 94565</span>
                </li>
                <li className="flex items-center justify-center sm:justify-start gap-3">
                  <Phone size={18} className="text-blue-500 shrink-0" />
                  <a href="tel:5106912694" className="hover:text-blue-400 transition-colors text-slate-400">510-691-2694</a>
                </li>
                <li className="flex items-start justify-center sm:justify-start gap-3">
                  <Mail size={18} className="text-blue-500 shrink-0 mt-0.5" />
                  <a href="mailto:info@tricoremedicalsupply.com" className="hover:text-blue-400 transition-colors text-slate-400 break-all text-left">info@tricoremedicalsupply.com</a>
                </li>
              </ul>
            </div>

          </div>
        </div>

        <div className="bg-[#0b1121] py-6 border-t border-slate-800">
          <div className="max-w-7xl mx-auto px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
            <p className="text-xs text-slate-500 font-medium">
              &copy; {new Date().getFullYear()} TriCore Medical Supply. All rights reserved.
            </p>
            <div className="flex gap-4 text-xs font-medium text-slate-500 justify-center">
              <span>Secure Checkout</span>
              <span>HIPAA Compliant Protocol</span>
            </div>
          </div>
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