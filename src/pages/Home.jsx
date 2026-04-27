import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  Truck, ShieldCheck, Clock, ArrowRight, Package, Lock, 
  ShoppingCart, Search, UserPlus, ChevronLeft, ChevronRight, 
  User, LayoutDashboard, ChevronDown, MapPin, Mail, Phone, Users,
  Menu, X, ArrowUp
} from 'lucide-react';

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
        scrollRef.current.scrollTo({
          left: targetChild.offsetLeft - 24,
          behavior: 'smooth'
        });
      }
    }, autoPlayInterval);

    return () => clearInterval(interval);
  }, [activeIndex, items.length, autoPlayInterval]);

  return (
    <div className="relative w-full">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={`flex sm:grid overflow-x-auto sm:overflow-visible snap-x snap-mandatory sm:snap-none gap-6 pb-2 sm:pb-0 -mx-6 px-6 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${desktopGridClass}`}
      >
        {items.map((item, idx) => (
          <div key={idx} className="w-[85vw] sm:w-auto shrink-0 snap-center sm:snap-align-none flex h-full">
            {renderItem(item, idx)}
          </div>
        ))}
      </div>
      
      <div className="flex sm:hidden justify-center items-center gap-2 mt-6">
        {items.map((_, idx) => (
          <div
            key={idx}
            className={`h-2 rounded-full transition-all duration-300 ${
              activeIndex === idx ? 'w-6 bg-blue-600' : 'w-2 bg-slate-300'
            }`}
          />
        ))}
      </div>
    </div>
  );
};


export default function Home() {
  const { session } = useAuth();
  
  // --- STATE MANAGEMENT ---
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState(['All']);
  
  // Filters & Search
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Dropdown & Pagination State
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Active Navigation & Mobile Menu State
  const [activeSection, setActiveSection] = useState('home');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // BACK TO TOP & MODAL STATE
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null); 
  const [clickedCardId, setClickedCardId] = useState(null); 
  
  // MODAL ANIMATION STATE
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 🚀 ANTI-JUMP SCROLL LOCK LOGIC
  useEffect(() => {
    if (selectedProduct) {
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
  }, [selectedProduct]);

  // 🚀 ANIMATED MODAL OPEN HANDLER
  const handleProductClick = (product) => {
    setClickedCardId(product.id); // 1. Trigger the card shrink animation
    setTimeout(() => {
      setSelectedProduct(product); // 2. Mount the modal to the DOM (hidden)
      setClickedCardId(null);      // 3. Reset the card size
      setTimeout(() => setIsModalOpen(true), 10); // 4. Trigger the CSS slide-up animation
    }, 150); // Feel the click for 150ms before opening
  };

  // 🚀 ANIMATED MODAL CLOSE HANDLER
  const handleCloseModal = () => {
    setIsModalOpen(false); // 1. Trigger the CSS slide-down animation
    setTimeout(() => {
      setSelectedProduct(null); // 2. Unmount from DOM after animation completes
    }, 300); // Matches the duration-300 class in the modal wrapper
  };

  // Handle clicking outside the custom dropdown to close it
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
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
        if (prevSize !== newSize) {
          setPage(0);
          return newSize;
        }
        return prevSize;
      });
      if (window.innerWidth >= 1024) setIsMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, activeCategory]);

  useEffect(() => {
    const fetchCategories = async () => {
      const { data } = await supabase.from('products').select('category');
      if (data) {
        const uniqueCats = ['All', ...new Set(data.map(d => d.category).filter(Boolean))];
        setCategories(uniqueCats);
      }
    };
    fetchCategories();
  }, []);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        let query = supabase.from('products').select('*', { count: 'exact' });

        if (activeCategory !== 'All') {
          query = query.eq('category', activeCategory);
        }
        if (debouncedSearch) {
          query = query.or(`name.ilike.%${debouncedSearch}%,base_sku.ilike.%${debouncedSearch}%`);
        }

        const from = page * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to).order('name', { ascending: true });

        const { data, count, error } = await query;
        if (error) throw error;
        
        setProducts(data || []);
        setTotalCount(count || 0);
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [debouncedSearch, activeCategory, page, pageSize]);

  useEffect(() => {
    const observerOptions = { root: null, rootMargin: '-100px 0px -60% 0px', threshold: 0 };
    const observerCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActiveSection(entry.target.id);
      });
    };
    const observer = new IntersectionObserver(observerCallback, observerOptions);
    const sections = ['home', 'catalog', 'brands', 'about'];
    sections.forEach((id) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    const handleScroll = () => {
      if (window.scrollY > 400) {
        setShowBackToTop(true);
      } else {
        setShowBackToTop(false);
      }
    };
    window.addEventListener('scroll', handleScroll);

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleScroll);
    };
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

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

  const navLinks = [
    { id: 'home', label: 'Home' },
    { id: 'catalog', label: 'Catalog' },
    { id: 'brands', label: 'Brands' },
    { id: 'about', label: 'About Us' }
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

  return (
    <div className={`min-h-screen bg-slate-50 flex flex-col relative transition-all duration-300 ${selectedProduct ? 'overflow-hidden' : ''}`}>
      
      {/* =========================================
          1. STICKY NAVIGATION BAR
          ========================================= */}
      <nav className="sticky top-0 z-40 w-full bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex justify-between items-center">
          
          <div className="flex items-center gap-3 cursor-pointer shrink-0" onClick={(e) => scrollToSection(e, 'home')}>
            <img 
              src="/images/tricore-logo2.png" 
              alt="Tricore Medical Logo" 
              className="h-9 sm:h-10 md:h-12 w-auto object-contain" 
            />
          </div>

          <div className="hidden lg:flex items-center gap-8 font-bold text-sm">
            {navLinks.map((link) => {
              const isActive = activeSection === link.id;
              return (
                <a 
                  key={link.id}
                  href={`#${link.id}`} 
                  onClick={(e) => scrollToSection(e, link.id)}
                  className={`relative py-2 transition-colors duration-300 ${
                    isActive ? 'text-blue-600' : 'text-slate-600 hover:text-blue-600'
                  }`}
                >
                  {link.label}
                  <span 
                    className={`absolute bottom-0 left-0 h-[3px] bg-blue-600 rounded-t-full transition-all duration-300 ease-out ${
                      isActive ? 'w-full opacity-100' : 'w-0 opacity-0'
                    }`}
                  ></span>
                </a>
              );
            })}
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3">
            {!session ? (
              <Link 
                to="/login" 
                className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 bg-slate-900 text-white font-bold text-[13px] sm:text-sm rounded-xl hover:bg-slate-800 transition-all shadow-md active:scale-95"
              >
                <User size={16} className="sm:w-[18px] sm:h-[18px]" /> <span className="hidden sm:inline">Login</span>
              </Link>
            ) : (
              <Link 
                to="/dashboard" 
                className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 bg-blue-600 text-white font-bold text-[13px] sm:text-sm rounded-xl hover:bg-blue-700 transition-all shadow-md active:scale-95"
              >
                <LayoutDashboard size={16} className="sm:w-[18px] sm:h-[18px]" /> <span className="hidden sm:inline">Dashboard</span>
              </Link>
            )}

            <button 
              className="lg:hidden relative w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-900 rounded-xl transition-colors active:scale-95 overflow-hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle Menu"
            >
              <Menu 
                className={`absolute transition-all duration-300 ease-out ${
                  isMobileMenuOpen ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100'
                }`} 
                size={24} 
              />
              <X 
                className={`absolute transition-all duration-300 ease-out ${
                  isMobileMenuOpen ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0'
                }`} 
                size={24} 
              />
            </button>
          </div>
        </div>

        {/* MOBILE NAVIGATION DROPDOWN */}
        <div 
          className={`lg:hidden absolute top-20 left-0 w-full bg-white shadow-2xl flex flex-col px-4 gap-2 z-50 overflow-hidden transition-all duration-300 ease-in-out ${
            isMobileMenuOpen 
              ? 'max-h-80 py-4 border-b border-slate-200 opacity-100 visible' 
              : 'max-h-0 py-0 border-transparent opacity-0 invisible pointer-events-none'
          }`}
        >
          {navLinks.map((link) => {
            const isActive = activeSection === link.id;
            return (
              <a 
                key={link.id}
                href={`#${link.id}`} 
                onClick={(e) => scrollToSection(e, link.id)}
                className={`px-5 py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-between ${
                  isActive ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {link.label}
                {isActive && <div className="w-2 h-2 rounded-full bg-blue-600"></div>}
              </a>
            );
          })}
        </div>
      </nav>

      {/* =========================================
          2. HERO SECTION (HOME)
          ========================================= */}
      <section id="home" className="bg-white border-b border-slate-200 relative overflow-hidden scroll-mt-24">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        
        <div className="max-w-7xl mx-auto px-6 py-16 sm:py-24 md:py-28 lg:py-32 relative z-10 flex flex-col items-center text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-slate-900 mb-6 max-w-4xl leading-[1.1]">
            Tricore Medical Supply <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500 block mt-2 text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold pb-2">
              built on reliability, driven by quality.
            </span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-slate-500 mb-10 max-w-2xl leading-relaxed font-medium px-2">
           Supplying premium medical equipment throughout California. Browse our complete selection and discover more by logging in.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <a href="#catalog" onClick={(e) => scrollToSection(e, 'catalog')} className="px-8 py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2">
              Explore Catalog <ArrowRight size={18} />
            </a>
            {!session && (
              <Link to="/login" className="px-8 py-4 bg-white text-slate-700 border border-slate-200 font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2">
                Create Account
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* =========================================
          3. WHY CHOOSE US (MOBILE SLIDER)
          ========================================= */}
      <section className="bg-slate-50 py-16 sm:py-20 md:py-28 border-b border-slate-200 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Why Choose Tricore?</h2>
            <div className="w-20 h-1.5 bg-blue-600 mx-auto mt-6 rounded-full"></div>
          </div>
          
          <MobileCarousel 
            items={whyChooseItems}
            desktopGridClass="sm:grid-cols-2 lg:grid-cols-4"
            autoPlayInterval={3500}
            renderItem={(item) => (
              <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 hover:shadow-xl hover:-translate-y-1 active:scale-95 transition-all duration-300 group w-full text-left cursor-default">
                <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center mb-5 sm:mb-6 border group-hover:scale-110 transition-transform ${item.colorClass}`}>
                  {item.icon}
                </div>
                <h3 className="font-bold text-lg sm:text-xl text-slate-900 mb-2 sm:mb-3 leading-tight">{item.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed font-medium">{item.text}</p>
              </div>
            )}
          />
          
        </div>
      </section>

      {/* =========================================
          4. STOREFRONT & CATALOG
          ========================================= */}
      <section id="catalog" className="max-w-7xl mx-auto px-6 py-16 sm:py-20 w-full flex-grow flex flex-col scroll-mt-24 border-b border-slate-200">
        
        {/* Responsive Toolbar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 shrink-0">
          <div className="w-full md:w-auto">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Catalog</h2>
            <p className="text-slate-500 mt-1 font-medium">Browse our comprehensive medical catalog.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
            
            <div className="relative w-full sm:w-64 shrink-0" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full flex justify-between items-center bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-bold py-3.5 pl-5 pr-4 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all text-left z-10 relative"
              >
                <span className="truncate pr-2">
                  {activeCategory === 'All' ? 'All Categories' : activeCategory}
                </span>
                <ChevronDown className={`text-slate-400 shrink-0 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} size={18} />
              </button>

              <div 
                className={`absolute z-50 w-full mt-2 bg-white border border-slate-100 rounded-xl shadow-xl overflow-hidden transition-all duration-200 origin-top ${
                  isDropdownOpen 
                    ? 'opacity-100 translate-y-0 scale-100 visible pointer-events-auto' 
                    : 'opacity-0 -translate-y-2 scale-95 invisible pointer-events-none'
                }`}
              >
                <ul className="max-h-64 overflow-y-auto divide-y divide-slate-50 py-1">
                  {categories.map((category, idx) => (
                    <li key={idx}>
                      <button
                        type="button"
                        onClick={() => { setActiveCategory(category); setIsDropdownOpen(false); }}
                        className={`w-full text-left px-5 py-3 text-sm font-bold transition-colors ${activeCategory === category ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                      >
                        {category === 'All' ? 'All Categories' : category}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="relative w-full sm:w-72 shrink-0">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Search products..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent shadow-sm transition-all text-sm font-medium"
              />
            </div>
          </div>
        </div>

        <div className="flex-grow min-h-[600px] lg:min-h-[750px] relative">
          {loading ? (
            <div className="absolute inset-0 flex justify-center items-center">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-24 bg-white rounded-3xl border border-slate-200 shadow-sm mx-2">
              <Package size={48} className="mx-auto text-slate-300 mb-4" strokeWidth={1.5} />
              <h3 className="text-xl font-bold text-slate-900 mb-2">No products found</h3>
              <p className="text-slate-500">Adjust your search or category filters to try again.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {products.map(product => (
                <div 
                  key={product.id} 
                  onClick={() => handleProductClick(product)} 
                  // 🚀 CARD CLICK ANIMATION CSS
                  className={`bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm transition-all duration-200 flex flex-col group relative overflow-hidden cursor-pointer ${
                    clickedCardId === product.id 
                      ? 'scale-95 opacity-80 shadow-inner' 
                      : 'hover:shadow-xl hover:-translate-y-1 active:scale-[0.96]' 
                  }`}
                >
                  <div className="w-full h-40 sm:h-48 bg-slate-50 rounded-xl mb-4 sm:mb-5 flex items-center justify-center overflow-hidden border border-slate-100">
                    {product.image_urls?.[0] ? (
                      <img src={product.image_urls[0]} alt={product.name} className="w-full h-full object-cover mix-blend-multiply group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <Package size={48} className="text-slate-200" strokeWidth={1.5} />
                    )}
                  </div>
                  <div className="flex flex-col flex-grow">
                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1 truncate">{product.category || 'General'}</span>
                    <h3 className="font-bold text-slate-900 text-base sm:text-lg mb-2 leading-tight group-hover:text-blue-600 transition-colors">{product.name}</h3>
                    {product.base_sku && (
                      <p className="text-[11px] sm:text-xs font-mono text-slate-500 mb-4 bg-slate-100 w-max px-2 py-0.5 rounded">SKU: {product.base_sku}</p>
                    )}
                  </div>
                  <div className="pt-4 sm:pt-5 border-t border-slate-100 mt-auto">
                    {session ? (
                      <div className="flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Your Price</span>
                          <span className="text-lg sm:text-xl font-black text-slate-900">
                            ${Number(product.retail_base_price || product.price || 0).toFixed(2)}
                          </span>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); }} 
                          className="px-3 sm:px-4 py-2 sm:py-2.5 bg-blue-600 text-white text-[13px] sm:text-sm font-bold rounded-xl hover:bg-blue-700 transition-all shadow-md active:scale-95 flex items-center gap-2"
                        >
                          <ShoppingCart size={16} /> <span className="hidden sm:inline">Add</span>
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 text-center">
                        <Link 
                          onClick={(e) => e.stopPropagation()} 
                          to="/login" 
                          className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-4 py-2.5 rounded-xl uppercase tracking-wider hover:bg-slate-200 hover:text-slate-900 active:scale-95 transition-all shadow-sm"
                        >
                          <Lock size={14} /> Login to view pricing
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!loading && totalCount > 0 && (
          <div className="mt-8 sm:mt-12 flex flex-col md:flex-row justify-between items-center gap-4 border-t border-slate-200 pt-6 shrink-0">
            <p className="text-xs sm:text-sm text-slate-500 font-medium text-center md:text-left mb-2 md:mb-0">
              Showing <span className="font-bold text-slate-900">{page * pageSize + 1}</span> to <span className="font-bold text-slate-900">{Math.min((page + 1) * pageSize, totalCount)}</span> of <span className="font-bold text-slate-900">{totalCount}</span> items
            </p>
            
            <div className="flex items-center gap-1 sm:gap-2 w-full md:w-auto justify-center">
              <button 
                onClick={() => setPage(p => Math.max(0, p - 1))} 
                disabled={page === 0} 
                className="p-2 sm:px-4 sm:py-2.5 rounded-xl border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 active:scale-95 disabled:opacity-50 disabled:active:scale-100 shadow-sm transition-all flex items-center justify-center"
              >
                <ChevronLeft size={18} /> <span className="hidden sm:inline ml-1 font-bold text-sm">Prev</span>
              </button>

              {getPageNumbers().map((p, index) => (
                p === '...' ? (
                  <span key={`dots-${index}`} className="px-1 sm:px-2 text-slate-400 font-bold">...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl font-bold text-sm transition-all flex items-center justify-center ${
                      page === p 
                        ? 'bg-blue-600 text-white shadow-md' 
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm'
                    }`}
                  >
                    {p + 1}
                  </button>
                )
              ))}

              <button 
                onClick={() => setPage(p => p + 1)} 
                disabled={page >= totalPages - 1} 
                className="p-2 sm:px-4 sm:py-2.5 rounded-xl border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 active:scale-95 disabled:opacity-50 disabled:active:scale-100 shadow-sm transition-all flex items-center justify-center"
              >
                <span className="hidden sm:inline mr-1 font-bold text-sm">Next</span> <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* =========================================
          5. BRANDS WE CARRY (MOBILE SLIDER)
          ========================================= */}
      <section id="brands" className="bg-white py-16 sm:py-20 md:py-24 border-b border-slate-200 scroll-mt-24 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10 sm:mb-16 max-w-3xl mx-auto">
            <h2 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight mb-4">Brands We Carry</h2>
            <div className="w-20 h-1.5 bg-blue-600 mx-auto mt-2 mb-6 rounded-full"></div>
            <p className="text-base sm:text-lg text-slate-500 leading-relaxed font-medium px-2">
              At Tricore Medical Supply, we offer a carefully curated selection of premium medical supplies from some of the most trusted names in the industry. Our commitment to quality means we partner with leading manufacturers to bring you reliable and innovative products that meet your healthcare needs. Explore our diverse collection today and experience the excellence and dependability that define the brands we proudly carry.
            </p>
          </div>

          <MobileCarousel 
            items={brandItems}
            desktopGridClass="sm:grid-cols-3"
            autoPlayInterval={4000}
            renderItem={(item) => (
              <div className="flex flex-col items-center text-center p-6 sm:p-8 rounded-3xl hover:bg-slate-50 transition-colors border border-slate-200 sm:border-transparent sm:hover:border-slate-100 shadow-sm sm:shadow-none group w-full h-full cursor-default">
                <div className="h-16 sm:h-20 md:h-24 w-full flex items-center justify-center mb-6">
                  <img src={item.img} alt={item.name} className="max-h-full max-w-[160px] sm:max-w-[200px] object-contain group-hover:scale-105 transition-transform duration-500" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-3">{item.name}</h3>
                <p className="text-sm text-slate-500 leading-relaxed font-medium">{item.text}</p>
              </div>
            )}
          />
          
        </div>
      </section>

      {/* =========================================
          6. ABOUT SECTION
          ========================================= */}
      <section id="about" className="bg-white border-t border-slate-200 py-16 sm:py-24 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-16 items-center">
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-blue-50 text-blue-700 text-[10px] font-extrabold uppercase tracking-widest mb-4">About Tricore</span>
              <h2 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight mb-4 sm:mb-6 leading-tight">Committed to Healthcare Excellence in California.</h2>
              <p className="text-base sm:text-lg text-slate-500 leading-relaxed mb-6 font-medium">At Tricore Medical Supply, we understand that reliable equipment is the backbone of exceptional patient care. We specialize in outfitting healthcare facilities, medical professionals, and individual patients with top-tier supplies.</p>
              <p className="text-base sm:text-lg text-slate-500 leading-relaxed mb-8 sm:mb-10 font-medium">Our dedicated fleet and streamlined ordering portal ensure that your focus remains entirely on your patients, not your supply chain.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="flex sm:flex-col items-center sm:items-start gap-4 text-left">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100"><ShieldCheck size={24} /></div>
                  <div><h4 className="font-bold text-slate-900 text-base sm:text-lg">Certified Quality</h4><p className="text-sm text-slate-500 mt-1 leading-relaxed hidden sm:block">Industry-standard medical supplies from trusted manufacturers.</p></div>
                </div>
                <div className="flex sm:flex-col items-center sm:items-start gap-4 text-left">
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100"><Truck size={24} /></div>
                  <div><h4 className="font-bold text-slate-900 text-base sm:text-lg">Direct Delivery</h4><p className="text-sm text-slate-500 mt-1 leading-relaxed hidden sm:block">Private logistics fleet dedicated to California medical facilities.</p></div>
                </div>
              </div>
            </div>
            <div className="relative mt-4 lg:mt-0">
              <div className="absolute -inset-4 bg-slate-100 rounded-3xl transform rotate-3 hidden sm:block"></div>
              <img src="https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=1000&q=80" alt="Tricore Medical Logistics" className="relative rounded-2xl shadow-xl object-cover w-full h-[300px] sm:h-[400px] lg:h-[450px] border border-slate-200"/>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================
          7. VALUE PROPS (MOBILE SLIDER)
          ========================================= */}
      <section className="bg-slate-50 border-t border-slate-200 py-16 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          
          <MobileCarousel 
            items={valuePropItems}
            desktopGridClass="sm:grid-cols-3 text-center"
            autoPlayInterval={4500}
            renderItem={(item) => (
              <div className="flex flex-col items-center text-center bg-white sm:bg-transparent p-6 sm:p-0 rounded-3xl border border-slate-200 sm:border-none shadow-sm sm:shadow-none w-full h-full cursor-default">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-5 border border-blue-100 text-blue-600">
                  {item.icon}
                </div>
                <h3 className="font-bold text-slate-900 text-xl mb-2 tracking-tight">{item.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed max-w-xs">{item.text}</p>
              </div>
            )}
          />

        </div>
      </section>

      {/* =========================================
          8. BOTTOM CTA BANNER
          ========================================= */}
      <section className="bg-blue-600 relative overflow-hidden shrink-0 border-t border-blue-700">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff1a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff1a_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="absolute right-0 top-0 w-[500px] h-[500px] bg-white rounded-full blur-[120px] opacity-10 translate-x-1/3 -translate-y-1/4 pointer-events-none"></div>
        <div className="max-w-7xl mx-auto px-6 py-12 sm:py-16 md:py-20 relative z-10 flex flex-col lg:flex-row items-center justify-between text-center lg:text-left gap-8 sm:gap-10">
          <div className="max-w-2xl">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight mb-3 sm:mb-4">Partner with a supply you can rely on.</h2>
            <p className="text-blue-100 text-base sm:text-lg md:text-xl font-medium">Secure your medical supply with confidence. Connect with our team today.</p>
          </div>
          <div className="shrink-0 w-full sm:w-auto">
            <a href="mailto:info@tricoremedicalsupply.com?subject=Wholesale%20Quote%20Request" className="flex w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 bg-white text-blue-600 font-extrabold rounded-xl hover:bg-slate-50 transition-all shadow-xl hover:shadow-2xl active:scale-95 items-center justify-center gap-2 text-base sm:text-lg border border-blue-50">
              <Mail size={20} strokeWidth={2.5} /> Request a Quote
            </a>
          </div>
        </div>
      </section>

      {/* =========================================
          9. FOOTER
          ========================================= */}
      <footer className="bg-slate-900 text-slate-300 py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 sm:gap-12 mb-10 sm:mb-12">
            
            <div className="lg:col-span-2">
              <img src="/images/tricore-logo2.png" alt="Tricore Medical Logo" className="h-10 sm:h-12 w-auto object-contain mb-5 sm:mb-6 brightness-0 invert" />
              <p className="text-sm leading-relaxed max-w-md">Equipping California's healthcare facilities with reliable, fast, and high-quality medical supplies. Built on reliability, driven by quality.</p>
              
              <div className="mt-8 flex items-center gap-4 bg-white p-4 rounded-2xl w-fit shadow-md border border-slate-200 group">
                <img 
                  src="/images/accreditation.webp" 
                  alt="ACHC Accredited" 
                  className="h-12 sm:h-14 w-auto object-contain group-hover:scale-105 transition-transform" 
                />
                <div className="text-xs text-slate-600 max-w-[200px] leading-snug">
                  <span className="font-black text-slate-900 block mb-0.5 text-sm">ACHC Accredited</span>
                  Upholding the highest national standards for quality.
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-white font-bold text-lg mb-5 sm:mb-6">Contact Us</h4>
              <ul className="space-y-3 sm:space-y-4 text-sm">
                <li className="flex items-start gap-3"><MapPin size={18} className="text-blue-500 shrink-0 mt-0.5" /><span>2169 Harbor St.<br />Pittsburg, CA 94565</span></li>
                <li className="flex items-center gap-3"><Mail size={18} className="text-blue-500 shrink-0" /><a href="mailto:info@tricoremedicalsupply.com" className="hover:text-white transition-colors">info@tricoremedicalsupply.com</a></li>
                <li className="flex items-center gap-3"><Phone size={18} className="text-blue-500 shrink-0" /><a href="tel:5106912694" className="hover:text-white transition-colors">510-691-2694</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-white font-bold text-lg mb-5 sm:mb-6">Quick Links</h4>
              <ul className="space-y-3 text-sm flex flex-col items-start">
                <li><Link to="/login" className="hover:text-white transition-colors">Login</Link></li>
                <li><a href="#about" onClick={(e) => scrollToSection(e, 'about')} className="hover:text-white transition-colors cursor-pointer">About Us</a></li>
                <li><a href="#catalog" onClick={(e) => scrollToSection(e, 'catalog')} className="hover:text-white transition-colors cursor-pointer">Browse Catalog</a></li>
                <li><a href="#brands" onClick={(e) => scrollToSection(e, 'brands')} className="hover:text-white transition-colors cursor-pointer">Our Brands</a></li>
              </ul>
            </div>
          </div>

          <div className="pt-6 sm:pt-8 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs sm:text-sm font-medium text-center sm:text-left">
            <p>© {new Date().getFullYear()} Tricore Medical Supply. All rights reserved.</p>
            <div className="flex gap-4 sm:gap-6 justify-center">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>

      {/* 🚀 BACK TO TOP BUTTON */}
      <button
        onClick={scrollToTop}
        className={`fixed bottom-6 right-6 sm:bottom-8 sm:right-8 p-3 sm:p-4 bg-slate-900 text-white rounded-full shadow-2xl hover:bg-blue-600 hover:-translate-y-1 transition-all duration-300 z-50 flex items-center justify-center group ${
          showBackToTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'
        }`}
        aria-label="Back to top"
      >
        <ArrowUp size={24} className="group-hover:animate-bounce" />
      </button>

      {/* 🚀 PRODUCT DETAILS MODAL (Animated Open & Close) */}
      {selectedProduct && (
        <div 
          className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300 ease-in-out ${
            isModalOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={handleCloseModal}
        >
          <div 
            className={`bg-white w-full sm:max-w-4xl max-h-[90vh] rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl flex flex-col md:flex-row overflow-hidden transition-all duration-300 transform ease-out ${
              isModalOpen 
                ? 'translate-y-0 sm:scale-100 opacity-100' 
                : 'translate-y-full sm:translate-y-8 sm:scale-95 sm:opacity-0'
            }`}
            onClick={(e) => e.stopPropagation()} 
          >
            {/* Image Section */}
            <div className="w-full md:w-1/2 h-64 md:h-auto bg-slate-50 relative p-8 flex items-center justify-center border-b md:border-b-0 md:border-r border-slate-100">
              <button 
                onClick={handleCloseModal} 
                className="absolute top-4 left-4 p-2 bg-white/80 backdrop-blur text-slate-600 hover:text-slate-900 rounded-full shadow-sm md:hidden active:scale-95 transition-all"
              >
                <X size={20}/>
              </button>
              {selectedProduct.image_urls?.[0] ? (
                <img src={selectedProduct.image_urls[0]} alt={selectedProduct.name} className="max-w-full max-h-full object-contain mix-blend-multiply drop-shadow-md" />
              ) : (
                <Package size={80} className="text-slate-200" />
              )}
            </div>

            {/* Details Section */}
            <div className="w-full md:w-1/2 p-6 sm:p-8 flex flex-col overflow-y-auto">
              <div className="flex justify-between items-start mb-6">
                <div className="pr-4">
                  <span className="inline-flex text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-1 rounded-md uppercase tracking-widest mb-3">
                    {selectedProduct.category || 'General'}
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight mb-2 tracking-tight">
                    {selectedProduct.name}
                  </h2>
                  {selectedProduct.base_sku && (
                    <p className="text-sm font-mono text-slate-500">SKU: {selectedProduct.base_sku}</p>
                  )}
                </div>
                <button 
                  onClick={handleCloseModal} 
                  className="hidden md:flex p-2.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors active:scale-95"
                >
                  <X size={22}/>
                </button>
              </div>

              <div className="prose prose-slate prose-sm mb-8 flex-grow">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 bg-blue-600 rounded-full"></span> Description
                </h4>
                <p className="text-slate-600 font-medium leading-relaxed">
                  {selectedProduct.description || "No detailed description available for this product at this time."}
                </p>
              </div>

              <div className="pt-6 border-t border-slate-100 mt-auto flex flex-col sm:flex-row gap-4 items-center justify-between shrink-0">
                {session ? (
                  <>
                    <div className="flex flex-col w-full sm:w-auto text-center sm:text-left">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-0.5">Your Price</span>
                      <span className="text-3xl font-black text-slate-900 tracking-tight">
                        ${Number(selectedProduct.retail_base_price || selectedProduct.price || 0).toFixed(2)}
                      </span>
                    </div>
                    <button className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/30 active:scale-[0.98] flex items-center justify-center gap-2">
                      <ShoppingCart size={18} /> Add to Cart
                    </button>
                  </>
                ) : (
                  <div className="w-full text-center bg-slate-50 p-5 rounded-2xl border border-slate-200 relative overflow-hidden">
                    <Lock size={24} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-sm font-bold text-slate-900 mb-1">Pricing is Hidden</p>
                    <p className="text-xs text-slate-500 mb-4 font-medium max-w-[200px] mx-auto">Please log in to view wholesale pricing and purchase.</p>
                    <Link 
                      to="/login" 
                      className="inline-flex w-full px-6 py-3 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-all active:scale-95 justify-center shadow-md"
                    >
                      Log In / Register
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}