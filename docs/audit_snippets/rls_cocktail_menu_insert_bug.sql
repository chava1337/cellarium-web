-- BUG P0: cocktail_menu_insert_owner (remote_schema ~3569)
-- La condición para staff usa u.owner_id = u.owner_id AND u.branch_id = u.branch_id (siempre true).
-- Cualquier usuario autenticado podría INSERT en cocktail_menu con cualquier owner_id/branch_id.

create policy "cocktail_menu_insert_owner" on "public"."cocktail_menu" for insert to public
with check (((auth.uid() = owner_id) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.owner_id = u.owner_id) AND (u.branch_id = u.branch_id))))));
--                                         ^^^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^  SIEMPRE TRUE

-- FIX: restringir staff a su owner y branch del row:
-- with check (
--   (auth.uid() = owner_id)
--   OR (EXISTS (
--     SELECT 1 FROM users u
--     WHERE u.id = auth.uid() AND u.owner_id IS NOT NULL AND u.branch_id IS NOT NULL
--       AND u.owner_id = cocktail_menu.owner_id AND u.branch_id = cocktail_menu.branch_id
--   ))
-- );
