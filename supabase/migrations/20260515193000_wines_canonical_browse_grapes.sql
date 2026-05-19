-- Catálogo global: exponer grapes (text[]) en la vista de browse para listados paginados.
-- IMPORTANT: `grapes` va al final del SELECT. Si se inserta antes de color_en/color_es,
-- PostgreSQL rechaza CREATE OR REPLACE (error 42P16: cannot change name of view column "color_en" to "grapes").
create or replace view public.wines_canonical_browse as
select
  id,
  winery,
  label,
  image_canonical_url,
  country,
  region,
  color,
  abv,
  lower(coalesce(color->>'en', '')) as color_en,
  lower(coalesce(color->>'es', '')) as color_es,
  grapes
from public.wines_canonical;

grant select on public.wines_canonical_browse to authenticated;
