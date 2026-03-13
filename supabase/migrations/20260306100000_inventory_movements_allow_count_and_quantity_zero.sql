-- Alinear inventory_movements con BD real y lógica de Ventas estimadas (conteos).
-- Permite movement_type = 'count' y quantity >= 0 para conteos.

-- 1) Permitir 'count' en movement_type
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (movement_type = ANY (ARRAY['entrada'::text, 'salida'::text, 'ajuste'::text, 'venta'::text, 'count'::text]));

-- 2) quantity: para 'count' permitir >= 0; para el resto > 0
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_quantity_check;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_quantity_check
  CHECK (
    (movement_type = 'count' AND quantity >= 0)
    OR
    (movement_type <> 'count' AND quantity > 0)
  );
