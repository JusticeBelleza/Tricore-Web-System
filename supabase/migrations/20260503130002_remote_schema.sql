set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.substitute_order_item(p_item_id uuid, p_new_variant_id uuid, p_new_qty integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_old_qty integer;
    v_old_mult integer;
    v_old_prod_id uuid;
    v_new_mult integer;
    v_new_price numeric;
    v_new_prod_id uuid;
BEGIN
    -- 1. Get old item details so we can restock it
    SELECT oi.quantity_variants, COALESCE(pv.multiplier, 1), pv.product_id
    INTO v_old_qty, v_old_mult, v_old_prod_id
    FROM order_items oi
    JOIN product_variants pv ON pv.id = oi.product_variant_id
    WHERE oi.id = p_item_id;

    -- Restock the old item's exact base units
    UPDATE inventory 
    SET base_units_on_hand = base_units_on_hand + (v_old_qty * v_old_mult)
    WHERE product_id = v_old_prod_id;

    -- 2. Get new item details
    SELECT COALESCE(multiplier, 1), price, product_id
    INTO v_new_mult, v_new_price, v_new_prod_id
    FROM product_variants
    WHERE id = p_new_variant_id;

    -- Deduct the new item's exact base units
    UPDATE inventory 
    SET base_units_on_hand = base_units_on_hand - (p_new_qty * v_new_mult)
    WHERE product_id = v_new_prod_id;

    -- 3. Safely update the order_items table with the new variant
    UPDATE order_items 
    SET product_variant_id = p_new_variant_id,
        quantity_variants = p_new_qty,
        total_base_units = p_new_qty * v_new_mult,
        unit_price = v_new_price,
        line_total = p_new_qty * v_new_price
    WHERE id = p_item_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.edit_order_item(p_item_id uuid, p_new_qty integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_old_qty integer;
    v_multiplier integer;
    v_diff_base integer;
    v_product_id uuid;
    v_unit_price numeric;
BEGIN
    -- Get old details and the correct multiplier
    SELECT oi.quantity_variants, oi.unit_price, COALESCE(pv.multiplier, 1), pv.product_id
    INTO v_old_qty, v_unit_price, v_multiplier, v_product_id
    FROM order_items oi
    JOIN product_variants pv ON pv.id = oi.product_variant_id
    WHERE oi.id = p_item_id;

    -- Calculate the exact difference in base units (e.g., changing 1 case to 2 cases = +5 packs)
    v_diff_base := (p_new_qty - v_old_qty) * v_multiplier;

    -- Update order item totals
    UPDATE order_items 
    SET quantity_variants = p_new_qty,
        total_base_units = p_new_qty * v_multiplier,
        line_total = p_new_qty * v_unit_price
    WHERE id = p_item_id;

    -- Deduct (or add back) the exact base units from inventory
    UPDATE inventory 
    SET base_units_on_hand = base_units_on_hand - v_diff_base
    WHERE product_id = v_product_id;
END;
$function$
;


  create policy "Allow Public Read Access to Inventory"
  on "public"."inventory"
  as permissive
  for select
  to public
using (true);



