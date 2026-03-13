-- Reemplazo seguro: solo gerente puede ver/actualizar usuarios, y solo de su misma sucursal.
-- Owner sigue usando "Owners can view/update their staff". Sommelier, supervisor y personal
-- no obtienen permisos de gestión de usuarios por RLS.

-- Eliminar políticas demasiado amplias (cualquier staff con owner_id podía ver/editar toda la org)
DROP POLICY IF EXISTS "Staff can view same-organization users" ON public.users;
DROP POLICY IF EXISTS "Staff can update same-organization users" ON public.users;

-- SELECT: solo gerente puede ver su propia fila y usuarios de su misma sucursal (mismo owner_id y branch_id)
CREATE POLICY "Gerente can view same-branch users"
ON public.users
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  (SELECT u.role FROM public.users u WHERE u.id = auth.uid() LIMIT 1) = 'gerente'
  AND (
    id = auth.uid()
    OR (
      (SELECT u.owner_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1) IS NOT NULL
      AND (SELECT u.branch_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1) IS NOT NULL
      AND owner_id = (SELECT u.owner_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1)
      AND branch_id = (SELECT u.branch_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1)
    )
  )
);

-- UPDATE: solo gerente puede actualizar usuarios de su misma sucursal (aprobación y cambio de rol)
CREATE POLICY "Gerente can update same-branch users"
ON public.users
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  (SELECT u.role FROM public.users u WHERE u.id = auth.uid() LIMIT 1) = 'gerente'
  AND (SELECT u.owner_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1) IS NOT NULL
  AND (SELECT u.branch_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1) IS NOT NULL
  AND owner_id = (SELECT u.owner_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1)
  AND branch_id = (SELECT u.branch_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1)
)
WITH CHECK (
  (SELECT u.role FROM public.users u WHERE u.id = auth.uid() LIMIT 1) = 'gerente'
  AND (SELECT u.owner_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1) IS NOT NULL
  AND (SELECT u.branch_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1) IS NOT NULL
  AND owner_id = (SELECT u.owner_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1)
  AND branch_id = (SELECT u.branch_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1)
);
