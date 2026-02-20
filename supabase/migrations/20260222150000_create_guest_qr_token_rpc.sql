-- RPC: create_guest_qr_token
-- Crea un token QR tipo guest con duración 1w/2w/1m. Valida que el caller sea owner del branch
-- o gerente/supervisor con branch_id asignado. Usa SECURITY DEFINER para poder insertar
-- con owner_id del branch (gerente/supervisor no son owner).

CREATE OR REPLACE FUNCTION public.create_guest_qr_token(
  p_branch_id uuid,
  p_duration text DEFAULT '1w',
  p_max_uses int DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_owner_id uuid;
  v_branch_name text;
  v_token text;
  v_expires_at timestamptz;
  v_row qr_tokens%ROWTYPE;
  v_user_role text;
  v_user_branch_id uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Obtener owner_id y nombre de la sucursal
  SELECT b.owner_id, b.name INTO v_owner_id, v_branch_name
  FROM branches b
  WHERE b.id = p_branch_id
  LIMIT 1;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Sucursal no encontrada';
  END IF;

  -- Permiso: owner del branch O gerente/supervisor asignado a esta sucursal
  IF v_owner_id = v_caller_id THEN
    NULL; -- OK
  ELSE
    SELECT u.role, u.branch_id INTO v_user_role, v_user_branch_id
    FROM users u
    WHERE u.id = v_caller_id
    LIMIT 1;
    IF v_user_role NOT IN ('gerente', 'supervisor') OR v_user_branch_id IS NULL OR v_user_branch_id != p_branch_id THEN
      RAISE EXCEPTION 'No autorizado para generar QR en esta sucursal';
    END IF;
  END IF;

  -- Validar p_duration
  p_duration := lower(trim(p_duration));
  IF p_duration NOT IN ('1w', '2w', '1m') THEN
    p_duration := '1w';
  END IF;

  -- Calcular expires_at
  v_expires_at := now();
  IF p_duration = '1w' THEN
    v_expires_at := v_expires_at + interval '7 days';
  ELSIF p_duration = '2w' THEN
    v_expires_at := v_expires_at + interval '14 days';
  ELSIF p_duration = '1m' THEN
    v_expires_at := v_expires_at + interval '30 days';
  END IF;

  -- Token único (base64url-like, 32 chars)
  v_token := replace(replace(encode(gen_random_bytes(24), 'base64'), '+', '-'), '/', '_');
  v_token := substr(v_token, 1, 32);

  INSERT INTO qr_tokens (
    token,
    type,
    branch_id,
    created_by,
    owner_id,
    expires_at,
    max_uses,
    current_uses,
    used
  ) VALUES (
    v_token,
    'guest',
    p_branch_id,
    v_caller_id,
    v_owner_id,
    v_expires_at,
    greatest(1, least(coalesce(p_max_uses, 100), 1000)),
    0,
    false
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'token', v_row.token,
    'expires_at', v_row.expires_at,
    'branch_id', v_row.branch_id,
    'branch_name', v_branch_name,
    'max_uses', v_row.max_uses,
    'created_at', v_row.created_at
  );
END;
$$;

COMMENT ON FUNCTION public.create_guest_qr_token(uuid, text, int) IS
  'Crea token QR guest. p_duration: 1w|2w|1m. Solo owner del branch o gerente/supervisor asignado a esa sucursal.';
