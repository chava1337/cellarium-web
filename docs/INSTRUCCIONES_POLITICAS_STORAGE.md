# 📋 Instrucciones para Configurar Políticas de Storage

Después de ejecutar la migración `031b_create_cocktail_storage_bucket.sql`, necesitas configurar las políticas de acceso desde la interfaz web de Supabase.

## Pasos para Configurar las Políticas

### 1. Acceder a Storage Policies

1. Ve a tu proyecto en [Supabase Dashboard](https://supabase.com/dashboard)
2. Navega a **Storage** en el menú lateral
3. Haz clic en **Policies** (o ve directamente a la sección de políticas del bucket)

### 2. Seleccionar el Bucket

1. Busca el bucket `cocktail-images` en la lista
2. Haz clic en él para ver sus políticas

### 3. Crear las Políticas

Crea las siguientes 4 políticas:

#### Política 1: Lectura Pública
- **Nombre:** `cocktail_images_public_read`
- **Operación:** `SELECT`
- **Target roles:** `public`
- **USING expression:**
```sql
bucket_id = 'cocktail-images'
```

#### Política 2: Inserción Autenticada
- **Nombre:** `cocktail_images_authenticated_insert`
- **Operación:** `INSERT`
- **Target roles:** `authenticated`
- **WITH CHECK expression:**
```sql
bucket_id = 'cocktail-images' AND auth.role() = 'authenticated'
```

#### Política 3: Actualización Autenticada
- **Nombre:** `cocktail_images_authenticated_update`
- **Operación:** `UPDATE`
- **Target roles:** `authenticated`
- **USING expression:**
```sql
bucket_id = 'cocktail-images' AND auth.role() = 'authenticated'
```
- **WITH CHECK expression:**
```sql
bucket_id = 'cocktail-images' AND auth.role() = 'authenticated'
```

#### Política 4: Eliminación Autenticada
- **Nombre:** `cocktail_images_authenticated_delete`
- **Operación:** `DELETE`
- **Target roles:** `authenticated`
- **USING expression:**
```sql
bucket_id = 'cocktail-images' AND auth.role() = 'authenticated'
```

## Alternativa: SQL Manual (si tienes permisos de superusuario)

Si tienes acceso como superusuario, puedes ejecutar este SQL directamente:

```sql
-- Política 1: Lectura pública
CREATE POLICY "cocktail_images_public_read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'cocktail-images');

-- Política 2: Inserción autenticada
CREATE POLICY "cocktail_images_authenticated_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'cocktail-images' 
  AND auth.role() = 'authenticated'
);

-- Política 3: Actualización autenticada
CREATE POLICY "cocktail_images_authenticated_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'cocktail-images' 
  AND auth.role() = 'authenticated'
)
WITH CHECK (
  bucket_id = 'cocktail-images' 
  AND auth.role() = 'authenticated'
);

-- Política 4: Eliminación autenticada
CREATE POLICY "cocktail_images_authenticated_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'cocktail-images' 
  AND auth.role() = 'authenticated'
);
```

## Verificación

Después de configurar las políticas, verifica que:

1. ✅ El bucket `cocktail-images` existe
2. ✅ El bucket está marcado como público (`public: true`)
3. ✅ Las 4 políticas están creadas y activas
4. ✅ Puedes subir una imagen de prueba desde la app

## Bucket `wine-bottles`

Para fotos de vinos (Scan Bottle, inventario), el bucket `wine-bottles` debe tener políticas RLS. Hay una migración que las crea:

- **Migración:** `supabase/migrations/20260217120000_storage_wine_bottles_policies.sql`
- **Aplicar:** `supabase db push` (o ejecutar el SQL en Dashboard → SQL Editor).

Políticas: lectura pública, INSERT/UPDATE/DELETE para `authenticated`. Sin ellas, la subida desde la app falla con "new row violates row-level security policy".

## Notas

- El bucket es **público para lectura** para que las imágenes se muestren en el catálogo sin autenticación
- Solo usuarios **autenticados** pueden subir, actualizar o eliminar imágenes
- El límite de tamaño es **5MB** por imagen
- Tipos permitidos: JPEG, JPG, PNG, WEBP

