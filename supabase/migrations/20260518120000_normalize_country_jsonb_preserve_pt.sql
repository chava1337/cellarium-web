-- Preserve country.pt through trigger_normalize_wines_canonical_country / normalize_country_jsonb.
-- Does not auto-generate pt; only keeps an existing non-empty pt key on the normalized object.

CREATE OR REPLACE FUNCTION public.normalize_country_jsonb(country_jsonb jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  normalized_obj JSONB := '{}';
  country_en TEXT;
  country_es TEXT;
  country_pt TEXT;
  normalized_en TEXT;
  normalized_es TEXT;
BEGIN
  -- Si es NULL, retornar NULL
  IF country_jsonb IS NULL THEN
    RETURN NULL;
  END IF;

  -- Extraer valores en inglés, español y portugués (pt solo se preserva, no se normaliza aquí)
  country_en := country_jsonb->>'en';
  country_es := country_jsonb->>'es';
  country_pt := country_jsonb->>'pt';

  -- Caso especial: si ambos idiomas son iguales, obtener traducciones correctas
  IF country_es IS NOT NULL AND country_en IS NOT NULL
     AND TRIM(country_es) != '' AND TRIM(country_en) != ''
     AND LOWER(TRIM(country_es)) = LOWER(TRIM(country_en)) THEN
  -- Ambos son iguales, normalizar y obtener traducciones
    normalized_es := normalize_country_name(country_es);
    IF normalized_es IS NOT NULL THEN
      normalized_en := get_country_translation(country_es, 'en');
      -- Si la traducción es diferente, usar ambas
      IF normalized_en IS NOT NULL AND normalized_en != normalized_es THEN
        normalized_obj := jsonb_build_object('es', normalized_es, 'en', normalized_en);
      ELSE
        -- Si no hay traducción diferente, mantener ambos iguales pero normalizados
        normalized_obj := jsonb_build_object('es', normalized_es, 'en', normalized_es);
      END IF;
    END IF;
    -- Preserve extra locale pt so i18n backfills are not stripped by the trigger.
    IF country_pt IS NOT NULL AND TRIM(country_pt) != '' AND normalized_obj != '{}'::jsonb THEN
      normalized_obj := normalized_obj || jsonb_build_object('pt', TRIM(country_pt));
    END IF;
    RETURN normalized_obj;
  END IF;

  -- Normalizar español si existe
  IF country_es IS NOT NULL AND TRIM(country_es) != '' THEN
    normalized_es := normalize_country_name(country_es);
    IF normalized_es IS NOT NULL THEN
      normalized_obj := normalized_obj || jsonb_build_object('es', normalized_es);
      -- Intentar obtener traducción en inglés (solo si no existe ya)
      IF normalized_obj->>'en' IS NULL THEN
        normalized_en := get_country_translation(country_es, 'en');
        IF normalized_en IS NOT NULL AND normalized_en != normalized_es THEN
          normalized_obj := normalized_obj || jsonb_build_object('en', normalized_en);
        ELSE
          -- Si no hay traducción, usar el mismo valor
          normalized_obj := normalized_obj || jsonb_build_object('en', normalized_es);
        END IF;
      END IF;
    END IF;
  END IF;

  -- Normalizar inglés si existe (solo si no se procesó antes)
  IF country_en IS NOT NULL AND TRIM(country_en) != '' AND (normalized_obj->>'en' IS NULL) THEN
    normalized_en := normalize_country_name(country_en);
    IF normalized_en IS NOT NULL THEN
      normalized_obj := normalized_obj || jsonb_build_object('en', normalized_en);
      -- Intentar obtener traducción en español (solo si no existe ya)
      IF normalized_obj->>'es' IS NULL THEN
        normalized_es := get_country_translation(country_en, 'es');
        IF normalized_es IS NOT NULL AND normalized_es != normalized_en THEN
          normalized_obj := normalized_obj || jsonb_build_object('es', normalized_es);
        ELSE
          -- Si no hay traducción, usar el mismo valor
          normalized_obj := normalized_obj || jsonb_build_object('es', normalized_en);
        END IF;
      END IF;
    END IF;
  END IF;

  -- Si no hay valores normalizados, retornar NULL
  IF normalized_obj = '{}' THEN
    RETURN NULL;
  END IF;

  -- Preserve extra locale pt so i18n backfills are not stripped by the trigger.
  IF country_pt IS NOT NULL AND TRIM(country_pt) != '' THEN
    normalized_obj := normalized_obj || jsonb_build_object('pt', TRIM(country_pt));
  END IF;

  RETURN normalized_obj;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Verificación manual (no ejecutar en migración automática; correr en SQL Editor)
-- ---------------------------------------------------------------------------
-- 1) Función pura:
-- SELECT normalize_country_jsonb('{"es":"Francia","en":"France","pt":"França"}'::jsonb);
-- Esperado: {"es":"Francia","en":"France","pt":"França"}
--
-- 2) UPDATE controlado (elegir un id real):
-- UPDATE public.wines_canonical
-- SET country = jsonb_set(COALESCE(country, '{}'::jsonb), '{pt}', '"França"'::jsonb, true)
-- WHERE id = '<uuid-de-un-vino>';
--
-- 3) Comprobar persistencia tras trigger:
-- SELECT id, country, (country ? 'pt') AS has_pt, country->>'pt' AS pt
-- FROM public.wines_canonical
-- WHERE id = '<uuid-de-un-vino>';
