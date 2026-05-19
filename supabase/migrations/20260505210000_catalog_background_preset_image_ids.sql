-- Extender CHECK de catalog_background_preset_id: presets imagen (Cava, Viñedo, Barricas).

ALTER TABLE public.branches DROP CONSTRAINT IF EXISTS branches_catalog_background_preset_id_check;

ALTER TABLE public.branches ADD CONSTRAINT branches_catalog_background_preset_id_check CHECK (
  catalog_background_preset_id IN (
    'default',
    'wine_soft',
    'champagne',
    'dark_luxe',
    'cave_luxe',
    'vineyard_soft',
    'barrel_cellar'
  )
);
