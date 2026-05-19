-- FASE 8: fondo del catálogo configurable por sucursal (solo owner persiste en app; lectura guest vía public-menu).

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS catalog_background_preset_id text NOT NULL DEFAULT 'default';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'branches_catalog_background_preset_id_check'
  ) THEN
    ALTER TABLE public.branches
      ADD CONSTRAINT branches_catalog_background_preset_id_check
      CHECK (
        catalog_background_preset_id IN (
          'default',
          'wine_soft',
          'champagne',
          'dark_luxe'
        )
      );
  END IF;
END $$;
