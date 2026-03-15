import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { startDate, endDate, reportType, searchTerm } = await req.json()

    // 1. Initialize Supabase Admin Client to bypass RLS for background processing
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 2. Fetch the data (Supabase handles this massive query instantly on their servers)
    let query = supabaseAdmin.from('orders').select(`
      id, created_at, status, subtotal, shipping_amount, tax_amount, total_amount, company_id, patient_name,
      shipping_name, shipping_address, shipping_city, shipping_state, shipping_zip, companies ( name )
      ${reportType === 'itemized' ? `, order_items ( quantity_variants, unit_price, line_total, product_variants ( name, sku, products ( name, base_sku ) ) )` : ''}
    `)
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: false });

    if (searchTerm) {
      query = query.or(`id.ilike.%${searchTerm}%,shipping_name.ilike.%${searchTerm}%,patient_name.ilike.%${searchTerm}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    // 3. Build the CSV String
    let csvContent = "";
    if (reportType === 'itemized') {
      csvContent += "Order ID,Date,Customer / Agency,Patient Name,Product,Variant,SKU,Qty,Street Address,City,State,Zip Code\n";
      data.forEach(order => {
        const customer = order.company_id ? (order.companies?.name || 'Agency') : (order.shipping_name || 'Retail Customer');
        (order.order_items || []).forEach(item => {
          csvContent += `"${order.id.substring(0,8)}","${new Date(order.created_at).toLocaleDateString()}","${customer}","${order.patient_name || 'N/A'}","${item.product_variants?.products?.name || 'N/A'}","${item.product_variants?.name || 'N/A'}","${item.product_variants?.sku || 'N/A'}",${item.quantity_variants || 0},"${order.shipping_address || 'N/A'}","${order.shipping_city || 'N/A'}","${order.shipping_state || 'N/A'}","${order.shipping_zip || 'N/A'}"\n`;
        });
      });
    } else {
      csvContent += "Order ID,Date,Customer / Agency,Street Address,City,State,Zip Code,CA Sale?,Subtotal,Shipping,Tax Collected,Total\n";
      data.forEach(order => {
        const customer = order.company_id ? (order.companies?.name || 'Agency') : (order.shipping_name || 'Retail Customer');
        const isCA = ['ca', 'california'].includes((order.shipping_state || '').trim().toLowerCase()) ? 'Yes' : 'No';
        csvContent += `"${order.id.substring(0,8)}","${new Date(order.created_at).toLocaleDateString()}","${customer}","${order.shipping_address || 'N/A'}","${order.shipping_city || 'N/A'}","${order.shipping_state || 'N/A'}","${order.shipping_zip || 'N/A'}","${isCA}",${Number(order.subtotal||0).toFixed(2)},${Number(order.shipping_amount||0).toFixed(2)},${Number(order.tax_amount||0).toFixed(2)},${Number(order.total_amount||0).toFixed(2)}\n`;
      });
    }

    // 4. Upload to Supabase Storage Bucket
    const filename = `Tricore_${reportType}_${Date.now()}.csv`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('reports')
      .upload(filename, csvContent, { contentType: 'text/csv' });
      
    if (uploadError) throw uploadError;

    // 5. Generate a temporary, secure 60-second download URL
    const { data: signedUrlData, error: urlError } = await supabaseAdmin.storage
      .from('reports')
      .createSignedUrl(filename, 60);

    if (urlError) throw urlError;

    return new Response(JSON.stringify({ url: signedUrlData.signedUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})