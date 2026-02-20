-- P0: Fix RLS cocktail_menu INSERT - staff must insert only into their owner_id/branch_id.
-- Before: policy used u.owner_id = u.owner_id AND u.branch_id = u.branch_id (always true).
-- After: staff can insert only when cocktail_menu.owner_id = u.owner_id AND cocktail_menu.branch_id = u.branch_id.

DROP POLICY IF EXISTS "cocktail_menu_insert_owner" ON public.cocktail_menu;

CREATE POLICY "cocktail_menu_insert_owner" ON public.cocktail_menu FOR INSERT TO public
WITH CHECK (
  (auth.uid() = owner_id)
  OR (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.owner_id IS NOT NULL
        AND u.branch_id IS NOT NULL
        AND u.owner_id = cocktail_menu.owner_id
        AND u.branch_id = cocktail_menu.branch_id
    )
  )
);
