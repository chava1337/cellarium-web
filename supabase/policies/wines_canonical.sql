-- Políticas RLS para wines_canonical (base de datos global)
-- Ejecutar en Supabase SQL Editor una sola vez

-- Habilitar RLS en la tabla
alter table wines_canonical enable row level security;

-- Eliminar política existente si existe (para permitir re-ejecutar)
drop policy if exists "read canonical for all auth" on wines_canonical;

-- Política: Permitir lectura a usuarios autenticados
create policy "read canonical for all auth"
on wines_canonical for select
to authenticated
using (true);

-- NOTA: Si deseas permitir acceso público (opcional, descomentar):
-- drop policy if exists "read canonical for public" on wines_canonical;
-- create policy "read canonical for public"
-- on wines_canonical for select
-- to public
-- using (true);

