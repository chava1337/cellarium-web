-- Evita crear sucursales duplicadas (mismo owner_id + mismo nombre normalizado).
-- Aplicar DESPUÉS de limpiar duplicados existentes en public.branches.
-- Ejemplo limpieza (ejecutar antes si hay duplicados):
--   DELETE FROM public.branches a
--   USING public.branches b
--   WHERE a.owner_id = b.owner_id AND lower(trim(a.name)) = lower(trim(b.name)) AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS branches_owner_name_unique
ON public.branches (owner_id, lower(trim(name)));
