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
  lower(coalesce(color->>'es', '')) as color_es
from public.wines_canonical;

grant select on public.wines_canonical_browse to authenticated;
