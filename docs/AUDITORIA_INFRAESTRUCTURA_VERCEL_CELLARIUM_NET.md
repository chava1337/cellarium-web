# Auditoría: Infraestructura real de deployment de www.cellarium.net

**Objetivo:** Descubrir qué proyecto Vercel, repo y código sirven realmente `https://www.cellarium.net/qr?data=...` y alinear dominio → proyecto único → repo único.

**Limitación:** Esta auditoría se hace desde el **repo Cellarium (Expo)**. No hay acceso al dashboard de Vercel ni al repo "Cellarium Visualizador Web" (Next.js). La evidencia es la que está en código y documentación; la verificación final debe hacerse en Vercel y con pruebas en producción.

---

## 1. Resumen ejecutivo

- Existen **dos orígenes posibles** para la ruta `/qr` en producción:
  1. **Repo actual (Cellarium):** carpeta `vercel-site/` con **qr.html** estático y `vercel.json`. No hay Next.js ni `app/qr/page.tsx` en este repo.
  2. **Repo externo (cellarium-visualizador-web):** Next.js App Router con **app/qr/page.tsx**. Ese repo **no está en este workspace**; se infiere de la documentación.
- El dominio **www.cellarium.net** está configurado en la app móvil (QrTokenService, app.config.js). **No se puede saber desde código** a qué proyecto de Vercel está asignado ese dominio.
- Hay **evidencia histórica** de nombres de proyecto Vercel: `cellarium-web.vercel.app` y `cellarium-visualizador-web.vercel.app`. Ambos aparecen en docs; solo uno (o ninguno) puede tener el dominio custom www.cellarium.net.

---

## 2. Mapa de lo que hay en ESTE repo (Cellarium – Expo)

### 2.1 Estructura `vercel-site/`

| Ruta en repo | Contenido | Se sirve en producción como |
|--------------|-----------|-----------------------------|
| `vercel-site/vercel.json` | Config: headers .well-known, redirect /qr.html → /qr | Depende del proyecto Vercel y Root Directory |
| `vercel-site/qr.html` | Página estática (modo pasivo: mensaje + "Abrir en app", sin redirect automático) | **Solo si hay rewrite /qr → /qr.html**; si no, /qr sería 404 |
| `vercel-site/.well-known/apple-app-site-association` | AASA para Universal Links | /.well-known/apple-app-site-association |
| `vercel-site/.well-known/assetlinks.json` | App Links Android | /.well-known/assetlinks.json |
| `vercel-site/api/stripe-webhook.ts` | Serverless: proxy a Supabase Edge | /api/stripe-webhook |
| `vercel-site/vercel-site` | Archivo con contenido HTML (copia antigua de qr?) | No es ruta estándar; podría ser error de nombre |

### 2.2 `vercel.json` en este repo

```json
{
  "version": 2,
  "public": true,
  "headers": [
    { "source": "/.well-known/apple-app-site-association", "headers": [...] },
    { "source": "/.well-known/assetlinks.json", "headers": [...] }
  ],
  "redirects": [
    { "source": "/qr.html", "destination": "/qr" }
  ]
}
```

- **Redirect:** solo `/qr.html` → `/qr`. No hay **rewrite** `/qr` → `/qr.html`.
- Con un deploy estático típico (root = public): se sirve `qr.html` en **/qr.html**. La ruta **/qr** no tiene archivo; sin rewrite en dashboard, **/qr** devolvería 404.
- Conclusión: si el proyecto que tiene www.cellarium.net es este `vercel-site`, en Vercel debería existir un **rewrite** (en `vercel.json` o en Dashboard) de `source: /qr` a `destination: /qr.html` para que `/qr?data=...` funcione.

### 2.3 Referencias en documentación (este repo)

- **DEPLOY.md** (vercel-site): sugiere crear repo GitHub `cellarium-web`, subir contenido de vercel-site, importar en Vercel. URL de ejemplo: `https://cellarium-web.vercel.app`.
- **VERCEL_SETUP.md:** menciona `https://cellarium-web.vercel.app/qr` y dominio personalizado.
- **Varios docs** mencionan `cellarium-visualizador-web.vercel.app` como URL del visualizador Next.js (repo externo).

---

## 3. Repo “Cellarium Visualizador Web” (externo)

- **No está en este workspace.** Referencias: REPORTE_IMAGENES_MENU_UX.md, STAFF_WEB_REGISTRATION_CONTEXT.md, INFORME_VISUALIZADOR_WEB_MENU_QR.md, AUDITORIA_COCTELES_VISUALIZADOR_WEB.md.
- Descripción: **Next.js** (App Router), ruta `/qr` con query `?data=...`, página en `app/qr/page.tsx` (o equivalente).
- Comportamiento esperado (según auditoría que mencionas): sin redirect automático, sin spinner infinito, fallback web con menú.
- Si **www.cellarium.net** apunta a **este** proyecto Next.js, entonces `/qr` lo sirve `app/qr/page.tsx`, no `qr.html`.

---

## 4. Riesgo de “split deployment”

- **Escenario A:** Dominio www.cellarium.net → proyecto **cellarium-web** (static, este repo vercel-site) → sirve `qr.html` si hay rewrite /qr → /qr.html. Comportamiento = el de `vercel-site/qr.html` (modo pasivo actual).
- **Escenario B:** Dominio www.cellarium.net → proyecto **cellarium-visualizador-web** (Next.js) → sirve `app/qr/page.tsx`. Comportamiento = el del repo Next.js.
- **Escenario C:** cellarium.net y www.cellarium.net repartidos entre dos proyectos (por error o histórico). Entonces una URL podría dar un código y la otra otro.
- **Escenario D:** Un proyecto tiene el dominio pero el deploy activo es antiguo (cache CDN / edge) y sirve una versión vieja de qr.html o de la página Next.js.

Para saber cuál es el caso hace falta **verificación en Vercel y en producción**.

---

## 5. Qué verificar en Vercel (pasos concretos)

### 5.1 Proyectos y dominio

1. **Vercel Dashboard** → **All Projects**
   - Listar proyectos que contengan “cellarium” en el nombre.
   - En cada uno: **Settings → Domains**. Anotar qué dominio(s) tiene cada uno (p. ej. `cellarium-web.vercel.app`, `www.cellarium.net`, `cellarium.net`).
2. **Resultado esperado:** Un único proyecto con `www.cellarium.net` (y opcionalmente `cellarium.net`). Si hay dos proyectos con el mismo dominio, hay conflicto.

### 5.2 Repo y rama por proyecto

1. Para el proyecto que tenga **www.cellarium.net**:
   - **Settings → Git**: Repo conectado (nombre, org/usuario) y rama de producción (p. ej. `main`).
2. Anotar: **Proyecto X** → **Repo Y** → **Rama Z**.

### 5.3 Root Directory y build

1. **Settings → General**: Root Directory (vacío = raíz del repo; si es `vercel-site`, entonces el deploy usa solo esa carpeta).
2. Si el repo es **este** (Cellarium Expo) y Root Directory es `vercel-site`, el deploy usa `vercel-site/vercel.json` y `vercel-site/qr.html`.
3. Si el repo es **otro** (cellarium-visualizador-web) y Root está vacío, el deploy usa Next.js y `app/qr/page.tsx`.

### 5.4 Rewrites / Redirects

1. En el proyecto que tiene www.cellarium.net:
   - **Settings → Rewrites** (o el `vercel.json` que use ese proyecto).
   - Comprobar si existe regla tipo: `source: /qr`, `destination: /qr.html` (necesaria si el deploy es estático con qr.html).
2. En el mismo proyecto, pestaña **Deployments**: abrir el **deployment de producción** (Production) y revisar **Build Logs** / **Source** para ver commit y rama.

### 5.5 Build ID / commit en producción

1. En el deployment de producción de ese proyecto, anotar:
   - **Commit** (hash) y **branch**.
   - **Deployment URL** (ej. `cellarium-xxx-xxx.vercel.app`).
2. Eso es el “build activo” que sirve tráfico cuando se resuelve www.cellarium.net.

---

## 6. Evidencia exacta de qué código sirve hoy /qr

Solo se puede con **pruebas en producción** y, opcionalmente, headers:

1. **Navegador (o curl)**  
   `https://www.cellarium.net/qr?data=test`  
   - Ver **código de estado** (200, 404, 302).  
   - Ver **contenido**: ¿página con “Cellarium - Menú” y botón “Abrir en la app” (qr.html actual) o “Redirigiendo...” (qr.html viejo) o página Next.js (menú/lista)?

2. **Headers de respuesta**  
   `curl -I "https://www.cellarium.net/qr?data=test"`  
   - `x-vercel-id`, `x-vercel-deployment-url` (si Vercel los expone): indican deployment concreto.

3. **Comparar con URLs de proyecto**  
   - Si tienes la URL de preview/producción del proyecto (ej. `cellarium-web.vercel.app`), abrir `https://cellarium-web.vercel.app/qr?data=test`.  
   - Si el contenido es **idéntico** al de www.cellarium.net/qr, ese proyecto es el que tiene el dominio.

4. **Repetir para cellarium.net (sin www)**  
   - Comprobar si redirige a www o si sirve otro contenido (riesgo de split).

---

## 7. Posible caché / CDN / contenido viejo

- **Vercel Edge Network:** puede cachear respuestas. Si cambiaste de proyecto o de rewrite y sigue viéndose la página antigua, probar:
  - Otra red (móvil vs WiFi) o incógnito.
  - Query distinta: `?data=test2` o `?nocache=1`.
- **Navegador:** caché local. Probar en incógnito o otro dispositivo.
- **SSL:** no debería servir “otro” contenido; el problema sería qué proyecto está detrás del dominio, no el certificado en sí.

---

## 8. Mapa resumido (a rellenar con tu verificación)

| Pregunta | Dónde verlo | Ejemplo de valor |
|----------|-------------|-------------------|
| ¿Qué proyecto Vercel tiene www.cellarium.net? | Vercel → Project → Settings → Domains | cellarium-web |
| ¿Qué repo está conectado a ese proyecto? | Settings → Git | chava1337/cellarium-web o otro |
| ¿Qué rama se despliega en Production? | Settings → Git | main |
| ¿Root Directory? | Settings → General | vacío o vercel-site |
| ¿Rewrite /qr → algo? | vercel.json o Settings → Rewrites | /qr → /qr.html o (Next) implícito |
| Build activo (commit) | Deployments → Production | abc123def |
| ¿cellarium.net (sin www) va al mismo proyecto? | Domains en el mismo proyecto | Sí/No |

---

## 9. Recomendación para alinear: dominio → proyecto único → repo único

1. **Decidir una sola fuente de verdad para `/qr`:**
   - **Opción A (Next.js):** Que **www.cellarium.net** apunte solo al proyecto **cellarium-visualizador-web** (Next.js, app/qr/page.tsx). Un solo repo, una sola rama (main), sin vercel-site de este repo en producción para ese dominio.
   - **Opción B (estático):** Que **www.cellarium.net** apunte solo al proyecto que despliega **vercel-site** (este repo o un repo “cellarium-web” que solo tenga ese contenido). En ese caso, en `vercel.json` de vercel-site **añadir** un rewrite:
     ```json
     "rewrites": [{ "source": "/qr", "destination": "/qr.html" }]
     ```
     para que `/qr?data=...` sirva `qr.html` sin depender del Dashboard.

2. **Un solo proyecto con el dominio:**
   - En Vercel, **quitar** www.cellarium.net (y cellarium.net) de cualquier otro proyecto.
   - Dejar **solo un** proyecto con ambos dominios (www + root, si aplica).

3. **Repos:**
   - Si eliges Next.js: el repo conectado debe ser cellarium-visualizador-web, rama main (o la que elijan).
   - Si eliges estático: el repo puede ser este (Cellarium) con Root Directory = `vercel-site`, o un repo separado “cellarium-web” que contenga solo el contenido de vercel-site.

4. **App móvil:**  
   Ya usa `https://www.cellarium.net/qr?data=...` (QrTokenService). No hace falta cambiar la app si el dominio y la ruta siguen siendo los mismos.

5. **Después de cambiar:**  
   Verificar de nuevo con curl y navegador que `https://www.cellarium.net/qr?data=...` devuelve el contenido esperado y que no hay 404 ni redirects raros.

---

## 10. Checklist de verificación (copiar y rellenar)

- [ ] Lista de proyectos Vercel con “cellarium” en el nombre.
- [ ] Proyecto que tiene dominio www.cellarium.net: nombre __________.
- [ ] Repo conectado a ese proyecto: __________.
- [ ] Rama de producción: __________.
- [ ] Root Directory: __________.
- [ ] ¿Existe rewrite o lógica que sirva /qr? __________.
- [ ] Commit/hash del deployment de producción: __________.
- [ ] Contenido de `https://www.cellarium.net/qr?data=test`: __________ (descripción breve).
- [ ] ¿cellarium.net (sin www) apunta al mismo proyecto? __________.
- [ ] ¿Hay otro proyecto con cellarium.net o www.cellarium.net? __________.

---

**Conclusión:** La auditoría en este repo confirma que **vercel-site/qr.html existe aquí** y que la documentación apunta a **dos posibles proyectos** (cellarium-web y cellarium-visualizador-web). **Qué código sirve exactamente hoy /qr en www.cellarium.net** solo puede confirmarse revisando Vercel (proyecto, dominio, repo, rewrite) y probando la URL en producción. Con el checklist y la recomendación anterior puedes alinear dominio → proyecto único → repo único y eliminar el riesgo de split o contenido antiguo.
