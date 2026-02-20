-- =============================================================================
-- Diagnóstico: public-menu 404 para token dado
-- Ejecutar en SQL Editor de Supabase (mismo proyecto que la Edge Function).
-- =============================================================================

-- 1) Buscar el token exacto en qr_tokens
SELECT id, token, type, branch_id, owner_id, created_by, created_at, expires_at, max_uses, current_uses, used
FROM public.qr_tokens
WHERE token = '2203ebdc8295fb46db80f17fe3db5f575';

-- 2) Si no existe: listar últimos 20 tokens guest (para ver formato y branch_id válidos)
SELECT token, type, branch_id, created_at, expires_at, max_uses, current_uses
FROM public.qr_tokens
WHERE type = 'guest'
ORDER BY created_at DESC
LIMIT 20;

-- 3) Branch y owner del branch para ese token (solo tiene sentido si 1) devolvió fila)
SELECT b.id, b.name, b.owner_id
FROM public.branches b
WHERE b.id IN (
  SELECT branch_id FROM public.qr_tokens WHERE token = '2203ebdc8295fb46db80f17fe3db5f575'
);

-- 4) Listar branches (para elegir branch_id si creas token manual)
SELECT id, name, owner_id
FROM public.branches
ORDER BY created_at DESC
LIMIT 10;

-- 5) Crear token de prueba (solo si el token no existe)
-- Inserta un guest token con expires_at = now()+7 days, max_uses=100, current_uses=0.
-- Usa la primera branch devuelta por (4). Creado por = owner de la branch.
INSERT INTO public.qr_tokens (
  token,
  type,
  branch_id,
  created_by,
  owner_id,
  expires_at,
  max_uses,
  current_uses,
  used
)
SELECT
  '2203ebdc8295fb46db80f17fe3db5f575',
  'guest',
  b.id,
  b.owner_id,
  b.owner_id,
  now() + interval '7 days',
  100,
  0,
  false
FROM public.branches b
ORDER BY b.created_at DESC
LIMIT 1
ON CONFLICT (token) DO NOTHING
RETURNING id, token, branch_id, expires_at, max_uses, current_uses;
-- Si no devuelve filas, el token ya existía (ON CONFLICT DO NOTHING). Usa ese token en el script.

-- 5b) Versión con valores fijos: descomenta y reemplaza los UUIDs por los de tu proyecto
-- (Obtén branch_id y owner_id de la query 4.)
/*
INSERT INTO public.qr_tokens (
  token,
  type,
  branch_id,
  created_by,
  owner_id,
  expires_at,
  max_uses,
  current_uses,
  used
) VALUES (
  '2203ebdc8295fb46db80f17fe3db5f575',
  'guest',
  '00000000-0000-0000-0000-000000000000',  -- reemplazar por branch_id real
  '00000000-0000-0000-0000-000000000000',  -- reemplazar por user id (created_by)
  '00000000-0000-0000-0000-000000000000',  -- reemplazar por owner_id de la branch
  now() + interval '7 days',
  100,
  0,
  false
)
RETURNING id, token, branch_id, expires_at, max_uses, current_uses;
*/

-- 6) Opcional: usar RPC create_guest_qr_token (requiere auth como owner o gerente/supervisor de esa branch)
-- Desde la app o con service_role:
-- select * from public.create_guest_qr_token(
--   'branch-uuid-aqui'::uuid,
--   '1w',
--   100
-- );
