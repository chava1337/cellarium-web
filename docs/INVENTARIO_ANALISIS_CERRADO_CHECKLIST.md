# Cierre módulo Inventario y Análisis – Checklist de pruebas

## Archivo de migración

- **Nombre:** `20260306100000_inventory_movements_allow_count_and_quantity_zero.sql`
- **Ubicación:** `supabase/migrations/`

## Cambios en InventoryAnalyticsScreen.tsx (resumen)

- **Pestaña:** "Ventas" → "Ventas estimadas".
- **Empty state (Ventas estimadas):** Título "para estimar ventas" → "para ventas estimadas"; subtítulo aclara "Las estimaciones se basan en cortes".
- **Secciones:** "Top 5 por ingresos estimados" → "Top 5 por ingresos estimados (desde cortes)"; "Top 5 por cantidad vendida (est.)" → "Top 5 por consumo estimado (botellas)".
- **Ordenar:** Botón "Ventas" → "Ventas est."; en tarjeta de vino "Vendidas (est.):" → "Consumo est.:".
- **Reportes:** Card "Ventas (est.)" → "Consumo est."; comentario "Periodo para ventas estimadas (misma lógica que pestaña Ventas estimadas)"; botón "Reporte de Ventas (estimadas)" → "Reporte de Ventas estimadas"; alertas de reporte actualizadas a "ventas estimadas".
- **generatePDF('sales'):** Comentario: "Misma fuente y lógica que la pestaña Ventas estimadas (getSalesFromCountsByPeriod)."
- **Logs:** Solo en `__DEV__` (sin cambios; ya estaba así). Comentarios de carga actualizados a "ventas estimadas desde cortes".

## Checklist de pruebas

### Migración

- [ ] Aplicar migración en local: `supabase db push` o `supabase migration up`.
- [ ] Comprobar que existen los constraints nuevos:
  - [ ] `inventory_movements_movement_type_check` permite `'entrada','salida','ajuste','venta','count'`.
  - [ ] `inventory_movements_quantity_check`: con `movement_type = 'count'` se permite `quantity >= 0`; con otros tipos `quantity > 0`.
- [ ] Insertar un movimiento `movement_type = 'count'` con `quantity = 0` y verificar que no falle.

### UI – Pestaña Ventas estimadas

- [ ] La pestaña se llama "Ventas estimadas" (no "Ventas").
- [ ] Sin datos: se muestra el empty state "Necesitas 2 conteos físicos... para ventas estimadas" y el subtítulo sobre cortes.
- [ ] Con al menos un vino con 2 conteos: se muestran Top 5 por ingresos estimados (desde cortes), Top 5 por consumo estimado (botellas), y la lista con "Consumo est." por vino.
- [ ] Ordenar por "Ventas est.", "Ingresos", "Rotación" funciona.

### Reportes

- [ ] En Reportes, la card de consumo dice "Consumo est. total" (no "Ventas (est.)").
- [ ] Cards: "Valor total", "Ingresos estimados", "Consumo est. total" con formatCurrencyMXN donde aplique.
- [ ] Montos en una sola línea: Valor total e Ingresos estimados no se parten (fontSize 16, numberOfLines={1}).
- [ ] Sin datos suficientes: Ingresos estimados y Consumo est. total muestran "—"; Valor total "—" o $0 según corresponda.
- [ ] Con precios válidos: Ingresos estimados muestra monto formateado (MXN); sin precio válido muestra "—".
- [ ] El botón es "Reporte de Ventas estimadas".
- [ ] Al generar el reporte se usa la misma función/lógica que Ventas estimadas (getSalesFromCountsByPeriod), sin duplicar cálculo.
- [ ] Sin vinos válidos (cortes insuficientes): Alert "Datos insuficientes" con mensaje claro; no se genera PDF.
- [ ] Con datos suficientes el PDF se genera y el mensaje de éxito dice "reporte de ventas estimadas (desde cortes)".
- [ ] PDF: encabezado incluye periodo (ej. "Últimos 30 días") y la nota "Estimado con base en cortes físicos y movimientos registrados.".
- [ ] PDF: tabla con columnas en orden — Vino, Stock inicio, Entradas, Salidas especiales, Stock fin, Consumo estimado, Ingresos estimados.
- [ ] PDF: resumen con "Consumo estimado", "Ingresos estimados", "Entradas", "Salidas especiales"; montos en MXN con formatCurrencyMXN.

### Logs

- [ ] En desarrollo (`__DEV__`): hay logs de carga "ventas estimadas desde cortes" y de error si falla `getSalesFromCountsByPeriod`.
- [ ] En producción no aparecen esos logs (no `console.log`/`console.error` de este flujo fuera de `__DEV__`).

### Consistencia BD / app

- [ ] Registrar un conteo físico desde la app (pestaña Stock) y comprobar en BD que se inserta `movement_type = 'count'` en `inventory_movements`.
- [ ] La pestaña Ventas estimadas muestra ese vino si tiene al menos 2 conteos (inicio y fin) según la lógica ya implementada.

### Vinos sin precio (consumo sin precio configurado)

- [ ] **1) Vino con consumo y precio válido:** En Ventas estimadas la card muestra Consumo est., Ingresos con monto en MXN; no aparece "Sin precio configurado". En Reportes no aparece la línea de "Consumo sin precio". En el PDF la fila tiene Ingresos estimados con monto y no "(Sin precio)".
- [ ] **2) Vino con consumo y sin precio:** En Ventas estimadas la card muestra Consumo est. (número), Ingresos "—" y debajo el texto pequeño "Sin precio configurado". El vino sigue en la lista (no se excluye). En Reportes aparece la card/línea "Consumo sin precio configurado: X botellas" y "Vinos sin precio: Y" cuando aplica. En el PDF la columna Ingresos estimados muestra "— (Sin precio)" para ese vino; en el resumen del PDF aparecen "Consumo sin precio configurado: X botellas" y "Vinos sin precio configurado: Y".
- [ ] **3) Reporte con mezcla de ambos:** Con al menos un vino con precio y uno sin precio: el PDF muestra filas con monto en Ingresos y filas con "— (Sin precio)"; el resumen muestra total de consumo estimado, ingresos estimados (solo de los con precio) y, si hay sin precio, las líneas de consumo sin precio y cantidad de vinos sin precio.
