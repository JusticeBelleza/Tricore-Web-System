import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export const useMetricsStore = create((set, get) => ({
  // --- STATE ---
  badges: {
    pendingCount: 0,
    processingCount: 0,
    needsDispatchCount: 0,
    returnsCount: 0,
    overdueCount: 0,
  },
  dashboardData: {
    totalSpend: 0,
    filteredRevenue: 0,
    outstanding: 0
  },
  isLoading: false,
  realtimeChannel: null,

  // --- ACTIONS ---

  // 1. Fetch Dashboard Money Metrics via RPC
  fetchDashboardMetrics: async (startDate = null, endDate = null) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.rpc('get_dashboard_metrics', {
        p_start_date: startDate ? startDate.toISOString() : null,
        p_end_date: endDate ? endDate.toISOString() : null
      });

      if (error) throw error;

      set({ dashboardData: data });
    } catch (error) {
      console.error("Failed to fetch dashboard metrics:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  // 2. Fetch Notification Badges
  fetchBadges: async (profile) => {
    if (!profile) return;
    const { role, id, company_id } = profile;
    const isStaff = ['admin', 'warehouse'].includes(role);

    try {
      if (isStaff) {
        // ✨ FIXED: Swapped the "dumb" frontend query for the "smart" RPC we just built!
        const [pendingRes, processingRes, dispatchRes, warehouseCountsRes] = await Promise.all([
          supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'processing'),
          supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'ready_for_delivery'),
          supabase.rpc('get_warehouse_tab_counts') 
        ]);

        set({
          badges: {
            ...get().badges,
            pendingCount: pendingRes.count || 0,
            processingCount: processingRes.count || 0,
            needsDispatchCount: dispatchRes.count || 0,
            returnsCount: warehouseCountsRes.data?.returns || 0, // Pulls accurate backorder-safe data!
          }
        });
      } else {
        // Customer overdue queries...
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - 25); 
        let q = supabase.from('orders').select('*', { count: 'exact', head: true })
          .eq('status', 'delivered').eq('payment_status', 'unpaid').eq('payment_method', 'net_30').lte('created_at', threshold.toISOString());
        q = company_id ? q.eq('company_id', company_id) : q.eq('user_id', id);
        
        const results = await q;
        set({ badges: { ...get().badges, overdueCount: results.count || 0 } });
      }
    } catch (error) {
      console.error("Failed to fetch badges:", error);
    }
  },

  // 3. Optimized Realtime Subscription
  initRealtime: (profile) => {
    if (get().realtimeChannel) return; 
    
    const isStaff = ['admin', 'warehouse'].includes(profile.role);
    
    const filterString = isStaff 
      ? 'status=in.(pending,processing,ready_for_delivery,attempted,delivered_partial)' 
      : `user_id=eq.${profile.id}`;

    const channel = supabase.channel('optimized_orders_channel')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'orders',
        filter: filterString 
      }, (payload) => {
        get().fetchBadges(profile);
      })
      .subscribe();

    set({ realtimeChannel: channel });
  },

  cleanupRealtime: () => {
    const channel = get().realtimeChannel;
    if (channel) {
      supabase.removeChannel(channel);
      set({ realtimeChannel: null });
    }
  }
}));