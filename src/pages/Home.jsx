import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  Truck, ShieldCheck, Clock, ArrowRight, Package, Lock, 
  ShoppingCart, Search, UserPlus, ChevronLeft, ChevronRight, 
  User, LayoutDashboard, Award, ChevronDown, MapPin, Mail, Phone, Users
} from 'lucide-react';

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

  // 🚀 DYNAMIC PAGE SIZE: 5 on mobile, 12 on desktop
  const getInitialPageSize = () => window.innerWidth < 640 ? 5 : 12;
  const [pageSize, setPageSize] = useState(getInitialPageSize());

  useEffect(() => {
    const handleResize = () => {
      const newSize = window.innerWidth < 640 ? 5 : 12;
      setPageSize(prevSize => {
        if (prevSize !== newSize) {
          setPage(0); // Reset page to 0 if the screen size changes
          return newSize;
        }
        return prevSize;
      });
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 1. Debounce the search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // 2. Reset to page 0 whenever the search or category changes
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, activeCategory]);

  // 3. Fetch unique categories exactly ONCE on page load
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

  // 4. Fetch Products (SERVER-SIDE PAGINATION)
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

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      
      {/* =========================================
          1. STICKY NAVIGATION BAR
          ========================================= */}
      <nav className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex justify-between items-center">
          {/* Brand / Logo */}
          <div className="flex items-center gap-3">
            <img 
              src="/images/tricore-logo2.png" 
              alt="Tricore Medical Logo" 
              className="h-10 sm:h-12 w-auto object-contain" 
            />
          </div>
          
          {/* Action Button */}
          <div>
            {!session ? (
              <Link 
                to="/login" 
                className="flex items-center gap-2 px-4 sm:px-6 py-2.5 bg-slate-900 text-white font-bold text-sm rounded-xl hover:bg-slate-800 transition-all shadow-md active:scale-95"
              >
                <User size={18} /> <span className="hidden sm:inline">Login</span>
              </Link>
            ) : (
              <Link 
                to="/dashboard" 
                className="flex items-center gap-2 px-4 sm:px-6 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition-all shadow-md active:scale-95"
              >
                <LayoutDashboard size={18} /> <span className="hidden sm:inline">Dashboard</span>
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* =========================================
          2. HERO SECTION
          ========================================= */}
      <section className="bg-white border-b border-slate-200 relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        
        <div className="max-w-7xl mx-auto px-6 py-16 sm:py-24 lg:py-32 relative z-10 flex flex-col items-center text-center">
          
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-slate-900 mb-6 max-w-4xl leading-[1.1]">
            Tricore Medical Supply <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500 block mt-2 text-3xl sm:text-5xl lg:text-6xl font-extrabold pb-2">
              built on reliability, driven by quality.
            </span>
          </h1>
          
          <p className="text-base sm:text-lg text-slate-500 mb-10 max-w-2xl leading-relaxed font-medium">
           Supplying premium medical equipment throughout California. Browse our complete selection and discover more by logging in.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <a 
              href="#catalog" 
              className="px-8 py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2"
            >
              Explore Catalog <ArrowRight size={18} />
            </a>
            {!session && (
              <Link 
                to="/login" 
                className="px-8 py-4 bg-white text-slate-700 border border-slate-200 font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2"
              >
                Create Account
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* =========================================
          3. WHY CHOOSE US
          ========================================= */}
      <section className="bg-slate-50 py-20 sm:py-28 border-b border-slate-200 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Why Choose Tricore?</h2>
            <div className="w-20 h-1.5 bg-blue-600 mx-auto mt-6 rounded-full"></div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6 border border-blue-100 group-hover:scale-110 transition-transform">
                <ShieldCheck size={28} />
              </div>
              <h3 className="font-bold text-xl text-slate-900 mb-3 leading-tight">Uncompromising Product Quality</h3>
              <p className="text-slate-500 text-sm leading-relaxed font-medium">Industry-standard equipment rigorously vetted for safety and peak performance.</p>
            </div>
            
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-6 border border-emerald-100 group-hover:scale-110 transition-transform">
                <Package size={28} />
              </div>
              <h3 className="font-bold text-xl text-slate-900 mb-3 leading-tight">Reliable Supply, Always Available</h3>
              <p className="text-slate-500 text-sm leading-relaxed font-medium">Consistent inventory levels to ensure you never run out of critical supplies.</p>
            </div>
            
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-6 border border-indigo-100 group-hover:scale-110 transition-transform">
                <Users size={28} />
              </div>
              <h3 className="font-bold text-xl text-slate-900 mb-3 leading-tight">Trusted by Medical Professionals</h3>
              <p className="text-slate-500 text-sm leading-relaxed font-medium">The preferred logistical partner for healthcare facilities across California.</p>
            </div>
            
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-6 border border-amber-100 group-hover:scale-110 transition-transform">
                <Truck size={28} />
              </div>
              <h3 className="font-bold text-xl text-slate-900 mb-3 leading-tight">Efficient and Timely Delivery</h3>
              <p className="text-slate-500 text-sm leading-relaxed font-medium">Fast, accurate shipping to keep your clinical operations running smoothly.</p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================
          4. STOREFRONT & CATALOG
          ========================================= */}
      <section id="catalog" className="max-w-7xl mx-auto px-6 py-20 w-full flex-grow flex flex-col scroll-mt-24">
        
        {/* Responsive Toolbar */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10 shrink-0">
          <div className="w-full lg:w-auto">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Catalog</h2>
            <p className="text-slate-500 mt-1 font-medium">Browse our comprehensive medical catalog.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
            
            {/* 🚀 CUSTOM CATEGORY DROPDOWN */}
            <div className="relative w-full sm:w-64 md:w-72 shrink-0" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full flex justify-between items-center bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-bold py-3.5 pl-5 pr-4 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all text-left"
              >
                <span className="truncate pr-2">
                  {activeCategory === 'All' ? 'All Categories' : activeCategory}
                </span>
                <ChevronDown 
                  className={`text-slate-400 shrink-0 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} 
                  size={18} 
                />
              </button>

              {/* The Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute z-50 w-full mt-2 bg-white border border-slate-100 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  <ul className="max-h-64 overflow-y-auto divide-y divide-slate-50 py-1">
                    {categories.map((category, idx) => (
                      <li key={idx}>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveCategory(category);
                            setIsDropdownOpen(false);
                          }}
                          className={`w-full text-left px-5 py-3 text-sm font-bold transition-colors ${
                            activeCategory === category 
                              ? 'bg-blue-50 text-blue-700' 
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                          }`}
                        >
                          {category === 'All' ? 'All Categories' : category}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Search Bar */}
            <div className="relative w-full sm:w-72 shrink-0">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Search products or SKUs..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent shadow-sm transition-all text-sm font-medium"
              />
            </div>
          </div>
        </div>

        <div className="flex-grow">
          {loading ? (
            <div className="flex justify-center items-center py-32">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-24 bg-white rounded-3xl border border-slate-200 shadow-sm">
              <Package size={48} className="mx-auto text-slate-300 mb-4" strokeWidth={1.5} />
              <h3 className="text-xl font-bold text-slate-900 mb-2">No products found</h3>
              <p className="text-slate-500">Adjust your search or category filters to try again.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map(product => (
                <div key={product.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-xl transition-all flex flex-col group relative overflow-hidden">
                  
                  <div className="w-full h-48 bg-slate-50 rounded-xl mb-5 flex items-center justify-center overflow-hidden border border-slate-100">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="w-full h-full object-cover mix-blend-multiply group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <Package size={48} className="text-slate-200" strokeWidth={1.5} />
                    )}
                  </div>
                  
                  <div className="flex flex-col flex-grow">
                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1 truncate">{product.category || 'General'}</span>
                    <h3 className="font-bold text-slate-900 text-lg mb-2 leading-tight group-hover:text-blue-600 transition-colors">{product.name}</h3>
                    {product.base_sku && (
                      <p className="text-xs font-mono text-slate-500 mb-4 bg-slate-100 w-max px-2 py-0.5 rounded">SKU: {product.base_sku}</p>
                    )}
                  </div>

                  <div className="pt-5 border-t border-slate-100 mt-auto">
                    {session ? (
                      <div className="flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Your Price</span>
                          <span className="text-xl font-black text-slate-900">
                            ${Number(product.retail_base_price || product.price || 0).toFixed(2)}
                          </span>
                        </div>
                        <button className="px-4 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all shadow-md active:scale-95 flex items-center gap-2">
                          <ShoppingCart size={16} /> Add
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 text-center">
                        <Link 
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

        {/* 🚀 PAGINATION CONTROLS */}
        {!loading && totalCount > 0 && (
          <div className="mt-12 flex flex-col sm:flex-row justify-between items-center gap-4 border-t border-slate-200 pt-6 shrink-0">
            <p className="text-sm text-slate-500 font-medium text-center sm:text-left">
              Showing <span className="font-bold text-slate-900">{page * pageSize + 1}</span> to <span className="font-bold text-slate-900">{Math.min((page + 1) * pageSize, totalCount)}</span> of <span className="font-bold text-slate-900">{totalCount}</span> items
            </p>
            
            <div className="flex gap-2 w-full sm:w-auto justify-center">
              <button 
                onClick={() => setPage(p => Math.max(0, p - 1))} 
                disabled={page === 0} 
                className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 active:scale-95 disabled:opacity-50 disabled:active:scale-100 shadow-sm transition-all flex items-center justify-center gap-1 font-bold text-sm"
              >
                <ChevronLeft size={16} /> Prev
              </button>
              <button 
                onClick={() => setPage(p => p + 1)} 
                disabled={page >= totalPages - 1} 
                className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 active:scale-95 disabled:opacity-50 disabled:active:scale-100 shadow-sm transition-all flex items-center justify-center gap-1 font-bold text-sm"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* =========================================
          5. ABOUT SECTION
          ========================================= */}
      <section id="about" className="bg-white border-t border-slate-200 py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 sm:gap-16 items-center">
            {/* Text Side */}
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-blue-50 text-blue-700 text-[10px] font-extrabold uppercase tracking-widest mb-4">
                About Tricore
              </span>
              <h2 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight mb-6 leading-tight">
                Committed to Healthcare Excellence in California.
              </h2>
              <p className="text-base sm:text-lg text-slate-500 leading-relaxed mb-6 font-medium">
                At Tricore Medical Supply, we understand that reliable equipment is the backbone of exceptional patient care. We specialize in outfitting healthcare facilities, medical professionals, and individual patients with top-tier supplies.
              </p>
              <p className="text-base sm:text-lg text-slate-500 leading-relaxed mb-10 font-medium">
                Our dedicated fleet and streamlined ordering portal ensure that your focus remains entirely on your patients, not your supply chain.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="flex flex-col items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                    <ShieldCheck size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-lg">Certified Quality</h4>
                    <p className="text-sm text-slate-500 mt-1 leading-relaxed">Industry-standard medical supplies from trusted manufacturers.</p>
                  </div>
                </div>
                <div className="flex flex-col items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                    <Truck size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-lg">Direct Delivery</h4>
                    <p className="text-sm text-slate-500 mt-1 leading-relaxed">Private logistics fleet dedicated to California medical facilities.</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Image Side */}
            <div className="relative mt-8 lg:mt-0">
              <div className="absolute -inset-4 bg-slate-100 rounded-3xl transform rotate-3 hidden sm:block"></div>
              <img 
                src="https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=1000&q=80" 
                alt="Tricore Medical Logistics" 
                className="relative rounded-2xl shadow-xl object-cover w-full h-[350px] sm:h-[450px] border border-slate-200"
              />
            </div>
          </div>
        </div>
      </section>

      {/* =========================================
          6. ACCREDITATION SECTION
          ========================================= */}
      <section id="accreditation" className="bg-slate-50 border-t border-slate-200 py-16 sm:py-20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-100 rounded-full blur-[80px] opacity-50 -translate-y-1/2 translate-x-1/4"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-slate-200 rounded-full blur-[80px] opacity-50 translate-y-1/2 -translate-x-1/4"></div>
        
        <div className="max-w-4xl mx-auto px-6 text-center flex flex-col items-center relative z-10">
          <img 
            src="/images/accreditation.webp" 
            alt="ACHC Accredited" 
            className="w-40 md:w-48 h-auto object-contain mb-8 drop-shadow-lg" 
          />
          
          <h2 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight mb-6">
            Accreditation Commission for Health Care, Inc.
          </h2>
          
          <p className="text-base sm:text-lg text-slate-500 leading-relaxed font-medium">
            Our accreditation by the Accreditation Commission for Health Care, Inc. (ACHC) demonstrates our commitment to upholding the highest national standards for quality and patient safety. This achievement means we have been independently evaluated and recognized for our dedication to providing exceptional care you can trust.
          </p>
        </div>
      </section>

      {/* =========================================
          7. VALUE PROPS
          ========================================= */}
      <section className="bg-white border-t border-slate-200 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 text-center">
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-5 border border-blue-100 text-blue-600">
                <Truck size={28} />
              </div>
              <h3 className="font-bold text-slate-900 text-xl mb-2 tracking-tight">Dedicated CA Fleet</h3>
              <p className="text-slate-500 text-sm leading-relaxed max-w-xs">Direct to your facility anywhere in California with our private, reliable drivers.</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-5 border border-blue-100 text-blue-600">
                <ShieldCheck size={28} />
              </div>
              <h3 className="font-bold text-slate-900 text-xl mb-2 tracking-tight">Flexible Net Terms</h3>
              <p className="text-slate-500 text-sm leading-relaxed max-w-xs">Custom credit limits and negotiated pricing for approved partner accounts.</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-5 border border-blue-100 text-blue-600">
                <Clock size={28} />
              </div>
              <h3 className="font-bold text-slate-900 text-xl mb-2 tracking-tight">Real-Time Tracking</h3>
              <p className="text-slate-500 text-sm leading-relaxed max-w-xs">Track your fleet deliveries instantly and manage patient orders from your dashboard.</p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================
          8. BOTTOM CTA BANNER
          ========================================= */}
      <section className="bg-blue-600 relative overflow-hidden shrink-0 border-t border-blue-700">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff1a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff1a_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="absolute right-0 top-0 w-[500px] h-[500px] bg-white rounded-full blur-[120px] opacity-10 translate-x-1/3 -translate-y-1/4 pointer-events-none"></div>
        
        <div className="max-w-7xl mx-auto px-6 py-16 sm:py-20 relative z-10 flex flex-col lg:flex-row items-center justify-between text-center lg:text-left gap-10">
          <div className="max-w-2xl">
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-4">Partner with a supply you can rely on.</h2>
            <p className="text-blue-100 text-lg sm:text-xl font-medium">Secure your medical supply with confidence. Connect with our team today.</p>
          </div>
          <div className="shrink-0">
            {/* 🚀 STANDARD MAILTO LINK (Forces default desktop app) */}
            <a 
              href="mailto:info@tricoremedicalsupply.com?subject=Wholesale%20Quote%20Request" 
              className="inline-flex px-8 py-4 bg-white text-blue-600 font-extrabold rounded-xl hover:bg-slate-50 transition-all shadow-xl hover:shadow-2xl active:scale-95 items-center justify-center gap-2 text-lg border border-blue-50"
            >
              <Mail size={20} strokeWidth={2.5} /> Request a Quote
            </a>
          </div>
        </div>
      </section>

      {/* =========================================
          9. CLEAN PROFESSIONAL FOOTER
          ========================================= */}
      <footer className="bg-slate-900 text-slate-300 py-16">
        <div className="max-w-7xl mx-auto px-6">
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            {/* Brand Column */}
            <div className="md:col-span-2">
              <img 
                src="/images/tricore-logo2.png" 
                alt="Tricore Medical Logo" 
                className="h-12 w-auto object-contain mb-6 brightness-0 invert" 
              />
              <p className="text-sm leading-relaxed max-w-md">
                Equipping California's healthcare facilities with reliable, fast, and high-quality medical supplies. Built on reliability, driven by quality.
              </p>
              {!session && (
                <div className="mt-8">
                  <Link to="/login" className="inline-flex px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500 transition-all shadow-md active:scale-95 items-center justify-center gap-2">
                    <UserPlus size={16} /> Create an Account
                  </Link>
                </div>
              )}
            </div>

            {/* Contact Column */}
            <div>
              <h4 className="text-white font-bold text-lg mb-6">Contact Us</h4>
              <ul className="space-y-4 text-sm">
                <li className="flex items-start gap-3">
                  <MapPin size={18} className="text-blue-500 shrink-0 mt-0.5" />
                  <span>2169 Harbor St.<br />Pittsburg, CA 94565</span>
                </li>
                <li className="flex items-center gap-3">
                  <Mail size={18} className="text-blue-500 shrink-0" />
                  <a href="mailto:info@tricoremedicalsupply.com" className="hover:text-white transition-colors">info@tricoremedicalsupply.com</a>
                </li>
                <li className="flex items-center gap-3">
                  <Phone size={18} className="text-blue-500 shrink-0" />
                  <a href="tel:5106912694" className="hover:text-white transition-colors">510-691-2694</a>
                </li>
              </ul>
            </div>

            {/* Links Column */}
            <div>
              <h4 className="text-white font-bold text-lg mb-6">Quick Links</h4>
              <ul className="space-y-3 text-sm flex flex-col items-start">
                <li><Link to="/login" className="hover:text-white transition-colors">Login</Link></li>
                <li><a href="#about" className="hover:text-white transition-colors">About Us</a></li>
                <li><a href="#catalog" className="hover:text-white transition-colors">Browse Catalog</a></li>
                <li><a href="#accreditation" className="hover:text-white transition-colors">Accreditation</a></li>
              </ul>
            </div>
          </div>

          {/* Copyright Row */}
          <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 text-sm font-medium text-center md:text-left">
            <p>© {new Date().getFullYear()} Tricore Medical Supply. All rights reserved.</p>
            <div className="flex gap-6 justify-center">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            </div>
          </div>
          
        </div>
      </footer>

    </div>
  );
}