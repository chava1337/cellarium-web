-- Permite al owner eliminar solo sucursales no principales desde la app.
-- Sin esta policy, DELETE en branches afectaba 0 filas por RLS y la app mostraba éxito falso.

CREATE POLICY "Users can delete own non-main branches"
ON public.branches
FOR DELETE
TO public
USING (
  auth.uid() = owner_id
  AND coalesce(is_main, false) = false
);
