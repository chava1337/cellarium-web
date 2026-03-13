# QR_SYSTEM_AUDIT — Sistema QR completo

**Solo lectura.** Estado actual: sin validateQrToken en flujo QR; guest vía public-menu; staff vía resolve-qr.

---

## 1. Tipos de token

- **guest:** Menú público en una sucursal; max_uses típicamente alto; no se marca "used" en un solo uso (solo current_uses incrementado si se implementa).
- **admin_invite:** Invitación staff; 1 uso; resolve-qr marca used y used_at.

Campos relevantes en `qr_tokens`: type, token, branch_id, owner_id, expires_at, used, used_at, current_uses, max_uses, created_by.

---

## 2. Generación

- **App:** QrGenerationScreen. Para comensales: `createGuestQrToken(branchId, duration, maxUses)` → RPC `create_guest_qr_token` (supabase/functions no; RPC en migración `20260222150000_create_guest_qr_token_rpc.sql`). Para admin: generateQrToken (QrGenerationService) → insert o RPC según servicio.
- **Gating:** canGenerateGuestQr (owner: getEffectivePlan; gerente/supervisor: status active, owner_id/branch_id no null, user.branch_id === currentBranchId). canGenerateAdminInviteQr: owner o gerente. No se usa ownerEffectivePlan para gerente (siempre permitido si branch coincide).

---

## 3. Consumo

- **App staff:** QrProcessorScreen detecta payload type admin/admin_invite → llama Edge `resolve-qr` (POST { token }) → si success navega a AdminRegistration con qrToken, ownerId, branchId, branchName. No se usa validateQrToken.
- **App guest:** Payload type guest → navega a WineCatalog con isGuest: true, guestToken: token. WineCatalogScreen con guestToken llama PublicMenuService.getPublicMenuByToken(guestToken) → Edge public-menu (GET ?token= o POST body) → pinta menú. No SELECT a qr_tokens ni wine_branch_stock desde cliente.
- **Legacy (QR sin type):** QrProcessorScreen intenta primero public-menu; si falla, resolve-qr. Si ambos fallan, Alert "Este QR expiró o ya no es válido". No se usa validateQrToken.

---

## 4. Confirmaciones

- **SELECT cliente a qr_tokens:** QrTokenService.validateQrToken hace SELECT/UPDATE qr_tokens pero **no se llama** desde ningún flujo QR actual. QrGenerationService (insert/select por created_by) usa usuario autenticado. QrService (clase con validateQrToken) no está importada en ningún archivo.
- **Anon y qr_tokens:** En schema base, policy "Owners can view their qr_tokens" incluye `OR (expires_at > now())`, por lo que anon podría ver tokens no expirados. Si en producción se endureció RLS (solo authenticated o eliminación de esa cláusula), anon no ve filas. Verificar en BD.

---

## 5. Archivos clave

| Archivo | Uso |
|---------|-----|
| `src/screens/QrProcessorScreen.tsx` | Procesa QR; resolve-qr (staff); public-menu (guest/legacy); sin validateQrToken. |
| `src/services/PublicMenuService.ts` | getPublicMenuByToken → fetch Edge public-menu. |
| `src/screens/WineCatalogScreen.tsx` | Guest con guestToken: loadGuestMenuByToken; guards evitan loadWines cuando isGuest sin token. |
| `src/services/QrGenerationService.ts` | createGuestQrToken (RPC), getUserQrTokens, etc.; from('qr_tokens') con auth. |
| `src/utils/permissions.ts` | canGenerateGuestQr, canGenerateAdminInviteQr. |
| `supabase/functions/resolve-qr/index.ts` | POST; service_role; qr_tokens SELECT + UPDATE (admin_invite). |
| `supabase/functions/public-menu/index.ts` | GET/POST; service_role; qr_tokens + branches + wine_branch_stock + wines. |
