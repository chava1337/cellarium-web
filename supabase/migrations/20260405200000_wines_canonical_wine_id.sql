-- Vincula filas de wines al registro exacto en wines_canonical (evita colisiones por nombre/label duplicado, p. ej. Opus One vs Opus One Overture).
alter table public.wines
  add column if not exists canonical_wine_id uuid references public.wines_canonical (id) on delete set null;

create index if not exists idx_wines_canonical_wine_id
  on public.wines (canonical_wine_id)
  where canonical_wine_id is not null;

comment on column public.wines.canonical_wine_id is
  'ID en wines_canonical cuando el vino se creó desde el catálogo global; lookup debe preferir este campo sobre nombre/label.';
