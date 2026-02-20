# Instrucciones para limpiar archivo corrupto

## Script: `Fix-CorruptedFile.ps1`

Este script limpia archivos TypeScript corruptos eliminando bytes de bullet point (•) insertados entre caracteres.

## Requisitos

- PowerShell 5.1 o superior
- Permisos de lectura/escritura en el archivo

## Uso básico

### 1. Ejecutar con ruta por defecto

```powershell
.\Fix-CorruptedFile.ps1
```

Esto procesará: `src/screens/GlobalWineCatalogScreen.tsx`

### 2. Ejecutar con ruta personalizada

```powershell
.\Fix-CorruptedFile.ps1 -FilePath "src/screens/OtroArchivo.tsx"
```

### 3. Modo dry-run (sin modificar archivo)

```powershell
.\Fix-CorruptedFile.ps1 -WhatIf
```

Muestra qué se haría sin modificar el archivo.

### 4. Combinar parámetros

```powershell
.\Fix-CorruptedFile.ps1 -FilePath "src/screens/OtroArchivo.tsx" -WhatIf
```

## Restaurar desde backup

Si algo sale mal, puedes restaurar el archivo desde el backup automático:

```powershell
# El backup tiene formato: archivo.bak-YYYYMMDD-HHMMSS
Copy-Item "src/screens/GlobalWineCatalogScreen.tsx.bak-20240101-120000" "src/screens/GlobalWineCatalogScreen.tsx" -Force
```

O buscar el backup más reciente:

```powershell
$backup = Get-ChildItem "src/screens/GlobalWineCatalogScreen.tsx.bak-*" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Copy-Item $backup.FullName "src/screens/GlobalWineCatalogScreen.tsx" -Force
```

## Ejemplo de salida

### Modo dry-run:
```
========================================
Limpieza de archivo corrupto
========================================

Archivo: C:\Users\chava\Desktop\Cellarium\src\screens\GlobalWineCatalogScreen.tsx
Leyendo archivo como bytes...
Tamano original: 43689 bytes
Buscando patrones de bullet point...
Encontradas 0 ocurrencias del patron bullet
Eliminando patrones bullet...

========================================
RESUMEN
========================================
Tamano original:     43689 bytes
Tamano final:        43689 bytes
Reduccion:           0 bytes
Bullets eliminados:  0
BOM eliminado:       No

========================================
MODO DRY-RUN: No se realizaran cambios
========================================

Se eliminarian 0 secuencias de bullet point
El archivo se reduciria de 43689 a 43689 bytes

Para aplicar los cambios, ejecuta sin -WhatIf
```

### Modo normal (con cambios):
```
========================================
Limpieza de archivo corrupto
========================================

Archivo: C:\Users\chava\Desktop\Cellarium\src\screens\GlobalWineCatalogScreen.tsx
Leyendo archivo como bytes...
Tamano original: 456789 bytes
Buscando patrones de bullet point...
Encontradas 15234 ocurrencias del patron bullet
Eliminando patrones bullet...
Eliminando BOM UTF-8...

========================================
RESUMEN
========================================
Tamano original:     456789 bytes
Tamano final:        304526 bytes
Reduccion:           152263 bytes
Bullets eliminados:  15234
BOM eliminado:       Si

Creando backup...
Backup creado: src/screens/GlobalWineCatalogScreen.tsx.bak-20240101-120000
Escribiendo archivo limpio...

========================================
ARCHIVO LIMPIADO EXITOSAMENTE
========================================

Archivo procesado: src/screens/GlobalWineCatalogScreen.tsx
Backup guardado:   src/screens/GlobalWineCatalogScreen.tsx.bak-20240101-120000

Para restaurar desde backup:
  Copy-Item 'src/screens/GlobalWineCatalogScreen.tsx.bak-20240101-120000' 'src/screens/GlobalWineCatalogScreen.tsx' -Force
```

## Seguridad

El script incluye las siguientes protecciones:

1. **Backup automático**: Crea un backup antes de modificar
2. **Validación de tamaño**: Aborta si el archivo resultante es muy pequeño (< 200 bytes)
3. **Validación de existencia**: Verifica que el archivo existe antes de procesar
4. **Manejo de errores**: Captura errores y muestra mensajes claros

## Solución de problemas

### Error: "El archivo no existe"
- Verifica que la ruta sea correcta
- Usa ruta absoluta si es necesario

### Error: "El archivo resultante es demasiado pequeño"
- El archivo podría estar demasiado corrupto
- Restaura desde backup y verifica manualmente

### El archivo sigue corrupto después de limpiar
- Restaura desde backup
- Verifica que el patrón de bytes sea correcto (E2 80 A2)
- Considera reconstruir el archivo desde cero

## Notas técnicas

- El script elimina el patrón de bytes `[0xE2, 0x80, 0xA2]` (bullet point • en UTF-8)
- También elimina BOM UTF-8 si está presente
- El backup se crea con timestamp para evitar sobrescrituras
- El script es idempotente: puede ejecutarse múltiples veces de forma segura

