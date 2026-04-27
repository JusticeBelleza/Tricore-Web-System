create extension if not exists "hypopg" with schema "extensions";

create extension if not exists "index_advisor" with schema "extensions";

create extension if not exists "pg_trgm" with schema "extensions";

drop extension if exists "pg_net";

create type "public"."account_type" as enum ('B2B', 'Retail');

create type "public"."movement_type" as enum ('inbound', 'outbound', 'adjustment');

create type "public"."order_status" as enum ('pending', 'approved', 'picking', 'packed', 'out_for_delivery', 'delivered', 'processing', 'shipped', 'cancelled', 'ready_for_delivery', 'attempted', 'restocked', 'delivered_partial');

create type "public"."payment_method" as enum ('net_30', 'cod');

create type "public"."payment_status" as enum ('unpaid', 'partial', 'paid');

create type "public"."po_status" as enum ('draft', 'sent', 'confirmed', 'receiving', 'received', 'cancelled');

create type "public"."rule_type" as enum ('fixed', 'percentage');


  create table "public"."agency_patients" (
    "id" uuid not null default gen_random_uuid(),
    "agency_id" uuid,
    "full_name" text not null,
    "email" text,
    "contact_number" text,
    "address" text,
    "city" text,
    "state" text,
    "zip" text,
    "created_at" timestamp with time zone default timezone('utc'::text, now()),
    "status" text default 'active'::text,
    "archive_reason" text
      );


alter table "public"."agency_patients" enable row level security;


  create table "public"."companies" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "account_type" public.account_type default 'Retail'::public.account_type,
    "credit_limit" numeric(10,2) default 0.00,
    "outstanding_balance" numeric(10,2) default 0.00,
    "shipping_fee" numeric(10,2) default 0.00,
    "tax_exempt" boolean default false,
    "created_at" timestamp with time zone default now(),
    "address" text,
    "city" text,
    "state" text,
    "zip" text,
    "phone" text,
    "email" text
      );


alter table "public"."companies" enable row level security;


  create table "public"."inventory" (
    "product_id" uuid not null,
    "base_units_on_hand" integer default 0,
    "base_units_reserved" integer default 0,
    "reorder_point" integer default 0
      );


alter table "public"."inventory" enable row level security;


  create table "public"."order_items" (
    "id" uuid not null default gen_random_uuid(),
    "order_id" uuid,
    "product_variant_id" uuid,
    "quantity_variants" integer not null,
    "total_base_units" integer not null,
    "unit_price" numeric(10,2) not null,
    "line_total" numeric(10,2) not null,
    "status" text default 'active'::text,
    "cancellation_reason" text
      );


alter table "public"."order_items" enable row level security;


  create table "public"."orders" (
    "id" uuid not null default gen_random_uuid(),
    "company_id" uuid,
    "status" public.order_status default 'pending'::public.order_status,
    "payment_method" public.payment_method,
    "payment_status" public.payment_status default 'unpaid'::public.payment_status,
    "subtotal" numeric(10,2) default 0.00,
    "tax_amount" numeric(10,2) default 0.00,
    "shipping_amount" numeric(10,2) default 0.00,
    "total_amount" numeric(10,2) default 0.00,
    "signature_url" text,
    "photo_url" text,
    "assigned_driver_id" uuid,
    "created_at" timestamp with time zone default now(),
    "user_id" uuid,
    "customer_name" text,
    "patient_name" text,
    "driver_name" text,
    "vehicle_name" text,
    "vehicle_model" text,
    "vehicle_year" text,
    "vehicle_vin" text,
    "vehicle_license" text,
    "patient_id" uuid,
    "shipping_name" text,
    "shipping_address" text,
    "shipping_city" text,
    "shipping_state" text,
    "shipping_zip" text,
    "updated_at" timestamp with time zone default now(),
    "shipping_email" text,
    "shipping_phone" text,
    "received_by" text,
    "cancellation_reason" text,
    "processing_at" timestamp without time zone,
    "shipped_at" timestamp without time zone,
    "delivered_at" timestamp without time zone,
    "cancelled_at" timestamp without time zone,
    "is_restocked" boolean default false
      );


alter table "public"."orders" enable row level security;


  create table "public"."pricing_rules" (
    "id" uuid not null default gen_random_uuid(),
    "company_id" uuid,
    "product_id" uuid,
    "rule_type" public.rule_type not null,
    "value" numeric(10,2) not null,
    "created_at" timestamp with time zone default now(),
    "variant_id" uuid
      );


alter table "public"."pricing_rules" enable row level security;


  create table "public"."product_variants" (
    "id" uuid not null default gen_random_uuid(),
    "product_id" uuid,
    "name" text not null,
    "multiplier" integer not null default 1,
    "created_at" timestamp with time zone default now(),
    "sku" text,
    "price" numeric(10,2),
    "unit_cost" numeric(10,2) default 0.00
      );


alter table "public"."product_variants" enable row level security;


  create table "public"."products" (
    "id" uuid not null default gen_random_uuid(),
    "base_sku" text not null,
    "name" text not null,
    "base_unit_name" text not null,
    "retail_base_price" numeric(10,2) not null,
    "created_at" timestamp with time zone default now(),
    "description" text,
    "manufacturer" text,
    "category" text,
    "continue_selling" boolean default false,
    "image_urls" text[] default '{}'::text[],
    "unit_cost" numeric(10,2) default 0.00
      );


alter table "public"."products" enable row level security;


  create table "public"."profiles" (
    "id" uuid not null,
    "full_name" text,
    "role" text default 'user'::text,
    "created_at" timestamp with time zone default timezone('utc'::text, now()),
    "company_id" uuid,
    "email" text,
    "contact_number" text
      );


alter table "public"."profiles" enable row level security;


  create table "public"."purchase_order_items" (
    "id" uuid not null default gen_random_uuid(),
    "po_id" uuid,
    "description" text not null,
    "sku" text,
    "quantity" integer default 1,
    "unit_cost" numeric default 0,
    "line_total" numeric default 0
      );


alter table "public"."purchase_order_items" enable row level security;


  create table "public"."purchase_orders" (
    "id" uuid not null default gen_random_uuid(),
    "po_number" text not null,
    "supplier_name" text not null,
    "supplier_email" text,
    "status" text default 'pending'::text,
    "expected_delivery" date,
    "total_amount" numeric default 0,
    "notes" text,
    "created_at" timestamp with time zone default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone default timezone('utc'::text, now())
      );


alter table "public"."purchase_orders" enable row level security;


  create table "public"."stock_movements" (
    "id" uuid not null default gen_random_uuid(),
    "product_id" uuid,
    "movement_type" text not null,
    "quantity" integer not null,
    "notes" text,
    "created_at" timestamp with time zone default now(),
    "variant_id" uuid,
    "quantity_change" integer
      );


alter table "public"."stock_movements" enable row level security;


  create table "public"."tax_rates" (
    "State" text,
    "ZipCode" text not null,
    "TaxRegionName" text,
    "EstimatedCombinedRate" numeric default 0,
    "StateRate" numeric default 0,
    "EstimatedCountyRate" numeric default 0,
    "EstimatedCityRate" numeric default 0,
    "EstimatedSpecialRate" numeric default 0,
    "RiskLevel" integer
      );


alter table "public"."tax_rates" enable row level security;


  create table "public"."user_profiles" (
    "id" uuid not null,
    "company_id" uuid,
    "role" text not null,
    "full_name" text,
    "created_at" timestamp with time zone default now(),
    "email" text,
    "contact_number" text,
    "parent_user_id" uuid,
    "address" text,
    "city" text,
    "state" text,
    "zip" text,
    "license_number" text,
    "license_expiry" date,
    "updated_at" timestamp with time zone,
    "billing_address" text,
    "billing_city" text,
    "billing_state" text,
    "billing_zip" text,
    "current_lat" numeric,
    "current_lng" numeric,
    "last_location_update" timestamp with time zone,
    "status" text default 'active'::text
      );


alter table "public"."user_profiles" enable row level security;


  create table "public"."vehicles" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "type" text not null,
    "make" text,
    "model" text,
    "year" text,
    "vin" text,
    "license_plate" text,
    "created_at" timestamp with time zone default timezone('utc'::text, now())
      );


alter table "public"."vehicles" enable row level security;

CREATE UNIQUE INDEX agency_patients_pkey ON public.agency_patients USING btree (id);

CREATE UNIQUE INDEX companies_pkey ON public.companies USING btree (id);

CREATE INDEX idx_agency_patients_agency_id ON public.agency_patients USING btree (agency_id);

CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);

CREATE INDEX idx_order_items_product_variant_id ON public.order_items USING btree (product_variant_id);

CREATE INDEX idx_orders_assigned_driver_id ON public.orders USING btree (assigned_driver_id);

CREATE INDEX idx_orders_company_id ON public.orders USING btree (company_id);

CREATE INDEX idx_orders_created_at ON public.orders USING btree (created_at DESC);

CREATE INDEX idx_orders_patient_id ON public.orders USING btree (patient_id);

CREATE INDEX idx_orders_updated_at ON public.orders USING btree (updated_at DESC);

CREATE INDEX idx_orders_user_id ON public.orders USING btree (user_id);

CREATE INDEX idx_pricing_rules_company_id ON public.pricing_rules USING btree (company_id);

CREATE INDEX idx_pricing_rules_product_id ON public.pricing_rules USING btree (product_id);

CREATE INDEX idx_pricing_rules_variant_id ON public.pricing_rules USING btree (variant_id);

CREATE INDEX idx_product_variants_product_id ON public.product_variants USING btree (product_id);

CREATE INDEX idx_products_base_sku_trgm ON public.products USING gin (base_sku extensions.gin_trgm_ops);

CREATE INDEX idx_products_name_trgm ON public.products USING gin (name extensions.gin_trgm_ops);

CREATE INDEX idx_profiles_company_id ON public.profiles USING btree (company_id);

CREATE INDEX idx_purchase_order_items_po_id ON public.purchase_order_items USING btree (po_id);

CREATE INDEX idx_stock_movements_product_id ON public.stock_movements USING btree (product_id);

CREATE INDEX idx_user_profiles_company_id ON public.user_profiles USING btree (company_id);

CREATE INDEX idx_user_profiles_parent_user_id ON public.user_profiles USING btree (parent_user_id);

CREATE INDEX idx_user_profiles_role ON public.user_profiles USING btree (role);

CREATE UNIQUE INDEX inventory_pkey ON public.inventory USING btree (product_id);

CREATE UNIQUE INDEX order_items_pkey ON public.order_items USING btree (id);

CREATE UNIQUE INDEX orders_pkey ON public.orders USING btree (id);

CREATE UNIQUE INDEX pricing_rules_pkey ON public.pricing_rules USING btree (id);

CREATE UNIQUE INDEX product_variants_pkey ON public.product_variants USING btree (id);

CREATE UNIQUE INDEX products_base_sku_key ON public.products USING btree (base_sku);

CREATE UNIQUE INDEX products_pkey ON public.products USING btree (id);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE UNIQUE INDEX purchase_order_items_pkey ON public.purchase_order_items USING btree (id);

CREATE UNIQUE INDEX purchase_orders_pkey ON public.purchase_orders USING btree (id);

CREATE UNIQUE INDEX purchase_orders_po_number_key ON public.purchase_orders USING btree (po_number);

CREATE UNIQUE INDEX stock_movements_pkey ON public.stock_movements USING btree (id);

CREATE UNIQUE INDEX tax_rates_pkey ON public.tax_rates USING btree ("ZipCode");

CREATE UNIQUE INDEX user_profiles_pkey ON public.user_profiles USING btree (id);

CREATE UNIQUE INDEX vehicles_pkey ON public.vehicles USING btree (id);

alter table "public"."agency_patients" add constraint "agency_patients_pkey" PRIMARY KEY using index "agency_patients_pkey";

alter table "public"."companies" add constraint "companies_pkey" PRIMARY KEY using index "companies_pkey";

alter table "public"."inventory" add constraint "inventory_pkey" PRIMARY KEY using index "inventory_pkey";

alter table "public"."order_items" add constraint "order_items_pkey" PRIMARY KEY using index "order_items_pkey";

alter table "public"."orders" add constraint "orders_pkey" PRIMARY KEY using index "orders_pkey";

alter table "public"."pricing_rules" add constraint "pricing_rules_pkey" PRIMARY KEY using index "pricing_rules_pkey";

alter table "public"."product_variants" add constraint "product_variants_pkey" PRIMARY KEY using index "product_variants_pkey";

alter table "public"."products" add constraint "products_pkey" PRIMARY KEY using index "products_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."purchase_order_items" add constraint "purchase_order_items_pkey" PRIMARY KEY using index "purchase_order_items_pkey";

alter table "public"."purchase_orders" add constraint "purchase_orders_pkey" PRIMARY KEY using index "purchase_orders_pkey";

alter table "public"."stock_movements" add constraint "stock_movements_pkey" PRIMARY KEY using index "stock_movements_pkey";

alter table "public"."tax_rates" add constraint "tax_rates_pkey" PRIMARY KEY using index "tax_rates_pkey";

alter table "public"."user_profiles" add constraint "user_profiles_pkey" PRIMARY KEY using index "user_profiles_pkey";

alter table "public"."vehicles" add constraint "vehicles_pkey" PRIMARY KEY using index "vehicles_pkey";

alter table "public"."agency_patients" add constraint "agency_patients_agency_id_fkey" FOREIGN KEY (agency_id) REFERENCES public.companies(id) ON DELETE CASCADE not valid;

alter table "public"."agency_patients" validate constraint "agency_patients_agency_id_fkey";

alter table "public"."inventory" add constraint "inventory_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) not valid;

alter table "public"."inventory" validate constraint "inventory_product_id_fkey";

alter table "public"."order_items" add constraint "order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE not valid;

alter table "public"."order_items" validate constraint "order_items_order_id_fkey";

alter table "public"."order_items" add constraint "order_items_product_variant_id_fkey" FOREIGN KEY (product_variant_id) REFERENCES public.product_variants(id) not valid;

alter table "public"."order_items" validate constraint "order_items_product_variant_id_fkey";

alter table "public"."orders" add constraint "orders_assigned_driver_id_fkey" FOREIGN KEY (assigned_driver_id) REFERENCES public.user_profiles(id) not valid;

alter table "public"."orders" validate constraint "orders_assigned_driver_id_fkey";

alter table "public"."orders" add constraint "orders_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) not valid;

alter table "public"."orders" validate constraint "orders_company_id_fkey";

alter table "public"."orders" add constraint "orders_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES public.agency_patients(id) ON DELETE SET NULL not valid;

alter table "public"."orders" validate constraint "orders_patient_id_fkey";

alter table "public"."orders" add constraint "orders_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."orders" validate constraint "orders_user_id_fkey";

alter table "public"."pricing_rules" add constraint "pricing_rules_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE not valid;

alter table "public"."pricing_rules" validate constraint "pricing_rules_company_id_fkey";

alter table "public"."pricing_rules" add constraint "pricing_rules_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."pricing_rules" validate constraint "pricing_rules_product_id_fkey";

alter table "public"."pricing_rules" add constraint "pricing_rules_variant_id_fkey" FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) not valid;

alter table "public"."pricing_rules" validate constraint "pricing_rules_variant_id_fkey";

alter table "public"."product_variants" add constraint "product_variants_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_variants" validate constraint "product_variants_product_id_fkey";

alter table "public"."products" add constraint "products_base_sku_key" UNIQUE using index "products_base_sku_key";

alter table "public"."profiles" add constraint "profiles_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL not valid;

alter table "public"."profiles" validate constraint "profiles_company_id_fkey";

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_id_fkey";

alter table "public"."purchase_order_items" add constraint "purchase_order_items_po_id_fkey" FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE not valid;

alter table "public"."purchase_order_items" validate constraint "purchase_order_items_po_id_fkey";

alter table "public"."purchase_orders" add constraint "purchase_orders_po_number_key" UNIQUE using index "purchase_orders_po_number_key";

alter table "public"."stock_movements" add constraint "stock_movements_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) not valid;

alter table "public"."stock_movements" validate constraint "stock_movements_product_id_fkey";

alter table "public"."user_profiles" add constraint "user_profiles_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL not valid;

alter table "public"."user_profiles" validate constraint "user_profiles_company_id_fkey";

alter table "public"."user_profiles" add constraint "user_profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_profiles" validate constraint "user_profiles_id_fkey";

alter table "public"."user_profiles" add constraint "user_profiles_parent_user_id_fkey" FOREIGN KEY (parent_user_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL not valid;

alter table "public"."user_profiles" validate constraint "user_profiles_parent_user_id_fkey";

alter table "public"."user_profiles" add constraint "user_profiles_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'warehouse'::text, 'driver'::text, 'b2b'::text, 'agency_admin'::text, 'retail'::text, 'user'::text, 'patient'::text]))) not valid;

alter table "public"."user_profiles" validate constraint "user_profiles_role_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.admin_create_user(email text, password text, full_name text, role text DEFAULT 'patient'::text, contact_number text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_create_user(user_email text, user_password text, user_full_name text, user_role text, user_contact text, user_company_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_create_user(user_email text, user_password text, user_full_name text, user_role text, user_contact text, user_company_id uuid DEFAULT NULL::uuid, new_company_name text DEFAULT NULL::text, creating_admin_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.complete_delivery(p_order_id uuid, p_signature_url text, p_photo_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.deduct_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.deduct_inventory(order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.delete_user(user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- 1. Delete their profile record first
  DELETE FROM public.user_profiles WHERE id = user_id;
  
  -- 2. Delete their actual login account permanently from the secure auth system
  DELETE FROM auth.users WHERE id = user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_company_id()
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT company_id FROM user_profiles WHERE id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.get_profitability_report(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_search text)
 RETURNS TABLE(id uuid, name text, sku text, "totalQty" bigint, "totalRevenue" numeric, "totalCogs" numeric, "grossProfit" numeric, margin numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_social_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.protect_secure_profile_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- If the person trying to save the data isn't ALREADY an admin in the database...
  IF (SELECT role FROM public.user_profiles WHERE id = auth.uid()) != 'admin' THEN
    -- ...THEN ignore their attempt to change 'role' or 'company_id'
    NEW.role = OLD.role;
    NEW.company_id = OLD.company_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_po_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.restock_inventory_on_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

grant delete on table "public"."agency_patients" to "anon";

grant insert on table "public"."agency_patients" to "anon";

grant references on table "public"."agency_patients" to "anon";

grant select on table "public"."agency_patients" to "anon";

grant trigger on table "public"."agency_patients" to "anon";

grant truncate on table "public"."agency_patients" to "anon";

grant update on table "public"."agency_patients" to "anon";

grant delete on table "public"."agency_patients" to "authenticated";

grant insert on table "public"."agency_patients" to "authenticated";

grant references on table "public"."agency_patients" to "authenticated";

grant select on table "public"."agency_patients" to "authenticated";

grant trigger on table "public"."agency_patients" to "authenticated";

grant truncate on table "public"."agency_patients" to "authenticated";

grant update on table "public"."agency_patients" to "authenticated";

grant delete on table "public"."agency_patients" to "service_role";

grant insert on table "public"."agency_patients" to "service_role";

grant references on table "public"."agency_patients" to "service_role";

grant select on table "public"."agency_patients" to "service_role";

grant trigger on table "public"."agency_patients" to "service_role";

grant truncate on table "public"."agency_patients" to "service_role";

grant update on table "public"."agency_patients" to "service_role";

grant delete on table "public"."companies" to "anon";

grant insert on table "public"."companies" to "anon";

grant references on table "public"."companies" to "anon";

grant select on table "public"."companies" to "anon";

grant trigger on table "public"."companies" to "anon";

grant truncate on table "public"."companies" to "anon";

grant update on table "public"."companies" to "anon";

grant delete on table "public"."companies" to "authenticated";

grant insert on table "public"."companies" to "authenticated";

grant references on table "public"."companies" to "authenticated";

grant select on table "public"."companies" to "authenticated";

grant trigger on table "public"."companies" to "authenticated";

grant truncate on table "public"."companies" to "authenticated";

grant update on table "public"."companies" to "authenticated";

grant delete on table "public"."companies" to "service_role";

grant insert on table "public"."companies" to "service_role";

grant references on table "public"."companies" to "service_role";

grant select on table "public"."companies" to "service_role";

grant trigger on table "public"."companies" to "service_role";

grant truncate on table "public"."companies" to "service_role";

grant update on table "public"."companies" to "service_role";

grant delete on table "public"."inventory" to "anon";

grant insert on table "public"."inventory" to "anon";

grant references on table "public"."inventory" to "anon";

grant select on table "public"."inventory" to "anon";

grant trigger on table "public"."inventory" to "anon";

grant truncate on table "public"."inventory" to "anon";

grant update on table "public"."inventory" to "anon";

grant delete on table "public"."inventory" to "authenticated";

grant insert on table "public"."inventory" to "authenticated";

grant references on table "public"."inventory" to "authenticated";

grant select on table "public"."inventory" to "authenticated";

grant trigger on table "public"."inventory" to "authenticated";

grant truncate on table "public"."inventory" to "authenticated";

grant update on table "public"."inventory" to "authenticated";

grant delete on table "public"."inventory" to "service_role";

grant insert on table "public"."inventory" to "service_role";

grant references on table "public"."inventory" to "service_role";

grant select on table "public"."inventory" to "service_role";

grant trigger on table "public"."inventory" to "service_role";

grant truncate on table "public"."inventory" to "service_role";

grant update on table "public"."inventory" to "service_role";

grant delete on table "public"."order_items" to "anon";

grant insert on table "public"."order_items" to "anon";

grant references on table "public"."order_items" to "anon";

grant select on table "public"."order_items" to "anon";

grant trigger on table "public"."order_items" to "anon";

grant truncate on table "public"."order_items" to "anon";

grant update on table "public"."order_items" to "anon";

grant delete on table "public"."order_items" to "authenticated";

grant insert on table "public"."order_items" to "authenticated";

grant references on table "public"."order_items" to "authenticated";

grant select on table "public"."order_items" to "authenticated";

grant trigger on table "public"."order_items" to "authenticated";

grant truncate on table "public"."order_items" to "authenticated";

grant update on table "public"."order_items" to "authenticated";

grant delete on table "public"."order_items" to "service_role";

grant insert on table "public"."order_items" to "service_role";

grant references on table "public"."order_items" to "service_role";

grant select on table "public"."order_items" to "service_role";

grant trigger on table "public"."order_items" to "service_role";

grant truncate on table "public"."order_items" to "service_role";

grant update on table "public"."order_items" to "service_role";

grant delete on table "public"."orders" to "anon";

grant insert on table "public"."orders" to "anon";

grant references on table "public"."orders" to "anon";

grant select on table "public"."orders" to "anon";

grant trigger on table "public"."orders" to "anon";

grant truncate on table "public"."orders" to "anon";

grant update on table "public"."orders" to "anon";

grant delete on table "public"."orders" to "authenticated";

grant insert on table "public"."orders" to "authenticated";

grant references on table "public"."orders" to "authenticated";

grant select on table "public"."orders" to "authenticated";

grant trigger on table "public"."orders" to "authenticated";

grant truncate on table "public"."orders" to "authenticated";

grant update on table "public"."orders" to "authenticated";

grant delete on table "public"."orders" to "service_role";

grant insert on table "public"."orders" to "service_role";

grant references on table "public"."orders" to "service_role";

grant select on table "public"."orders" to "service_role";

grant trigger on table "public"."orders" to "service_role";

grant truncate on table "public"."orders" to "service_role";

grant update on table "public"."orders" to "service_role";

grant delete on table "public"."pricing_rules" to "anon";

grant insert on table "public"."pricing_rules" to "anon";

grant references on table "public"."pricing_rules" to "anon";

grant select on table "public"."pricing_rules" to "anon";

grant trigger on table "public"."pricing_rules" to "anon";

grant truncate on table "public"."pricing_rules" to "anon";

grant update on table "public"."pricing_rules" to "anon";

grant delete on table "public"."pricing_rules" to "authenticated";

grant insert on table "public"."pricing_rules" to "authenticated";

grant references on table "public"."pricing_rules" to "authenticated";

grant select on table "public"."pricing_rules" to "authenticated";

grant trigger on table "public"."pricing_rules" to "authenticated";

grant truncate on table "public"."pricing_rules" to "authenticated";

grant update on table "public"."pricing_rules" to "authenticated";

grant delete on table "public"."pricing_rules" to "service_role";

grant insert on table "public"."pricing_rules" to "service_role";

grant references on table "public"."pricing_rules" to "service_role";

grant select on table "public"."pricing_rules" to "service_role";

grant trigger on table "public"."pricing_rules" to "service_role";

grant truncate on table "public"."pricing_rules" to "service_role";

grant update on table "public"."pricing_rules" to "service_role";

grant delete on table "public"."product_variants" to "anon";

grant insert on table "public"."product_variants" to "anon";

grant references on table "public"."product_variants" to "anon";

grant select on table "public"."product_variants" to "anon";

grant trigger on table "public"."product_variants" to "anon";

grant truncate on table "public"."product_variants" to "anon";

grant update on table "public"."product_variants" to "anon";

grant delete on table "public"."product_variants" to "authenticated";

grant insert on table "public"."product_variants" to "authenticated";

grant references on table "public"."product_variants" to "authenticated";

grant select on table "public"."product_variants" to "authenticated";

grant trigger on table "public"."product_variants" to "authenticated";

grant truncate on table "public"."product_variants" to "authenticated";

grant update on table "public"."product_variants" to "authenticated";

grant delete on table "public"."product_variants" to "service_role";

grant insert on table "public"."product_variants" to "service_role";

grant references on table "public"."product_variants" to "service_role";

grant select on table "public"."product_variants" to "service_role";

grant trigger on table "public"."product_variants" to "service_role";

grant truncate on table "public"."product_variants" to "service_role";

grant update on table "public"."product_variants" to "service_role";

grant delete on table "public"."products" to "anon";

grant insert on table "public"."products" to "anon";

grant references on table "public"."products" to "anon";

grant select on table "public"."products" to "anon";

grant trigger on table "public"."products" to "anon";

grant truncate on table "public"."products" to "anon";

grant update on table "public"."products" to "anon";

grant delete on table "public"."products" to "authenticated";

grant insert on table "public"."products" to "authenticated";

grant references on table "public"."products" to "authenticated";

grant select on table "public"."products" to "authenticated";

grant trigger on table "public"."products" to "authenticated";

grant truncate on table "public"."products" to "authenticated";

grant update on table "public"."products" to "authenticated";

grant delete on table "public"."products" to "service_role";

grant insert on table "public"."products" to "service_role";

grant references on table "public"."products" to "service_role";

grant select on table "public"."products" to "service_role";

grant trigger on table "public"."products" to "service_role";

grant truncate on table "public"."products" to "service_role";

grant update on table "public"."products" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."purchase_order_items" to "anon";

grant insert on table "public"."purchase_order_items" to "anon";

grant references on table "public"."purchase_order_items" to "anon";

grant select on table "public"."purchase_order_items" to "anon";

grant trigger on table "public"."purchase_order_items" to "anon";

grant truncate on table "public"."purchase_order_items" to "anon";

grant update on table "public"."purchase_order_items" to "anon";

grant delete on table "public"."purchase_order_items" to "authenticated";

grant insert on table "public"."purchase_order_items" to "authenticated";

grant references on table "public"."purchase_order_items" to "authenticated";

grant select on table "public"."purchase_order_items" to "authenticated";

grant trigger on table "public"."purchase_order_items" to "authenticated";

grant truncate on table "public"."purchase_order_items" to "authenticated";

grant update on table "public"."purchase_order_items" to "authenticated";

grant delete on table "public"."purchase_order_items" to "service_role";

grant insert on table "public"."purchase_order_items" to "service_role";

grant references on table "public"."purchase_order_items" to "service_role";

grant select on table "public"."purchase_order_items" to "service_role";

grant trigger on table "public"."purchase_order_items" to "service_role";

grant truncate on table "public"."purchase_order_items" to "service_role";

grant update on table "public"."purchase_order_items" to "service_role";

grant delete on table "public"."purchase_orders" to "anon";

grant insert on table "public"."purchase_orders" to "anon";

grant references on table "public"."purchase_orders" to "anon";

grant select on table "public"."purchase_orders" to "anon";

grant trigger on table "public"."purchase_orders" to "anon";

grant truncate on table "public"."purchase_orders" to "anon";

grant update on table "public"."purchase_orders" to "anon";

grant delete on table "public"."purchase_orders" to "authenticated";

grant insert on table "public"."purchase_orders" to "authenticated";

grant references on table "public"."purchase_orders" to "authenticated";

grant select on table "public"."purchase_orders" to "authenticated";

grant trigger on table "public"."purchase_orders" to "authenticated";

grant truncate on table "public"."purchase_orders" to "authenticated";

grant update on table "public"."purchase_orders" to "authenticated";

grant delete on table "public"."purchase_orders" to "service_role";

grant insert on table "public"."purchase_orders" to "service_role";

grant references on table "public"."purchase_orders" to "service_role";

grant select on table "public"."purchase_orders" to "service_role";

grant trigger on table "public"."purchase_orders" to "service_role";

grant truncate on table "public"."purchase_orders" to "service_role";

grant update on table "public"."purchase_orders" to "service_role";

grant delete on table "public"."stock_movements" to "anon";

grant insert on table "public"."stock_movements" to "anon";

grant references on table "public"."stock_movements" to "anon";

grant select on table "public"."stock_movements" to "anon";

grant trigger on table "public"."stock_movements" to "anon";

grant truncate on table "public"."stock_movements" to "anon";

grant update on table "public"."stock_movements" to "anon";

grant delete on table "public"."stock_movements" to "authenticated";

grant insert on table "public"."stock_movements" to "authenticated";

grant references on table "public"."stock_movements" to "authenticated";

grant select on table "public"."stock_movements" to "authenticated";

grant trigger on table "public"."stock_movements" to "authenticated";

grant truncate on table "public"."stock_movements" to "authenticated";

grant update on table "public"."stock_movements" to "authenticated";

grant delete on table "public"."stock_movements" to "service_role";

grant insert on table "public"."stock_movements" to "service_role";

grant references on table "public"."stock_movements" to "service_role";

grant select on table "public"."stock_movements" to "service_role";

grant trigger on table "public"."stock_movements" to "service_role";

grant truncate on table "public"."stock_movements" to "service_role";

grant update on table "public"."stock_movements" to "service_role";

grant delete on table "public"."tax_rates" to "anon";

grant insert on table "public"."tax_rates" to "anon";

grant references on table "public"."tax_rates" to "anon";

grant select on table "public"."tax_rates" to "anon";

grant trigger on table "public"."tax_rates" to "anon";

grant truncate on table "public"."tax_rates" to "anon";

grant update on table "public"."tax_rates" to "anon";

grant delete on table "public"."tax_rates" to "authenticated";

grant insert on table "public"."tax_rates" to "authenticated";

grant references on table "public"."tax_rates" to "authenticated";

grant select on table "public"."tax_rates" to "authenticated";

grant trigger on table "public"."tax_rates" to "authenticated";

grant truncate on table "public"."tax_rates" to "authenticated";

grant update on table "public"."tax_rates" to "authenticated";

grant delete on table "public"."tax_rates" to "service_role";

grant insert on table "public"."tax_rates" to "service_role";

grant references on table "public"."tax_rates" to "service_role";

grant select on table "public"."tax_rates" to "service_role";

grant trigger on table "public"."tax_rates" to "service_role";

grant truncate on table "public"."tax_rates" to "service_role";

grant update on table "public"."tax_rates" to "service_role";

grant delete on table "public"."user_profiles" to "anon";

grant insert on table "public"."user_profiles" to "anon";

grant references on table "public"."user_profiles" to "anon";

grant select on table "public"."user_profiles" to "anon";

grant trigger on table "public"."user_profiles" to "anon";

grant truncate on table "public"."user_profiles" to "anon";

grant update on table "public"."user_profiles" to "anon";

grant delete on table "public"."user_profiles" to "authenticated";

grant insert on table "public"."user_profiles" to "authenticated";

grant references on table "public"."user_profiles" to "authenticated";

grant select on table "public"."user_profiles" to "authenticated";

grant trigger on table "public"."user_profiles" to "authenticated";

grant truncate on table "public"."user_profiles" to "authenticated";

grant update on table "public"."user_profiles" to "authenticated";

grant delete on table "public"."user_profiles" to "service_role";

grant insert on table "public"."user_profiles" to "service_role";

grant references on table "public"."user_profiles" to "service_role";

grant select on table "public"."user_profiles" to "service_role";

grant trigger on table "public"."user_profiles" to "service_role";

grant truncate on table "public"."user_profiles" to "service_role";

grant update on table "public"."user_profiles" to "service_role";

grant delete on table "public"."vehicles" to "anon";

grant insert on table "public"."vehicles" to "anon";

grant references on table "public"."vehicles" to "anon";

grant select on table "public"."vehicles" to "anon";

grant trigger on table "public"."vehicles" to "anon";

grant truncate on table "public"."vehicles" to "anon";

grant update on table "public"."vehicles" to "anon";

grant delete on table "public"."vehicles" to "authenticated";

grant insert on table "public"."vehicles" to "authenticated";

grant references on table "public"."vehicles" to "authenticated";

grant select on table "public"."vehicles" to "authenticated";

grant trigger on table "public"."vehicles" to "authenticated";

grant truncate on table "public"."vehicles" to "authenticated";

grant update on table "public"."vehicles" to "authenticated";

grant delete on table "public"."vehicles" to "service_role";

grant insert on table "public"."vehicles" to "service_role";

grant references on table "public"."vehicles" to "service_role";

grant select on table "public"."vehicles" to "service_role";

grant trigger on table "public"."vehicles" to "service_role";

grant truncate on table "public"."vehicles" to "service_role";

grant update on table "public"."vehicles" to "service_role";


  create policy "Agency staff manage their own patients"
  on "public"."agency_patients"
  as permissive
  for all
  to authenticated
using ((((agency_id = public.get_my_company_id()) AND (public.get_user_role() = ANY (ARRAY['b2b'::text, 'agency_admin'::text]))) OR (public.get_user_role() = 'admin'::text)))
with check ((((agency_id = public.get_my_company_id()) AND (public.get_user_role() = ANY (ARRAY['b2b'::text, 'agency_admin'::text]))) OR (public.get_user_role() = 'admin'::text)));



  create policy "Staff delete companies"
  on "public"."companies"
  as permissive
  for delete
  to authenticated
using ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "Staff insert companies"
  on "public"."companies"
  as permissive
  for insert
  to authenticated
with check ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "Staff update companies"
  on "public"."companies"
  as permissive
  for update
  to authenticated
using ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])))
with check ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "Users can view relevant companies"
  on "public"."companies"
  as permissive
  for select
  to authenticated
using (((id = public.get_my_company_id()) OR (public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text]))));



  create policy "Everyone can update inventory"
  on "public"."inventory"
  as permissive
  for update
  to authenticated
using ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text, 'retail'::text, 'b2b'::text, 'driver'::text])))
with check ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text, 'retail'::text, 'b2b'::text, 'driver'::text])));



  create policy "Logged in users can view inventory"
  on "public"."inventory"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Only staff can delete inventory"
  on "public"."inventory"
  as permissive
  for delete
  to authenticated
using ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "Only staff can insert inventory"
  on "public"."inventory"
  as permissive
  for insert
  to authenticated
with check ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "Delete order items"
  on "public"."order_items"
  as permissive
  for delete
  to authenticated
using ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "Insert order items"
  on "public"."order_items"
  as permissive
  for insert
  to authenticated
with check (((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text, 'driver'::text])) OR (EXISTS ( SELECT 1
   FROM public.orders
  WHERE ((orders.id = order_items.order_id) AND ((orders.user_id = ( SELECT auth.uid() AS uid)) OR (orders.company_id = public.get_my_company_id())))))));



  create policy "Update order items"
  on "public"."order_items"
  as permissive
  for update
  to authenticated
using ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text, 'driver'::text])))
with check ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text, 'driver'::text])));



  create policy "View order items"
  on "public"."order_items"
  as permissive
  for select
  to authenticated
using (((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text, 'driver'::text])) OR (EXISTS ( SELECT 1
   FROM public.orders
  WHERE ((orders.id = order_items.order_id) AND ((orders.user_id = ( SELECT auth.uid() AS uid)) OR (orders.company_id = public.get_my_company_id())))))));



  create policy "Delete orders"
  on "public"."orders"
  as permissive
  for delete
  to authenticated
using ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "Insert orders"
  on "public"."orders"
  as permissive
  for insert
  to authenticated
with check (((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])) OR ((public.get_user_role() = 'retail'::text) AND (user_id = ( SELECT auth.uid() AS uid))) OR ((public.get_user_role() = ANY (ARRAY['b2b'::text, 'agency_admin'::text])) AND (company_id = public.get_my_company_id()))));



  create policy "Update orders"
  on "public"."orders"
  as permissive
  for update
  to authenticated
using (((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text, 'driver'::text])) OR ((public.get_user_role() = 'retail'::text) AND (user_id = ( SELECT auth.uid() AS uid))) OR ((public.get_user_role() = ANY (ARRAY['b2b'::text, 'agency_admin'::text])) AND (company_id = public.get_my_company_id()))))
with check (((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text, 'driver'::text])) OR ((public.get_user_role() = 'retail'::text) AND (user_id = ( SELECT auth.uid() AS uid))) OR ((public.get_user_role() = ANY (ARRAY['b2b'::text, 'agency_admin'::text])) AND (company_id = public.get_my_company_id()))));



  create policy "View orders"
  on "public"."orders"
  as permissive
  for select
  to authenticated
using (((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text, 'driver'::text])) OR ((public.get_user_role() = 'retail'::text) AND (user_id = ( SELECT auth.uid() AS uid))) OR ((public.get_user_role() = ANY (ARRAY['b2b'::text, 'agency_admin'::text])) AND (company_id = public.get_my_company_id()))));



  create policy "Staff delete pricing rules"
  on "public"."pricing_rules"
  as permissive
  for delete
  to authenticated
using ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "Staff insert pricing rules"
  on "public"."pricing_rules"
  as permissive
  for insert
  to authenticated
with check ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "Staff update pricing rules"
  on "public"."pricing_rules"
  as permissive
  for update
  to authenticated
using ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])))
with check ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "View pricing rules"
  on "public"."pricing_rules"
  as permissive
  for select
  to authenticated
using (((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])) OR ((public.get_user_role() = ANY (ARRAY['b2b'::text, 'agency_admin'::text])) AND (company_id = public.get_my_company_id()))));



  create policy "Anyone can view variants"
  on "public"."product_variants"
  as permissive
  for select
  to public
using (true);



  create policy "Staff delete variants"
  on "public"."product_variants"
  as permissive
  for delete
  to authenticated
using ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "Staff insert variants"
  on "public"."product_variants"
  as permissive
  for insert
  to authenticated
with check ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "Staff update variants"
  on "public"."product_variants"
  as permissive
  for update
  to authenticated
using ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])))
with check ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "Anyone can view products"
  on "public"."products"
  as permissive
  for select
  to public
using (true);



  create policy "Staff delete products"
  on "public"."products"
  as permissive
  for delete
  to authenticated
using ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "Staff insert products"
  on "public"."products"
  as permissive
  for insert
  to authenticated
with check ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "Staff update products"
  on "public"."products"
  as permissive
  for update
  to authenticated
using ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])))
with check ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "Update profiles"
  on "public"."profiles"
  as permissive
  for update
  to authenticated
using (((( SELECT auth.uid() AS uid) = id) OR (public.get_user_role() = 'admin'::text)))
with check (((( SELECT auth.uid() AS uid) = id) OR (public.get_user_role() = 'admin'::text)));



  create policy "View profiles"
  on "public"."profiles"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Staff manage PO Items"
  on "public"."purchase_order_items"
  as permissive
  for all
  to authenticated
using ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])))
with check ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "Staff manage POs"
  on "public"."purchase_orders"
  as permissive
  for all
  to authenticated
using ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])))
with check ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "Staff can insert stock movements"
  on "public"."stock_movements"
  as permissive
  for insert
  to authenticated
with check ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "Anyone can view tax rates"
  on "public"."tax_rates"
  as permissive
  for select
  to public
using (true);



  create policy "Staff delete tax rates"
  on "public"."tax_rates"
  as permissive
  for delete
  to authenticated
using ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "Staff insert tax rates"
  on "public"."tax_rates"
  as permissive
  for insert
  to authenticated
with check ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "Staff update tax rates"
  on "public"."tax_rates"
  as permissive
  for update
  to authenticated
using ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])))
with check ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "Update user profiles"
  on "public"."user_profiles"
  as permissive
  for update
  to authenticated
using (((id = ( SELECT auth.uid() AS uid)) OR (public.get_user_role() = 'admin'::text) OR ((public.get_user_role() = 'agency_admin'::text) AND (company_id = public.get_my_company_id()))))
with check (((id = ( SELECT auth.uid() AS uid)) OR (public.get_user_role() = 'admin'::text) OR ((public.get_user_role() = 'agency_admin'::text) AND (company_id = public.get_my_company_id()))));



  create policy "View user profiles"
  on "public"."user_profiles"
  as permissive
  for select
  to authenticated
using (((id = ( SELECT auth.uid() AS uid)) OR (public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])) OR ((company_id IS NOT NULL) AND (company_id = public.get_my_company_id())) OR (role = 'driver'::text)));



  create policy "Staff and drivers view vehicles"
  on "public"."vehicles"
  as permissive
  for select
  to authenticated
using ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text, 'driver'::text])));



  create policy "Staff delete vehicles"
  on "public"."vehicles"
  as permissive
  for delete
  to authenticated
using ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "Staff insert vehicles"
  on "public"."vehicles"
  as permissive
  for insert
  to authenticated
with check ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));



  create policy "Staff update vehicles"
  on "public"."vehicles"
  as permissive
  for update
  to authenticated
using ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])))
with check ((public.get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text])));


CREATE TRIGGER on_order_item_insert AFTER INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.deduct_inventory();

CREATE TRIGGER on_order_cancelled AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.restock_inventory_on_cancel();

CREATE TRIGGER enforce_profile_security BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.protect_secure_profile_columns();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


  create policy "Allow All Authenticated Uploads 1uh8lhk_0"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'product_images'::text));



  create policy "Allow Authenticated Uploads dsl9k8_1"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'delivery-proofs'::text));



  create policy "Allow Authenticated Uploads dsl9k8_2"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'delivery-proofs'::text));



