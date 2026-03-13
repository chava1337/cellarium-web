-- Cocktail image cleanup: image_path column, storage_delete_queue table, and triggers
-- so that when a cocktail is deactivated, image changed, or deleted (including CASCADE),
-- the object path is enqueued for deletion from bucket cocktail-images.

-- 1) Add image_path to cocktail_menu
ALTER TABLE public.cocktail_menu
  ADD COLUMN IF NOT EXISTS image_path text;

COMMENT ON COLUMN public.cocktail_menu.image_path IS 'Storage path in bucket cocktail-images (e.g. cocktails/branchId/file.jpg). Used for cleanup on delete/deactivate.';

-- 2) Queue table for deferred storage deletes
CREATE TABLE IF NOT EXISTS public.storage_delete_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  path text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'error')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_storage_delete_queue_status_created
  ON public.storage_delete_queue (status, created_at ASC)
  WHERE status = 'pending';

COMMENT ON TABLE public.storage_delete_queue IS 'Queue of storage objects to delete. Processed by Edge Function process-storage-delete-queue.';

-- 3) Extract storage path from public URL (fallback when image_path is null)
CREATE OR REPLACE FUNCTION public.extract_storage_path_from_url(p_url text, p_bucket text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  pos int;
  bucket_len int;
BEGIN
  IF p_url IS NULL OR p_bucket IS NULL OR trim(p_bucket) = '' THEN
    RETURN NULL;
  END IF;
  pos := position(p_bucket in p_url);
  IF pos <= 0 THEN
    RETURN NULL;
  END IF;
  bucket_len := length(p_bucket);
  -- path is everything after bucket name and one slash (e.g. .../cocktail-images/cocktails/xx/yy.jpg -> cocktails/xx/yy.jpg)
  RETURN trim(substring(p_url from pos + bucket_len + 1));
END;
$function$;

-- 4) Trigger function: enqueue cocktail image for deletion when row is updated (deactivate or image change) or deleted
CREATE OR REPLACE FUNCTION public.enqueue_cocktail_image_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_path text;
  v_should_enqueue boolean := false;
BEGIN
  v_path := COALESCE(
    OLD.image_path,
    public.extract_storage_path_from_url(OLD.image_url, 'cocktail-images')
  );
  v_path := trim(v_path);
  IF v_path IS NULL OR v_path = '' THEN
    IF TG_OP = 'UPDATE' THEN
      RETURN NEW;
    ELSE
      RETURN OLD;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_should_enqueue := true;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_active = true AND (NEW.is_active = false OR NEW.is_active IS NULL) THEN
      v_should_enqueue := true;
    ELSIF (OLD.image_path IS DISTINCT FROM NEW.image_path) OR (OLD.image_url IS DISTINCT FROM NEW.image_url) THEN
      v_should_enqueue := true;
    END IF;
  END IF;

  IF v_should_enqueue THEN
    INSERT INTO public.storage_delete_queue (bucket, path, status)
    VALUES ('cocktail-images', v_path, 'pending');
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  ELSE
    RETURN OLD;
  END IF;
END;
$function$;

-- 5) Triggers on cocktail_menu
DROP TRIGGER IF EXISTS trg_enqueue_cocktail_image_delete_update ON public.cocktail_menu;
CREATE TRIGGER trg_enqueue_cocktail_image_delete_update
  BEFORE UPDATE ON public.cocktail_menu
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_cocktail_image_delete();

DROP TRIGGER IF EXISTS trg_enqueue_cocktail_image_delete_delete ON public.cocktail_menu;
CREATE TRIGGER trg_enqueue_cocktail_image_delete_delete
  BEFORE DELETE ON public.cocktail_menu
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_cocktail_image_delete();

-- 6) Backfill image_path from existing image_url
UPDATE public.cocktail_menu
SET image_path = public.extract_storage_path_from_url(image_url, 'cocktail-images')
WHERE image_url IS NOT NULL
  AND (image_path IS NULL OR image_path = '');
