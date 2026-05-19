-- =============================================================================
-- RLS multitenancy / multi-sucursal (incremental; NO edita migraciones previas)
-- =============================================================================
--
-- --- FASE 1 — AUDITORÍA (referencia; aplicada ya en producción vía migraciones
--     base + fixes). Resumen de hallazgos ---
--
-- wine_branch_stock:
--   - En algunos entornos relrowsecurity = false → superficie sin RLS.
--   - staff_can_* solo validaba owner/vía wines.owner_id; sin users.branch_id =
--     wine_branch_stock.branch_id → cross-branch dentro del mismo tenant.
--   - Mantener: guests_can_view_public_stock (menú guest anónimo vía qr_tokens).
--
-- inventory_movements:
--   - Redundancia: "Users can insert/view...", owner_can_create_movements,
--     staff_can_* — PERMISSIVE OR → la política más amplia gana.
--   - staff_can_view_owner_movements: solo owner_id → todas las sucursales.
--
-- sales / sale_items:
--   - staff_can_*: mismo antipatrón (solo owner_id del staff).
--
-- qr_tokens:
--   - "Owners can view their qr_tokens": (auth.uid() = owner_id) OR
--     (expires_at > now()) → cualquier usuario autenticado leía tokens activos
--     de otros tenants (crítico).
--   - create_guest_qr_token es SECURITY DEFINER → no depende de INSERT RLS.
--
-- guest_sessions:
--   - Sin RLS en schema base + grants amplios → riesgo de lectura/escritura
--     cruzada. Uso app: SELECT por branch (QrService). Edge public-menu no usa
--     esta tabla (service_role). RPCs con service_role ignoran RLS.
--
-- branches / cocktail_menu:
--   - branches: SELECT ya limita staff a su branch_id (OK).
--   - cocktail_menu: INSERT corregido en 20260222130000; delete/select/update
--     ya exigen misma sucursal para staff (OK). Sin cambios aquí.
--
-- =============================================================================
-- FASE 2 — IMPLEMENTACIÓN
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) Activar RLS (idempotente)
-- -----------------------------------------------------------------------------
ALTER TABLE public.wine_branch_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_sessions ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- B) wine_branch_stock — reemplazar políticas owner/staff; conservar guest anon
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "guests_can_view_public_stock" ON public.wine_branch_stock;
DROP POLICY IF EXISTS "owner_can_create_stock" ON public.wine_branch_stock;
DROP POLICY IF EXISTS "owner_can_delete_their_stock" ON public.wine_branch_stock;
DROP POLICY IF EXISTS "owner_can_update_their_stock" ON public.wine_branch_stock;
DROP POLICY IF EXISTS "owner_can_view_their_stock" ON public.wine_branch_stock;
DROP POLICY IF EXISTS "staff_can_create_owner_stock" ON public.wine_branch_stock;
DROP POLICY IF EXISTS "staff_can_update_owner_stock" ON public.wine_branch_stock;
DROP POLICY IF EXISTS "staff_can_view_owner_stock" ON public.wine_branch_stock;

-- Invitado anónimo: mismo criterio que antes (stock visible si hay QR guest activo).
CREATE POLICY "guests_can_view_public_stock"
  ON public.wine_branch_stock
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    branch_id IN (
      SELECT qr.branch_id
      FROM public.qr_tokens qr
      WHERE qr.type = 'guest'
        AND qr.expires_at > now()
        AND (qr.used = false OR qr.used IS NULL)
    )
  );

-- Owner: todas las sucursales del tenant; vino y sucursal deben ser suyos.
CREATE POLICY "wine_branch_stock_owner_select"
  ON public.wine_branch_stock
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.wines w
      WHERE w.id = wine_branch_stock.wine_id AND w.owner_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = wine_branch_stock.branch_id AND b.owner_id = auth.uid()
    )
  );

CREATE POLICY "wine_branch_stock_owner_insert"
  ON public.wine_branch_stock
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wines w
      WHERE w.id = wine_branch_stock.wine_id AND w.owner_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = wine_branch_stock.branch_id AND b.owner_id = auth.uid()
    )
  );

CREATE POLICY "wine_branch_stock_owner_update"
  ON public.wine_branch_stock
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.wines w
      WHERE w.id = wine_branch_stock.wine_id AND w.owner_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = wine_branch_stock.branch_id AND b.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wines w
      WHERE w.id = wine_branch_stock.wine_id AND w.owner_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = wine_branch_stock.branch_id AND b.owner_id = auth.uid()
    )
  );

CREATE POLICY "wine_branch_stock_owner_delete"
  ON public.wine_branch_stock
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.wines w
      WHERE w.id = wine_branch_stock.wine_id AND w.owner_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = wine_branch_stock.branch_id AND b.owner_id = auth.uid()
    )
  );

-- Staff: solo filas de SU sucursal (users.branch_id); mismo tenant (owner_id).
CREATE POLICY "wine_branch_stock_staff_select"
  ON public.wine_branch_stock
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.owner_id IS NOT NULL
        AND u.branch_id = wine_branch_stock.branch_id
    )
    AND EXISTS (
      SELECT 1 FROM public.wines w
      WHERE w.id = wine_branch_stock.wine_id
        AND w.owner_id = (SELECT u2.owner_id FROM public.users u2 WHERE u2.id = auth.uid())
    )
  );

CREATE POLICY "wine_branch_stock_staff_insert"
  ON public.wine_branch_stock
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.owner_id IS NOT NULL
        AND u.branch_id = wine_branch_stock.branch_id
    )
    AND EXISTS (
      SELECT 1 FROM public.wines w
      WHERE w.id = wine_branch_stock.wine_id
        AND w.owner_id = (SELECT u2.owner_id FROM public.users u2 WHERE u2.id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = wine_branch_stock.branch_id
        AND b.owner_id = (SELECT u3.owner_id FROM public.users u3 WHERE u3.id = auth.uid())
    )
  );

CREATE POLICY "wine_branch_stock_staff_update"
  ON public.wine_branch_stock
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.owner_id IS NOT NULL
        AND u.branch_id = wine_branch_stock.branch_id
    )
    AND EXISTS (
      SELECT 1 FROM public.wines w
      WHERE w.id = wine_branch_stock.wine_id
        AND w.owner_id = (SELECT u2.owner_id FROM public.users u2 WHERE u2.id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.owner_id IS NOT NULL
        AND u.branch_id = wine_branch_stock.branch_id
    )
    AND EXISTS (
      SELECT 1 FROM public.wines w
      WHERE w.id = wine_branch_stock.wine_id
        AND w.owner_id = (SELECT u2.owner_id FROM public.users u2 WHERE u2.id = auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- C) inventory_movements — quitar políticas amplias y duplicadas; aislar staff
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert movements for their owner" ON public.inventory_movements;
DROP POLICY IF EXISTS "Users can view their owner's movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "owner_can_create_movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "staff_can_create_owner_movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "staff_can_view_owner_movements" ON public.inventory_movements;

-- Owner: cualquier sucursal de su cuenta (owner_id en fila = auth.uid()).
CREATE POLICY "inventory_movements_insert_owner"
  ON public.inventory_movements
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = branch_id AND b.owner_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.wines w
      WHERE w.id = wine_id AND w.owner_id = auth.uid()
    )
  );

-- Staff: solo movimientos de su branch_id.
CREATE POLICY "inventory_movements_insert_staff"
  ON public.inventory_movements
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.owner_id IS NOT NULL
        AND u.branch_id = branch_id
        AND owner_id = u.owner_id
    )
    AND EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = branch_id AND b.owner_id = owner_id
    )
    AND EXISTS (
      SELECT 1 FROM public.wines w
      WHERE w.id = wine_id AND w.owner_id = owner_id
    )
  );

CREATE POLICY "inventory_movements_select_staff"
  ON public.inventory_movements
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.owner_id IS NOT NULL
        AND u.branch_id = inventory_movements.branch_id
        AND inventory_movements.owner_id = u.owner_id
    )
  );

-- owner_can_view_their_movements, owner_can_update_*, owner_can_delete_* sin cambios de nombre

-- -----------------------------------------------------------------------------
-- D) sales — políticas staff con branch_id
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "staff_can_create_owner_sales" ON public.sales;
DROP POLICY IF EXISTS "staff_can_update_owner_sales" ON public.sales;
DROP POLICY IF EXISTS "staff_can_view_owner_sales" ON public.sales;

CREATE POLICY "sales_staff_select"
  ON public.sales
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.owner_id IS NOT NULL
        AND u.branch_id = sales.branch_id
        AND sales.owner_id = u.owner_id
    )
  );

CREATE POLICY "sales_staff_insert"
  ON public.sales
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.owner_id IS NOT NULL
        AND u.branch_id = branch_id
        AND owner_id = u.owner_id
    )
    AND EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = branch_id AND b.owner_id = owner_id
    )
  );

CREATE POLICY "sales_staff_update"
  ON public.sales
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.owner_id IS NOT NULL
        AND u.branch_id = sales.branch_id
        AND sales.owner_id = u.owner_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.owner_id IS NOT NULL
        AND u.branch_id = branch_id
        AND owner_id = u.owner_id
    )
  );

-- -----------------------------------------------------------------------------
-- E) sale_items — staff solo si la venta es de su sucursal
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "staff_can_create_owner_sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "staff_can_update_owner_sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "staff_can_view_owner_sale_items" ON public.sale_items;

CREATE POLICY "sale_items_staff_select"
  ON public.sale_items
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.sales s
      JOIN public.users u ON u.id = auth.uid()
      WHERE s.id = sale_id
        AND u.owner_id IS NOT NULL
        AND s.branch_id = u.branch_id
        AND s.owner_id = u.owner_id
    )
  );

CREATE POLICY "sale_items_staff_insert"
  ON public.sale_items
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales s
      JOIN public.users u ON u.id = auth.uid()
      WHERE s.id = sale_id
        AND u.owner_id IS NOT NULL
        AND s.branch_id = u.branch_id
        AND s.owner_id = u.owner_id
    )
    AND EXISTS (
      SELECT 1 FROM public.wines w
      WHERE w.id = wine_id
        AND w.owner_id = (SELECT u2.owner_id FROM public.users u2 WHERE u2.id = auth.uid())
    )
  );

CREATE POLICY "sale_items_staff_update"
  ON public.sale_items
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.sales s
      JOIN public.users u ON u.id = auth.uid()
      WHERE s.id = sale_id
        AND u.owner_id IS NOT NULL
        AND s.branch_id = u.branch_id
        AND s.owner_id = u.owner_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales s
      JOIN public.users u ON u.id = auth.uid()
      WHERE s.id = sale_id
        AND u.owner_id IS NOT NULL
        AND s.branch_id = u.branch_id
        AND s.owner_id = u.owner_id
    )
  );

-- -----------------------------------------------------------------------------
-- F) qr_tokens — cerrar fuga SELECT; staff por sucursal; escaneo guest limitado
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Owners can view their qr_tokens" ON public.qr_tokens;

-- Owner del tenant
CREATE POLICY "qr_tokens_select_owner"
  ON public.qr_tokens
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (auth.uid() = owner_id);

-- Staff con sucursal asignada: solo tokens de su branch
CREATE POLICY "qr_tokens_select_staff_branch"
  ON public.qr_tokens
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.owner_id IS NOT NULL
        AND u.branch_id = qr_tokens.branch_id
        AND qr_tokens.owner_id = u.owner_id
    )
  );

-- Escaneo de QR sin ser owner/staff (anon o usuario autenticado que escanea):
-- solo filas aún válidas para lectura de metadatos del escaneo.
CREATE POLICY "qr_tokens_select_scan_active"
  ON public.qr_tokens
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    expires_at > now()
    AND type IN ('guest', 'admin_invite')
    AND (type <> 'admin_invite' OR used IS DISTINCT FROM true)
  );

-- Gerente/supervisor/etc.: actualizar tokens de su sucursal (p. ej. desactivar).
CREATE POLICY "qr_tokens_update_staff_branch"
  ON public.qr_tokens
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.owner_id IS NOT NULL
        AND u.branch_id = qr_tokens.branch_id
        AND qr_tokens.owner_id = u.owner_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.owner_id IS NOT NULL
        AND u.branch_id = branch_id
        AND owner_id = u.owner_id
    )
  );

-- Nota: UPDATE de métricas al escanear QR como anon queda cubierto solo si el
-- producto usa sesión autenticada o RPC/Edge con service_role. No se añade
-- política UPDATE abierta por token (evita abuso cross-tenant).

-- -----------------------------------------------------------------------------
-- G) guest_sessions — RLS: sin acceso anónimo; owner y staff por sucursal
-- -----------------------------------------------------------------------------
-- Nota: service_role (Edge Functions, jobs) no aplica RLS.

CREATE POLICY "guest_sessions_select_owner"
  ON public.guest_sessions
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = guest_sessions.branch_id
        AND b.owner_id = auth.uid()
    )
  );

CREATE POLICY "guest_sessions_select_staff"
  ON public.guest_sessions
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      INNER JOIN public.branches b ON b.id = guest_sessions.branch_id
      WHERE u.id = auth.uid()
        AND u.owner_id IS NOT NULL
        AND u.branch_id = guest_sessions.branch_id
        AND b.owner_id = u.owner_id
    )
  );
