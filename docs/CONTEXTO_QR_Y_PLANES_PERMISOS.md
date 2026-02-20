# Contexto verificable: QR + planes + permisos (repo RN)

Solo información comprobada en código y migraciones. Si algo no existe, se indica explícitamente.

---

## 1) Roles: fuente de verdad

### Dónde están definidos/normalizados

| Ubicación | Qué define |
|-----------|------------|
| `src/types/index.ts` | Tipo `User['role']` y lista `validRoles`; normalización `staff` → `personal`. |
| `src/utils/permissions.ts` | Tipo `UserRole`, jerarquía, `canGenerateQr`, `canApproveRole`, `getAssignableRoles`, etc. |
| `src/hooks/useAdminGuard.ts` | `allowedRoles` por defecto para pantallas admin (no incluye sommelier/supervisor). |
| BD `users.role` | Columna `text not null default 'owner'`. **No hay CHECK constraint** en el schema inspeccionado; los valores válidos los impone el código. |

### Valores EXACTOS en código y BD

- En **TypeScript**: `'owner' | 'gerente' | 'sommelier' | 'supervisor' | 'personal'`.
- En **BD**: misma lista; legacy `'staff'` se normaliza a `'personal'` en `normalizeRole()`.
- En **RLS** (tasting_exam_*, etc.): solo se mencionan `'owner'`, `'gerente'`, `'sommelier'` en arrays; no aparecen `supervisor` ni `personal` en esas políticas (sí en otras partes del código).

### Snippets

**`src/types/index.ts` (líneas 8–12, 106):**

```ts
export function normalizeRole(role: string | null | undefined): User['role'] {
  if (!role) return 'personal';
  if (role === 'staff') return 'personal';
  const validRoles: User['role'][] = ['owner', 'gerente', 'sommelier', 'supervisor', 'personal'];
  return validRoles.includes(role as User['role']) ? (role as User['role']) : 'personal';
}
// ...
role?: 'owner' | 'gerente' | 'sommelier' | 'supervisor' | 'personal';
```

**`src/utils/permissions.ts` (líneas 3–12, 54–57):**

```ts
export type UserRole = 'owner' | 'gerente' | 'sommelier' | 'supervisor' | 'personal';

const roleHierarchy: Record<UserRole, number> = {
  owner: 5,
  gerente: 4,
  sommelier: 3,
  supervisor: 2,
  personal: 1,
};
// ...
export const canGenerateQr = (userRole: UserRole): boolean => {
  return true; // Todos los roles pueden generar QR
};
```

**`src/hooks/useAdminGuard.ts` (líneas 21–22, 34, 56):**

```ts
  allowedRoles?: ('owner' | 'gerente' | 'personal')[];
  // ...
  allowedRoles = ['owner', 'gerente', 'personal'],
  // ...
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role as any)) return 'denied';
```

- **Conclusión:** `useAdminGuard` por defecto solo permite `owner`, `gerente`, `personal`. **Sommelier y supervisor quedan "denied"** en pantallas que usan este guard. En `QrGenerationScreen` no se usa `useAdminGuard`; solo se comprueba `user.role` para el botón de QR de invitación admin.

---

## 2) Planes: fuente de verdad (CRÍTICO)

### Dónde se determina el plan efectivo

- **`src/utils/effectivePlan.ts`:** `getEffectivePlan(user)` → `'free' | 'basic' | 'additional-branch'`.
- **`src/utils/planLabels.ts`:** Etiquetas UI: free → "Gratis", basic → "Pro", additional-branch → "Business".
- **`src/utils/branchLimit.ts`:** Usa `getEffectivePlan`; Business = `'additional-branch'` (3 sucursales base), Free/Pro = 1.
- **`src/utils/subscriptionPermissions.ts`:** `PLAN_LIMITS` por plan; usa `getEffectivePlan`.
- **Campos en `users`:** `subscription_plan`, `subscription_active`, `subscription_expires_at`, `subscription_branch_addons_count` (y otros ya documentados).

### Valores exactos de plan en código

| Valor en BD / código | Etiqueta UI (planLabels) | Pro vs Business |
|----------------------|---------------------------|------------------|
| `'free'` | Gratis | Free |
| `'basic'` | Pro | **Pro** |
| `'additional-branch'` | Business | **Business** |

- **Pro** = plan efectivo `'basic'` (función `isPro(user)`).
- **Business** = plan efectivo `'additional-branch'` (función `isBusiness(user)`).
- No hay literales `'pro'` ni `'business'` en `users.subscription_plan`; Stripe usa lookup_key y se mapean a estos tres.

### Stripe lookup_key → plan_id

**`supabase/functions/create-checkout-session/index.ts` (líneas 23–27):**

```ts
// Mapeo interno -> Stripe lookup_key
const PLAN_LOOKUP_KEY_MAP = {
  pro_monthly: 'pro_monthly',
  business_monthly: 'business_monthly_mxn',
} as const;
```

- El cliente envía `planLookupKey` interno (`pro_monthly` o `business_monthly`); la Edge lo mapea al lookup_key de Stripe. No se escribe `subscription_plan` en create-checkout-session; lo hace el webhook.

**`supabase/functions/stripe-webhook/index.ts` (líneas 121–146, 158–161):**

```ts
const ALLOWED_PLAN_IDS = new Set(['free', 'basic', 'additional-branch'] as const);
// ...
function normalizePlanId(_invoicePlan: string | null, key: string): AllowedPlanId {
  const i = (key || '').toLowerCase();
  if (i === 'free' || i === 'basic' || i === 'additional-branch') return i as AllowedPlanId;
  if (i === 'pro' || i.startsWith('pro_')) return 'basic';
  if (i === 'business' || i.startsWith('business_')) return 'additional-branch';
  if (key.startsWith('pro_')) return 'basic';
  if (key.startsWith('business_')) return 'additional-branch';
  if (key.startsWith('basic_')) return 'basic';
  if (key.startsWith('free_')) return 'free';
  return 'basic';
}
// ...
function mapPlanFromLookupKey(key: string): { plan_id: AllowedPlanId; plan_name: string } {
  if (key.startsWith('business_')) return { plan_id: 'additional-branch', plan_name: 'Business' };
  if (key.startsWith('pro_')) return { plan_id: 'basic', plan_name: 'Pro' };
  if (key.startsWith('basic_')) return { plan_id: 'basic', plan_name: 'Basic' };
  return { plan_id: 'free', plan_name: 'Free' };
}
```

- Los únicos valores que se persisten en `users.subscription_plan` son: **`'free'`, `'basic'`, `'additional-branch'`**.

### Snippets de effectivePlan y branchLimit

**`src/utils/effectivePlan.ts` (completo):**

```ts
export type EffectivePlanId = 'free' | 'basic' | 'additional-branch';

export function getEffectivePlan(user: User | null): EffectivePlanId {
  if (!user) return 'free';
  if (user.subscription_active !== true) return 'free';
  if (user.subscription_expires_at != null) {
    const expiresAt = new Date(user.subscription_expires_at);
    if (!isNaN(expiresAt.getTime()) && expiresAt <= new Date()) return 'free';
  }
  const plan = user.subscription_plan ?? 'free';
  if (plan === 'free' || plan === 'basic' || plan === 'additional-branch') return plan;
  return 'free';
}

export function isBusiness(user: User | null): boolean {
  return getEffectivePlan(user) === 'additional-branch';
}
export function isPro(user: User | null): boolean {
  return getEffectivePlan(user) === 'basic';
}
export function isFree(user: User | null): boolean {
  return getEffectivePlan(user) === 'free';
}
```

**`src/utils/branchLimit.ts` (líneas 26–35):**

```ts
  const effectivePlan = getEffectivePlan(user);
  const included = effectivePlan === 'additional-branch' ? 3 : 1;
  const addons = user.subscription_branch_addons_count ?? 0;
  const limit = included + addons;
  return { included, addons, limit };
```

---

## 3) QR: generación actual

### ¿Insert directo o RPC?

- **Inserción:** Directa a `qr_tokens` vía `supabase.from('qr_tokens').insert({ ... }).select(...).single()`.
- **Token string:** Se obtiene con **RPC `generate_qr_token`**; si falla, fallback local (32 caracteres alfanuméricos + `-_`).

### Cálculo de expires_at

- `expiresInHours = data.expiresInHours || 24`.
- `expiresAt = new Date(); expiresAt.setHours(expiresAt.getHours() + expiresInHours);` → se guarda `expiresAt.toISOString()`.

### Payload que va al QR (objeto antes del encode)

- Lo construye `QrTokenService.generateUniversalQrUrl(qrData)` con `QrTokenData`: `{ type, token, branchId, branchName }`.
- En **guest:** `type: 'guest'`, `expiresInHours: 24`, `maxUses: 100`.
- En **admin_invite:** `type: 'admin_invite'`, `expiresInHours: 24 * 7`, `maxUses: 1`.
- La URL final es `https://cellarium-visualizador-web.vercel.app/qr?data=${encodeURIComponent(JSON.stringify(qrData))}`.

### Dónde se arma el objeto y cómo se elige la branch

- **Armado del objeto para compartir/mostrar QR:** En `QrGenerationScreen`, al compartir o renderizar el QR se llama `generateUniversalQrUrl({ type: selectedQr.type, token: selectedQr.token, branchId: selectedQr.branchId, branchName: selectedQr.branchName })`. El `selectedQr` viene del resultado de `generateQrToken(...)` que ya trae `branchId` y `branchName` del select con join a `branches`.
- **Branch usada al generar:** Siempre `currentBranch` de `useBranch()`. No hay selector de sucursal en la pantalla de generación; se usa la sucursal actual del contexto.

### Snippets

**`src/services/QrGenerationService.ts` (líneas 40–72, 96–112):**

```ts
    const expiresInHours = data.expiresInHours || 24;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);

    const { data: qrToken, error } = await supabase
      .from('qr_tokens')
      .insert({
        token: token,
        type: data.type,
        branch_id: data.branchId,
        created_by: data.createdBy,
        owner_id: data.ownerId,
        expires_at: expiresAt.toISOString(),
        max_uses: data.maxUses || 1,
        current_uses: 0,
        used: false,
      })
      .select(`id, token, type, branch_id, created_at, expires_at, max_uses, branches ( id, name )`)
      .single();
```

```ts
const generateUniqueToken = async (): Promise<string> => {
  const { data, error } = await supabase.rpc('generate_qr_token');
  if (error) {
    // Fallback: 32 chars alfanum + -_
    ...
  }
  return data;
};
```

**`src/services/QrTokenService.ts` (líneas 124–131):**

```ts
export const generateUniversalQrUrl = (qrData: QrTokenData): string => {
  const encodedData = encodeURIComponent(JSON.stringify(qrData));
  const universalUrl = `https://cellarium-visualizador-web.vercel.app/qr?data=${encodedData}`;
  return universalUrl;
};
```

**`src/screens/QrGenerationScreen.tsx` (líneas 68–82, 143–149):**

```ts
  const handleGenerateGuestQr = async () => {
    if (!currentBranch || !user?.id) { ... }
    const newQr = await generateQrToken({
      type: 'guest',
      branchId: currentBranch.id,
      createdBy: user.id,
      ownerId: user.owner_id || user.id,
      expiresInHours: 24,
      maxUses: 100,
    });
    // ...
  };
  // handleShareQr / QRCode value:
  generateUniversalQrUrl({
    type: selectedQr.type,
    token: selectedQr.token,
    branchId: selectedQr.branchId,
    branchName: selectedQr.branchName,
  });
```

---

## 4) Branch seleccionado (enforcement UI)

### Qué es “branch seleccionado”

- **`currentBranch`** en `BranchContext`: es la sucursal con la que el usuario trabaja en la app (catálogo, inventario, QR, etc.).
- Sale de **`loadBranchesFromDB(user)`**: se cargan branches con `owner_id = ownerUser.owner_id || ownerUser.id`; si el usuario es **owner**, se muestran todas y por defecto se hace `setCurrentBranch(filteredBranches[0])`; si es staff, se filtra por `branch.id === ownerUser.branch_id` y se setea esa (o la primera si hay varias).

### Owner y users.branch_id

- En BD, **owner** puede tener `branch_id` null (no hay constraint que lo obligue a una sucursal). En código, para owner se usa `owner_id = ownerUser.id` y se listan todas sus branches; no se usa `user.branch_id` para filtrar. Para staff, `user.branch_id` es la sucursal asignada.

### Cómo se setea currentBranch

- En **BranchContext:** al cargar, `setCurrentBranch(filteredBranches[0])` para owner, o `setCurrentBranch(assignedBranch || filteredBranches[0])` para staff.
- En **AdminDashboardScreen:** el usuario puede elegir otra branch del selector y se llama `setCurrentBranch(branch)`.
- En **BranchManagementScreen:** al editar/crear, se puede actualizar la lista y `setCurrentBranch(data)` si aplica.
- En **WineCatalogScreen:** al guardar nombre de branch se hace `setCurrentBranch(data)` y `setAvailableBranches(updatedBranches)`.

No hay una “lógica extra” que fuerce todas las acciones al branch seleccionado más allá de que las pantallas usen `currentBranch` (o `route.params.branchId` donde exista) para sus queries.

### Snippet BranchContext (líneas 33–64, 76–84):**

```ts
  const loadBranchesFromDB = useCallback(async (ownerUser: User) => {
    const ownerId = ownerUser.owner_id || ownerUser.id;
    const { data: branches, error } = await supabase
      .from('branches')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: true });
    let filteredBranches: Branch[] = [];
    if (ownerUser.role === 'owner') {
      filteredBranches = branches || [];
    } else {
      filteredBranches = (branches || []).filter(branch => branch.id === ownerUser.branch_id);
    }
    setAvailableBranches(filteredBranches);
    if (filteredBranches.length > 0) {
      if (ownerUser.role === 'owner') {
        setCurrentBranch(filteredBranches[0]);
      } else {
        const assignedBranch = filteredBranches.find(b => b.id === ownerUser.branch_id);
        setCurrentBranch(assignedBranch || filteredBranches[0]);
      }
    }
    // ...
  }, []);

  useEffect(() => {
    if (user && profileReady) {
      loadBranchesFromDB(user as User);
    } else if (!user) {
      setAvailableBranches([]);
      setCurrentBranch(null);
      // ...
    }
  }, [user, profileReady, loadBranchesFromDB]);
```

---

## 5) Resumen final

### Lista exacta de roles (strings) en runtime

- `'owner'`
- `'gerente'`
- `'sommelier'`
- `'supervisor'`
- `'personal'`  
(legacy `'staff'` se normaliza a `'personal'` en `normalizeRole`).

### Lista exacta de planes (strings) y mapeo a Free / Pro / Business

| Valor en BD y código | Free | Pro | Business |
|----------------------|------|-----|----------|
| `'free'` | ✓ | | |
| `'basic'` | | ✓ | |
| `'additional-branch'` | | | ✓ |

- Pro = `getEffectivePlan(user) === 'basic'` (`isPro(user)`).
- Business = `getEffectivePlan(user) === 'additional-branch'` (`isBusiness(user)`).
- No usar `'pro'` ni `'business'` como valor de `subscription_plan` en BD.

### Propuesta de gating UI para “Generar QR”

- **QR guest (comensales):**
  - Hoy: cualquier rol con `currentBranch` y `user` puede generar (24 h, 100 usos). `permissions.canGenerateQr` devuelve `true` para todos.
  - Para restringir por rol: por ejemplo solo `owner`, `gerente`, `sommelier`, `supervisor`, `personal` (o el subconjunto que definas) y ocultar/deshabilitar el botón si `!allowedRoles.includes(user.role)`.
  - Para restringir por plan: si quieres que solo Pro/Business puedan generar QR guest, usar `!isFree(user)` (o `isPro(user) || isBusiness(user)`). Solo aplica a **owners** (subscriptionPermissions ya ignora límites si `user.role !== 'owner'`).
  - Para expiración 1w/2w/1m: hoy solo 24h (guest) y 7d (admin_invite). Habría que pasar `expiresInHours` (24, 168, 336, 720) o añadir un selector en UI y seguir usando la misma inserción con `expires_at` calculado.

- **QR admin_invite:**
  - Hoy: solo `user.role === 'owner' || user.role === 'gerente'` ven el botón; el resto ve “Acceso restringido”. Mantener este gating.

- **Resumen gating sugerido (ejemplo):**
  - **Generar QR comensales:** Permitir si `currentBranch` y `user` existen y (opcional) `user.role === 'owner'` O plan efectivo no Free para owners. Opcional: selector de duración (24h / 1 semana / 2 semanas / 1 mes) y pasar `expiresInHours` correspondiente.
  - **Generar QR invitación admin:** Solo `user.role === 'owner' || user.role === 'gerente'` (como ahora).

### Riesgos / ambigüedades

1. **useAdminGuard** permite por defecto solo `owner`, `gerente`, `personal`. Pantallas que usen este guard sin override rechazan a **sommelier** y **supervisor** (status `denied`). Si quieres que sommelier/supervisor accedan a “Generar QR”, no deben depender de ese guard en esa pantalla (como ya pasa en QrGenerationScreen) o hay que pasar `allowedRoles` que los incluyan.
2. **BD `users.role`** no tiene CHECK; valores raros en BD podrían dar comportamientos inesperados si no se normalizan con `normalizeRole` en todos los flujos.
3. **Expiración QR guest:** hoy fija 24h. Si se añaden 1w/2w/1m, hay que asegurar que el tipo de token y la tabla sigan siendo los mismos y que el front/backend que valida el token siga usando `expires_at` correctamente.
4. **Stripe lookup_key:** create-checkout-session solo acepta `pro_monthly` y `business_monthly`; el webhook normaliza cualquier `pro_*` → `basic` y `business_*` → `additional-branch`. Cualquier otro lookup_key en Stripe debe estar alineado con esa lógica si quieres consistencia con `getEffectivePlan`.
