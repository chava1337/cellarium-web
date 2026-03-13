# Ocultar módulos bloqueados por suscripción para staff

**Regla:** Solo el **owner** ve tarjetas bloqueadas por plan (con candado). El **staff** no ve esas tarjetas.

---

## 1. Causa del comportamiento actual

El menú se construía así:
1. **menuItems** → lista completa de ítems.
2. **filteredMenuItems** → filtro por rol (`canAccessFullAdminScreens`, `requiresOwner`, `requiresManager`). Staff con rol gerente/supervisor/etc. pasaba y veía todos los ítems permitidos por rol.
3. **blockedFeatureIds** → ítems bloqueados por plan (inventory, tastings, branches_additional en FREE) usando `checkSubscriptionFeatureByPlan` con plan del owner para staff.
4. **FlatList** usaba `data={filteredMenuItems}` y **renderMenuItem** mostraba cada ítem; si `blockedFeatureIds.has(item.id)` → se pintaba con candado y “Requiere suscripción”, pero la tarjeta **se seguía mostrando** para todos (owner y staff).

Por tanto, staff veía las mismas tarjetas que el owner, incluidas las bloqueadas (con candado). La causa es que no se filtraba por “bloqueado + no owner” antes de pasar la lista al FlatList.

---

## 2. Archivo(s) exactos a tocar

- **`src/screens/AdminDashboardScreen.tsx`** (único archivo modificado).

---

## 3. Función(es) exactas a tocar

- **Nuevo useMemo:** `visibleMenuItems`: lista que se pasa al FlatList.  
  - Si **owner** → `filteredMenuItems` (sin cambiar nada).  
  - Si **staff** → `filteredMenuItems.filter(item => !blockedFeatureIds.has(item.id))` (se ocultan ítems bloqueados por suscripción).
- **FlatList:** `data` pasa de `filteredMenuItems` a `visibleMenuItems`.

No se modifica `renderMenuItem`, `blockedFeatureIds`, ni la lógica de roles/suscripción fuera del armado del menú.

---

## 4. Cambio mínimo aplicado

- Añadido **visibleMenuItems**:
  - `isOwner` → `filteredMenuItems`.
  - no owner (staff) → se excluyen ítems cuyo `item.id` está en `blockedFeatureIds`.
- FlatList usa **data={visibleMenuItems}** en lugar de **data={filteredMenuItems}**.

Con esto:
- Owner sigue viendo todos los ítems permitidos por rol, incluidos los bloqueados (con candado).
- Staff solo ve ítems que no están bloqueados por plan; las tarjetas bloqueadas desaparecen del menú.

---

## 5. Código exacto (diff)

```diff
  }, [user, isOwner, ownerPlanForGating, filteredMenuItems]);

+  // Staff no debe ver tarjetas bloqueadas por suscripción; owner sí las ve (con candado).
+  const visibleMenuItems = useMemo(() => {
+    if (isOwner) return filteredMenuItems;
+    return filteredMenuItems.filter(item => !blockedFeatureIds.has(item.id));
+  }, [isOwner, filteredMenuItems, blockedFeatureIds]);
+
   // Renderizar item del menú
   const renderMenuItem = useCallback(...

       <FlatList
-        data={filteredMenuItems}
+        data={visibleMenuItems}
```

---

## 6. Checklist de pruebas manuales

- [ ] **Owner FREE:** Ve tarjetas de Inventario, Catas, Sucursales (y las que apliquen) con candado / “Requiere suscripción”; al tocarlas sale el alert y puede ir a Suscripciones.
- [ ] **Gerente en org FREE:** No ve tarjetas de Inventario, Catas ni Sucursales adicionales; solo ve ítems permitidos por rol y por plan (catálogo, vinos, QR, usuarios, etc. según rol).
- [ ] **Supervisor / sommelier / personal en org FREE:** Tampoco ven esas tarjetas bloqueadas; menú según rol sin ítems bloqueados.
- [ ] **Owner con plan de pago:** Ve todos los módulos desbloqueados, sin candados (o los que correspondan al plan).
- [ ] **Staff en org con plan de pago:** Ve solo lo permitido por rol; no aparecen tarjetas “bloqueadas” porque el plan no bloquea esos ítems.
- [ ] **Menú reducido (personal):** Sigue viendo solo Catas y Configuración; si por plan alguno estuviera bloqueado, para personal (staff) no se mostraría esa tarjeta.
- [ ] **Navegación:** Los ítems visibles siguen abriendo las mismas pantallas; no se cambia lógica de permisos en backend ni en otras pantallas.
