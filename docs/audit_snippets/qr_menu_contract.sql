-- qr_tokens: schema (remote_schema)
create table "public"."qr_tokens" (
    "id" uuid not null default gen_random_uuid(),
    "token" text not null,
    "type" text not null,  -- 'guest' | 'admin_invite'
    "branch_id" uuid not null,
    "created_by" uuid not null,
    "created_at" timestamp with time zone default now(),
    "expires_at" timestamp with time zone not null,
    "used" boolean default false,
    "used_at" timestamp with time zone,
    "used_by" uuid,
    "max_uses" integer default 1,
    "current_uses" integer default 0,
    "owner_id" uuid
);
-- UNIQUE(token), FK branch_id->branches, created_by->users, owner_id->users

-- RLS qr_tokens SELECT: anon puede leer filas con expires_at > now()
-- (auth.uid() = owner_id) OR (expires_at > now())

-- RLS wine_branch_stock SELECT (anon): branches con QR guest válido
-- using ((branch_id IN (
--   SELECT qr_tokens.branch_id FROM qr_tokens
--   WHERE qr_tokens.type = 'guest' AND qr_tokens.expires_at > now()
--     AND (qr_tokens.used = false OR qr_tokens.used IS NULL)
-- )));
