-- =============================================================================
-- Verificación de usuario supervisor (Cellarium)
-- Ejecutar en Supabase SQL Editor o cliente PostgreSQL contra la BD del proyecto
-- =============================================================================

-- 1) Usuario(s) con rol supervisor (revisar que role sea exactamente 'supervisor')
SELECT
  id,
  email,
  name,
  role,
  status,
  owner_id,
  branch_id,
  created_at,
  length(role) AS role_length,
  role = 'supervisor' AS role_equals_supervisor_lowercase,
  (role IS NULL OR trim(role) = '') AS role_empty_or_null
FROM public.users
WHERE role = 'supervisor'
   OR lower(trim(role)) = 'supervisor'
ORDER BY email;

-- 2) Por email concreto (sustituir por el email del usuario de prueba)
-- SELECT
--   id,
--   email,
--   name,
--   role,
--   status,
--   owner_id,
--   branch_id,
--   length(role) AS role_length,
--   role = 'supervisor' AS role_equals_supervisor
-- FROM public.users
-- WHERE email = 'SUPERVISOR_EMAIL@ejemplo.com';

-- 3) Comprobar que no hay duplicados por id
-- SELECT id, email, role, count(*) OVER (PARTITION BY id) AS row_count
-- FROM public.users
-- WHERE role = 'supervisor' OR email = 'SUPERVISOR_EMAIL@ejemplo.com';
