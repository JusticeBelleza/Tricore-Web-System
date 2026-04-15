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
      // Call our new Postgres function! No more .reduce() on 10,000 rows.
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
      const queries = [];
      
      if (isStaff) {
        queries.push(
          supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'processing'),
          supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'ready_for_delivery'),
          supabase.from('orders').select('*', { count: 'exact', head: true }).in('status', ['attempted', 'delivered_partial']).is('is_restocked', false)
        );
      } else {
        // Customer overdue queries...
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - 25); 
        let q = supabase.from('orders').select('*', { count: 'exact', head: true })
          .eq('status', 'delivered').eq('payment_status', 'unpaid').eq('payment_method', 'net_30').lte('created_at', threshold.toISOString());
        q = company_id ? q.eq('company_id', company_id) : q.eq('user_id', id);
        queries.push(q);
      }

      const results = await Promise.all(queries);

      if (isStaff) {
        set({
          badges: {
            ...get().badges,
            pendingCount: results[0].count || 0,
            processingCount: results[1].count || 0,
            needsDispatchCount: results[2].count || 0,
            returnsCount: results[3].count || 0,
          }
        });
      } else {
        set({ badges: { ...get().badges, overdueCount: results[0].count || 0 } });
      }
    } catch (error) {
      console.error("Failed to fetch badges:", error);
    }
  },

  // 3. Optimized Realtime Subscription
  initRealtime: (profile) => {
    if (get().realtimeChannel) return; // Prevent duplicate sockets
    
    const isStaff = ['admin', 'warehouse'].includes(profile.role);
    
    // OPTIMIZATION: Only listen to what matters!
    // Customers only hear about their own orders. Staff only hear about actionable status changes.
    const filterString = isStaff 
      ? 'status=in.(pending,processing,ready_for_delivery,attempted)' 
      : `user_id=eq.${profile.id}`;

    const channel = supabase.channel('optimized_orders_channel')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'orders',
        filter: filterString // Stops the "Firehose" memory leak!
      }, (payload) => {
        // Silently update badges when relevant changes happen
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