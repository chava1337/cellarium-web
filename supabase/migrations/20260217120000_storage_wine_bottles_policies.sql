-- Storage RLS policies for bucket wine-bottles (fotos de vinos desde Scan Bottle / inventario).
-- El bucket debe existir (creado desde Dashboard o por otro medio). Sin estas políticas, el INSERT falla con RLS.

-- Lectura pública (para mostrar imágenes en catálogo/menú)
CREATE POLICY "wine_bottles_public_read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'wine-bottles');

-- Inserción: usuarios autenticados pueden subir a wine-bottles (path recomendado: auth.uid()/wines/...)
CREATE POLICY "wine_bottles_authenticated_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'wine-bottles'
  AND auth.role() = 'authenticated'
);

-- Actualización: necesario si se usa upsert en uploads
CREATE POLICY "wine_bottles_authenticated_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'wine-bottles'
  AND auth.role() = 'authenticated'
)
WITH CHECK (
  bucket_id = 'wine-bottles'
  AND auth.role() = 'authenticated'
);

-- Eliminación: usuarios autenticados pueden borrar objetos del bucket
CREATE POLICY "wine_bottles_authenticated_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'wine-bottles'
  AND auth.role() = 'authenticated'
);
