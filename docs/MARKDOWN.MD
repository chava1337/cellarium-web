# 🍷 App de Carta de Vinos (Tablet) — Especificación General NoirSong Studios

## 1. Objetivo del Proyecto
Desarrollar una aplicación para **tablets (Android/iPad)** que funcione como **carta digital de vinos interactiva** con **inteligencia artificial**, **control de inventario**, **estadísticas de ventas**, **multi-sucursal** y **acceso por QR seguro** para los comensales.  

La app combinará funciones de experiencia al cliente y herramientas de gestión interna, integrando un **panel administrativo completo** con control total sobre el catálogo, stock, proveedores y análisis de rendimiento.

---

## 2. Funcionalidades Principales

### 🧭 Sección Comensal (sin necesidad de registro manual)
- Acceso mediante **QR con token firmado y caducidad dinámica**.  
- Visualización de la carta/cava completa de vinos.  
- Fichas generadas con **IA** (nombre, bodega, tipo, región, descripción, maridajes).  
- **UI sensorial animada**: íconos para cuerpo, dulzura, acidez e intensidad aromática.  
- Visualización de **precios por copa/botella** y **disponibilidad de stock**.  
- Filtros y búsqueda por región, tipo, uva o bodega.  
- Favoritos locales (sin conexión a usuario).  
- Promociones del día y vinos destacados por el sommelier.  
- Compatible con múltiples sucursales (cada QR determina la ubicación).

---

### 🧑‍💼 Panel Administrativo (con autenticación)
- **Login seguro** (Supabase Auth) con roles jerárquicos.  
- **Alta híbrida con IA**:
  - Foto de etiqueta → IA reconoce vino y completa ficha automáticamente.  
  - Datos generados: nombre, bodega, tipo, uvas, añada, país, %alc., descripción, maridajes, notas de cata.  
  - Posibilidad de editar o confirmar antes de guardar.
- **Inventario completo**:
  - Registro de entradas/salidas con fecha, proveedor y costo.  
  - Alertas automáticas por bajo stock.  
- **Dashboard de análisis**:
  - Ventas totales, margen promedio, rotación, inventario en valor monetario.  
  - Gráficas por mes, temporada o sucursal.  
- **Multi-sucursal**:
  - Administrar varias ubicaciones desde la misma app.  
  - Sincronización de carta, stock y reportes.  
- **Promociones y destacados**:
  - “Copa del mes” o “Vino recomendado del chef”.  
  - Configurables por sucursal.  
- **Calificaciones internas** (solo staff/sommelier):  
  - Evaluación privada de vinos (1–5 estrellas, notas de cata internas).  
- **Catálogo exportable (PDF)**:
  - Generación automática con logotipo, secciones, precios y destacados.  
  - Se actualiza en tiempo real con los cambios del panel.

---

## 3. Inteligencia Artificial (IA)
- **Visión por IA** (Google Vision / OpenAI / AWS):  
  - Reconocimiento de etiqueta, texto, código de barras y características del vino.  
- **Lenguaje natural (GPT u otro modelo)**:
  - Genera automáticamente descripciones, maridajes y notas de cata.  
- **Confirmación humana**: el administrador revisa la ficha antes de guardarla.

---

## 4. Sistema de Autenticación y Roles

### 🔐 Doble Registro / Doble Autenticación
1. **Nivel 1 – Acceso general a la cava:**  
   Requiere registro (email/OTP). Permite ver la carta y fichas IA.
2. **Nivel 2 – Panel Administrativo:**  
   Segundo registro con aprobación o invitación.  
   Puede incluir **2FA (doble factor)**.  
3. **Modo Invitado QR (Nivel 0):**  
   Acceso temporal mediante token firmado (sin registro).  
   Solo lectura.

### 👥 Roles
- **Customer:** lectura general (tras login o QR).  
- **Staff:** acceso operativo básico (stock, salidas).  
- **Sommelier:** alta de vinos con IA, reseñas internas.  
- **Admin:** control total (panel, inventario, reportes).  
- **Owner:** todo lo anterior + gestión de roles y sucursales.

---

## 5. Acceso QR Seguro (Token Firmado + Caducidad Dinámica)

### 🧾 Funcionamiento
- El QR contiene un **token firmado (JWT/HMAC)** con `branch_id`, `table_id`, `scope=read`, `duration`.  
- Cuando un usuario lo escanea:
  - Si la app está instalada → abre la app directamente (deep link).  
  - Si no está instalada → redirige automáticamente a **Play Store / App Store**, y al abrir la app por primera vez (deferred deep link), el token se recupera y lo lleva directo a la cava correspondiente.
- En el primer uso se guarda `first_used_at` y calcula `expires_at = first_used_at + duration`.  
- Tras expirar o ser revocado → muestra mensaje “Sesión expirada — escanea un QR actualizado”.

### 🔒 Seguridad
- Tokens firmados desde **Edge Function** (clave secreta).  
- Validación en cada solicitud (`revoked` y `expires_at`).  
- Scope por sucursal y permisos **solo lectura**.  
- Revocación manual desde el panel.  
- Opcional: PIN de mesa o límite de usos.

### 📄 Datos (modelo)
```text
qr_tokens
- id, branch_id, table_id (nullable), token, scope ('read'),
  duration_seconds, first_used_at (nullable), expires_at (nullable),
  max_uses (nullable), uses_count (int default 0),
  pin (nullable), created_by, created_at, revoked (bool), revoked_at

guest_sessions
- id, qr_token_id, started_at, ended_at, device_info (nullable), active (bool)
Generación y Gestión de QR en Panel Administrativo
⚙️ Flujo de uso (admin)

Seleccionar sucursal (y mesa/evento si aplica).

Definir duración del QR (ej. 6 h, 12 h, 24 h).

Generar token firmado → guardar en qr_tokens.

Visualizar, descargar o imprimir QR con branding.

Monitorear estado (activo, expirado, revocado, primer uso).

Revocar o regenerar cuando sea necesario.

🧩 UI del Panel

Crear QR: formulario (sucursal, mesa, duración, PIN opcional).

Activos: lista con expira en, usos, acciones (copiar, descargar, revocar).

Historial: expirados/revocados.

Ajustes: duración por defecto, plantilla visual de QR.

🧠 Reglas y seguridad

Token firmado en Edge Function (no en cliente).

Revocación inmediata (revoked=true).

Caducidad gestionada automáticamente.

RLS: invitados solo pueden leer datos públicos.

Modelo de Datos Principal (Supabase)
Tablas clave
branches (sucursales)
users (con roles)
wines
wine_branch_stock
inventory_movements
suppliers
sales
staff_ratings
featured_items
wine_images
qr_tokens
guest_sessions


Cada tabla incluye branch_id para control multi-sucursal y RLS por rol.

8. Arquitectura Técnica

Frontend: React Native (Expo) — orientación horizontal.

Backend: Supabase (Auth, DB, Storage, Edge Functions).

IA: Google Vision + GPT (vía API).

Gráficas: Recharts o Victory Native.

PDF exportable: Edge Function con plantilla personalizada.

Alertas automáticas: cron jobs por Edge Function (stock bajo, expiraciones).

Beneficios Clave

✅ Acceso inmediato a la cava mediante QR seguro.
✅ IA integrada para generar fichas completas.
✅ Panel administrativo con control total e informes en tiempo real.
✅ Multi-sucursal con sincronización y métricas por local.
✅ Catálogo exportable y branding personalizable.
✅ Integración con tiendas (redirección automática si la app no está instalada).