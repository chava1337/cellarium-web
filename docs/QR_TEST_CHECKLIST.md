# Checklist de pruebas manuales – Flujos QR

Usar este checklist para validar flujos de QR (guest y staff) antes y después de cambios en RLS o en la Edge resolve-qr. Verificar logs con los prefijos indicados (sin exponer tokens ni PII).

---

## Cómo verificar con logs

- **App (__DEV__):** Consola Metro/Expo: buscar `[QrProcessor]`, `[QR_VALIDATE]` (si se añade en Fase 1), `[QrGenerationService]`.
- **Edge public-menu:** Supabase Dashboard → Edge Functions → public-menu → Logs: buscar `[PUBLIC_MENU]` (si se añade).
- **Edge resolve-qr (futuro):** Logs con prefijo `[RESOLVE_QR]`.
- No imprimir nunca el token completo; solo últimos 4 caracteres o “***” en logs.

---

## Casos mínimos (12+)

### Guest – generación y primer uso

| # | Caso | Pasos | Resultado esperado | Verificación en logs |
|---|------|--------|--------------------|----------------------|
| 1 | Owner genera QR para comensales | Login como owner → QrGeneration → tipo Comensales → generar → guardar/imprimir QR | Se muestra URL/QR con token; duración y usos según elegido | Log de creación (branch, tipo guest); sin token completo |
| 2 | Comensal escanea QR guest (app) | Abrir app (o deep link) → escanear QR guest → validar | Mensaje “Bienvenido a [sucursal]” → redirección a WineCatalog con vinos del branch | validateQrToken ok; tipo guest; navegación a WineCatalog |
| 3 | Stock carga en WineCatalog (guest) | Tras 2, en WineCatalog en modo guest | Lista de vinos con precios/stock del branch correcto | Sin error RLS; posible log de getWinesByBranch o de public-menu si se usa |
| 4 | Token guest marcado / contador | Tras 2, en BD o en “estadísticas” del token (si existe UI) | current_uses incrementado (o lógica 1 uso aplicada) | qr_scans INSERT; qr_tokens UPDATE current_uses |

### Guest – re-scan y expiración

| # | Caso | Pasos | Resultado esperado | Verificación en logs |
|---|------|--------|--------------------|----------------------|
| 5 | Re-escanear mismo QR guest (N usos) | Mismo QR guest escaneado de nuevo (si max_uses > 1) | Según política: éxito o “límite alcanzado” | Si límite: current_uses >= max_uses en validación |
| 6 | Token guest expirado | Usar QR guest pasado expires_at (o revocar y usar el mismo) | Error “expirado” o “Solicita uno nuevo al restaurante” | validateQrToken o resolve-qr devuelve expired |
| 7 | UI “Generar nuevo QR” / “Solicitar nuevo QR” | Tras 6 (o tras “token usado” si es 1 uso) | Mensaje claro y botón/enlace para volver o pedir nuevo QR | Texto visible en pantalla; sin crash |

### Staff – invitación y 1 uso

| # | Caso | Pasos | Resultado esperado | Verificación en logs |
|---|------|--------|--------------------|----------------------|
| 8 | Owner genera QR invitación admin | QrGeneration → tipo Invitación Admin → generar | QR/URL con type admin (admin_invite en BD) | Insert qr_tokens type admin_invite, max_uses 1 |
| 9 | Staff escanea QR invitación (app) | Escanear QR staff → validar | “Invitación validada” → AdminRegistration con branch/sucursal | validateQrToken ok; tipo admin; navegación a AdminRegistration |
| 10 | Staff completa registro | En AdminRegistration: email, nombre, (username) → enviar | Usuario creado (pending); asignado a branch correcto | user-created o create_staff_user; owner_id/branch_id desde qr_tokens |
| 11 | Token staff marcado used | Tras 9/10, intentar usar el mismo token de nuevo | Error “Este código de invitación ya fue utilizado” | UPDATE qr_tokens used=true; segundo intento falla |
| 12 | Token staff expirado | QR staff pasado expires_at | Error “expirado” o “inválido” | Validación rechaza por expires_at |

### Regeneración y web

| # | Caso | Pasos | Resultado esperado | Verificación en logs |
|---|------|--------|--------------------|----------------------|
| 13 | Owner regenera QR | Generar nuevo QR (guest o staff) para el mismo branch | Nuevo token; QR anterior sigue siendo el mismo (no invalida el viejo hasta expirar/revocar) | Nuevo insert; listado de QRs muestra el nuevo |
| 14 | Web – menú guest (public-menu) | En navegador: GET …/public-menu?token=<token_guest_válido> | 200; JSON con branch y wines | Edge public-menu logs; sin error 404/400 por token |
| 15 | Web – token staff en public-menu | GET …/public-menu?token=<token_staff> | 400 (solo guest aceptado) | Edge responde invalid_token o type !== guest |
| 16 | Listado “Mis QRs” y revocar | Owner entra a lista de QRs generados → revocar uno | Token revocado ya no válido al escanear (expirado) | revokeQrToken; expires_at actualizado; validate falla |

---

## Resumen de prefijos de log recomendados

| Prefijo | Dónde | Qué registrar (sin PII/tokens completos) |
|---------|--------|----------------------------------------|
| `[QrProcessor]` | App – QrProcessorScreen | Initial URL (truncada), deep link event, resultado processQrCode (ok/error) |
| `[QR_VALIDATE]` | App – QrTokenService (Fase 1) | valid/invalid, type (guest/admin), tokenSuffix (últimos 4) |
| `[PUBLIC_MENU]` | Edge public-menu (Fase 1) | tokenSuffix, type, branch_id suffix, result (ok/invalid/expired/limit) |
| `[RESOLVE_QR]` | Edge resolve-qr (Fase 2) | result, type, branch_id suffix |
| `[QrGenerationService]` | App – QrGenerationService | create/list/revoke; branchId; sin token |

---

*Checklist alineado con docs/QR_IMPACT_ANALYSIS.md. Ejecutar al menos una vez por flujo (guest y staff) antes de desplegar cambios en RLS o en resolve-qr.*
