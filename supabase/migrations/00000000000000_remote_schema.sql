


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "hypopg" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "index_advisor" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."account_type" AS ENUM (
    'B2B',
    'Retail'
);


ALTER TYPE "public"."account_type" OWNER TO "postgres";


CREATE TYPE "public"."movement_type" AS ENUM (
    'inbound',
    'outbound',
    'adjustment'
);


ALTER TYPE "public"."movement_type" OWNER TO "postgres";


CREATE TYPE "public"."order_status" AS ENUM (
    'pending',
    'approved',
    'picking',
    'packed',
    'out_for_delivery',
    'delivered',
    'processing',
    'shipped',
    'cancelled',
    'ready_for_delivery',
    'attempted',
    'restocked',
    'delivered_partial'
);


ALTER TYPE "public"."order_status" OWNER TO "postgres";


CREATE TYPE "public"."payment_method" AS ENUM (
    'net_30',
    'cod'
);


ALTER TYPE "public"."payment_method" OWNER TO "postgres";


CREATE TYPE "public"."payment_status" AS ENUM (
    'unpaid',
    'partial',
    'paid'
);


ALTER TYPE "public"."payment_status" OWNER TO "postgres";


CREATE TYPE "public"."po_status" AS ENUM (
    'draft',
    'sent',
    'confirmed',
    'receiving',
    'received',
    'cancelled'
);


ALTER TYPE "public"."po_status" OWNER TO "postgres";


CREATE TYPE "public"."rule_type" AS ENUM (
    'fixed',
    'percentage'
);


ALTER TYPE "public"."rule_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_order_item"("p_order_id" "uuid", "p_variant_id" "uuid", "p_qty" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_existing_item_id UUID;
    v_unit_price NUMERIC;
    v_product_id UUID;
    v_old_subtotal NUMERIC;
    v_old_tax NUMERIC;
    v_shipping NUMERIC;
    v_new_subtotal NUMERIC;
    v_tax_rate NUMERIC;
    v_new_tax NUMERIC;
    v_current_qty INTEGER;
BEGIN
    IF p_qty <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than 0.'; END IF;

    -- 1. Check if item already exists in the order
    SELECT id, quantity_variants INTO v_existing_item_id, v_current_qty 
    FROM order_items 
    WHERE order_id = p_order_id AND product_variant_id = p_variant_id AND status NOT IN ('cancelled', 'rejected') 
    LIMIT 1;

    -- 2. If it exists, just update the quantity safely
    IF v_existing_item_id IS NOT NULL THEN
        PERFORM public.edit_order_item(v_existing_item_id, v_current_qty + p_qty);
        RETURN;
    END IF;

    -- 3. If new item, fetch data and insert
    SELECT price, product_id INTO v_unit_price, v_product_id FROM product_variants WHERE id = p_variant_id;
    IF v_unit_price IS NULL THEN RAISE EXCEPTION 'Variant not found.'; END IF;

    -- Note: Your existing trigger 'on_order_item_insert' automatically handles the inventory deduction here!
    INSERT INTO order_items (order_id, product_variant_id, quantity_variants, total_base_units, unit_price, line_total, status)
    VALUES (p_order_id, p_variant_id, p_qty, p_qty, v_unit_price, p_qty * v_unit_price, 'active');

    -- 4. Recalculate Order Totals
    SELECT subtotal, tax_amount, shipping_amount INTO v_old_subtotal, v_old_tax, v_shipping FROM orders WHERE id = p_order_id;
    SELECT COALESCE(SUM(line_total), 0) INTO v_new_subtotal FROM order_items WHERE order_id = p_order_id AND status NOT IN ('cancelled', 'rejected');
    
    IF v_old_subtotal > 0 THEN v_tax_rate := v_old_tax / v_old_subtotal; ELSE v_tax_rate := 0; END IF;
    v_new_tax := v_new_subtotal * v_tax_rate;
    
    UPDATE orders SET subtotal = v_new_subtotal, tax_amount = v_new_tax, total_amount = v_new_subtotal + v_shipping + v_new_tax, updated_at = NOW() WHERE id = p_order_id;
END;
$$;


ALTER FUNCTION "public"."add_order_item"("p_order_id" "uuid", "p_variant_id" "uuid", "p_qty" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_user"("email" "text", "password" "text", "full_name" "text", "role" "text" DEFAULT 'patient'::"text", "contact_number" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  new_user_id uuid;
  encrypted_pw text;
BEGIN
  -- Now it knows exactly where to find gen_salt and crypt!
  encrypted_pw := crypt(password, gen_salt('bf'));

  -- Insert the user into the Supabase auth.users table
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', email, encrypted_pw, now(), 
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', full_name, 'role', role, 'contact_number', contact_number),
    now(), now()
  ) RETURNING id INTO new_user_id;

  -- Insert into auth.identities so they can actually log in
  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), new_user_id, new_user_id::text, 
    jsonb_build_object('sub', new_user_id::text, 'email', email), 
    'email', now(), now(), now()
  );

  RETURN new_user_id;
END;
$$;


ALTER FUNCTION "public"."admin_create_user"("email" "text", "password" "text", "full_name" "text", "role" "text", "contact_number" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_user"("user_email" "text", "user_password" "text", "user_full_name" "text", "user_role" "text", "user_contact" "text", "user_company_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  new_user_id uuid;
BEGIN
  -- Generate user ID locally
  new_user_id := gen_random_uuid();
  
  -- Insert into auth.users safely
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, 
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', new_user_id, 'authenticated', 'authenticated', 
    user_email, crypt(user_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'full_name', user_full_name, 
      'role', user_role, 
      'contact_number', user_contact, 
      'company_id', user_company_id
    ),
    now(), now()
  );
  
  -- Insert the identity
  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), new_user_id, new_user_id::text, 
    jsonb_build_object('sub', new_user_id::text, 'email', user_email), 
    'email', now(), now(), now()
  );

  RETURN new_user_id;
END;
$$;


ALTER FUNCTION "public"."admin_create_user"("user_email" "text", "user_password" "text", "user_full_name" "text", "user_role" "text", "user_contact" "text", "user_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_user"("user_email" "text", "user_password" "text", "user_full_name" "text", "user_role" "text", "user_contact" "text", "user_company_id" "uuid" DEFAULT NULL::"uuid", "new_company_name" "text" DEFAULT NULL::"text", "creating_admin_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  new_user_id uuid;
  final_company_id uuid := user_company_id;
  admin_role text;
BEGIN
  -- Security Check: Is the person trying to run this function actually an admin?
  IF creating_admin_id IS NOT NULL THEN
    SELECT role INTO admin_role FROM public.user_profiles WHERE id = creating_admin_id;
    IF admin_role NOT IN ('admin', 'agency_admin', 'b2b') THEN
      RAISE EXCEPTION 'Not authorized to create users.';
    END IF;
  END IF;

  -- Create the Company (if a Global Admin requested a new one)
  IF final_company_id IS NULL AND new_company_name IS NOT NULL AND new_company_name != '' THEN
    INSERT INTO public.companies (name) VALUES (new_company_name) RETURNING id INTO final_company_id;
  END IF;

  -- Generate ID
  new_user_id := gen_random_uuid();
  
  -- Insert into Auth
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, 
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', new_user_id, 'authenticated', 'authenticated', 
    user_email, crypt(user_password, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );
  
  -- Insert Identity
  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), new_user_id, new_user_id::text, jsonb_build_object('sub', new_user_id::text, 'email', user_email), 'email', now(), now(), now()
  );

  -- Insert Profile
  INSERT INTO public.user_profiles (id, full_name, email, contact_number, role, company_id, parent_user_id)
  VALUES (new_user_id, user_full_name, user_email, user_contact, user_role, final_company_id, creating_admin_id);

  RETURN new_user_id;
END;
$$;


ALTER FUNCTION "public"."admin_create_user"("user_email" "text", "user_password" "text", "user_full_name" "text", "user_role" "text", "user_contact" "text", "user_company_id" "uuid", "new_company_name" "text", "creating_admin_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_order"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  item RECORD;
BEGIN
  -- Loop through every item in the cancelled order
  FOR item IN 
    SELECT oi.quantity, pv.product_id, COALESCE(pv.multiplier, 1) as multiplier
    FROM order_items oi
    JOIN product_variants pv ON oi.variant_id = pv.id
    WHERE oi.order_id = p_order_id
  LOOP
    -- THE FIX: Restock the inventory using (Quantity × Multiplier)
    UPDATE inventory
    SET base_units_on_hand = base_units_on_hand + (item.quantity * item.multiplier)
    WHERE product_id = item.product_id;
  END LOOP;

  -- Update the main order status
  UPDATE orders SET status = 'cancelled' WHERE id = p_order_id;
END;
$$;


ALTER FUNCTION "public"."cancel_order"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_order_item"("p_item_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_variant_id uuid;
  v_product_id uuid;
  v_quantity integer;
  v_multiplier integer;
BEGIN
  -- 1. Get the variant_id and the quantity from the cancelled order item
  SELECT variant_id, quantity 
  INTO v_variant_id, v_quantity
  FROM order_items
  WHERE id = p_item_id;

  -- 2. Grab the correct multiplier and product_id from the product_variants table
  SELECT product_id, COALESCE(multiplier, 1) 
  INTO v_product_id, v_multiplier
  FROM product_variants
  WHERE id = v_variant_id;

  -- 3. THE FIX: Restock the inventory using the correct math (Quantity × Multiplier)
  UPDATE inventory
  SET base_units_on_hand = base_units_on_hand + (v_quantity * v_multiplier)
  WHERE product_id = v_product_id;

  -- 4. Mark the specific order item as cancelled
  UPDATE order_items 
  SET status = 'cancelled' 
  WHERE id = p_item_id;
  
END;
$$;


ALTER FUNCTION "public"."cancel_order_item"("p_item_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_order_item"("p_item_id" "uuid", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_variant_id uuid;
  v_product_id uuid;
  v_quantity integer;
  v_multiplier integer;
BEGIN
  -- 1. Grab the quantity and variant from the cancelled order item
  SELECT variant_id, quantity_variants 
  INTO v_variant_id, v_quantity
  FROM order_items
  WHERE id = p_item_id;

  -- 2. Grab the multiplier from the product_variants table
  SELECT product_id, COALESCE(multiplier, 1) 
  INTO v_product_id, v_multiplier
  FROM product_variants
  WHERE id = v_variant_id;

  -- 3. THE FIX: Update inventory using Quantity × Multiplier
  UPDATE inventory
  SET base_units_on_hand = base_units_on_hand + (v_quantity * v_multiplier)
  WHERE product_id = v_product_id;

  -- 4. Mark the item as cancelled with the provided reason
  UPDATE order_items 
  SET status = 'cancelled',
      cancellation_reason = p_reason
  WHERE id = p_item_id;
  
END;
$$;


ALTER FUNCTION "public"."cancel_order_item"("p_item_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_delivery"("p_order_id" "uuid", "p_signature_url" "text", "p_photo_url" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  item RECORD;
  v_product_id UUID;
BEGIN
  -- 1. Mark order as delivered and attach proof
  UPDATE orders
  SET status = 'delivered',
      signature_url = p_signature_url,
      photo_url = p_photo_url
  WHERE id = p_order_id;

  -- 2. Loop through each item in the order to deduct inventory
  FOR item IN SELECT product_variant_id, total_base_units FROM order_items WHERE order_id = p_order_id LOOP
     
     -- Get the base product ID from the variant
     SELECT product_id INTO v_product_id FROM product_variants WHERE id = item.product_variant_id;

     -- Deduct from inventory
     UPDATE inventory
     SET base_units_on_hand = base_units_on_hand - item.total_base_units
     WHERE product_id = v_product_id;

     -- Record the outbound stock movement
     INSERT INTO stock_movements (product_id, movement_type, quantity, notes)
     VALUES (v_product_id, 'outbound', item.total_base_units, 'Delivered Order: ' || p_order_id);
     
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."complete_delivery"("p_order_id" "uuid", "p_signature_url" "text", "p_photo_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deduct_inventory"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  target_product_id UUID;
BEGIN
  -- Find the parent product_id connected to this variant
  SELECT product_id INTO target_product_id
  FROM product_variants
  WHERE id = NEW.product_variant_id;

  -- Deduct the ordered amount from the inventory table
  UPDATE inventory
  SET base_units_on_hand = base_units_on_hand - NEW.total_base_units
  WHERE product_id = target_product_id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."deduct_inventory"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deduct_inventory"("order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    item RECORD;
    v_product_id uuid;
    v_total_base_units integer;
BEGIN
    -- Loop through all items that were just placed in this order
    FOR item IN 
        SELECT 
            oi.product_variant_id, 
            oi.quantity_variants,
            pv.product_id
        FROM public.order_items oi
        JOIN public.product_variants pv ON oi.product_variant_id = pv.id
        WHERE oi.order_id = deduct_inventory.order_id
    LOOP
        v_product_id := item.product_id;
        v_total_base_units := item.quantity_variants;

        -- A. Deduct from the live inventory
        UPDATE public.inventory
        SET base_units_on_hand = base_units_on_hand - v_total_base_units
        WHERE product_id = v_product_id;

        -- B. Log the history using the exact correct column name: quantity
        INSERT INTO public.stock_movements (
            product_id,
            variant_id,
            quantity,           -- 🚀 FIXED: Changed to 'quantity'
            movement_type,
            notes
        ) VALUES (
            v_product_id,
            item.product_variant_id,
            -v_total_base_units, 
            'sale',
            'Order Placed: ' || deduct_inventory.order_id::text
        );
    END LOOP;
END;
$$;


ALTER FUNCTION "public"."deduct_inventory"("order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_user"("user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- 1. Delete their profile record first
  DELETE FROM public.user_profiles WHERE id = user_id;
  
  -- 2. Delete their actual login account permanently from the secure auth system
  DELETE FROM auth.users WHERE id = user_id;
END;
$$;


ALTER FUNCTION "public"."delete_user"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."edit_order_item"("p_item_id" "uuid", "p_new_qty" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_order_id UUID;
    v_variant_id UUID;
    v_old_qty INTEGER;
    v_unit_price NUMERIC;
    v_product_id UUID;
    v_qty_diff INTEGER;
    v_old_subtotal NUMERIC;
    v_old_tax NUMERIC;
    v_shipping NUMERIC;
    v_new_subtotal NUMERIC;
    v_tax_rate NUMERIC;
    v_new_tax NUMERIC;
BEGIN
    IF p_new_qty <= 0 THEN
        RAISE EXCEPTION 'Quantity must be greater than 0.';
    END IF;

    -- 1. Safely lock and get Item Info
    SELECT order_id, product_variant_id, quantity_variants, unit_price
    INTO v_order_id, v_variant_id, v_old_qty, v_unit_price
    FROM order_items WHERE id = p_item_id AND status NOT IN ('cancelled', 'rejected')
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item not found or cannot be edited.';
    END IF;

    -- 2. Adjust Inventory dynamically based on the difference
    v_qty_diff := p_new_qty - v_old_qty;
    SELECT product_id INTO v_product_id FROM product_variants WHERE id = v_variant_id;
    UPDATE inventory SET base_units_on_hand = base_units_on_hand - v_qty_diff WHERE product_id = v_product_id;

    -- 3. Update Item Totals
    UPDATE order_items 
    SET quantity_variants = p_new_qty, 
        total_base_units = p_new_qty, 
        line_total = p_new_qty * v_unit_price
    WHERE id = p_item_id;

    -- 4. Recalculate Order Totals
    SELECT subtotal, tax_amount, shipping_amount INTO v_old_subtotal, v_old_tax, v_shipping FROM orders WHERE id = v_order_id;
    SELECT COALESCE(SUM(line_total), 0) INTO v_new_subtotal FROM order_items WHERE order_id = v_order_id AND status NOT IN ('cancelled', 'rejected');
    
    IF v_old_subtotal > 0 THEN v_tax_rate := v_old_tax / v_old_subtotal; ELSE v_tax_rate := 0; END IF;
    v_new_tax := v_new_subtotal * v_tax_rate;
    
    UPDATE orders SET subtotal = v_new_subtotal, tax_amount = v_new_tax, total_amount = v_new_subtotal + v_shipping + v_new_tax, updated_at = NOW() WHERE id = v_order_id;
END;
$$;


ALTER FUNCTION "public"."edit_order_item"("p_item_id" "uuid", "p_new_qty" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_product_tab_counts"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_all_count INT;
  v_low_stock_count INT;
  v_out_of_stock_count INT;
BEGIN
  -- Count 1: All Products
  SELECT COUNT(*) INTO v_all_count
  FROM products;

  -- Count 2: Low Stock (1 to 10 items)
  SELECT COUNT(p.id) INTO v_low_stock_count
  FROM products p
  INNER JOIN inventory i ON p.id = i.product_id
  WHERE i.base_units_on_hand > 0 AND i.base_units_on_hand <= 10;

  -- Count 3: Out of Stock (0 or less)
  SELECT COUNT(p.id) INTO v_out_of_stock_count
  FROM products p
  INNER JOIN inventory i ON p.id = i.product_id
  WHERE i.base_units_on_hand <= 0;

  RETURN json_build_object(
    'all', v_all_count,
    'low_stock', v_low_stock_count,
    'out_of_stock', v_out_of_stock_count
  );
END;
$$;


ALTER FUNCTION "public"."get_admin_product_tab_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_metrics"("p_start_date" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_end_date" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role TEXT := get_user_role();
    v_company_id UUID := get_my_company_id();
    
    v_total_spend NUMERIC := 0;
    v_filtered_revenue NUMERIC := 0;
    v_outstanding NUMERIC := 0;
BEGIN
    -- A. Calculate Lifetime Total Spend / Revenue
    -- 🚀 FIX: Added status filter so we don't count cancelled/pending orders
    SELECT COALESCE(SUM(total_amount), 0) INTO v_total_spend
    FROM public.orders
    WHERE 
        status IN ('delivered', 'delivered_partial') AND
        (
            (v_role IN ('admin', 'warehouse')) OR 
            (v_role IN ('b2b', 'agency_admin') AND company_id = v_company_id) OR
            (v_role = 'retail' AND user_id = v_user_id)
        );

    -- B. Calculate Filtered Revenue (Honors the date picker)
    -- 🚀 FIX: Added status filter so we don't count cancelled/pending orders
    SELECT COALESCE(SUM(total_amount), 0) INTO v_filtered_revenue
    FROM public.orders
    WHERE 
        status IN ('delivered', 'delivered_partial') AND
        (p_start_date IS NULL OR created_at >= p_start_date) AND
        (p_end_date IS NULL OR created_at <= p_end_date) AND
        (
            (v_role IN ('admin', 'warehouse')) OR 
            (v_role IN ('b2b', 'agency_admin') AND company_id = v_company_id) OR
            (v_role = 'retail' AND user_id = v_user_id)
        );

    -- C. Calculate Outstanding Balance (Unpaid Net-30 Delivered Orders)
    -- Note: This one already had the status = 'delivered' filter!
    SELECT COALESCE(SUM(total_amount), 0) INTO v_outstanding
    FROM public.orders
    WHERE status = 'delivered' 
        AND payment_status = 'unpaid' 
        AND payment_method = 'net_30'
        AND (
            (v_role IN ('admin', 'warehouse')) OR 
            (v_role IN ('b2b', 'agency_admin') AND company_id = v_company_id) OR
            (v_role = 'retail' AND user_id = v_user_id)
        );

    -- Return as a cleanly formatted JSON object to the frontend
    RETURN json_build_object(
        'totalSpend', v_total_spend,
        'filteredRevenue', v_filtered_revenue,
        'outstanding', v_outstanding
    );
END;
$$;


ALTER FUNCTION "public"."get_dashboard_metrics"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dispatch_tab_counts"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_needs_dispatch INT;
  v_in_transit INT;
  v_delivered INT;
  v_cancelled INT;
BEGIN
  -- Count 1: Needs Dispatch (Ready for delivery)
  SELECT COUNT(*) INTO v_needs_dispatch
  FROM orders
  WHERE status = 'ready_for_delivery';

  -- Count 2: In Transit (Shipped or Out for Delivery)
  SELECT COUNT(*) INTO v_in_transit
  FROM orders
  WHERE status IN ('shipped', 'out_for_delivery');

  -- Count 3: Delivered
  SELECT COUNT(*) INTO v_delivered
  FROM orders
  WHERE status = 'delivered';

  -- Count 4: Cancelled/Exceptions
  SELECT COUNT(*) INTO v_cancelled
  FROM orders
  WHERE status = 'cancelled';

  RETURN json_build_object(
    'needs_dispatch', v_needs_dispatch,
    'in_transit', v_in_transit,
    'delivered', v_delivered,
    'cancelled', v_cancelled
  );
END;
$$;


ALTER FUNCTION "public"."get_dispatch_tab_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_company_id"() RETURNS "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT company_id FROM user_profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_company_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_order_tab_counts"("p_last_viewed_pending" timestamp with time zone DEFAULT '1970-01-01 00:00:00+00'::timestamp with time zone) RETURNS json
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT json_build_object(
    'pending', COUNT(*) FILTER (WHERE status = 'pending'),
    'newPending', COUNT(*) FILTER (WHERE status = 'pending' AND created_at > p_last_viewed_pending),
    'processing', COUNT(*) FILTER (WHERE status = 'processing'),
    'shipped', COUNT(*) FILTER (WHERE status = 'shipped'),
    'attempted', COUNT(*) FILTER (WHERE status = 'attempted'),
    
    -- Completed (Unpaid Delivered Orders)
    'completed', COUNT(*) FILTER (WHERE status IN ('delivered', 'delivered_partial') AND payment_status = 'unpaid'),
    
    -- Due (Net-30 Orders older than 25 days)
    'due', COUNT(*) FILTER (WHERE status IN ('delivered', 'delivered_partial') AND payment_method = 'net_30' AND payment_status = 'unpaid' AND created_at <= (now() - interval '25 days')),
    
    'paid', COUNT(*) FILTER (WHERE payment_status = 'paid'),
    'cancelled', COUNT(*) FILTER (WHERE status = 'cancelled'),
    
    -- Restocked Orders
    'restocked', COUNT(*) FILTER (WHERE is_restocked = true AND processing_at IS NOT NULL)
  ) 
  FROM public.orders;
$$;


ALTER FUNCTION "public"."get_order_tab_counts"("p_last_viewed_pending" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_profitability_report"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_search" "text") RETURNS TABLE("id" "uuid", "name" "text", "sku" "text", "totalQty" bigint, "totalRevenue" numeric, "totalCogs" numeric, "grossProfit" numeric, "margin" numeric)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pv.id,
    p.name AS name,
    COALESCE(pv.sku, p.base_sku) AS sku,
    SUM(oi.quantity_variants)::bigint AS "totalQty",
    SUM(oi.line_total)::numeric AS "totalRevenue",
    SUM(oi.quantity_variants * COALESCE(pv.cost_price, 0))::numeric AS "totalCogs",
    SUM(oi.line_total - (oi.quantity_variants * COALESCE(pv.cost_price, 0)))::numeric AS "grossProfit",
    CASE 
      WHEN SUM(oi.line_total) > 0 THEN 
        ((SUM(oi.line_total) - SUM(oi.quantity_variants * COALESCE(pv.cost_price, 0))) / SUM(oi.line_total) * 100)::numeric
      ELSE 0::numeric 
    END AS margin
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.id
  JOIN product_variants pv ON oi.product_variant_id = pv.id
  JOIN products p ON pv.product_id = p.id
  WHERE o.status IN ('delivered', 'delivered_partial')
    AND oi.status NOT IN ('cancelled', 'rejected')
    AND o.created_at >= p_start_date
    AND o.created_at <= p_end_date
    AND (p_search = '' OR p.name ILIKE '%' || p_search || '%' OR pv.sku ILIKE '%' || p_search || '%')
  GROUP BY pv.id, p.name, COALESCE(pv.sku, p.base_sku)
  ORDER BY "totalRevenue" DESC;
END;
$$;


ALTER FUNCTION "public"."get_profitability_report"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_search" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unique_categories"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN (
    SELECT json_agg(category)
    FROM (
      SELECT DISTINCT category 
      FROM products 
      WHERE category IS NOT NULL 
      ORDER BY category
    ) as sub
  );
END;
$$;


ALTER FUNCTION "public"."get_unique_categories"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_warehouse_tab_counts"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_processing_count INT;
  v_completed_count INT;
  v_returns_count INT;
BEGIN
  -- Count 1: Processing
  SELECT COUNT(*) INTO v_processing_count
  FROM orders
  WHERE status = 'processing';

  -- Count 2: Completed (Ready or Shipped)
  SELECT COUNT(*) INTO v_completed_count
  FROM orders
  WHERE status IN ('ready_for_delivery', 'shipped');

  -- Count 3: Returns
  SELECT COUNT(*) INTO v_returns_count
  FROM orders
  WHERE status IN ('attempted', 'delivered_partial')
  AND is_restocked = false;

  RETURN json_build_object(
    'processing', v_processing_count,
    'completed', v_completed_count,
    'returns', v_returns_count
  );
END;
$$;


ALTER FUNCTION "public"."get_warehouse_tab_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_social_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Check if a profile already exists for this user ID
  -- (This prevents overwriting existing admins who might log in with Google)
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = NEW.id) THEN
    INSERT INTO public.user_profiles (id, email, full_name, role, status)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'Google User'),
      'retail', -- 🚀 FORCE THE ROLE TO RETAIL
      'active'
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_social_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    -- Grab the name from Google, or fallback to 'New User'
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'New User'),
    -- THE MAGIC LINE: If a role is provided (like your manual signups), use it. 
    -- If NO role is provided (like Google), FORCE it to be 'retail'.
    COALESCE(NEW.raw_user_meta_data->>'role', 'retail'),
    'active'
  )
  -- If the profile somehow already exists, override 'user' to 'retail'
  ON CONFLICT (id) DO UPDATE 
  SET role = 'retail' 
  WHERE public.user_profiles.role = 'user' OR public.user_profiles.role IS NULL;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_secure_profile_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- If the person trying to save the data isn't ALREADY an admin in the database...
  IF (SELECT role FROM public.user_profiles WHERE id = auth.uid()) != 'admin' THEN
    -- ...THEN ignore their attempt to change 'role' or 'company_id'
    NEW.role = OLD.role;
    NEW.company_id = OLD.company_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_secure_profile_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."receive_purchase_order"("p_po_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  item RECORD;
BEGIN
  -- Mark the PO as received
  UPDATE purchase_orders SET status = 'received' WHERE id = p_po_id;

  -- Loop through each item in the PO to add to inventory
  FOR item IN SELECT product_id, quantity FROM purchase_order_items WHERE purchase_order_id = p_po_id LOOP
     
     -- Add to inventory
     UPDATE inventory
     SET base_units_on_hand = base_units_on_hand + item.quantity
     WHERE product_id = item.product_id;

     -- Record the inbound stock movement
     INSERT INTO stock_movements (product_id, movement_type, quantity, notes)
     VALUES (item.product_id, 'inbound', item.quantity, 'Received PO: ' || p_po_id);
     
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."receive_purchase_order"("p_po_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restock_inventory_on_cancel"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  item RECORD;
  target_product_id UUID;
BEGIN
  -- If the order status just changed to 'cancelled' or 'rejected'
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    
    -- Loop through every item that was in this cancelled order
    FOR item IN SELECT * FROM order_items WHERE order_id = NEW.id LOOP
      
      -- Find the parent product
      SELECT product_id INTO target_product_id
      FROM product_variants
      WHERE id = item.product_variant_id;

      -- Add the inventory back!
      UPDATE inventory
      SET base_units_on_hand = base_units_on_hand + item.total_base_units
      WHERE product_id = target_product_id;

    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."restock_inventory_on_cancel"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."agency_patients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agency_id" "uuid",
    "full_name" "text" NOT NULL,
    "email" "text",
    "contact_number" "text",
    "address" "text",
    "city" "text",
    "state" "text",
    "zip" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "status" "text" DEFAULT 'active'::"text",
    "archive_reason" "text"
);


ALTER TABLE "public"."agency_patients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "account_type" "public"."account_type" DEFAULT 'Retail'::"public"."account_type",
    "credit_limit" numeric(10,2) DEFAULT 0.00,
    "outstanding_balance" numeric(10,2) DEFAULT 0.00,
    "shipping_fee" numeric(10,2) DEFAULT 0.00,
    "tax_exempt" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "address" "text",
    "city" "text",
    "state" "text",
    "zip" "text",
    "phone" "text",
    "email" "text"
);


ALTER TABLE "public"."companies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory" (
    "product_id" "uuid" NOT NULL,
    "base_units_on_hand" integer DEFAULT 0,
    "base_units_reserved" integer DEFAULT 0,
    "reorder_point" integer DEFAULT 0
);


ALTER TABLE "public"."inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid",
    "product_variant_id" "uuid",
    "quantity_variants" integer NOT NULL,
    "total_base_units" integer NOT NULL,
    "unit_price" numeric(10,2) NOT NULL,
    "line_total" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "cancellation_reason" "text"
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid",
    "status" "public"."order_status" DEFAULT 'pending'::"public"."order_status",
    "payment_method" "public"."payment_method",
    "payment_status" "public"."payment_status" DEFAULT 'unpaid'::"public"."payment_status",
    "subtotal" numeric(10,2) DEFAULT 0.00,
    "tax_amount" numeric(10,2) DEFAULT 0.00,
    "shipping_amount" numeric(10,2) DEFAULT 0.00,
    "total_amount" numeric(10,2) DEFAULT 0.00,
    "signature_url" "text",
    "photo_url" "text",
    "assigned_driver_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid",
    "customer_name" "text",
    "patient_name" "text",
    "driver_name" "text",
    "vehicle_name" "text",
    "vehicle_model" "text",
    "vehicle_year" "text",
    "vehicle_vin" "text",
    "vehicle_license" "text",
    "patient_id" "uuid",
    "shipping_name" "text",
    "shipping_address" "text",
    "shipping_city" "text",
    "shipping_state" "text",
    "shipping_zip" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "shipping_email" "text",
    "shipping_phone" "text",
    "received_by" "text",
    "cancellation_reason" "text",
    "processing_at" timestamp without time zone,
    "shipped_at" timestamp without time zone,
    "delivered_at" timestamp without time zone,
    "cancelled_at" timestamp without time zone,
    "is_restocked" boolean DEFAULT false
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pricing_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid",
    "product_id" "uuid",
    "rule_type" "public"."rule_type" NOT NULL,
    "value" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "variant_id" "uuid"
);


ALTER TABLE "public"."pricing_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_variants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid",
    "name" "text" NOT NULL,
    "multiplier" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sku" "text",
    "price" numeric(10,2),
    "unit_cost" numeric(10,2) DEFAULT 0.00
);


ALTER TABLE "public"."product_variants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "base_sku" "text" NOT NULL,
    "name" "text" NOT NULL,
    "base_unit_name" "text" NOT NULL,
    "retail_base_price" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "description" "text",
    "manufacturer" "text",
    "category" "text",
    "continue_selling" boolean DEFAULT false,
    "image_urls" "text"[] DEFAULT '{}'::"text"[],
    "unit_cost" numeric(10,2) DEFAULT 0.00
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "role" "text" DEFAULT 'user'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "company_id" "uuid",
    "email" "text",
    "contact_number" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "po_id" "uuid",
    "description" "text" NOT NULL,
    "sku" "text",
    "quantity" integer DEFAULT 1,
    "unit_cost" numeric DEFAULT 0,
    "line_total" numeric DEFAULT 0
);


ALTER TABLE "public"."purchase_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "po_number" "text" NOT NULL,
    "supplier_name" "text" NOT NULL,
    "supplier_email" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "expected_delivery" "date",
    "total_amount" numeric DEFAULT 0,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."purchase_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid",
    "movement_type" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "variant_id" "uuid",
    "quantity_change" integer
);


ALTER TABLE "public"."stock_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tax_rates" (
    "State" "text",
    "ZipCode" "text" NOT NULL,
    "TaxRegionName" "text",
    "EstimatedCombinedRate" numeric DEFAULT 0,
    "StateRate" numeric DEFAULT 0,
    "EstimatedCountyRate" numeric DEFAULT 0,
    "EstimatedCityRate" numeric DEFAULT 0,
    "EstimatedSpecialRate" numeric DEFAULT 0,
    "RiskLevel" integer
);


ALTER TABLE "public"."tax_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "company_id" "uuid",
    "role" "text" NOT NULL,
    "full_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "email" "text",
    "contact_number" "text",
    "parent_user_id" "uuid",
    "address" "text",
    "city" "text",
    "state" "text",
    "zip" "text",
    "license_number" "text",
    "license_expiry" "date",
    "updated_at" timestamp with time zone,
    "billing_address" "text",
    "billing_city" "text",
    "billing_state" "text",
    "billing_zip" "text",
    "current_lat" numeric,
    "current_lng" numeric,
    "last_location_update" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text",
    CONSTRAINT "user_profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'warehouse'::"text", 'driver'::"text", 'b2b'::"text", 'agency_admin'::"text", 'retail'::"text", 'user'::"text", 'patient'::"text"])))
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "make" "text",
    "model" "text",
    "year" "text",
    "vin" "text",
    "license_plate" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."vehicles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."agency_patients"
    ADD CONSTRAINT "agency_patients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("product_id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_rules"
    ADD CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_base_sku_key" UNIQUE ("base_sku");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_po_number_key" UNIQUE ("po_number");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tax_rates"
    ADD CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("ZipCode");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_agency_patients_agency_id" ON "public"."agency_patients" USING "btree" ("agency_id");



CREATE INDEX "idx_companies_name_trgm" ON "public"."companies" USING "gin" ("name" "extensions"."gin_trgm_ops");



CREATE INDEX "idx_order_items_order_id" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_order_items_product_variant_id" ON "public"."order_items" USING "btree" ("product_variant_id");



CREATE INDEX "idx_orders_assigned_driver_id" ON "public"."orders" USING "btree" ("assigned_driver_id");



CREATE INDEX "idx_orders_company_id" ON "public"."orders" USING "btree" ("company_id");



CREATE INDEX "idx_orders_created_at" ON "public"."orders" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_orders_patient_id" ON "public"."orders" USING "btree" ("patient_id");



CREATE INDEX "idx_orders_payment_status" ON "public"."orders" USING "btree" ("payment_status", "payment_method");



CREATE INDEX "idx_orders_shipping_name_trgm" ON "public"."orders" USING "gin" ("shipping_name" "extensions"."gin_trgm_ops");



CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "idx_orders_updated_at" ON "public"."orders" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_orders_user_id" ON "public"."orders" USING "btree" ("user_id");



CREATE INDEX "idx_pricing_rules_company_id" ON "public"."pricing_rules" USING "btree" ("company_id");



CREATE INDEX "idx_pricing_rules_product_id" ON "public"."pricing_rules" USING "btree" ("product_id");



CREATE INDEX "idx_pricing_rules_variant_id" ON "public"."pricing_rules" USING "btree" ("variant_id");



CREATE INDEX "idx_product_variants_product_id" ON "public"."product_variants" USING "btree" ("product_id");



CREATE INDEX "idx_products_base_sku_trgm" ON "public"."products" USING "gin" ("base_sku" "extensions"."gin_trgm_ops");



CREATE INDEX "idx_products_name_trgm" ON "public"."products" USING "gin" ("name" "extensions"."gin_trgm_ops");



CREATE INDEX "idx_profiles_company_id" ON "public"."profiles" USING "btree" ("company_id");



CREATE INDEX "idx_purchase_order_items_po_id" ON "public"."purchase_order_items" USING "btree" ("po_id");



CREATE INDEX "idx_stock_movements_product_id" ON "public"."stock_movements" USING "btree" ("product_id");



CREATE INDEX "idx_user_profiles_company_id" ON "public"."user_profiles" USING "btree" ("company_id");



CREATE INDEX "idx_user_profiles_parent_user_id" ON "public"."user_profiles" USING "btree" ("parent_user_id");



CREATE INDEX "idx_user_profiles_role" ON "public"."user_profiles" USING "btree" ("role");



CREATE OR REPLACE TRIGGER "enforce_profile_security" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_secure_profile_columns"();



CREATE OR REPLACE TRIGGER "on_order_cancelled" AFTER UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."restock_inventory_on_cancel"();



CREATE OR REPLACE TRIGGER "on_order_item_insert" AFTER INSERT ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."deduct_inventory"();



ALTER TABLE ONLY "public"."agency_patients"
    ADD CONSTRAINT "agency_patients_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_assigned_driver_id_fkey" FOREIGN KEY ("assigned_driver_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."agency_patients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."pricing_rules"
    ADD CONSTRAINT "pricing_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pricing_rules"
    ADD CONSTRAINT "pricing_rules_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pricing_rules"
    ADD CONSTRAINT "pricing_rules_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id");



ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



CREATE POLICY "Agency staff manage their own patients" ON "public"."agency_patients" TO "authenticated" USING (((("agency_id" = "public"."get_my_company_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['b2b'::"text", 'agency_admin'::"text"]))) OR ("public"."get_user_role"() = 'admin'::"text"))) WITH CHECK (((("agency_id" = "public"."get_my_company_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['b2b'::"text", 'agency_admin'::"text"]))) OR ("public"."get_user_role"() = 'admin'::"text")));



CREATE POLICY "Anyone can view products" ON "public"."products" FOR SELECT USING (true);



CREATE POLICY "Anyone can view tax rates" ON "public"."tax_rates" FOR SELECT USING (true);



CREATE POLICY "Anyone can view variants" ON "public"."product_variants" FOR SELECT USING (true);



CREATE POLICY "Delete order items" ON "public"."order_items" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Delete orders" ON "public"."orders" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Everyone can update inventory" ON "public"."inventory" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text", 'retail'::"text", 'b2b'::"text", 'driver'::"text"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text", 'retail'::"text", 'b2b'::"text", 'driver'::"text"])));



CREATE POLICY "Insert order items" ON "public"."order_items" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text", 'driver'::"text"])) OR (EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_items"."order_id") AND (("orders"."user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("orders"."company_id" = "public"."get_my_company_id"())))))));



CREATE POLICY "Insert orders" ON "public"."orders" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])) OR (("public"."get_user_role"() = 'retail'::"text") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))) OR (("public"."get_user_role"() = ANY (ARRAY['b2b'::"text", 'agency_admin'::"text"])) AND ("company_id" = "public"."get_my_company_id"()))));



CREATE POLICY "Logged in users can view inventory" ON "public"."inventory" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Only staff can delete inventory" ON "public"."inventory" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Only staff can insert inventory" ON "public"."inventory" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Staff and drivers view vehicles" ON "public"."vehicles" FOR SELECT TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text", 'driver'::"text"])));



CREATE POLICY "Staff can insert stock movements" ON "public"."stock_movements" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Staff delete companies" ON "public"."companies" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Staff delete pricing rules" ON "public"."pricing_rules" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Staff delete products" ON "public"."products" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Staff delete tax rates" ON "public"."tax_rates" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Staff delete variants" ON "public"."product_variants" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Staff delete vehicles" ON "public"."vehicles" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Staff insert companies" ON "public"."companies" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Staff insert pricing rules" ON "public"."pricing_rules" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Staff insert products" ON "public"."products" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Staff insert tax rates" ON "public"."tax_rates" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Staff insert variants" ON "public"."product_variants" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Staff insert vehicles" ON "public"."vehicles" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Staff manage PO Items" ON "public"."purchase_order_items" TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Staff manage POs" ON "public"."purchase_orders" TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Staff update companies" ON "public"."companies" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Staff update pricing rules" ON "public"."pricing_rules" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Staff update products" ON "public"."products" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Staff update tax rates" ON "public"."tax_rates" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Staff update variants" ON "public"."product_variants" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Staff update vehicles" ON "public"."vehicles" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])));



CREATE POLICY "Update order items" ON "public"."order_items" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text", 'driver'::"text"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text", 'driver'::"text"])));



CREATE POLICY "Update orders" ON "public"."orders" FOR UPDATE TO "authenticated" USING ((("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text", 'driver'::"text"])) OR (("public"."get_user_role"() = 'retail'::"text") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))) OR (("public"."get_user_role"() = ANY (ARRAY['b2b'::"text", 'agency_admin'::"text"])) AND ("company_id" = "public"."get_my_company_id"())))) WITH CHECK ((("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text", 'driver'::"text"])) OR (("public"."get_user_role"() = 'retail'::"text") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))) OR (("public"."get_user_role"() = ANY (ARRAY['b2b'::"text", 'agency_admin'::"text"])) AND ("company_id" = "public"."get_my_company_id"()))));



CREATE POLICY "Update profiles" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "id") OR ("public"."get_user_role"() = 'admin'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "id") OR ("public"."get_user_role"() = 'admin'::"text")));



CREATE POLICY "Update user profiles" ON "public"."user_profiles" FOR UPDATE TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR ("public"."get_user_role"() = 'admin'::"text") OR (("public"."get_user_role"() = 'agency_admin'::"text") AND ("company_id" = "public"."get_my_company_id"())))) WITH CHECK ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR ("public"."get_user_role"() = 'admin'::"text") OR (("public"."get_user_role"() = 'agency_admin'::"text") AND ("company_id" = "public"."get_my_company_id"()))));



CREATE POLICY "Users can view relevant companies" ON "public"."companies" FOR SELECT TO "authenticated" USING ((("id" = "public"."get_my_company_id"()) OR ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"]))));



CREATE POLICY "View order items" ON "public"."order_items" FOR SELECT TO "authenticated" USING ((("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text", 'driver'::"text"])) OR (EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_items"."order_id") AND (("orders"."user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("orders"."company_id" = "public"."get_my_company_id"())))))));



CREATE POLICY "View orders" ON "public"."orders" FOR SELECT TO "authenticated" USING ((("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text", 'driver'::"text"])) OR (("public"."get_user_role"() = 'retail'::"text") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))) OR (("public"."get_user_role"() = ANY (ARRAY['b2b'::"text", 'agency_admin'::"text"])) AND ("company_id" = "public"."get_my_company_id"()))));



CREATE POLICY "View pricing rules" ON "public"."pricing_rules" FOR SELECT TO "authenticated" USING ((("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])) OR (("public"."get_user_role"() = ANY (ARRAY['b2b'::"text", 'agency_admin'::"text"])) AND ("company_id" = "public"."get_my_company_id"()))));



CREATE POLICY "View profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "View user profiles" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'warehouse'::"text"])) OR (("company_id" IS NOT NULL) AND ("company_id" = "public"."get_my_company_id"())) OR ("role" = 'driver'::"text")));



ALTER TABLE "public"."agency_patients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pricing_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_variants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tax_rates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";























































































































































































































































































REVOKE ALL ON FUNCTION "public"."add_order_item"("p_order_id" "uuid", "p_variant_id" "uuid", "p_qty" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_order_item"("p_order_id" "uuid", "p_variant_id" "uuid", "p_qty" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_order_item"("p_order_id" "uuid", "p_variant_id" "uuid", "p_qty" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_create_user"("email" "text", "password" "text", "full_name" "text", "role" "text", "contact_number" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_create_user"("email" "text", "password" "text", "full_name" "text", "role" "text", "contact_number" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_create_user"("user_email" "text", "user_password" "text", "user_full_name" "text", "user_role" "text", "user_contact" "text", "user_company_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_create_user"("user_email" "text", "user_password" "text", "user_full_name" "text", "user_role" "text", "user_contact" "text", "user_company_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_create_user"("user_email" "text", "user_password" "text", "user_full_name" "text", "user_role" "text", "user_contact" "text", "user_company_id" "uuid", "new_company_name" "text", "creating_admin_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_create_user"("user_email" "text", "user_password" "text", "user_full_name" "text", "user_role" "text", "user_contact" "text", "user_company_id" "uuid", "new_company_name" "text", "creating_admin_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_order"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_order"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_order"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_order_item"("p_item_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_order_item"("p_item_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_order_item"("p_item_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_order_item"("p_item_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_order_item"("p_item_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_order_item"("p_item_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_delivery"("p_order_id" "uuid", "p_signature_url" "text", "p_photo_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_delivery"("p_order_id" "uuid", "p_signature_url" "text", "p_photo_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_delivery"("p_order_id" "uuid", "p_signature_url" "text", "p_photo_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."deduct_inventory"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."deduct_inventory"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."deduct_inventory"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."deduct_inventory"("order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."deduct_inventory"("order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."deduct_inventory"("order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_user"("user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_user"("user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."edit_order_item"("p_item_id" "uuid", "p_new_qty" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."edit_order_item"("p_item_id" "uuid", "p_new_qty" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."edit_order_item"("p_item_id" "uuid", "p_new_qty" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_admin_product_tab_counts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_product_tab_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_product_tab_counts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_dashboard_metrics"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_dashboard_metrics"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_metrics"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_dispatch_tab_counts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_dispatch_tab_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dispatch_tab_counts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_company_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_company_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_company_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_order_tab_counts"("p_last_viewed_pending" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_order_tab_counts"("p_last_viewed_pending" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_order_tab_counts"("p_last_viewed_pending" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_profitability_report"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_search" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_profitability_report"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_search" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_profitability_report"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_search" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_unique_categories"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_unique_categories"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unique_categories"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_warehouse_tab_counts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_warehouse_tab_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_warehouse_tab_counts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_social_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_social_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_secure_profile_columns"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_secure_profile_columns"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."receive_purchase_order"("p_po_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."receive_purchase_order"("p_po_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."receive_purchase_order"("p_po_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."restock_inventory_on_cancel"() TO "anon";
GRANT ALL ON FUNCTION "public"."restock_inventory_on_cancel"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."restock_inventory_on_cancel"() TO "service_role";
























GRANT ALL ON TABLE "public"."agency_patients" TO "anon";
GRANT ALL ON TABLE "public"."agency_patients" TO "authenticated";
GRANT ALL ON TABLE "public"."agency_patients" TO "service_role";



GRANT ALL ON TABLE "public"."companies" TO "anon";
GRANT ALL ON TABLE "public"."companies" TO "authenticated";
GRANT ALL ON TABLE "public"."companies" TO "service_role";



GRANT ALL ON TABLE "public"."inventory" TO "anon";
GRANT ALL ON TABLE "public"."inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_rules" TO "anon";
GRANT ALL ON TABLE "public"."pricing_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_rules" TO "service_role";



GRANT ALL ON TABLE "public"."product_variants" TO "anon";
GRANT ALL ON TABLE "public"."product_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."product_variants" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_order_items" TO "anon";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_orders" TO "anon";
GRANT ALL ON TABLE "public"."purchase_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_orders" TO "service_role";



GRANT ALL ON TABLE "public"."stock_movements" TO "anon";
GRANT ALL ON TABLE "public"."stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movements" TO "service_role";



GRANT ALL ON TABLE "public"."tax_rates" TO "anon";
GRANT ALL ON TABLE "public"."tax_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."tax_rates" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."vehicles" TO "anon";
GRANT ALL ON TABLE "public"."vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































