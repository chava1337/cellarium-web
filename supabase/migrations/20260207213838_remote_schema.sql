create extension if not exists "pg_trgm" with schema "public" version '1.6';

create extension if not exists "vector" with schema "public" version '0.8.0';

create table "public"."branches" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "address" text,
    "owner_id" uuid not null,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "is_main" boolean default false,
    "is_locked" boolean not null default false,
    "lock_reason" text,
    "locked_at" timestamp with time zone
);


alter table "public"."branches" enable row level security;

create table "public"."cocktail_menu" (
    "id" uuid not null default gen_random_uuid(),
    "branch_id" uuid not null,
    "owner_id" uuid not null,
    "name" jsonb not null,
    "description" jsonb,
    "ingredients" jsonb not null,
    "image_url" text,
    "price" numeric(10,2) not null,
    "is_active" boolean default true,
    "display_order" integer default 0,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "created_by" uuid
);


alter table "public"."cocktail_menu" enable row level security;

create table "public"."guest_sessions" (
    "id" uuid not null default gen_random_uuid(),
    "qr_token_id" uuid,
    "branch_id" uuid,
    "session_start" timestamp with time zone default now(),
    "session_end" timestamp with time zone,
    "created_at" timestamp with time zone default now()
);


create table "public"."ingest_logs" (
    "id" uuid not null default gen_random_uuid(),
    "user_name" text not null,
    "wine_id" uuid,
    "action" text not null,
    "created_at" timestamp with time zone not null default now()
);


create table "public"."inventory_movements" (
    "id" uuid not null default gen_random_uuid(),
    "wine_id" uuid not null,
    "branch_id" uuid not null,
    "user_id" uuid,
    "owner_id" uuid not null,
    "movement_type" text not null,
    "quantity" integer not null,
    "reason" text,
    "previous_quantity" integer not null,
    "new_quantity" integer not null,
    "created_at" timestamp with time zone default now()
);


alter table "public"."inventory_movements" enable row level security;

create table "public"."invoices" (
    "id" uuid not null default gen_random_uuid(),
    "payment_id" uuid,
    "user_id" uuid not null,
    "owner_id" uuid not null,
    "subscription_id" uuid,
    "invoice_number" text not null,
    "amount" numeric(10,2) not null,
    "currency" text not null default 'MXN'::text,
    "status" text not null,
    "invoice_date" timestamp with time zone not null default now(),
    "due_date" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "pdf_url" text,
    "pdf_path" text,
    "stripe_invoice_id" text,
    "customer_name" text,
    "customer_email" text,
    "customer_address" jsonb,
    "line_items" jsonb,
    "metadata" jsonb,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);


alter table "public"."invoices" enable row level security;

create table "public"."payments" (
    "id" uuid not null default gen_random_uuid(),
    "subscription_id" uuid,
    "user_id" uuid not null,
    "owner_id" uuid not null,
    "amount" numeric(10,2) not null,
    "currency" text not null default 'MXN'::text,
    "status" text not null,
    "payment_method" text not null,
    "payment_method_details" jsonb,
    "stripe_payment_intent_id" text,
    "stripe_charge_id" text,
    "description" text,
    "failure_reason" text,
    "failure_code" text,
    "invoice_id" uuid,
    "metadata" jsonb,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "completed_at" timestamp with time zone
);


alter table "public"."payments" enable row level security;

create table "public"."qr_tokens" (
    "id" uuid not null default gen_random_uuid(),
    "token" text not null,
    "type" text not null,
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


alter table "public"."qr_tokens" enable row level security;

create table "public"."qr_tokens_backup" (
    "id" uuid,
    "token" text,
    "branch_id" uuid,
    "expires_at" timestamp with time zone,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone
);


create table "public"."rate_limits" (
    "id" uuid not null default gen_random_uuid(),
    "key" text not null,
    "action" text not null,
    "identifier" text not null,
    "attempts" integer not null default 1,
    "reset_at" bigint not null,
    "last_attempt" timestamp with time zone default now(),
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);


alter table "public"."rate_limits" enable row level security;

create table "public"."sale_items" (
    "id" uuid not null default gen_random_uuid(),
    "sale_id" uuid not null,
    "wine_id" uuid not null,
    "quantity" integer not null,
    "unit_price" numeric(10,2) not null,
    "item_type" text not null,
    "created_at" timestamp with time zone default now()
);


alter table "public"."sale_items" enable row level security;

create table "public"."sales" (
    "id" uuid not null default gen_random_uuid(),
    "branch_id" uuid not null,
    "user_id" uuid,
    "guest_session_id" uuid,
    "owner_id" uuid not null,
    "sale_type" text not null,
    "total_amount" numeric(10,2) not null,
    "payment_status" text not null,
    "payment_method" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "completed_at" timestamp with time zone,
    "idempotency_key" text
);


alter table "public"."sales" enable row level security;

create table "public"."subscriptions" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "owner_id" uuid not null,
    "plan_id" text not null,
    "plan_name" text not null,
    "status" text not null,
    "current_period_start" timestamp with time zone not null,
    "current_period_end" timestamp with time zone not null,
    "cancel_at_period_end" boolean default false,
    "canceled_at" timestamp with time zone,
    "stripe_subscription_id" text,
    "stripe_customer_id" text,
    "metadata" jsonb,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);


alter table "public"."subscriptions" enable row level security;

create table "public"."tasting_exam_pdfs" (
    "id" uuid not null default gen_random_uuid(),
    "exam_id" uuid not null,
    "generated_by" uuid not null,
    "pdf_url" text not null,
    "generated_at" timestamp with time zone default now(),
    "responses_count" integer default 0,
    "created_at" timestamp with time zone default now()
);


alter table "public"."tasting_exam_pdfs" enable row level security;

create table "public"."tasting_exam_wines" (
    "id" uuid not null default gen_random_uuid(),
    "exam_id" uuid not null,
    "wine_id" uuid not null,
    "order_index" integer not null default 0,
    "created_at" timestamp with time zone default now()
);


alter table "public"."tasting_exam_wines" enable row level security;

create table "public"."tasting_exams" (
    "id" uuid not null default gen_random_uuid(),
    "branch_id" uuid not null,
    "owner_id" uuid not null,
    "created_by" uuid not null,
    "name" text not null,
    "description" text,
    "enabled" boolean default false,
    "enabled_at" timestamp with time zone,
    "enabled_until" timestamp with time zone,
    "duration_hours" integer,
    "permanently_disabled" boolean default false,
    "disabled_reason" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);


alter table "public"."tasting_exams" enable row level security;

create table "public"."tasting_responses" (
    "id" uuid not null default gen_random_uuid(),
    "exam_id" uuid not null,
    "user_id" uuid not null,
    "user_name" text not null,
    "completed_at" timestamp with time zone default now(),
    "created_at" timestamp with time zone default now()
);


alter table "public"."tasting_responses" enable row level security;

create table "public"."tasting_wine_responses" (
    "id" uuid not null default gen_random_uuid(),
    "response_id" uuid not null,
    "wine_id" uuid not null,
    "body_intensity" integer,
    "clarity" integer,
    "effervescence" integer,
    "alcohol_level" integer,
    "detected_aromas" text[],
    "other_aromas" text,
    "aroma_intensity" text,
    "aroma_quality" text,
    "aroma_complexity" text,
    "first_impact" text,
    "other_first_impact" text,
    "recognized_flavors" text[],
    "other_flavors" text,
    "acidity_level" integer,
    "tannin_level" integer,
    "alcohol_sensation" integer,
    "body" text,
    "persistence" text,
    "detected_tastes" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);


alter table "public"."tasting_wine_responses" enable row level security;

create table "public"."users" (
    "id" uuid not null,
    "email" text not null,
    "name" text,
    "role" text not null default 'owner'::text,
    "branch_id" uuid,
    "owner_id" uuid,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "status" text default 'active'::text,
    "approved_by" uuid,
    "approved_at" timestamp with time zone,
    "subscription_plan" text default 'free'::text,
    "subscription_expires_at" timestamp with time zone,
    "subscription_branches_count" integer default 1,
    "subscription_active" boolean default true,
    "username" text,
    "subscription_id" uuid,
    "stripe_customer_id" text,
    "payment_method_id" text,
    "billing_email" text,
    "subscription_branch_addons_count" integer not null default 0
);


alter table "public"."users" enable row level security;

create table "public"."wine_branch_stock" (
    "id" uuid not null default gen_random_uuid(),
    "wine_id" uuid not null,
    "branch_id" uuid not null,
    "quantity" integer not null default 0,
    "price_by_bottle" numeric(10,2),
    "price_by_glass" numeric(10,2),
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "stock_quantity" integer default 0,
    "min_stock" integer default 0,
    "owner_id" uuid
);


create table "public"."wine_images" (
    "id" uuid not null default gen_random_uuid(),
    "wine_id" uuid not null,
    "kind" text,
    "file_path" text not null,
    "created_at" timestamp with time zone default now()
);


create table "public"."wine_sources" (
    "id" uuid not null default gen_random_uuid(),
    "wine_id" uuid not null,
    "source_name" text not null,
    "source_type" text,
    "source_ref" text,
    "extracted_json" jsonb,
    "created_at" timestamp with time zone default now(),
    "source_hash" text
);


create table "public"."wines" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "grape_variety" text,
    "region" text,
    "country" text,
    "vintage" text,
    "alcohol_content" numeric(4,2),
    "description" text,
    "price" numeric(10,2),
    "price_per_glass" numeric(10,2),
    "image_url" text,
    "front_label_image" text,
    "back_label_image" text,
    "additional_images" text[],
    "body_level" integer,
    "sweetness_level" integer,
    "acidity_level" integer,
    "intensity_level" integer,
    "winery" text,
    "type" text,
    "tasting_notes" text,
    "food_pairings" text[],
    "serving_temperature" text,
    "owner_id" uuid not null,
    "created_by" uuid,
    "updated_by" uuid,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "available_by_glass" boolean default false,
    "available_by_bottle" boolean default true,
    "stock_quantity" integer default 0,
    "fizziness_level" integer
);


alter table "public"."wines" enable row level security;

create table "public"."wines_canonical" (
    "id" uuid not null default gen_random_uuid(),
    "winery" text not null,
    "label" text,
    "abv" numeric,
    "color" jsonb,
    "country" jsonb,
    "region" jsonb,
    "grapes" text[],
    "serving" jsonb default '{"pairing": {"en": [], "es": []}}'::jsonb,
    "image_canonical_url" text,
    "is_shared" boolean not null default true,
    "vector_embedding" vector(3072),
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "taste_profile" jsonb default '{}'::jsonb,
    "flavors" jsonb default '{"en": [], "es": []}'::jsonb
);


alter table "public"."wines_canonical" enable row level security;

CREATE UNIQUE INDEX branches_pkey ON public.branches USING btree (id);

CREATE UNIQUE INDEX cocktail_menu_pkey ON public.cocktail_menu USING btree (id);

CREATE UNIQUE INDEX guest_sessions_pkey ON public.guest_sessions USING btree (id);

CREATE INDEX idx_branches_owner_id ON public.branches USING btree (owner_id);

CREATE INDEX idx_cocktail_menu_active ON public.cocktail_menu USING btree (branch_id, is_active) WHERE (is_active = true);

CREATE INDEX idx_cocktail_menu_branch_id ON public.cocktail_menu USING btree (branch_id);

CREATE INDEX idx_cocktail_menu_description_gin ON public.cocktail_menu USING gin (description);

CREATE INDEX idx_cocktail_menu_display_order ON public.cocktail_menu USING btree (branch_id, display_order);

CREATE INDEX idx_cocktail_menu_ingredients_gin ON public.cocktail_menu USING gin (ingredients);

CREATE INDEX idx_cocktail_menu_name_gin ON public.cocktail_menu USING gin (name);

CREATE INDEX idx_cocktail_menu_owner_id ON public.cocktail_menu USING btree (owner_id);

CREATE INDEX idx_ingest_logs_created_at ON public.ingest_logs USING btree (created_at);

CREATE INDEX idx_ingest_logs_user_created ON public.ingest_logs USING btree (user_name, created_at);

CREATE INDEX idx_inventory_movements_branch_id ON public.inventory_movements USING btree (branch_id);

CREATE INDEX idx_inventory_movements_created_at ON public.inventory_movements USING btree (created_at DESC);

CREATE INDEX idx_inventory_movements_movement_type ON public.inventory_movements USING btree (movement_type);

CREATE INDEX idx_inventory_movements_owner_id ON public.inventory_movements USING btree (owner_id);

CREATE INDEX idx_inventory_movements_wine_id ON public.inventory_movements USING btree (wine_id);

CREATE INDEX idx_invoices_invoice_number ON public.invoices USING btree (invoice_number);

CREATE INDEX idx_invoices_owner_id ON public.invoices USING btree (owner_id);

CREATE INDEX idx_invoices_payment_id ON public.invoices USING btree (payment_id);

CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);

CREATE INDEX idx_invoices_stripe_invoice_id ON public.invoices USING btree (stripe_invoice_id);

CREATE INDEX idx_invoices_subscription_id ON public.invoices USING btree (subscription_id);

CREATE INDEX idx_invoices_user_id ON public.invoices USING btree (user_id);

CREATE INDEX idx_payments_created_at ON public.payments USING btree (created_at DESC);

CREATE INDEX idx_payments_owner_id ON public.payments USING btree (owner_id);

CREATE INDEX idx_payments_status ON public.payments USING btree (status);

CREATE INDEX idx_payments_stripe_payment_intent_id ON public.payments USING btree (stripe_payment_intent_id);

CREATE INDEX idx_payments_subscription_id ON public.payments USING btree (subscription_id);

CREATE INDEX idx_payments_user_id ON public.payments USING btree (user_id);

CREATE INDEX idx_qr_tokens_branch_id ON public.qr_tokens USING btree (branch_id);

CREATE INDEX idx_qr_tokens_expires_at ON public.qr_tokens USING btree (expires_at);

CREATE INDEX idx_qr_tokens_owner_id ON public.qr_tokens USING btree (owner_id);

CREATE INDEX idx_qr_tokens_token ON public.qr_tokens USING btree (token);

CREATE INDEX idx_rate_limits_action ON public.rate_limits USING btree (action);

CREATE INDEX idx_rate_limits_identifier ON public.rate_limits USING btree (identifier);

CREATE INDEX idx_rate_limits_key ON public.rate_limits USING btree (key);

CREATE INDEX idx_rate_limits_reset_at ON public.rate_limits USING btree (reset_at);

CREATE INDEX idx_sale_items_created_at ON public.sale_items USING btree (created_at DESC);

CREATE INDEX idx_sale_items_item_type ON public.sale_items USING btree (item_type);

CREATE INDEX idx_sale_items_sale_id ON public.sale_items USING btree (sale_id);

CREATE INDEX idx_sale_items_wine_id ON public.sale_items USING btree (wine_id);

CREATE INDEX idx_sales_branch_id ON public.sales USING btree (branch_id);

CREATE INDEX idx_sales_created_at ON public.sales USING btree (created_at DESC);

CREATE INDEX idx_sales_guest_session_id ON public.sales USING btree (guest_session_id);

CREATE INDEX idx_sales_owner_id ON public.sales USING btree (owner_id);

CREATE INDEX idx_sales_payment_status ON public.sales USING btree (payment_status);

CREATE INDEX idx_sales_user_id ON public.sales USING btree (user_id);

CREATE INDEX idx_subscriptions_current_period_end ON public.subscriptions USING btree (current_period_end);

CREATE INDEX idx_subscriptions_owner_id ON public.subscriptions USING btree (owner_id);

CREATE INDEX idx_subscriptions_status ON public.subscriptions USING btree (status);

CREATE INDEX idx_subscriptions_stripe_subscription_id ON public.subscriptions USING btree (stripe_subscription_id);

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions USING btree (user_id);

CREATE INDEX idx_tasting_exam_pdfs_exam_id ON public.tasting_exam_pdfs USING btree (exam_id);

CREATE INDEX idx_tasting_exam_pdfs_generated_by ON public.tasting_exam_pdfs USING btree (generated_by);

CREATE INDEX idx_tasting_exam_wines_exam_id ON public.tasting_exam_wines USING btree (exam_id);

CREATE INDEX idx_tasting_exam_wines_wine_id ON public.tasting_exam_wines USING btree (wine_id);

CREATE INDEX idx_tasting_exams_branch_id ON public.tasting_exams USING btree (branch_id);

CREATE INDEX idx_tasting_exams_enabled ON public.tasting_exams USING btree (enabled);

CREATE INDEX idx_tasting_exams_enabled_until ON public.tasting_exams USING btree (enabled_until);

CREATE INDEX idx_tasting_exams_owner_id ON public.tasting_exams USING btree (owner_id);

CREATE INDEX idx_tasting_responses_exam_id ON public.tasting_responses USING btree (exam_id);

CREATE INDEX idx_tasting_responses_user_id ON public.tasting_responses USING btree (user_id);

CREATE INDEX idx_tasting_wine_responses_response_id ON public.tasting_wine_responses USING btree (response_id);

CREATE INDEX idx_tasting_wine_responses_wine_id ON public.tasting_wine_responses USING btree (wine_id);

CREATE INDEX idx_users_branch_id ON public.users USING btree (branch_id);

CREATE INDEX idx_users_email ON public.users USING btree (email);

CREATE INDEX idx_users_owner_id ON public.users USING btree (owner_id);

CREATE INDEX idx_users_role ON public.users USING btree (role);

CREATE INDEX idx_users_status ON public.users USING btree (status);

CREATE INDEX idx_users_stripe_customer_id ON public.users USING btree (stripe_customer_id);

CREATE INDEX idx_users_subscription_active ON public.users USING btree (subscription_active);

CREATE INDEX idx_users_subscription_id ON public.users USING btree (subscription_id);

CREATE INDEX idx_users_subscription_plan ON public.users USING btree (subscription_plan);

CREATE UNIQUE INDEX idx_users_username_owner ON public.users USING btree (username, owner_id) WHERE ((username IS NOT NULL) AND (status = 'active'::text));

CREATE INDEX idx_wine_branch_stock_branch_id ON public.wine_branch_stock USING btree (branch_id);

CREATE INDEX idx_wine_branch_stock_branch_owner ON public.wine_branch_stock USING btree (branch_id, owner_id);

CREATE INDEX idx_wine_branch_stock_wine_branch ON public.wine_branch_stock USING btree (wine_id, branch_id);

CREATE INDEX idx_wine_branch_stock_wine_id ON public.wine_branch_stock USING btree (wine_id);

CREATE INDEX idx_wine_images_wine_id ON public.wine_images USING btree (wine_id);

CREATE INDEX idx_wine_sources_wine_id ON public.wine_sources USING btree (wine_id);

CREATE INDEX idx_wines_canonical_color_gin ON public.wines_canonical USING gin (color jsonb_path_ops);

CREATE INDEX idx_wines_canonical_color_value ON public.wines_canonical USING btree (get_wine_color_value(color));

CREATE INDEX idx_wines_country ON public.wines USING btree (country);

CREATE INDEX idx_wines_flavors ON public.wines_canonical USING gin (flavors);

CREATE INDEX idx_wines_name ON public.wines USING btree (name);

CREATE INDEX idx_wines_owner_id ON public.wines USING btree (owner_id);

CREATE INDEX idx_wines_owner_id_country ON public.wines USING btree (owner_id, country);

CREATE INDEX idx_wines_owner_id_created_at ON public.wines USING btree (owner_id, created_at DESC);

CREATE INDEX idx_wines_owner_id_grape_variety ON public.wines USING btree (owner_id, grape_variety) WHERE ((grape_variety IS NOT NULL) AND (grape_variety <> ''::text));

CREATE INDEX idx_wines_owner_id_name ON public.wines USING btree (owner_id, name);

CREATE INDEX idx_wines_owner_id_type ON public.wines USING btree (owner_id, type);

CREATE INDEX idx_wines_region ON public.wines USING btree (region);

CREATE INDEX idx_wines_taste_profile ON public.wines_canonical USING gin (taste_profile);

CREATE INDEX idx_wines_type ON public.wines USING btree (type);

CREATE UNIQUE INDEX ingest_logs_pkey ON public.ingest_logs USING btree (id);

CREATE UNIQUE INDEX inventory_movements_pkey ON public.inventory_movements USING btree (id);

CREATE UNIQUE INDEX invoices_invoice_number_key ON public.invoices USING btree (invoice_number);

CREATE UNIQUE INDEX invoices_pkey ON public.invoices USING btree (id);

CREATE UNIQUE INDEX invoices_stripe_invoice_id_key ON public.invoices USING btree (stripe_invoice_id);

CREATE UNIQUE INDEX payments_pkey ON public.payments USING btree (id);

CREATE UNIQUE INDEX payments_stripe_payment_intent_id_key ON public.payments USING btree (stripe_payment_intent_id);

CREATE UNIQUE INDEX qr_tokens_pkey ON public.qr_tokens USING btree (id);

CREATE UNIQUE INDEX qr_tokens_token_key ON public.qr_tokens USING btree (token);

CREATE UNIQUE INDEX rate_limits_key_key ON public.rate_limits USING btree (key);

CREATE UNIQUE INDEX rate_limits_pkey ON public.rate_limits USING btree (id);

CREATE UNIQUE INDEX sale_items_pkey ON public.sale_items USING btree (id);

CREATE UNIQUE INDEX sales_idempotency_key_unique ON public.sales USING btree (owner_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);

CREATE UNIQUE INDEX sales_pkey ON public.sales USING btree (id);

CREATE UNIQUE INDEX subscriptions_pkey ON public.subscriptions USING btree (id);

CREATE UNIQUE INDEX subscriptions_stripe_subscription_id_key ON public.subscriptions USING btree (stripe_subscription_id);

CREATE UNIQUE INDEX tasting_exam_pdfs_pkey ON public.tasting_exam_pdfs USING btree (id);

CREATE UNIQUE INDEX tasting_exam_wines_exam_id_wine_id_key ON public.tasting_exam_wines USING btree (exam_id, wine_id);

CREATE UNIQUE INDEX tasting_exam_wines_pkey ON public.tasting_exam_wines USING btree (id);

CREATE UNIQUE INDEX tasting_exams_pkey ON public.tasting_exams USING btree (id);

CREATE UNIQUE INDEX tasting_responses_exam_id_user_id_key ON public.tasting_responses USING btree (exam_id, user_id);

CREATE UNIQUE INDEX tasting_responses_pkey ON public.tasting_responses USING btree (id);

CREATE UNIQUE INDEX tasting_wine_responses_pkey ON public.tasting_wine_responses USING btree (id);

CREATE UNIQUE INDEX uq_wine_images_kind ON public.wine_images USING btree (wine_id, kind);

CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id);

CREATE UNIQUE INDEX users_stripe_customer_id_key ON public.users USING btree (stripe_customer_id);

CREATE UNIQUE INDEX ux_wine_sources_hash ON public.wine_sources USING btree (source_hash);

CREATE UNIQUE INDEX wine_branch_stock_pkey ON public.wine_branch_stock USING btree (id);

CREATE UNIQUE INDEX wine_branch_stock_wine_id_branch_id_key ON public.wine_branch_stock USING btree (wine_id, branch_id);

CREATE UNIQUE INDEX wine_images_pkey ON public.wine_images USING btree (id);

CREATE UNIQUE INDEX wine_sources_pkey ON public.wine_sources USING btree (id);

CREATE UNIQUE INDEX wines_canonical_pkey ON public.wines_canonical USING btree (id);

CREATE UNIQUE INDEX wines_pkey ON public.wines USING btree (id);

alter table "public"."branches" add constraint "branches_pkey" PRIMARY KEY using index "branches_pkey";

alter table "public"."cocktail_menu" add constraint "cocktail_menu_pkey" PRIMARY KEY using index "cocktail_menu_pkey";

alter table "public"."guest_sessions" add constraint "guest_sessions_pkey" PRIMARY KEY using index "guest_sessions_pkey";

alter table "public"."ingest_logs" add constraint "ingest_logs_pkey" PRIMARY KEY using index "ingest_logs_pkey";

alter table "public"."inventory_movements" add constraint "inventory_movements_pkey" PRIMARY KEY using index "inventory_movements_pkey";

alter table "public"."invoices" add constraint "invoices_pkey" PRIMARY KEY using index "invoices_pkey";

alter table "public"."payments" add constraint "payments_pkey" PRIMARY KEY using index "payments_pkey";

alter table "public"."qr_tokens" add constraint "qr_tokens_pkey" PRIMARY KEY using index "qr_tokens_pkey";

alter table "public"."rate_limits" add constraint "rate_limits_pkey" PRIMARY KEY using index "rate_limits_pkey";

alter table "public"."sale_items" add constraint "sale_items_pkey" PRIMARY KEY using index "sale_items_pkey";

alter table "public"."sales" add constraint "sales_pkey" PRIMARY KEY using index "sales_pkey";

alter table "public"."subscriptions" add constraint "subscriptions_pkey" PRIMARY KEY using index "subscriptions_pkey";

alter table "public"."tasting_exam_pdfs" add constraint "tasting_exam_pdfs_pkey" PRIMARY KEY using index "tasting_exam_pdfs_pkey";

alter table "public"."tasting_exam_wines" add constraint "tasting_exam_wines_pkey" PRIMARY KEY using index "tasting_exam_wines_pkey";

alter table "public"."tasting_exams" add constraint "tasting_exams_pkey" PRIMARY KEY using index "tasting_exams_pkey";

alter table "public"."tasting_responses" add constraint "tasting_responses_pkey" PRIMARY KEY using index "tasting_responses_pkey";

alter table "public"."tasting_wine_responses" add constraint "tasting_wine_responses_pkey" PRIMARY KEY using index "tasting_wine_responses_pkey";

alter table "public"."users" add constraint "users_pkey" PRIMARY KEY using index "users_pkey";

alter table "public"."wine_branch_stock" add constraint "wine_branch_stock_pkey" PRIMARY KEY using index "wine_branch_stock_pkey";

alter table "public"."wine_images" add constraint "wine_images_pkey" PRIMARY KEY using index "wine_images_pkey";

alter table "public"."wine_sources" add constraint "wine_sources_pkey" PRIMARY KEY using index "wine_sources_pkey";

alter table "public"."wines" add constraint "wines_pkey" PRIMARY KEY using index "wines_pkey";

alter table "public"."wines_canonical" add constraint "wines_canonical_pkey" PRIMARY KEY using index "wines_canonical_pkey";

alter table "public"."cocktail_menu" add constraint "cocktail_menu_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE not valid;

alter table "public"."cocktail_menu" validate constraint "cocktail_menu_branch_id_fkey";

alter table "public"."cocktail_menu" add constraint "cocktail_menu_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."cocktail_menu" validate constraint "cocktail_menu_created_by_fkey";

alter table "public"."cocktail_menu" add constraint "cocktail_menu_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."cocktail_menu" validate constraint "cocktail_menu_owner_id_fkey";

alter table "public"."cocktail_menu" add constraint "cocktail_menu_price_check" CHECK ((price >= (0)::numeric)) not valid;

alter table "public"."cocktail_menu" validate constraint "cocktail_menu_price_check";

alter table "public"."ingest_logs" add constraint "ingest_logs_action_check" CHECK ((action = ANY (ARRAY['inserted'::text, 'updated'::text]))) not valid;

alter table "public"."ingest_logs" validate constraint "ingest_logs_action_check";

alter table "public"."ingest_logs" add constraint "ingest_logs_wine_id_fkey" FOREIGN KEY (wine_id) REFERENCES wines_canonical(id) ON DELETE SET NULL not valid;

alter table "public"."ingest_logs" validate constraint "ingest_logs_wine_id_fkey";

alter table "public"."inventory_movements" add constraint "inventory_movements_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE not valid;

alter table "public"."inventory_movements" validate constraint "inventory_movements_branch_id_fkey";

alter table "public"."inventory_movements" add constraint "inventory_movements_movement_type_check" CHECK ((movement_type = ANY (ARRAY['entrada'::text, 'salida'::text, 'ajuste'::text, 'venta'::text]))) not valid;

alter table "public"."inventory_movements" validate constraint "inventory_movements_movement_type_check";

alter table "public"."inventory_movements" add constraint "inventory_movements_quantity_check" CHECK ((quantity > 0)) not valid;

alter table "public"."inventory_movements" validate constraint "inventory_movements_quantity_check";

alter table "public"."inventory_movements" add constraint "inventory_movements_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL not valid;

alter table "public"."inventory_movements" validate constraint "inventory_movements_user_id_fkey";

alter table "public"."inventory_movements" add constraint "inventory_movements_wine_id_fkey" FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE CASCADE not valid;

alter table "public"."inventory_movements" validate constraint "inventory_movements_wine_id_fkey";

alter table "public"."invoices" add constraint "invoices_amount_check" CHECK ((amount >= (0)::numeric)) not valid;

alter table "public"."invoices" validate constraint "invoices_amount_check";

alter table "public"."invoices" add constraint "invoices_invoice_number_key" UNIQUE using index "invoices_invoice_number_key";

alter table "public"."invoices" add constraint "invoices_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."invoices" validate constraint "invoices_owner_id_fkey";

alter table "public"."invoices" add constraint "invoices_payment_id_fkey" FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL not valid;

alter table "public"."invoices" validate constraint "invoices_payment_id_fkey";

alter table "public"."invoices" add constraint "invoices_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'paid'::text, 'void'::text, 'uncollectible'::text]))) not valid;

alter table "public"."invoices" validate constraint "invoices_status_check";

alter table "public"."invoices" add constraint "invoices_stripe_invoice_id_key" UNIQUE using index "invoices_stripe_invoice_id_key";

alter table "public"."invoices" add constraint "invoices_subscription_id_fkey" FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL not valid;

alter table "public"."invoices" validate constraint "invoices_subscription_id_fkey";

alter table "public"."invoices" add constraint "invoices_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."invoices" validate constraint "invoices_user_id_fkey";

alter table "public"."payments" add constraint "payments_amount_check" CHECK ((amount >= (0)::numeric)) not valid;

alter table "public"."payments" validate constraint "payments_amount_check";

alter table "public"."payments" add constraint "payments_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."payments" validate constraint "payments_owner_id_fkey";

alter table "public"."payments" add constraint "payments_payment_method_check" CHECK ((payment_method = ANY (ARRAY['card'::text, 'bank_transfer'::text, 'cash'::text, 'other'::text]))) not valid;

alter table "public"."payments" validate constraint "payments_payment_method_check";

alter table "public"."payments" add constraint "payments_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'refunded'::text, 'canceled'::text]))) not valid;

alter table "public"."payments" validate constraint "payments_status_check";

alter table "public"."payments" add constraint "payments_stripe_payment_intent_id_key" UNIQUE using index "payments_stripe_payment_intent_id_key";

alter table "public"."payments" add constraint "payments_subscription_id_fkey" FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL not valid;

alter table "public"."payments" validate constraint "payments_subscription_id_fkey";

alter table "public"."payments" add constraint "payments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."payments" validate constraint "payments_user_id_fkey";

alter table "public"."qr_tokens" add constraint "qr_tokens_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE not valid;

alter table "public"."qr_tokens" validate constraint "qr_tokens_branch_id_fkey";

alter table "public"."qr_tokens" add constraint "qr_tokens_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) not valid;

alter table "public"."qr_tokens" validate constraint "qr_tokens_created_by_fkey";

alter table "public"."qr_tokens" add constraint "qr_tokens_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES users(id) not valid;

alter table "public"."qr_tokens" validate constraint "qr_tokens_owner_id_fkey";

alter table "public"."qr_tokens" add constraint "qr_tokens_token_key" UNIQUE using index "qr_tokens_token_key";

alter table "public"."qr_tokens" add constraint "qr_tokens_type_check" CHECK ((type = ANY (ARRAY['guest'::text, 'admin_invite'::text]))) not valid;

alter table "public"."qr_tokens" validate constraint "qr_tokens_type_check";

alter table "public"."qr_tokens" add constraint "qr_tokens_used_by_fkey" FOREIGN KEY (used_by) REFERENCES users(id) not valid;

alter table "public"."qr_tokens" validate constraint "qr_tokens_used_by_fkey";

alter table "public"."rate_limits" add constraint "rate_limits_key_key" UNIQUE using index "rate_limits_key_key";

alter table "public"."sale_items" add constraint "sale_items_item_type_check" CHECK ((item_type = ANY (ARRAY['bottle'::text, 'glass'::text]))) not valid;

alter table "public"."sale_items" validate constraint "sale_items_item_type_check";

alter table "public"."sale_items" add constraint "sale_items_quantity_check" CHECK ((quantity > 0)) not valid;

alter table "public"."sale_items" validate constraint "sale_items_quantity_check";

alter table "public"."sale_items" add constraint "sale_items_sale_id_fkey" FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE not valid;

alter table "public"."sale_items" validate constraint "sale_items_sale_id_fkey";

alter table "public"."sale_items" add constraint "sale_items_unit_price_check" CHECK ((unit_price >= (0)::numeric)) not valid;

alter table "public"."sale_items" validate constraint "sale_items_unit_price_check";

alter table "public"."sale_items" add constraint "sale_items_wine_id_fkey" FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE RESTRICT not valid;

alter table "public"."sale_items" validate constraint "sale_items_wine_id_fkey";

alter table "public"."sales" add constraint "sales_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE not valid;

alter table "public"."sales" validate constraint "sales_branch_id_fkey";

alter table "public"."sales" add constraint "sales_guest_session_id_fkey" FOREIGN KEY (guest_session_id) REFERENCES guest_sessions(id) ON DELETE SET NULL not valid;

alter table "public"."sales" validate constraint "sales_guest_session_id_fkey";

alter table "public"."sales" add constraint "sales_payment_method_check" CHECK ((payment_method = ANY (ARRAY['cash'::text, 'card'::text, 'digital_wallet'::text, 'other'::text]))) not valid;

alter table "public"."sales" validate constraint "sales_payment_method_check";

alter table "public"."sales" add constraint "sales_payment_status_check" CHECK ((payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'cancelled'::text]))) not valid;

alter table "public"."sales" validate constraint "sales_payment_status_check";

alter table "public"."sales" add constraint "sales_sale_type_check" CHECK ((sale_type = ANY (ARRAY['guest'::text, 'direct'::text, 'takeout'::text]))) not valid;

alter table "public"."sales" validate constraint "sales_sale_type_check";

alter table "public"."sales" add constraint "sales_total_amount_check" CHECK ((total_amount >= (0)::numeric)) not valid;

alter table "public"."sales" validate constraint "sales_total_amount_check";

alter table "public"."sales" add constraint "sales_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL not valid;

alter table "public"."sales" validate constraint "sales_user_id_fkey";

alter table "public"."subscriptions" add constraint "subscriptions_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."subscriptions" validate constraint "subscriptions_owner_id_fkey";

alter table "public"."subscriptions" add constraint "subscriptions_plan_id_check" CHECK ((plan_id = ANY (ARRAY['free'::text, 'basic'::text, 'additional-branch'::text]))) not valid;

alter table "public"."subscriptions" validate constraint "subscriptions_plan_id_check";

alter table "public"."subscriptions" add constraint "subscriptions_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'canceled'::text, 'expired'::text, 'past_due'::text, 'trialing'::text, 'pending'::text]))) not valid;

alter table "public"."subscriptions" validate constraint "subscriptions_status_check";

alter table "public"."subscriptions" add constraint "subscriptions_stripe_subscription_id_key" UNIQUE using index "subscriptions_stripe_subscription_id_key";

alter table "public"."subscriptions" add constraint "subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."subscriptions" validate constraint "subscriptions_user_id_fkey";

alter table "public"."tasting_exam_pdfs" add constraint "tasting_exam_pdfs_exam_id_fkey" FOREIGN KEY (exam_id) REFERENCES tasting_exams(id) ON DELETE CASCADE not valid;

alter table "public"."tasting_exam_pdfs" validate constraint "tasting_exam_pdfs_exam_id_fkey";

alter table "public"."tasting_exam_pdfs" add constraint "tasting_exam_pdfs_generated_by_fkey" FOREIGN KEY (generated_by) REFERENCES auth.users(id) ON DELETE RESTRICT not valid;

alter table "public"."tasting_exam_pdfs" validate constraint "tasting_exam_pdfs_generated_by_fkey";

alter table "public"."tasting_exam_wines" add constraint "tasting_exam_wines_exam_id_fkey" FOREIGN KEY (exam_id) REFERENCES tasting_exams(id) ON DELETE CASCADE not valid;

alter table "public"."tasting_exam_wines" validate constraint "tasting_exam_wines_exam_id_fkey";

alter table "public"."tasting_exam_wines" add constraint "tasting_exam_wines_exam_id_wine_id_key" UNIQUE using index "tasting_exam_wines_exam_id_wine_id_key";

alter table "public"."tasting_exam_wines" add constraint "tasting_exam_wines_wine_id_fkey" FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE RESTRICT not valid;

alter table "public"."tasting_exam_wines" validate constraint "tasting_exam_wines_wine_id_fkey";

alter table "public"."tasting_exams" add constraint "tasting_exams_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE not valid;

alter table "public"."tasting_exams" validate constraint "tasting_exams_branch_id_fkey";

alter table "public"."tasting_exams" add constraint "tasting_exams_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT not valid;

alter table "public"."tasting_exams" validate constraint "tasting_exams_created_by_fkey";

alter table "public"."tasting_exams" add constraint "tasting_exams_duration_hours_check" CHECK ((duration_hours = ANY (ARRAY[1, 3, 6]))) not valid;

alter table "public"."tasting_exams" validate constraint "tasting_exams_duration_hours_check";

alter table "public"."tasting_exams" add constraint "tasting_exams_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."tasting_exams" validate constraint "tasting_exams_owner_id_fkey";

alter table "public"."tasting_responses" add constraint "tasting_responses_exam_id_fkey" FOREIGN KEY (exam_id) REFERENCES tasting_exams(id) ON DELETE CASCADE not valid;

alter table "public"."tasting_responses" validate constraint "tasting_responses_exam_id_fkey";

alter table "public"."tasting_responses" add constraint "tasting_responses_exam_id_user_id_key" UNIQUE using index "tasting_responses_exam_id_user_id_key";

alter table "public"."tasting_responses" add constraint "tasting_responses_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT not valid;

alter table "public"."tasting_responses" validate constraint "tasting_responses_user_id_fkey";

alter table "public"."tasting_wine_responses" add constraint "tasting_wine_responses_acidity_level_check" CHECK (((acidity_level >= 1) AND (acidity_level <= 10))) not valid;

alter table "public"."tasting_wine_responses" validate constraint "tasting_wine_responses_acidity_level_check";

alter table "public"."tasting_wine_responses" add constraint "tasting_wine_responses_alcohol_level_check" CHECK (((alcohol_level >= 1) AND (alcohol_level <= 10))) not valid;

alter table "public"."tasting_wine_responses" validate constraint "tasting_wine_responses_alcohol_level_check";

alter table "public"."tasting_wine_responses" add constraint "tasting_wine_responses_alcohol_sensation_check" CHECK (((alcohol_sensation >= 1) AND (alcohol_sensation <= 5))) not valid;

alter table "public"."tasting_wine_responses" validate constraint "tasting_wine_responses_alcohol_sensation_check";

alter table "public"."tasting_wine_responses" add constraint "tasting_wine_responses_aroma_complexity_check" CHECK ((aroma_complexity = ANY (ARRAY['varios_mezclados'::text, 'uno_destacado'::text]))) not valid;

alter table "public"."tasting_wine_responses" validate constraint "tasting_wine_responses_aroma_complexity_check";

alter table "public"."tasting_wine_responses" add constraint "tasting_wine_responses_aroma_intensity_check" CHECK ((aroma_intensity = ANY (ARRAY['fuertes'::text, 'sutiles'::text]))) not valid;

alter table "public"."tasting_wine_responses" validate constraint "tasting_wine_responses_aroma_intensity_check";

alter table "public"."tasting_wine_responses" add constraint "tasting_wine_responses_aroma_quality_check" CHECK ((aroma_quality = ANY (ARRAY['agradables'::text, 'desagradables'::text]))) not valid;

alter table "public"."tasting_wine_responses" validate constraint "tasting_wine_responses_aroma_quality_check";

alter table "public"."tasting_wine_responses" add constraint "tasting_wine_responses_body_check" CHECK ((body = ANY (ARRAY['ligero'::text, 'medio'::text, 'robusto'::text]))) not valid;

alter table "public"."tasting_wine_responses" validate constraint "tasting_wine_responses_body_check";

alter table "public"."tasting_wine_responses" add constraint "tasting_wine_responses_body_intensity_check" CHECK (((body_intensity >= 1) AND (body_intensity <= 5))) not valid;

alter table "public"."tasting_wine_responses" validate constraint "tasting_wine_responses_body_intensity_check";

alter table "public"."tasting_wine_responses" add constraint "tasting_wine_responses_clarity_check" CHECK (((clarity >= 1) AND (clarity <= 5))) not valid;

alter table "public"."tasting_wine_responses" validate constraint "tasting_wine_responses_clarity_check";

alter table "public"."tasting_wine_responses" add constraint "tasting_wine_responses_effervescence_check" CHECK (((effervescence >= 1) AND (effervescence <= 5))) not valid;

alter table "public"."tasting_wine_responses" validate constraint "tasting_wine_responses_effervescence_check";

alter table "public"."tasting_wine_responses" add constraint "tasting_wine_responses_persistence_check" CHECK ((persistence = ANY (ARRAY['baja'::text, 'media'::text, 'alta'::text]))) not valid;

alter table "public"."tasting_wine_responses" validate constraint "tasting_wine_responses_persistence_check";

alter table "public"."tasting_wine_responses" add constraint "tasting_wine_responses_response_id_fkey" FOREIGN KEY (response_id) REFERENCES tasting_responses(id) ON DELETE CASCADE not valid;

alter table "public"."tasting_wine_responses" validate constraint "tasting_wine_responses_response_id_fkey";

alter table "public"."tasting_wine_responses" add constraint "tasting_wine_responses_tannin_level_check" CHECK (((tannin_level >= 1) AND (tannin_level <= 10))) not valid;

alter table "public"."tasting_wine_responses" validate constraint "tasting_wine_responses_tannin_level_check";

alter table "public"."tasting_wine_responses" add constraint "tasting_wine_responses_wine_id_fkey" FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE RESTRICT not valid;

alter table "public"."tasting_wine_responses" validate constraint "tasting_wine_responses_wine_id_fkey";

alter table "public"."users" add constraint "users_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES users(id) not valid;

alter table "public"."users" validate constraint "users_approved_by_fkey";

alter table "public"."users" add constraint "users_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id) not valid;

alter table "public"."users" validate constraint "users_branch_id_fkey";

alter table "public"."users" add constraint "users_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'inactive'::text]))) not valid;

alter table "public"."users" validate constraint "users_status_check";

alter table "public"."users" add constraint "users_stripe_customer_id_key" UNIQUE using index "users_stripe_customer_id_key";

alter table "public"."users" add constraint "users_subscription_id_fkey" FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL not valid;

alter table "public"."users" validate constraint "users_subscription_id_fkey";

alter table "public"."users" add constraint "users_subscription_plan_check" CHECK ((subscription_plan = ANY (ARRAY['free'::text, 'basic'::text, 'additional-branch'::text]))) not valid;

alter table "public"."users" validate constraint "users_subscription_plan_check";

alter table "public"."wine_branch_stock" add constraint "wine_branch_stock_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE not valid;

alter table "public"."wine_branch_stock" validate constraint "wine_branch_stock_branch_id_fkey";

alter table "public"."wine_branch_stock" add constraint "wine_branch_stock_wine_id_branch_id_key" UNIQUE using index "wine_branch_stock_wine_id_branch_id_key";

alter table "public"."wine_branch_stock" add constraint "wine_branch_stock_wine_id_fkey" FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE CASCADE not valid;

alter table "public"."wine_branch_stock" validate constraint "wine_branch_stock_wine_id_fkey";

alter table "public"."wine_images" add constraint "uq_wine_images_kind" UNIQUE using index "uq_wine_images_kind";

alter table "public"."wine_images" add constraint "wine_images_kind_check" CHECK ((kind = ANY (ARRAY['bottle'::text, 'label'::text, 'techsheet'::text, 'other'::text]))) not valid;

alter table "public"."wine_images" validate constraint "wine_images_kind_check";

alter table "public"."wine_images" add constraint "wine_images_wine_id_fkey" FOREIGN KEY (wine_id) REFERENCES wines_canonical(id) ON DELETE CASCADE not valid;

alter table "public"."wine_images" validate constraint "wine_images_wine_id_fkey";

alter table "public"."wine_sources" add constraint "wine_sources_wine_id_fkey" FOREIGN KEY (wine_id) REFERENCES wines_canonical(id) ON DELETE CASCADE not valid;

alter table "public"."wine_sources" validate constraint "wine_sources_wine_id_fkey";

alter table "public"."wines" add constraint "wines_acidity_level_check" CHECK (((acidity_level >= 1) AND (acidity_level <= 5))) not valid;

alter table "public"."wines" validate constraint "wines_acidity_level_check";

alter table "public"."wines" add constraint "wines_body_level_check" CHECK (((body_level >= 1) AND (body_level <= 5))) not valid;

alter table "public"."wines" validate constraint "wines_body_level_check";

alter table "public"."wines" add constraint "wines_fizziness_level_check" CHECK (((fizziness_level >= 1) AND (fizziness_level <= 5))) not valid;

alter table "public"."wines" validate constraint "wines_fizziness_level_check";

alter table "public"."wines" add constraint "wines_intensity_level_check" CHECK (((intensity_level >= 1) AND (intensity_level <= 5))) not valid;

alter table "public"."wines" validate constraint "wines_intensity_level_check";

alter table "public"."wines" add constraint "wines_sweetness_level_check" CHECK (((sweetness_level >= 1) AND (sweetness_level <= 5))) not valid;

alter table "public"."wines" validate constraint "wines_sweetness_level_check";

alter table "public"."wines" add constraint "wines_type_check" CHECK ((type = ANY (ARRAY['red'::text, 'white'::text, 'rose'::text, 'sparkling'::text, 'dessert'::text, 'fortified'::text]))) not valid;

alter table "public"."wines" validate constraint "wines_type_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.auto_disable_expired_exams()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE tasting_exams
  SET enabled = false, updated_at = NOW()
  WHERE enabled = true
  AND enabled_until < NOW();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_exam_limit_per_branch()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  exam_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO exam_count
  FROM tasting_exams
  WHERE branch_id = NEW.branch_id
  AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);
  
  IF exam_count >= 10 THEN
    RAISE EXCEPTION 'No se pueden crear más de 10 exámenes por sucursal';
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limits()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Eliminar entradas donde reset_at ya pasó (más de 1 hora de antigüedad)
  DELETE FROM public.rate_limits
  WHERE reset_at < EXTRACT(EPOCH FROM NOW()) * 1000 - (60 * 60 * 1000); -- 1 hora atrás
  
  RAISE NOTICE 'Limpieza de rate limits completada';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_staff_user(p_user_id uuid, p_email text, p_name text, p_qr_token text, p_username text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_id UUID;
  v_branch_id UUID;
  v_result JSON;
BEGIN
  -- Validar que el QR token existe y está válido
  SELECT owner_id, branch_id 
  INTO v_owner_id, v_branch_id
  FROM public.qr_tokens
  WHERE token = p_qr_token
  AND expires_at > NOW()
  LIMIT 1;

  -- Si no se encontró el token, error
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Token QR inválido o expirado';
  END IF;

  -- Verificar que el username no esté en uso (si se proporciona)
  IF p_username IS NOT NULL AND p_username != '' THEN
    IF EXISTS (
      SELECT 1 FROM public.users 
      WHERE username = p_username 
      AND owner_id = v_owner_id 
      AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'El nombre de usuario ya está en uso';
    END IF;
  END IF;

  -- Insertar usuario en public.users
  INSERT INTO public.users (
    id,
    email,
    name,
    username,
    role,
    status,
    owner_id,
    branch_id,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_email,
    p_name,
    NULLIF(p_username, ''), -- Guardar username solo si no está vacío
    'staff',
    'pending',
    v_owner_id,
    v_branch_id,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    username = COALESCE(EXCLUDED.username, users.username), -- Actualizar username si viene en el INSERT
    updated_at = NOW();

  -- ✅ Confirmar email automáticamente en auth.users
  UPDATE auth.users
  SET 
    email_confirmed_at = NOW()
  WHERE id = p_user_id
  AND email_confirmed_at IS NULL;

  -- Retornar resultado
  SELECT json_build_object(
    'success', true,
    'user_id', p_user_id,
    'owner_id', v_owner_id,
    'branch_id', v_branch_id,
    'username', p_username,
    'message', 'Usuario staff creado exitosamente'
  ) INTO v_result;

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Retornar error
    SELECT json_build_object(
      'success', false,
      'error', SQLERRM,
      'message', 'Error creando usuario staff'
    ) INTO v_result;
    
    RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_user_account(p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_role TEXT;
  v_owner_id UUID;
  v_user_email TEXT;
  v_result JSON;
  v_deleted_count INTEGER := 0;
BEGIN
  -- Verificar que el usuario existe y obtener email antes de eliminar
  SELECT role, COALESCE(owner_id, id), email INTO v_user_role, v_owner_id, v_user_email
  FROM public.users
  WHERE id = p_user_id
  LIMIT 1;

  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  -- Si es owner, eliminar todo relacionado
  IF v_user_role = 'owner' THEN
    -- 1. Eliminar exámenes de cata y respuestas
    DELETE FROM public.tasting_responses
    WHERE user_id IN (
      SELECT id FROM public.users WHERE owner_id = p_user_id
    );
    
    DELETE FROM public.tasting_wine_responses
    WHERE tasting_response_id IN (
      SELECT id FROM public.tasting_responses 
      WHERE user_id IN (SELECT id FROM public.users WHERE owner_id = p_user_id)
    );
    
    DELETE FROM public.tasting_exam_wines
    WHERE tasting_exam_id IN (
      SELECT id FROM public.tasting_exams WHERE owner_id = p_user_id
    );
    
    DELETE FROM public.tasting_exam_pdfs
    WHERE tasting_exam_id IN (
      SELECT id FROM public.tasting_exams WHERE owner_id = p_user_id
    );
    
    DELETE FROM public.tasting_exams
    WHERE owner_id = p_user_id;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Eliminados % exámenes de cata', v_deleted_count;

    -- 2. Eliminar usuarios staff del owner
    DELETE FROM public.users
    WHERE owner_id = p_user_id;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Eliminados % usuarios staff', v_deleted_count;

    -- 3. Eliminar vinos del catálogo del owner
    DELETE FROM public.wine_branch_stock
    WHERE branch_id IN (
      SELECT id FROM public.branches WHERE owner_id = p_user_id
    );
    
    DELETE FROM public.inventory_movements
    WHERE branch_id IN (
      SELECT id FROM public.branches WHERE owner_id = p_user_id
    );
    
    DELETE FROM public.wines
    WHERE owner_id = p_user_id;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Eliminados % vinos', v_deleted_count;

    -- 4. Eliminar sucursales
    DELETE FROM public.branches
    WHERE owner_id = p_user_id;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Eliminados % sucursales', v_deleted_count;

    -- 5. Eliminar QR tokens
    DELETE FROM public.qr_tokens
    WHERE owner_id = p_user_id;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Eliminados % QR tokens', v_deleted_count;

    -- 6. Eliminar ventas (si existe tabla sales)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales' AND table_schema = 'public') THEN
      DELETE FROM public.sales
      WHERE branch_id IN (
        SELECT id FROM public.branches WHERE owner_id = p_user_id
      );
    END IF;

    -- 7. Eliminar rate limits (usar email guardado)
    IF v_user_email IS NOT NULL THEN
      DELETE FROM public.rate_limits
      WHERE identifier LIKE '%' || v_user_email || '%';
    END IF;
  ELSE
    -- Si no es owner, solo eliminar datos del usuario
    DELETE FROM public.tasting_responses
    WHERE user_id = p_user_id;
    
    DELETE FROM public.tasting_wine_responses
    WHERE tasting_response_id IN (
      SELECT id FROM public.tasting_responses WHERE user_id = p_user_id
    );
  END IF;

  -- 8. Eliminar usuario de public.users
  DELETE FROM public.users
  WHERE id = p_user_id;

  -- Retornar resultado
  SELECT json_build_object(
    'success', true,
    'message', CASE 
      WHEN v_user_role = 'owner' THEN 'Cuenta de owner eliminada exitosamente. Todos los datos relacionados fueron eliminados.'
      ELSE 'Cuenta eliminada exitosamente.'
    END,
    'user_role', v_user_role
  ) INTO v_result;

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Retornar error
    SELECT json_build_object(
      'success', false,
      'error', SQLERRM,
      'message', 'Error eliminando cuenta de usuario'
    ) INTO v_result;
    
    RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.disable_exam_if_wine_deleted()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Si se elimina un vino, deshabilitar permanentemente los exámenes que lo usan
  UPDATE tasting_exams
  SET 
    enabled = false,
    permanently_disabled = true,
    disabled_reason = 'Vino eliminado del catálogo: ' || OLD.name,
    updated_at = NOW()
  WHERE id IN (
    SELECT exam_id 
    FROM tasting_exam_wines 
    WHERE wine_id = OLD.id
  );
  
  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_branch_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  owner uuid;
  max_branches int;
  current_count int;
begin
  owner := new.owner_id;

  if owner is null then
    owner := public.get_request_owner_id();
    new.owner_id := owner;
  end if;

  max_branches := public.get_branch_limit_for_owner(owner);

  select count(*) into current_count
  from public.branches
  where owner_id = owner;

  if current_count >= max_branches then
    raise exception 'Subscription limit reached: max branches = % (owner=%)', max_branches, owner
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_free_user_limits_on_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  owner uuid;
  plan text;
  total_users int;
  manager_count int;
begin
  -- Solo nos importa cuando se asigna owner_id o cambia role
  if (new.owner_id is null and old.owner_id is null)
     and (new.role = old.role) then
    return new;
  end if;

  owner := coalesce(new.owner_id, old.owner_id);

  if owner is null then
    return new;
  end if;

  plan := public.get_plan_id_effective(owner);

  if plan <> 'free' then
    return new;
  end if;

  -- Solo el owner puede “administrar” su staff (asignar owner_id o rol gerente)
  -- auth.uid() debe ser el owner para cambios de staff
  if auth.uid() <> owner then
    raise exception 'Only owner can modify staff assignments in FREE plan.'
      using errcode = 'P0001';
  end if;

  -- Conteo total de usuarios del owner (incluye el owner mismo)
  select count(*) into total_users
  from public.users
  where (id = owner) or (owner_id = owner);

  -- Si este update convierte a alguien en miembro del owner (owner_id no null),
  -- ya estamos contando todos; ahora validamos max 2
  if total_users > 2 then
    raise exception 'FREE plan limit: max 2 users total (owner + 1).'
      using errcode = 'P0001';
  end if;

  -- Max 1 gerente bajo FREE (además del owner)
  select count(*) into manager_count
  from public.users
  where owner_id = owner
    and role = 'gerente';

  -- Si el usuario se está poniendo como gerente, incluye este cambio:
  if new.role = 'gerente' and (old.role is distinct from 'gerente') then
    manager_count := manager_count + 1;
  end if;

  if manager_count > 1 then
    raise exception 'FREE plan limit: max 1 gerente.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_wine_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  owner uuid;
  max_wines int;
  current_count int;
begin
  -- owner_id debe existir en tu insert (hoy es nullable en schema; vamos a normalizarlo)
  if new.owner_id is null then
    -- si el cliente no manda owner_id, intentamos inferirlo del request
    owner := public.get_request_owner_id();
    new.owner_id := owner;
  else
    owner := new.owner_id;
  end if;

  max_wines := public.get_wine_limit_for_owner(owner);

  if max_wines = -1 then
    return new;
  end if;

  select count(*) into current_count
  from public.wines
  where owner_id = owner;

  if current_count >= max_wines then
    raise exception 'Subscription limit reached: max wines = % (owner=%)', max_wines, owner
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.extract_text_from_field(field_value anyelement, lang text DEFAULT 'en'::text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  jsonb_val JSONB;
BEGIN
  -- Si es NULL, retornar NULL
  IF field_value IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Intentar convertir a JSONB
  BEGIN
    jsonb_val := field_value::jsonb;
    
    -- Si es objeto JSONB
    IF jsonb_typeof(jsonb_val) = 'object' THEN
      RETURN COALESCE(
        jsonb_val->>lang,
        jsonb_val->>'en',
        jsonb_val->>'es'
      );
    -- Si es string JSONB
    ELSIF jsonb_typeof(jsonb_val) = 'string' THEN
      RETURN jsonb_val::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Si falla el cast, es TEXT
    RETURN field_value::text;
  END;
  
  -- Si llegamos aquí, retornar como texto
  RETURN field_value::text;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.filter_wines_by_color(p_search_query text DEFAULT ''::text, p_colors text[] DEFAULT ARRAY[]::text[], p_from integer DEFAULT 0, p_to integer DEFAULT 19)
 RETURNS TABLE(id uuid, winery jsonb, label jsonb, image_canonical_url text, country jsonb, region jsonb, color jsonb, abv numeric, total_count bigint)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  -- Retornar resultados usando CTE
  RETURN QUERY
  WITH filtered_wines AS (
    SELECT 
      wc.id,
      wc.winery,
      wc.label,
      wc.image_canonical_url,
      wc.country,
      wc.region,
      wc.color,
      wc.abv
    FROM wines_canonical wc
    WHERE (
      -- Filtro de búsqueda de texto (si existe)
      -- Usa función helper que maneja TEXT y JSONB de forma segura
      (p_search_query IS NULL OR p_search_query = '' OR
        extract_text_from_field(wc.label, 'en') ILIKE '%' || p_search_query || '%' OR
        extract_text_from_field(wc.label, 'es') ILIKE '%' || p_search_query || '%' OR
        extract_text_from_field(wc.winery, 'en') ILIKE '%' || p_search_query || '%' OR
        extract_text_from_field(wc.winery, 'es') ILIKE '%' || p_search_query || '%'
      )
      AND
      -- Filtro de color (si existe) - usa la función helper para normalizar
      (p_colors IS NULL OR array_length(p_colors, 1) IS NULL OR array_length(p_colors, 1) = 0 OR
        EXISTS (
          SELECT 1 
          FROM unnest(p_colors) AS color_filter
          WHERE LOWER(get_wine_color_value(wc.color)) LIKE '%' || LOWER(color_filter) || '%'
        )
      )
    )
  ),
  counted_wines AS (
    SELECT COUNT(*)::BIGINT as total FROM filtered_wines
  )
  SELECT 
    fw.id,
    -- Convertir a JSONB de forma segura usando función helper
    to_jsonb_safe(fw.winery) as winery,
    to_jsonb_safe(fw.label) as label,
    fw.image_canonical_url,
    to_jsonb_safe(fw.country) as country,
    to_jsonb_safe(fw.region) as region,
    fw.color,
    fw.abv,
    cw.total as total_count
  FROM filtered_wines fw
  CROSS JOIN counted_wines cw
  ORDER BY COALESCE(
    extract_text_from_field(fw.label, 'en'),
    extract_text_from_field(fw.label, 'es'),
    ''
  )
  LIMIT (p_to - p_from + 1)
  OFFSET p_from;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.find_similar_wines(p_text text, p_embedding vector, p_k integer DEFAULT 5)
 RETURNS TABLE(id uuid, wine_full_name text, cosine double precision, trigram double precision)
 LANGUAGE sql
 STABLE
AS $function$
  select id, wine_full_name,
         1 - (vector_embedding <=> p_embedding) as cosine,
         similarity(wine_full_name, p_text)     as trigram
  from wines_canonical
  order by (vector_embedding <=> p_embedding) asc
  limit p_k;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  year_part TEXT;
  sequence_num INTEGER;
  invoice_num TEXT;
BEGIN
  year_part := TO_CHAR(NOW(), 'YYYY');
  
  -- Obtener el siguiente número de secuencia para este año
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '(\d+)$') AS INTEGER)), 0) + 1
  INTO sequence_num
  FROM invoices
  WHERE invoice_number LIKE 'INV-' || year_part || '-%';
  
  -- Formato: INV-YYYY-XXX
  invoice_num := 'INV-' || year_part || '-' || LPAD(sequence_num::TEXT, 3, '0');
  
  RETURN invoice_num;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_active_subscription(p_user_id uuid)
 RETURNS TABLE(subscription_id uuid, plan_id text, plan_name text, status text, current_period_end timestamp with time zone)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.plan_id,
    s.plan_name,
    s.status,
    s.current_period_end
  FROM subscriptions s
  WHERE s.user_id = p_user_id
    AND s.status = 'active'
    AND s.current_period_end > NOW()
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_branch_limit_for_owner(p_owner uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  plan text;
  addons int;
begin
  plan := public.get_plan_id_effective(p_owner);

  select coalesce(subscription_branch_addons_count, 0) into addons
  from public.users
  where id = p_owner;

  if plan = 'free' then return 1;
  elsif plan = 'pro' then return 1;
  elsif plan = 'business' then return 3 + addons;
  else return 1;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_country_translation(country_text text, target_lang text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  country_lower TEXT;
  normalized_country TEXT;
  translations JSONB := '{
    "italia": {"es": "Italia", "en": "Italy"},
    "italy": {"es": "Italia", "en": "Italy"},
    "españa": {"es": "España", "en": "Spain"},
    "spain": {"es": "España", "en": "Spain"},
    "francia": {"es": "Francia", "en": "France"},
    "france": {"es": "Francia", "en": "France"},
    "alemania": {"es": "Alemania", "en": "Germany"},
    "germany": {"es": "Alemania", "en": "Germany"},
    "portugal": {"es": "Portugal", "en": "Portugal"},
    "argentina": {"es": "Argentina", "en": "Argentina"},
    "chile": {"es": "Chile", "en": "Chile"},
    "australia": {"es": "Australia", "en": "Australia"},
    "nueva zelanda": {"es": "Nueva Zelanda", "en": "New Zealand"},
    "new zealand": {"es": "Nueva Zelanda", "en": "New Zealand"},
    "sudafrica": {"es": "Sudáfrica", "en": "South Africa"},
    "sudáfrica": {"es": "Sudáfrica", "en": "South Africa"},
    "south africa": {"es": "Sudáfrica", "en": "South Africa"},
    "estados unidos": {"es": "Estados Unidos", "en": "United States"},
    "united states": {"es": "Estados Unidos", "en": "United States"},
    "usa": {"es": "Estados Unidos", "en": "United States"},
    "méxico": {"es": "México", "en": "Mexico"},
    "mexico": {"es": "México", "en": "Mexico"},
    "brasil": {"es": "Brasil", "en": "Brazil"},
    "brazil": {"es": "Brasil", "en": "Brazil"},
    "perú": {"es": "Perú", "en": "Peru"},
    "peru": {"es": "Perú", "en": "Peru"},
    "uruguay": {"es": "Uruguay", "en": "Uruguay"},
    "colombia": {"es": "Colombia", "en": "Colombia"},
    "canadá": {"es": "Canadá", "en": "Canada"},
    "canada": {"es": "Canadá", "en": "Canada"},
    "reino unido": {"es": "Reino Unido", "en": "United Kingdom"},
    "united kingdom": {"es": "Reino Unido", "en": "United Kingdom"},
    "uk": {"es": "Reino Unido", "en": "United Kingdom"}
  }'::jsonb;
BEGIN
  IF country_text IS NULL OR TRIM(country_text) = '' THEN
    RETURN NULL;
  END IF;

  country_lower := LOWER(TRIM(country_text));
  
  -- Buscar traducción en el mapeo (primero con el texto original)
  IF translations ? country_lower THEN
    RETURN translations->country_lower->>target_lang;
  END IF;

  -- Si no se encontró, normalizar y buscar de nuevo
  normalized_country := normalize_country_name(country_text);
  IF normalized_country IS NOT NULL THEN
    country_lower := LOWER(normalized_country);
    IF translations ? country_lower THEN
      RETURN translations->country_lower->>target_lang;
    END IF;
  END IF;

  -- Si no hay traducción, retornar el valor normalizado
  RETURN normalized_country;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_plan_id_effective(p_owner uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  plan text;
  active boolean;
begin
  select subscription_plan into plan
  from public.users
  where id = p_owner;

  active := public.is_subscription_effectively_active(p_owner);

  if active = false then
    return 'free';
  end if;

  return coalesce(plan, 'free');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_request_owner_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(
    (select u.owner_id from public.users u where u.id = auth.uid()),
    auth.uid()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_email_by_username(p_username text)
 RETURNS TABLE(email text, user_id uuid, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    u.email,
    u.id as user_id,
    u.status
  FROM public.users u
  WHERE u.username = p_username
    AND u.status IN ('pending', 'active')
    AND u.email LIKE '%@placeholder.com' -- Solo emails ficticios generados por el sistema
  LIMIT 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_wine_color_value(color_field jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  -- Si es NULL, retornar NULL
  IF color_field IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Si es string simple (JSONB de tipo string)
  IF jsonb_typeof(color_field) = 'string' THEN
    RETURN LOWER(color_field::text);
  END IF;
  
  -- Si es objeto (JSONB de tipo object) - formato bilingüe {en, es}
  IF jsonb_typeof(color_field) = 'object' THEN
    -- Intentar obtener valor en inglés primero, luego español
    RETURN LOWER(COALESCE(
      color_field->>'en',
      color_field->>'es',
      ''
    ));
  END IF;
  
  -- Si es array (JSONB de tipo array), tomar el primer elemento
  IF jsonb_typeof(color_field) = 'array' THEN
    IF jsonb_array_length(color_field) > 0 THEN
      RETURN LOWER(color_field->>0);
    END IF;
  END IF;
  
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_wine_limit_for_owner(p_owner uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  plan text;
begin
  plan := public.get_plan_id_effective(p_owner);

  if plan = 'free' then return 25;
  elsif plan = 'pro' then return 200;
  elsif plan = 'business' then return -1; -- ilimitado
  else return 25;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_qr_token TEXT;
  v_branch_id UUID;
  v_invitation_type TEXT;
  v_owner_id UUID;
BEGIN
  -- Extraer datos del QR del metadata del usuario
  v_qr_token := NEW.raw_user_meta_data->>'qrToken';
  v_invitation_type := NEW.raw_user_meta_data->>'invitationType';
  
  -- Si hay invitación por QR, obtener el owner_id y branch_id del QR token
  IF v_qr_token IS NOT NULL THEN
    SELECT owner_id, branch_id INTO v_owner_id, v_branch_id
    FROM public.qr_tokens
    WHERE token = v_qr_token
    LIMIT 1;
  ELSE
    -- Si no hay QR token, es registro libre de owner - obtener branch_id del metadata
    v_branch_id := (NEW.raw_user_meta_data->>'branchId')::UUID;
  END IF;
  
  -- Insertar usuario en public.users
  INSERT INTO public.users (
    id,
    email,
    name,
    role,
    status,
    branch_id,
    owner_id,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    CASE 
      WHEN v_invitation_type = 'admin_invite' THEN 'staff'
      ELSE 'owner'
    END,
    CASE 
      WHEN v_invitation_type = 'admin_invite' THEN 'pending'
      ELSE 'active'
    END,
    v_branch_id,
    v_owner_id,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  
  -- Si es staff invitado, confirmar el email automáticamente
  IF v_invitation_type = 'admin_invite' THEN
    UPDATE auth.users
    SET email_confirmed_at = NOW()
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_subscription_active(sub_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
  sub_status TEXT;
  period_end TIMESTAMP WITH TIME ZONE;
BEGIN
  SELECT status, current_period_end
  INTO sub_status, period_end
  FROM subscriptions
  WHERE id = sub_id;
  
  IF sub_status IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Verificar que esté activa y no haya expirado
  IF sub_status = 'active' AND period_end > NOW() THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_subscription_effectively_active(p_owner uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  u record;
begin
  select subscription_active, subscription_expires_at
  into u
  from public.users
  where id = p_owner;

  if u is null then
    return false;
  end if;

  if coalesce(u.subscription_active, false) = false then
    return false;
  end if;

  if u.subscription_expires_at is not null and u.subscription_expires_at <= now() then
    return false;
  end if;

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_country_jsonb(country_jsonb jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  normalized_obj JSONB := '{}';
  country_en TEXT;
  country_es TEXT;
  normalized_en TEXT;
  normalized_es TEXT;
BEGIN
  -- Si es NULL, retornar NULL
  IF country_jsonb IS NULL THEN
    RETURN NULL;
  END IF;

  -- Extraer valores en inglés y español
  country_en := country_jsonb->>'en';
  country_es := country_jsonb->>'es';

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

  RETURN normalized_obj;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_country_name(country_text text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  normalized TEXT;
  country_lower TEXT;
BEGIN
  -- Si es NULL o vacío, retornar NULL
  IF country_text IS NULL OR TRIM(country_text) = '' THEN
    RETURN NULL;
  END IF;

  -- Convertir a minúsculas para comparación
  country_lower := LOWER(TRIM(country_text));

  -- Mapeo de países comunes con sus variaciones
  CASE country_lower
    WHEN 'italia' THEN RETURN 'Italia';
    WHEN 'italy' THEN RETURN 'Italia';
    WHEN 'españa' THEN RETURN 'España';
    WHEN 'spain' THEN RETURN 'España';
    WHEN 'francia' THEN RETURN 'Francia';
    WHEN 'france' THEN RETURN 'Francia';
    WHEN 'alemania' THEN RETURN 'Alemania';
    WHEN 'germany' THEN RETURN 'Alemania';
    WHEN 'portugal' THEN RETURN 'Portugal';
    WHEN 'argentina' THEN RETURN 'Argentina';
    WHEN 'chile' THEN RETURN 'Chile';
    WHEN 'australia' THEN RETURN 'Australia';
    WHEN 'nueva zelanda' THEN RETURN 'Nueva Zelanda';
    WHEN 'new zealand' THEN RETURN 'Nueva Zelanda';
    WHEN 'sudafrica' THEN RETURN 'Sudáfrica';
    WHEN 'sudáfrica' THEN RETURN 'Sudáfrica';
    WHEN 'south africa' THEN RETURN 'Sudáfrica';
    WHEN 'estados unidos' THEN RETURN 'Estados Unidos';
    WHEN 'united states' THEN RETURN 'Estados Unidos';
    WHEN 'usa' THEN RETURN 'Estados Unidos';
    WHEN 'méxico' THEN RETURN 'México';
    WHEN 'mexico' THEN RETURN 'México';
    WHEN 'brasil' THEN RETURN 'Brasil';
    WHEN 'brazil' THEN RETURN 'Brasil';
    WHEN 'perú' THEN RETURN 'Perú';
    WHEN 'peru' THEN RETURN 'Perú';
    WHEN 'uruguay' THEN RETURN 'Uruguay';
    WHEN 'colombia' THEN RETURN 'Colombia';
    WHEN 'canadá' THEN RETURN 'Canadá';
    WHEN 'canada' THEN RETURN 'Canadá';
    WHEN 'reino unido' THEN RETURN 'Reino Unido';
    WHEN 'united kingdom' THEN RETURN 'Reino Unido';
    WHEN 'uk' THEN RETURN 'Reino Unido';
    WHEN 'grecia' THEN RETURN 'Grecia';
    WHEN 'greece' THEN RETURN 'Grecia';
    WHEN 'hungría' THEN RETURN 'Hungría';
    WHEN 'hungary' THEN RETURN 'Hungría';
    WHEN 'rumanía' THEN RETURN 'Rumanía';
    WHEN 'romania' THEN RETURN 'Rumanía';
    WHEN 'bulgaria' THEN RETURN 'Bulgaria';
    WHEN 'croacia' THEN RETURN 'Croacia';
    WHEN 'croatia' THEN RETURN 'Croacia';
    WHEN 'eslovenia' THEN RETURN 'Eslovenia';
    WHEN 'slovenia' THEN RETURN 'Eslovenia';
    WHEN 'republica checa' THEN RETURN 'República Checa';
    WHEN 'czech republic' THEN RETURN 'República Checa';
    WHEN 'austria' THEN RETURN 'Austria';
    WHEN 'suiza' THEN RETURN 'Suiza';
    WHEN 'switzerland' THEN RETURN 'Suiza';
    WHEN 'suecia' THEN RETURN 'Suecia';
    WHEN 'sweden' THEN RETURN 'Suecia';
    WHEN 'noruega' THEN RETURN 'Noruega';
    WHEN 'norway' THEN RETURN 'Noruega';
    WHEN 'dinamarca' THEN RETURN 'Dinamarca';
    WHEN 'denmark' THEN RETURN 'Dinamarca';
    WHEN 'finlandia' THEN RETURN 'Finlandia';
    WHEN 'finland' THEN RETURN 'Finlandia';
    WHEN 'polonia' THEN RETURN 'Polonia';
    WHEN 'poland' THEN RETURN 'Polonia';
    WHEN 'turquía' THEN RETURN 'Turquía';
    WHEN 'turkey' THEN RETURN 'Turquía';
    WHEN 'israel' THEN RETURN 'Israel';
    WHEN 'libano' THEN RETURN 'Líbano';
    WHEN 'lebanon' THEN RETURN 'Líbano';
    WHEN 'japon' THEN RETURN 'Japón';
    WHEN 'japan' THEN RETURN 'Japón';
    WHEN 'china' THEN RETURN 'China';
    WHEN 'india' THEN RETURN 'India';
    WHEN 'tailandia' THEN RETURN 'Tailandia';
    WHEN 'thailand' THEN RETURN 'Tailandia';
    WHEN 'corea del sur' THEN RETURN 'Corea del Sur';
    WHEN 'south korea' THEN RETURN 'Corea del Sur';
    ELSE
      -- Si no está en el mapeo, capitalizar la primera letra de cada palabra
      normalized := INITCAP(country_lower);
      
      -- Aplicar correcciones comunes de acentos
      normalized := REPLACE(normalized, 'Mexico', 'México');
      normalized := REPLACE(normalized, 'Peru', 'Perú');
      normalized := REPLACE(normalized, 'Republica', 'República');
      normalized := REPLACE(normalized, 'Libano', 'Líbano');
      normalized := REPLACE(normalized, 'Japon', 'Japón');
      normalized := REPLACE(normalized, 'Turquia', 'Turquía');
      normalized := REPLACE(normalized, 'Hungria', 'Hungría');
      normalized := REPLACE(normalized, 'Rumania', 'Rumanía');
      normalized := REPLACE(normalized, 'Sudafrica', 'Sudáfrica');
      normalized := REPLACE(normalized, 'Canada', 'Canadá');
      
      RETURN normalized;
  END CASE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reconcile_branch_locks(p_owner_id uuid)
 RETURNS TABLE(locked_count integer, unlocked_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_plan_id TEXT;
  v_addon_qty INTEGER;
  v_allowed_count INTEGER;
  v_unlocked_count INTEGER;
  v_locked_total INTEGER;
  v_locked_now INTEGER := 0;
  v_unlocked_now INTEGER := 0;
  v_to_lock_count INTEGER;
  v_to_unlock_count INTEGER;
  v_unlocked_after_lock INTEGER;
BEGIN
  -- 1) Obtener plan y addon de forma determinista
  SELECT 
    plan_id,
    COALESCE(
      (metadata->>'addonBranchesQty')::INTEGER,
      (SELECT subscription_branch_addons_count FROM users WHERE id = p_owner_id),
      0
    )
  INTO v_plan_id, v_addon_qty
  FROM subscriptions
  WHERE owner_id = p_owner_id
    AND status = 'active'
    AND current_period_end > NOW()
  ORDER BY created_at DESC
  LIMIT 1;

  -- Si no hay suscripción activa, usar plan 'free' y addon=0 (NO permitir addons sin subscription)
  IF v_plan_id IS NULL THEN
    v_plan_id := 'free';
    v_addon_qty := 0;
  END IF;

  -- 2) Calcular allowed_count
  IF v_plan_id = 'business' THEN
    v_allowed_count := 3 + v_addon_qty; -- 1 main + 2 incluidas + addons
  ELSE
    v_allowed_count := 1; -- free y pro solo permiten 1 (main)
  END IF;

  -- 3) Calcular counts usando siempre owner_id = p_owner_id
  SELECT COUNT(*)
  INTO v_unlocked_count
  FROM branches
  WHERE owner_id = p_owner_id
    AND is_locked = false;

  SELECT COUNT(*)
  INTO v_locked_total
  FROM branches
  WHERE owner_id = p_owner_id
    AND is_locked = true
    AND is_main = false;

  -- 4) Locking: to_lock = greatest(0, unlocked - allowed_count)
  v_to_lock_count := GREATEST(0, v_unlocked_count - v_allowed_count);

  IF v_to_lock_count > 0 THEN
    -- Lock newest (created_at desc) excluding is_main=true
    UPDATE branches
    SET 
      is_locked = true,
      lock_reason = 'subscription_limit',
      locked_at = NOW()
    WHERE id IN (
      SELECT id
      FROM branches
      WHERE owner_id = p_owner_id
        AND is_locked = false
        AND is_main = false
      ORDER BY created_at DESC
      LIMIT v_to_lock_count
    );

    GET DIAGNOSTICS v_locked_now = ROW_COUNT;
  ELSE
    v_locked_now := 0;
  END IF;

  -- 5) Recalcular unlocked y locked_total DESPUÉS de locking
  SELECT COUNT(*)
  INTO v_unlocked_after_lock
  FROM branches
  WHERE owner_id = p_owner_id
    AND is_locked = false;

  SELECT COUNT(*)
  INTO v_locked_total
  FROM branches
  WHERE owner_id = p_owner_id
    AND is_locked = true
    AND is_main = false;

  -- 6) Unlocking: to_unlock = least(locked_total, greatest(0, allowed_count - unlocked_after_lock))
  v_to_unlock_count := LEAST(
    v_locked_total,
    GREATEST(0, v_allowed_count - v_unlocked_after_lock)
  );

  IF v_to_unlock_count > 0 THEN
    -- Unlock oldest (created_at asc) excluding is_main=true
    UPDATE branches
    SET 
      is_locked = false,
      lock_reason = NULL,
      locked_at = NULL
    WHERE id IN (
      SELECT id
      FROM branches
      WHERE owner_id = p_owner_id
        AND is_locked = true
        AND is_main = false
      ORDER BY created_at ASC
      LIMIT v_to_unlock_count
    );

    GET DIAGNOSTICS v_unlocked_now = ROW_COUNT;
  ELSE
    v_unlocked_now := 0;
  END IF;

  -- 7) Retornar estadísticas con ROW_COUNT reales (v_locked_now, v_unlocked_now)
  RETURN QUERY SELECT v_locked_now, v_unlocked_now;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at = now(); return new; end;
$function$
;

CREATE OR REPLACE FUNCTION public.to_jsonb_safe(field_value anyelement)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  -- Si es NULL, retornar NULL
  IF field_value IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Intentar retornar como JSONB directamente
  BEGIN
    RETURN field_value::jsonb;
  EXCEPTION WHEN OTHERS THEN
    -- Si falla, convertir TEXT a JSONB (string JSONB)
    RETURN to_jsonb(field_value::text);
  END;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_normalize_country()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Normalizar el país si está presente y es JSONB
  IF NEW.country IS NOT NULL AND jsonb_typeof(NEW.country) = 'object' THEN
    -- Es JSONB (objeto bilingüe)
    NEW.country := normalize_country_jsonb(NEW.country);
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_cocktail_menu_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_subscriptions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_wine_canonical(p_winery text, p_label text, p_vintage text, p_payload jsonb, p_embedding vector)
 RETURNS TABLE(o_id uuid, o_winery text, o_label text, o_vintage text, o_abv numeric, o_volume_ml integer, o_closure text, o_color text, o_style text, o_country text, o_region text, o_appellation text, o_grapes text[], o_blend jsonb, o_tasting_notes jsonb, o_vinification jsonb, o_serving jsonb, o_tech_data jsonb, o_vector_embedding vector, o_action text)
 LANGUAGE plpgsql
AS $function$
begin
  return query
  insert into public.wines_canonical as wc (
    winery, label, vintage,
    abv, volume_ml, closure, color, style,
    country, region, appellation,
    grapes, blend, tasting_notes, vinification, serving, tech_data,
    vector_embedding
  )
  values (
    p_winery, p_label, p_vintage,
    (p_payload->>'abv')::numeric,
    (p_payload->>'volume_ml')::int,
    p_payload->>'closure',
    p_payload->>'color',
    p_payload->>'style',
    p_payload->>'country',
    p_payload->>'region',
    p_payload->>'appellation',
    (select array(select jsonb_array_elements_text(p_payload->'grapes'))),
    p_payload->'blend',
    p_payload->'tasting_notes',
    p_payload->'vinification',
    p_payload->'serving',
    p_payload->'tech_data',
    p_embedding
  )
  on conflict (
    lower(regexp_replace(wc.winery,'\s+',' ','g')),
    lower(regexp_replace(wc.label ,'\s+',' ','g')),
    coalesce(wc.vintage,'')
  )
  do update set
    abv = excluded.abv,
    volume_ml = excluded.volume_ml,
    closure = excluded.closure,
    color = excluded.color,
    style = excluded.style,
    country = excluded.country,
    region = excluded.region,
    appellation = excluded.appellation,
    grapes = excluded.grapes,
    blend = excluded.blend,
    tasting_notes = excluded.tasting_notes,
    vinification = excluded.vinification,
    serving = excluded.serving,
    tech_data = excluded.tech_data,
    vector_embedding = excluded.vector_embedding
  returning
    wc.id,
    wc.winery,
    wc.label,
    wc.vintage,
    wc.abv,
    wc.volume_ml,
    wc.closure,
    wc.color,
    wc.style,
    wc.country,
    wc.region,
    wc.appellation,
    wc.grapes,
    wc.blend,
    wc.tasting_notes,
    wc.vinification,
    wc.serving,
    wc.tech_data,
    wc.vector_embedding,
    case when wc.xmax = 0 then 'inserted' else 'updated' end as o_action;
end;
$function$
;

grant delete on table "public"."branches" to "anon";

grant insert on table "public"."branches" to "anon";

grant references on table "public"."branches" to "anon";

grant select on table "public"."branches" to "anon";

grant trigger on table "public"."branches" to "anon";

grant truncate on table "public"."branches" to "anon";

grant update on table "public"."branches" to "anon";

grant delete on table "public"."branches" to "authenticated";

grant insert on table "public"."branches" to "authenticated";

grant references on table "public"."branches" to "authenticated";

grant select on table "public"."branches" to "authenticated";

grant trigger on table "public"."branches" to "authenticated";

grant truncate on table "public"."branches" to "authenticated";

grant update on table "public"."branches" to "authenticated";

grant delete on table "public"."branches" to "service_role";

grant insert on table "public"."branches" to "service_role";

grant references on table "public"."branches" to "service_role";

grant select on table "public"."branches" to "service_role";

grant trigger on table "public"."branches" to "service_role";

grant truncate on table "public"."branches" to "service_role";

grant update on table "public"."branches" to "service_role";

grant delete on table "public"."cocktail_menu" to "anon";

grant insert on table "public"."cocktail_menu" to "anon";

grant references on table "public"."cocktail_menu" to "anon";

grant select on table "public"."cocktail_menu" to "anon";

grant trigger on table "public"."cocktail_menu" to "anon";

grant truncate on table "public"."cocktail_menu" to "anon";

grant update on table "public"."cocktail_menu" to "anon";

grant delete on table "public"."cocktail_menu" to "authenticated";

grant insert on table "public"."cocktail_menu" to "authenticated";

grant references on table "public"."cocktail_menu" to "authenticated";

grant select on table "public"."cocktail_menu" to "authenticated";

grant trigger on table "public"."cocktail_menu" to "authenticated";

grant truncate on table "public"."cocktail_menu" to "authenticated";

grant update on table "public"."cocktail_menu" to "authenticated";

grant delete on table "public"."cocktail_menu" to "service_role";

grant insert on table "public"."cocktail_menu" to "service_role";

grant references on table "public"."cocktail_menu" to "service_role";

grant select on table "public"."cocktail_menu" to "service_role";

grant trigger on table "public"."cocktail_menu" to "service_role";

grant truncate on table "public"."cocktail_menu" to "service_role";

grant update on table "public"."cocktail_menu" to "service_role";

grant delete on table "public"."guest_sessions" to "anon";

grant insert on table "public"."guest_sessions" to "anon";

grant references on table "public"."guest_sessions" to "anon";

grant select on table "public"."guest_sessions" to "anon";

grant trigger on table "public"."guest_sessions" to "anon";

grant truncate on table "public"."guest_sessions" to "anon";

grant update on table "public"."guest_sessions" to "anon";

grant delete on table "public"."guest_sessions" to "authenticated";

grant insert on table "public"."guest_sessions" to "authenticated";

grant references on table "public"."guest_sessions" to "authenticated";

grant select on table "public"."guest_sessions" to "authenticated";

grant trigger on table "public"."guest_sessions" to "authenticated";

grant truncate on table "public"."guest_sessions" to "authenticated";

grant update on table "public"."guest_sessions" to "authenticated";

grant delete on table "public"."guest_sessions" to "service_role";

grant insert on table "public"."guest_sessions" to "service_role";

grant references on table "public"."guest_sessions" to "service_role";

grant select on table "public"."guest_sessions" to "service_role";

grant trigger on table "public"."guest_sessions" to "service_role";

grant truncate on table "public"."guest_sessions" to "service_role";

grant update on table "public"."guest_sessions" to "service_role";

grant delete on table "public"."ingest_logs" to "anon";

grant insert on table "public"."ingest_logs" to "anon";

grant references on table "public"."ingest_logs" to "anon";

grant select on table "public"."ingest_logs" to "anon";

grant trigger on table "public"."ingest_logs" to "anon";

grant truncate on table "public"."ingest_logs" to "anon";

grant update on table "public"."ingest_logs" to "anon";

grant delete on table "public"."ingest_logs" to "authenticated";

grant insert on table "public"."ingest_logs" to "authenticated";

grant references on table "public"."ingest_logs" to "authenticated";

grant select on table "public"."ingest_logs" to "authenticated";

grant trigger on table "public"."ingest_logs" to "authenticated";

grant truncate on table "public"."ingest_logs" to "authenticated";

grant update on table "public"."ingest_logs" to "authenticated";

grant delete on table "public"."ingest_logs" to "service_role";

grant insert on table "public"."ingest_logs" to "service_role";

grant references on table "public"."ingest_logs" to "service_role";

grant select on table "public"."ingest_logs" to "service_role";

grant trigger on table "public"."ingest_logs" to "service_role";

grant truncate on table "public"."ingest_logs" to "service_role";

grant update on table "public"."ingest_logs" to "service_role";

grant delete on table "public"."inventory_movements" to "anon";

grant insert on table "public"."inventory_movements" to "anon";

grant references on table "public"."inventory_movements" to "anon";

grant select on table "public"."inventory_movements" to "anon";

grant trigger on table "public"."inventory_movements" to "anon";

grant truncate on table "public"."inventory_movements" to "anon";

grant update on table "public"."inventory_movements" to "anon";

grant delete on table "public"."inventory_movements" to "authenticated";

grant insert on table "public"."inventory_movements" to "authenticated";

grant references on table "public"."inventory_movements" to "authenticated";

grant select on table "public"."inventory_movements" to "authenticated";

grant trigger on table "public"."inventory_movements" to "authenticated";

grant truncate on table "public"."inventory_movements" to "authenticated";

grant update on table "public"."inventory_movements" to "authenticated";

grant delete on table "public"."inventory_movements" to "service_role";

grant insert on table "public"."inventory_movements" to "service_role";

grant references on table "public"."inventory_movements" to "service_role";

grant select on table "public"."inventory_movements" to "service_role";

grant trigger on table "public"."inventory_movements" to "service_role";

grant truncate on table "public"."inventory_movements" to "service_role";

grant update on table "public"."inventory_movements" to "service_role";

grant delete on table "public"."invoices" to "anon";

grant insert on table "public"."invoices" to "anon";

grant references on table "public"."invoices" to "anon";

grant select on table "public"."invoices" to "anon";

grant trigger on table "public"."invoices" to "anon";

grant truncate on table "public"."invoices" to "anon";

grant update on table "public"."invoices" to "anon";

grant delete on table "public"."invoices" to "authenticated";

grant insert on table "public"."invoices" to "authenticated";

grant references on table "public"."invoices" to "authenticated";

grant select on table "public"."invoices" to "authenticated";

grant trigger on table "public"."invoices" to "authenticated";

grant truncate on table "public"."invoices" to "authenticated";

grant update on table "public"."invoices" to "authenticated";

grant delete on table "public"."invoices" to "service_role";

grant insert on table "public"."invoices" to "service_role";

grant references on table "public"."invoices" to "service_role";

grant select on table "public"."invoices" to "service_role";

grant trigger on table "public"."invoices" to "service_role";

grant truncate on table "public"."invoices" to "service_role";

grant update on table "public"."invoices" to "service_role";

grant delete on table "public"."payments" to "anon";

grant insert on table "public"."payments" to "anon";

grant references on table "public"."payments" to "anon";

grant select on table "public"."payments" to "anon";

grant trigger on table "public"."payments" to "anon";

grant truncate on table "public"."payments" to "anon";

grant update on table "public"."payments" to "anon";

grant delete on table "public"."payments" to "authenticated";

grant insert on table "public"."payments" to "authenticated";

grant references on table "public"."payments" to "authenticated";

grant select on table "public"."payments" to "authenticated";

grant trigger on table "public"."payments" to "authenticated";

grant truncate on table "public"."payments" to "authenticated";

grant update on table "public"."payments" to "authenticated";

grant delete on table "public"."payments" to "service_role";

grant insert on table "public"."payments" to "service_role";

grant references on table "public"."payments" to "service_role";

grant select on table "public"."payments" to "service_role";

grant trigger on table "public"."payments" to "service_role";

grant truncate on table "public"."payments" to "service_role";

grant update on table "public"."payments" to "service_role";

grant delete on table "public"."qr_tokens" to "anon";

grant insert on table "public"."qr_tokens" to "anon";

grant references on table "public"."qr_tokens" to "anon";

grant select on table "public"."qr_tokens" to "anon";

grant trigger on table "public"."qr_tokens" to "anon";

grant truncate on table "public"."qr_tokens" to "anon";

grant update on table "public"."qr_tokens" to "anon";

grant delete on table "public"."qr_tokens" to "authenticated";

grant insert on table "public"."qr_tokens" to "authenticated";

grant references on table "public"."qr_tokens" to "authenticated";

grant select on table "public"."qr_tokens" to "authenticated";

grant trigger on table "public"."qr_tokens" to "authenticated";

grant truncate on table "public"."qr_tokens" to "authenticated";

grant update on table "public"."qr_tokens" to "authenticated";

grant delete on table "public"."qr_tokens" to "service_role";

grant insert on table "public"."qr_tokens" to "service_role";

grant references on table "public"."qr_tokens" to "service_role";

grant select on table "public"."qr_tokens" to "service_role";

grant trigger on table "public"."qr_tokens" to "service_role";

grant truncate on table "public"."qr_tokens" to "service_role";

grant update on table "public"."qr_tokens" to "service_role";

grant delete on table "public"."qr_tokens_backup" to "anon";

grant insert on table "public"."qr_tokens_backup" to "anon";

grant references on table "public"."qr_tokens_backup" to "anon";

grant select on table "public"."qr_tokens_backup" to "anon";

grant trigger on table "public"."qr_tokens_backup" to "anon";

grant truncate on table "public"."qr_tokens_backup" to "anon";

grant update on table "public"."qr_tokens_backup" to "anon";

grant delete on table "public"."qr_tokens_backup" to "authenticated";

grant insert on table "public"."qr_tokens_backup" to "authenticated";

grant references on table "public"."qr_tokens_backup" to "authenticated";

grant select on table "public"."qr_tokens_backup" to "authenticated";

grant trigger on table "public"."qr_tokens_backup" to "authenticated";

grant truncate on table "public"."qr_tokens_backup" to "authenticated";

grant update on table "public"."qr_tokens_backup" to "authenticated";

grant delete on table "public"."qr_tokens_backup" to "service_role";

grant insert on table "public"."qr_tokens_backup" to "service_role";

grant references on table "public"."qr_tokens_backup" to "service_role";

grant select on table "public"."qr_tokens_backup" to "service_role";

grant trigger on table "public"."qr_tokens_backup" to "service_role";

grant truncate on table "public"."qr_tokens_backup" to "service_role";

grant update on table "public"."qr_tokens_backup" to "service_role";

grant delete on table "public"."rate_limits" to "anon";

grant insert on table "public"."rate_limits" to "anon";

grant references on table "public"."rate_limits" to "anon";

grant select on table "public"."rate_limits" to "anon";

grant trigger on table "public"."rate_limits" to "anon";

grant truncate on table "public"."rate_limits" to "anon";

grant update on table "public"."rate_limits" to "anon";

grant delete on table "public"."rate_limits" to "authenticated";

grant insert on table "public"."rate_limits" to "authenticated";

grant references on table "public"."rate_limits" to "authenticated";

grant select on table "public"."rate_limits" to "authenticated";

grant trigger on table "public"."rate_limits" to "authenticated";

grant truncate on table "public"."rate_limits" to "authenticated";

grant update on table "public"."rate_limits" to "authenticated";

grant delete on table "public"."rate_limits" to "service_role";

grant insert on table "public"."rate_limits" to "service_role";

grant references on table "public"."rate_limits" to "service_role";

grant select on table "public"."rate_limits" to "service_role";

grant trigger on table "public"."rate_limits" to "service_role";

grant truncate on table "public"."rate_limits" to "service_role";

grant update on table "public"."rate_limits" to "service_role";

grant delete on table "public"."sale_items" to "anon";

grant insert on table "public"."sale_items" to "anon";

grant references on table "public"."sale_items" to "anon";

grant select on table "public"."sale_items" to "anon";

grant trigger on table "public"."sale_items" to "anon";

grant truncate on table "public"."sale_items" to "anon";

grant update on table "public"."sale_items" to "anon";

grant delete on table "public"."sale_items" to "authenticated";

grant insert on table "public"."sale_items" to "authenticated";

grant references on table "public"."sale_items" to "authenticated";

grant select on table "public"."sale_items" to "authenticated";

grant trigger on table "public"."sale_items" to "authenticated";

grant truncate on table "public"."sale_items" to "authenticated";

grant update on table "public"."sale_items" to "authenticated";

grant delete on table "public"."sale_items" to "service_role";

grant insert on table "public"."sale_items" to "service_role";

grant references on table "public"."sale_items" to "service_role";

grant select on table "public"."sale_items" to "service_role";

grant trigger on table "public"."sale_items" to "service_role";

grant truncate on table "public"."sale_items" to "service_role";

grant update on table "public"."sale_items" to "service_role";

grant delete on table "public"."sales" to "anon";

grant insert on table "public"."sales" to "anon";

grant references on table "public"."sales" to "anon";

grant select on table "public"."sales" to "anon";

grant trigger on table "public"."sales" to "anon";

grant truncate on table "public"."sales" to "anon";

grant update on table "public"."sales" to "anon";

grant delete on table "public"."sales" to "authenticated";

grant insert on table "public"."sales" to "authenticated";

grant references on table "public"."sales" to "authenticated";

grant select on table "public"."sales" to "authenticated";

grant trigger on table "public"."sales" to "authenticated";

grant truncate on table "public"."sales" to "authenticated";

grant update on table "public"."sales" to "authenticated";

grant delete on table "public"."sales" to "service_role";

grant insert on table "public"."sales" to "service_role";

grant references on table "public"."sales" to "service_role";

grant select on table "public"."sales" to "service_role";

grant trigger on table "public"."sales" to "service_role";

grant truncate on table "public"."sales" to "service_role";

grant update on table "public"."sales" to "service_role";

grant delete on table "public"."subscriptions" to "anon";

grant insert on table "public"."subscriptions" to "anon";

grant references on table "public"."subscriptions" to "anon";

grant select on table "public"."subscriptions" to "anon";

grant trigger on table "public"."subscriptions" to "anon";

grant truncate on table "public"."subscriptions" to "anon";

grant update on table "public"."subscriptions" to "anon";

grant delete on table "public"."subscriptions" to "authenticated";

grant insert on table "public"."subscriptions" to "authenticated";

grant references on table "public"."subscriptions" to "authenticated";

grant select on table "public"."subscriptions" to "authenticated";

grant trigger on table "public"."subscriptions" to "authenticated";

grant truncate on table "public"."subscriptions" to "authenticated";

grant update on table "public"."subscriptions" to "authenticated";

grant delete on table "public"."subscriptions" to "service_role";

grant insert on table "public"."subscriptions" to "service_role";

grant references on table "public"."subscriptions" to "service_role";

grant select on table "public"."subscriptions" to "service_role";

grant trigger on table "public"."subscriptions" to "service_role";

grant truncate on table "public"."subscriptions" to "service_role";

grant update on table "public"."subscriptions" to "service_role";

grant delete on table "public"."tasting_exam_pdfs" to "anon";

grant insert on table "public"."tasting_exam_pdfs" to "anon";

grant references on table "public"."tasting_exam_pdfs" to "anon";

grant select on table "public"."tasting_exam_pdfs" to "anon";

grant trigger on table "public"."tasting_exam_pdfs" to "anon";

grant truncate on table "public"."tasting_exam_pdfs" to "anon";

grant update on table "public"."tasting_exam_pdfs" to "anon";

grant delete on table "public"."tasting_exam_pdfs" to "authenticated";

grant insert on table "public"."tasting_exam_pdfs" to "authenticated";

grant references on table "public"."tasting_exam_pdfs" to "authenticated";

grant select on table "public"."tasting_exam_pdfs" to "authenticated";

grant trigger on table "public"."tasting_exam_pdfs" to "authenticated";

grant truncate on table "public"."tasting_exam_pdfs" to "authenticated";

grant update on table "public"."tasting_exam_pdfs" to "authenticated";

grant delete on table "public"."tasting_exam_pdfs" to "service_role";

grant insert on table "public"."tasting_exam_pdfs" to "service_role";

grant references on table "public"."tasting_exam_pdfs" to "service_role";

grant select on table "public"."tasting_exam_pdfs" to "service_role";

grant trigger on table "public"."tasting_exam_pdfs" to "service_role";

grant truncate on table "public"."tasting_exam_pdfs" to "service_role";

grant update on table "public"."tasting_exam_pdfs" to "service_role";

grant delete on table "public"."tasting_exam_wines" to "anon";

grant insert on table "public"."tasting_exam_wines" to "anon";

grant references on table "public"."tasting_exam_wines" to "anon";

grant select on table "public"."tasting_exam_wines" to "anon";

grant trigger on table "public"."tasting_exam_wines" to "anon";

grant truncate on table "public"."tasting_exam_wines" to "anon";

grant update on table "public"."tasting_exam_wines" to "anon";

grant delete on table "public"."tasting_exam_wines" to "authenticated";

grant insert on table "public"."tasting_exam_wines" to "authenticated";

grant references on table "public"."tasting_exam_wines" to "authenticated";

grant select on table "public"."tasting_exam_wines" to "authenticated";

grant trigger on table "public"."tasting_exam_wines" to "authenticated";

grant truncate on table "public"."tasting_exam_wines" to "authenticated";

grant update on table "public"."tasting_exam_wines" to "authenticated";

grant delete on table "public"."tasting_exam_wines" to "service_role";

grant insert on table "public"."tasting_exam_wines" to "service_role";

grant references on table "public"."tasting_exam_wines" to "service_role";

grant select on table "public"."tasting_exam_wines" to "service_role";

grant trigger on table "public"."tasting_exam_wines" to "service_role";

grant truncate on table "public"."tasting_exam_wines" to "service_role";

grant update on table "public"."tasting_exam_wines" to "service_role";

grant delete on table "public"."tasting_exams" to "anon";

grant insert on table "public"."tasting_exams" to "anon";

grant references on table "public"."tasting_exams" to "anon";

grant select on table "public"."tasting_exams" to "anon";

grant trigger on table "public"."tasting_exams" to "anon";

grant truncate on table "public"."tasting_exams" to "anon";

grant update on table "public"."tasting_exams" to "anon";

grant delete on table "public"."tasting_exams" to "authenticated";

grant insert on table "public"."tasting_exams" to "authenticated";

grant references on table "public"."tasting_exams" to "authenticated";

grant select on table "public"."tasting_exams" to "authenticated";

grant trigger on table "public"."tasting_exams" to "authenticated";

grant truncate on table "public"."tasting_exams" to "authenticated";

grant update on table "public"."tasting_exams" to "authenticated";

grant delete on table "public"."tasting_exams" to "service_role";

grant insert on table "public"."tasting_exams" to "service_role";

grant references on table "public"."tasting_exams" to "service_role";

grant select on table "public"."tasting_exams" to "service_role";

grant trigger on table "public"."tasting_exams" to "service_role";

grant truncate on table "public"."tasting_exams" to "service_role";

grant update on table "public"."tasting_exams" to "service_role";

grant delete on table "public"."tasting_responses" to "anon";

grant insert on table "public"."tasting_responses" to "anon";

grant references on table "public"."tasting_responses" to "anon";

grant select on table "public"."tasting_responses" to "anon";

grant trigger on table "public"."tasting_responses" to "anon";

grant truncate on table "public"."tasting_responses" to "anon";

grant update on table "public"."tasting_responses" to "anon";

grant delete on table "public"."tasting_responses" to "authenticated";

grant insert on table "public"."tasting_responses" to "authenticated";

grant references on table "public"."tasting_responses" to "authenticated";

grant select on table "public"."tasting_responses" to "authenticated";

grant trigger on table "public"."tasting_responses" to "authenticated";

grant truncate on table "public"."tasting_responses" to "authenticated";

grant update on table "public"."tasting_responses" to "authenticated";

grant delete on table "public"."tasting_responses" to "service_role";

grant insert on table "public"."tasting_responses" to "service_role";

grant references on table "public"."tasting_responses" to "service_role";

grant select on table "public"."tasting_responses" to "service_role";

grant trigger on table "public"."tasting_responses" to "service_role";

grant truncate on table "public"."tasting_responses" to "service_role";

grant update on table "public"."tasting_responses" to "service_role";

grant delete on table "public"."tasting_wine_responses" to "anon";

grant insert on table "public"."tasting_wine_responses" to "anon";

grant references on table "public"."tasting_wine_responses" to "anon";

grant select on table "public"."tasting_wine_responses" to "anon";

grant trigger on table "public"."tasting_wine_responses" to "anon";

grant truncate on table "public"."tasting_wine_responses" to "anon";

grant update on table "public"."tasting_wine_responses" to "anon";

grant delete on table "public"."tasting_wine_responses" to "authenticated";

grant insert on table "public"."tasting_wine_responses" to "authenticated";

grant references on table "public"."tasting_wine_responses" to "authenticated";

grant select on table "public"."tasting_wine_responses" to "authenticated";

grant trigger on table "public"."tasting_wine_responses" to "authenticated";

grant truncate on table "public"."tasting_wine_responses" to "authenticated";

grant update on table "public"."tasting_wine_responses" to "authenticated";

grant delete on table "public"."tasting_wine_responses" to "service_role";

grant insert on table "public"."tasting_wine_responses" to "service_role";

grant references on table "public"."tasting_wine_responses" to "service_role";

grant select on table "public"."tasting_wine_responses" to "service_role";

grant trigger on table "public"."tasting_wine_responses" to "service_role";

grant truncate on table "public"."tasting_wine_responses" to "service_role";

grant update on table "public"."tasting_wine_responses" to "service_role";

grant delete on table "public"."users" to "anon";

grant insert on table "public"."users" to "anon";

grant references on table "public"."users" to "anon";

grant select on table "public"."users" to "anon";

grant trigger on table "public"."users" to "anon";

grant truncate on table "public"."users" to "anon";

grant update on table "public"."users" to "anon";

grant delete on table "public"."users" to "authenticated";

grant insert on table "public"."users" to "authenticated";

grant references on table "public"."users" to "authenticated";

grant select on table "public"."users" to "authenticated";

grant trigger on table "public"."users" to "authenticated";

grant truncate on table "public"."users" to "authenticated";

grant update on table "public"."users" to "authenticated";

grant delete on table "public"."users" to "service_role";

grant insert on table "public"."users" to "service_role";

grant references on table "public"."users" to "service_role";

grant select on table "public"."users" to "service_role";

grant trigger on table "public"."users" to "service_role";

grant truncate on table "public"."users" to "service_role";

grant update on table "public"."users" to "service_role";

grant delete on table "public"."wine_branch_stock" to "anon";

grant insert on table "public"."wine_branch_stock" to "anon";

grant references on table "public"."wine_branch_stock" to "anon";

grant select on table "public"."wine_branch_stock" to "anon";

grant trigger on table "public"."wine_branch_stock" to "anon";

grant truncate on table "public"."wine_branch_stock" to "anon";

grant update on table "public"."wine_branch_stock" to "anon";

grant delete on table "public"."wine_branch_stock" to "authenticated";

grant insert on table "public"."wine_branch_stock" to "authenticated";

grant references on table "public"."wine_branch_stock" to "authenticated";

grant select on table "public"."wine_branch_stock" to "authenticated";

grant trigger on table "public"."wine_branch_stock" to "authenticated";

grant truncate on table "public"."wine_branch_stock" to "authenticated";

grant update on table "public"."wine_branch_stock" to "authenticated";

grant delete on table "public"."wine_branch_stock" to "service_role";

grant insert on table "public"."wine_branch_stock" to "service_role";

grant references on table "public"."wine_branch_stock" to "service_role";

grant select on table "public"."wine_branch_stock" to "service_role";

grant trigger on table "public"."wine_branch_stock" to "service_role";

grant truncate on table "public"."wine_branch_stock" to "service_role";

grant update on table "public"."wine_branch_stock" to "service_role";

grant delete on table "public"."wine_images" to "anon";

grant insert on table "public"."wine_images" to "anon";

grant references on table "public"."wine_images" to "anon";

grant select on table "public"."wine_images" to "anon";

grant trigger on table "public"."wine_images" to "anon";

grant truncate on table "public"."wine_images" to "anon";

grant update on table "public"."wine_images" to "anon";

grant delete on table "public"."wine_images" to "authenticated";

grant insert on table "public"."wine_images" to "authenticated";

grant references on table "public"."wine_images" to "authenticated";

grant select on table "public"."wine_images" to "authenticated";

grant trigger on table "public"."wine_images" to "authenticated";

grant truncate on table "public"."wine_images" to "authenticated";

grant update on table "public"."wine_images" to "authenticated";

grant delete on table "public"."wine_images" to "service_role";

grant insert on table "public"."wine_images" to "service_role";

grant references on table "public"."wine_images" to "service_role";

grant select on table "public"."wine_images" to "service_role";

grant trigger on table "public"."wine_images" to "service_role";

grant truncate on table "public"."wine_images" to "service_role";

grant update on table "public"."wine_images" to "service_role";

grant delete on table "public"."wine_sources" to "anon";

grant insert on table "public"."wine_sources" to "anon";

grant references on table "public"."wine_sources" to "anon";

grant select on table "public"."wine_sources" to "anon";

grant trigger on table "public"."wine_sources" to "anon";

grant truncate on table "public"."wine_sources" to "anon";

grant update on table "public"."wine_sources" to "anon";

grant delete on table "public"."wine_sources" to "authenticated";

grant insert on table "public"."wine_sources" to "authenticated";

grant references on table "public"."wine_sources" to "authenticated";

grant select on table "public"."wine_sources" to "authenticated";

grant trigger on table "public"."wine_sources" to "authenticated";

grant truncate on table "public"."wine_sources" to "authenticated";

grant update on table "public"."wine_sources" to "authenticated";

grant delete on table "public"."wine_sources" to "service_role";

grant insert on table "public"."wine_sources" to "service_role";

grant references on table "public"."wine_sources" to "service_role";

grant select on table "public"."wine_sources" to "service_role";

grant trigger on table "public"."wine_sources" to "service_role";

grant truncate on table "public"."wine_sources" to "service_role";

grant update on table "public"."wine_sources" to "service_role";

grant delete on table "public"."wines" to "anon";

grant insert on table "public"."wines" to "anon";

grant references on table "public"."wines" to "anon";

grant select on table "public"."wines" to "anon";

grant trigger on table "public"."wines" to "anon";

grant truncate on table "public"."wines" to "anon";

grant update on table "public"."wines" to "anon";

grant delete on table "public"."wines" to "authenticated";

grant insert on table "public"."wines" to "authenticated";

grant references on table "public"."wines" to "authenticated";

grant select on table "public"."wines" to "authenticated";

grant trigger on table "public"."wines" to "authenticated";

grant truncate on table "public"."wines" to "authenticated";

grant update on table "public"."wines" to "authenticated";

grant delete on table "public"."wines" to "service_role";

grant insert on table "public"."wines" to "service_role";

grant references on table "public"."wines" to "service_role";

grant select on table "public"."wines" to "service_role";

grant trigger on table "public"."wines" to "service_role";

grant truncate on table "public"."wines" to "service_role";

grant update on table "public"."wines" to "service_role";

grant delete on table "public"."wines_canonical" to "anon";

grant insert on table "public"."wines_canonical" to "anon";

grant references on table "public"."wines_canonical" to "anon";

grant select on table "public"."wines_canonical" to "anon";

grant trigger on table "public"."wines_canonical" to "anon";

grant truncate on table "public"."wines_canonical" to "anon";

grant update on table "public"."wines_canonical" to "anon";

grant delete on table "public"."wines_canonical" to "authenticated";

grant insert on table "public"."wines_canonical" to "authenticated";

grant references on table "public"."wines_canonical" to "authenticated";

grant select on table "public"."wines_canonical" to "authenticated";

grant trigger on table "public"."wines_canonical" to "authenticated";

grant truncate on table "public"."wines_canonical" to "authenticated";

grant update on table "public"."wines_canonical" to "authenticated";

grant delete on table "public"."wines_canonical" to "service_role";

grant insert on table "public"."wines_canonical" to "service_role";

grant references on table "public"."wines_canonical" to "service_role";

grant select on table "public"."wines_canonical" to "service_role";

grant trigger on table "public"."wines_canonical" to "service_role";

grant truncate on table "public"."wines_canonical" to "service_role";

grant update on table "public"."wines_canonical" to "service_role";

create policy "Users can insert own branches"
on "public"."branches"
as permissive
for insert
to public
with check ((auth.uid() = owner_id));


create policy "Users can update own branches"
on "public"."branches"
as permissive
for update
to public
using ((auth.uid() = owner_id));


create policy "Users can view own branches"
on "public"."branches"
as permissive
for select
to public
using (((auth.uid() = owner_id) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.branch_id = branches.id))))));


create policy "cocktail_menu_delete_owner"
on "public"."cocktail_menu"
as permissive
for delete
to public
using (((auth.uid() = owner_id) OR (auth.uid() IN ( SELECT users.id
   FROM users
  WHERE ((users.owner_id = cocktail_menu.owner_id) AND (users.branch_id = cocktail_menu.branch_id))))));


create policy "cocktail_menu_insert_owner"
on "public"."cocktail_menu"
as permissive
for insert
to public
with check (((auth.uid() = owner_id) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.owner_id = u.owner_id) AND (u.branch_id = u.branch_id))))));


create policy "cocktail_menu_select_owner"
on "public"."cocktail_menu"
as permissive
for select
to public
using (((auth.uid() = owner_id) OR (auth.uid() IN ( SELECT users.id
   FROM users
  WHERE ((users.owner_id = cocktail_menu.owner_id) AND (users.branch_id = cocktail_menu.branch_id))))));


create policy "cocktail_menu_update_owner"
on "public"."cocktail_menu"
as permissive
for update
to public
using (((auth.uid() = owner_id) OR (auth.uid() IN ( SELECT users.id
   FROM users
  WHERE ((users.owner_id = cocktail_menu.owner_id) AND (users.branch_id = cocktail_menu.branch_id))))));


create policy "Users can insert movements for their owner"
on "public"."inventory_movements"
as permissive
for insert
to public
with check ((owner_id = ( SELECT COALESCE(users.owner_id, users.id) AS "coalesce"
   FROM users
  WHERE (users.id = auth.uid()))));


create policy "Users can view their owner's movements"
on "public"."inventory_movements"
as permissive
for select
to public
using ((owner_id = ( SELECT COALESCE(users.owner_id, users.id) AS "coalesce"
   FROM users
  WHERE (users.id = auth.uid()))));


create policy "owner_can_create_movements"
on "public"."inventory_movements"
as permissive
for insert
to public
with check (((auth.uid() IS NOT NULL) AND ((owner_id = auth.uid()) OR (owner_id IN ( SELECT users.owner_id
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.owner_id IS NOT NULL)))))));


create policy "owner_can_delete_their_movements"
on "public"."inventory_movements"
as permissive
for delete
to public
using ((owner_id = auth.uid()));


create policy "owner_can_update_their_movements"
on "public"."inventory_movements"
as permissive
for update
to public
using ((owner_id = auth.uid()))
with check ((owner_id = auth.uid()));


create policy "owner_can_view_their_movements"
on "public"."inventory_movements"
as permissive
for select
to public
using ((owner_id = auth.uid()));


create policy "staff_can_create_owner_movements"
on "public"."inventory_movements"
as permissive
for insert
to public
with check (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.owner_id IS NOT NULL)))) AND (owner_id = ( SELECT users.owner_id
   FROM users
  WHERE (users.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM wines
  WHERE ((wines.id = inventory_movements.wine_id) AND (wines.owner_id = ( SELECT users.owner_id
           FROM users
          WHERE (users.id = auth.uid())))))) AND (EXISTS ( SELECT 1
   FROM branches
  WHERE ((branches.id = inventory_movements.branch_id) AND (branches.owner_id = ( SELECT users.owner_id
           FROM users
          WHERE (users.id = auth.uid()))))))));


create policy "staff_can_view_owner_movements"
on "public"."inventory_movements"
as permissive
for select
to public
using ((owner_id IN ( SELECT users.owner_id
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.owner_id IS NOT NULL)))));


create policy "invoices_insert_owner"
on "public"."invoices"
as permissive
for insert
to public
with check ((auth.uid() = owner_id));


create policy "invoices_select_owner"
on "public"."invoices"
as permissive
for select
to public
using (((auth.uid() = owner_id) OR (auth.uid() = user_id) OR (auth.uid() IN ( SELECT users.id
   FROM users
  WHERE (users.owner_id = invoices.owner_id)))));


create policy "payments_insert_owner"
on "public"."payments"
as permissive
for insert
to public
with check ((auth.uid() = owner_id));


create policy "payments_select_owner"
on "public"."payments"
as permissive
for select
to public
using (((auth.uid() = owner_id) OR (auth.uid() = user_id) OR (auth.uid() IN ( SELECT users.id
   FROM users
  WHERE (users.owner_id = payments.owner_id)))));


create policy "Owners can create qr_tokens"
on "public"."qr_tokens"
as permissive
for insert
to public
with check ((auth.uid() = owner_id));


create policy "Owners can delete their qr_tokens"
on "public"."qr_tokens"
as permissive
for delete
to public
using ((auth.uid() = owner_id));


create policy "Owners can update their qr_tokens"
on "public"."qr_tokens"
as permissive
for update
to public
using ((auth.uid() = owner_id))
with check ((auth.uid() = owner_id));


create policy "Owners can view their qr_tokens"
on "public"."qr_tokens"
as permissive
for select
to public
using (((auth.uid() = owner_id) OR (expires_at > now())));


create policy "rate_limits_service_only"
on "public"."rate_limits"
as permissive
for all
to public
using (false);


create policy "owner_can_create_sale_items"
on "public"."sale_items"
as permissive
for insert
to public
with check (((sale_id IN ( SELECT sales.id
   FROM sales
  WHERE (sales.owner_id = auth.uid()))) AND (wine_id IN ( SELECT wines.id
   FROM wines
  WHERE (wines.owner_id = auth.uid())))));


create policy "owner_can_update_their_sale_items"
on "public"."sale_items"
as permissive
for update
to public
using ((sale_id IN ( SELECT sales.id
   FROM sales
  WHERE (sales.owner_id = auth.uid()))))
with check ((sale_id IN ( SELECT sales.id
   FROM sales
  WHERE (sales.owner_id = auth.uid()))));


create policy "owner_can_view_their_sale_items"
on "public"."sale_items"
as permissive
for select
to public
using ((sale_id IN ( SELECT sales.id
   FROM sales
  WHERE (sales.owner_id = auth.uid()))));


create policy "staff_can_create_owner_sale_items"
on "public"."sale_items"
as permissive
for insert
to public
with check (((sale_id IN ( SELECT sales.id
   FROM sales
  WHERE (sales.owner_id = ( SELECT users.owner_id
           FROM users
          WHERE (users.id = auth.uid()))))) AND (wine_id IN ( SELECT wines.id
   FROM wines
  WHERE (wines.owner_id = ( SELECT users.owner_id
           FROM users
          WHERE (users.id = auth.uid())))))));


create policy "staff_can_update_owner_sale_items"
on "public"."sale_items"
as permissive
for update
to public
using ((sale_id IN ( SELECT sales.id
   FROM sales
  WHERE (sales.owner_id = ( SELECT users.owner_id
           FROM users
          WHERE (users.id = auth.uid()))))))
with check ((sale_id IN ( SELECT sales.id
   FROM sales
  WHERE (sales.owner_id = ( SELECT users.owner_id
           FROM users
          WHERE (users.id = auth.uid()))))));


create policy "staff_can_view_owner_sale_items"
on "public"."sale_items"
as permissive
for select
to public
using ((sale_id IN ( SELECT sales.id
   FROM sales
  WHERE (sales.owner_id IN ( SELECT users.owner_id
           FROM users
          WHERE ((users.id = auth.uid()) AND (users.owner_id IS NOT NULL)))))));


create policy "owner_can_create_sales"
on "public"."sales"
as permissive
for insert
to public
with check (((owner_id = auth.uid()) AND (branch_id IN ( SELECT branches.id
   FROM branches
  WHERE (branches.owner_id = auth.uid())))));


create policy "owner_can_update_their_sales"
on "public"."sales"
as permissive
for update
to public
using ((owner_id = auth.uid()))
with check ((owner_id = auth.uid()));


create policy "owner_can_view_their_sales"
on "public"."sales"
as permissive
for select
to public
using ((owner_id = auth.uid()));


create policy "staff_can_create_owner_sales"
on "public"."sales"
as permissive
for insert
to public
with check (((owner_id IN ( SELECT users.owner_id
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.owner_id IS NOT NULL)))) AND (branch_id IN ( SELECT branches.id
   FROM branches
  WHERE (branches.owner_id = ( SELECT users.owner_id
           FROM users
          WHERE (users.id = auth.uid())))))));


create policy "staff_can_update_owner_sales"
on "public"."sales"
as permissive
for update
to public
using ((owner_id IN ( SELECT users.owner_id
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.owner_id IS NOT NULL)))))
with check ((owner_id IN ( SELECT users.owner_id
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.owner_id IS NOT NULL)))));


create policy "staff_can_view_owner_sales"
on "public"."sales"
as permissive
for select
to public
using ((owner_id IN ( SELECT users.owner_id
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.owner_id IS NOT NULL)))));


create policy "subscriptions_select_owner"
on "public"."subscriptions"
as permissive
for select
to public
using (((auth.uid() = owner_id) OR (auth.uid() = user_id) OR (auth.uid() IN ( SELECT users.id
   FROM users
  WHERE (users.owner_id = subscriptions.owner_id)))));


create policy "owners_managers_sommeliers_can_create_pdfs"
on "public"."tasting_exam_pdfs"
as permissive
for insert
to public
with check (((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['owner'::text, 'gerente'::text, 'sommelier'::text])) AND (exam_id IN ( SELECT tasting_exams.id
   FROM tasting_exams
  WHERE (tasting_exams.owner_id = ( SELECT COALESCE(users.owner_id, users.id) AS "coalesce"
           FROM users
          WHERE (users.id = auth.uid())))))));


create policy "users_can_view_pdfs_in_their_branch"
on "public"."tasting_exam_pdfs"
as permissive
for select
to public
using ((exam_id IN ( SELECT tasting_exams.id
   FROM tasting_exams
  WHERE (tasting_exams.owner_id = ( SELECT COALESCE(users.owner_id, users.id) AS "coalesce"
           FROM users
          WHERE (users.id = auth.uid()))))));


create policy "owners_managers_sommeliers_can_manage_exam_wines"
on "public"."tasting_exam_wines"
as permissive
for all
to public
using (((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['owner'::text, 'gerente'::text, 'sommelier'::text])) AND (exam_id IN ( SELECT tasting_exams.id
   FROM tasting_exams
  WHERE (tasting_exams.owner_id = ( SELECT COALESCE(users.owner_id, users.id) AS "coalesce"
           FROM users
          WHERE (users.id = auth.uid())))))));


create policy "users_can_view_exam_wines_in_their_branch"
on "public"."tasting_exam_wines"
as permissive
for select
to public
using ((exam_id IN ( SELECT tasting_exams.id
   FROM tasting_exams
  WHERE (tasting_exams.owner_id = ( SELECT COALESCE(users.owner_id, users.id) AS "coalesce"
           FROM users
          WHERE (users.id = auth.uid()))))));


create policy "owners_managers_sommeliers_can_create_exams"
on "public"."tasting_exams"
as permissive
for insert
to public
with check (((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['owner'::text, 'gerente'::text, 'sommelier'::text])) AND (owner_id = ( SELECT COALESCE(users.owner_id, users.id) AS "coalesce"
   FROM users
  WHERE (users.id = auth.uid()))) AND (branch_id IN ( SELECT branches.id
   FROM branches
  WHERE (branches.owner_id = ( SELECT COALESCE(users.owner_id, users.id) AS "coalesce"
           FROM users
          WHERE (users.id = auth.uid())))))));


create policy "owners_managers_sommeliers_can_delete_exams"
on "public"."tasting_exams"
as permissive
for delete
to public
using (((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['owner'::text, 'gerente'::text, 'sommelier'::text])) AND (owner_id = ( SELECT COALESCE(users.owner_id, users.id) AS "coalesce"
   FROM users
  WHERE (users.id = auth.uid())))));


create policy "owners_managers_sommeliers_can_update_exams"
on "public"."tasting_exams"
as permissive
for update
to public
using (((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['owner'::text, 'gerente'::text, 'sommelier'::text])) AND (owner_id = ( SELECT COALESCE(users.owner_id, users.id) AS "coalesce"
   FROM users
  WHERE (users.id = auth.uid())))));


create policy "users_can_view_exams_in_their_branch"
on "public"."tasting_exams"
as permissive
for select
to public
using ((owner_id = ( SELECT COALESCE(users.owner_id, users.id) AS "coalesce"
   FROM users
  WHERE (users.id = auth.uid()))));


create policy "users_can_create_responses_to_enabled_exams"
on "public"."tasting_responses"
as permissive
for insert
to public
with check (((exam_id IN ( SELECT tasting_exams.id
   FROM tasting_exams
  WHERE ((tasting_exams.enabled = true) AND (tasting_exams.enabled_until > now()) AND (tasting_exams.permanently_disabled = false) AND (tasting_exams.owner_id = ( SELECT COALESCE(users.owner_id, users.id) AS "coalesce"
           FROM users
          WHERE (users.id = auth.uid())))))) AND (user_id = auth.uid())));


create policy "users_can_view_their_responses"
on "public"."tasting_responses"
as permissive
for select
to public
using (((user_id = auth.uid()) OR (( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['owner'::text, 'gerente'::text, 'sommelier'::text]))));


create policy "users_can_create_wine_responses"
on "public"."tasting_wine_responses"
as permissive
for insert
to public
with check ((response_id IN ( SELECT tasting_responses.id
   FROM tasting_responses
  WHERE ((tasting_responses.user_id = auth.uid()) AND (tasting_responses.exam_id IN ( SELECT tasting_exams.id
           FROM tasting_exams
          WHERE ((tasting_exams.enabled = true) AND (tasting_exams.enabled_until > now()) AND (tasting_exams.permanently_disabled = false))))))));


create policy "users_can_view_wine_responses"
on "public"."tasting_wine_responses"
as permissive
for select
to public
using ((response_id IN ( SELECT tasting_responses.id
   FROM tasting_responses
  WHERE ((tasting_responses.user_id = auth.uid()) OR (( SELECT users.role
           FROM users
          WHERE (users.id = auth.uid())) = ANY (ARRAY['owner'::text, 'gerente'::text, 'sommelier'::text]))))));


create policy "Allow insert for authenticated users"
on "public"."users"
as permissive
for insert
to public
with check ((auth.uid() = id));


create policy "Owners can update their staff"
on "public"."users"
as permissive
for update
to public
using ((auth.uid() = owner_id))
with check ((auth.uid() = owner_id));


create policy "Owners can view their staff"
on "public"."users"
as permissive
for select
to public
using (((auth.uid() = id) OR (auth.uid() = owner_id)));


create policy "Users can insert own data"
on "public"."users"
as permissive
for insert
to public
with check ((auth.uid() = id));


create policy "Users can update own data"
on "public"."users"
as permissive
for update
to public
using ((auth.uid() = id));


create policy "Users can update own record"
on "public"."users"
as permissive
for update
to public
using ((auth.uid() = id))
with check ((auth.uid() = id));


create policy "Users can view own data"
on "public"."users"
as permissive
for select
to public
using ((auth.uid() = id));


create policy "Users can view own record"
on "public"."users"
as permissive
for select
to public
using ((auth.uid() = id));


create policy "Users can view their own profile"
on "public"."users"
as permissive
for select
to authenticated
using ((auth.uid() = id));


create policy "guests_can_view_public_stock"
on "public"."wine_branch_stock"
as permissive
for select
to public
using ((branch_id IN ( SELECT qr_tokens.branch_id
   FROM qr_tokens
  WHERE ((qr_tokens.type = 'guest'::text) AND (qr_tokens.expires_at > now()) AND ((qr_tokens.used = false) OR (qr_tokens.used IS NULL))))));


create policy "owner_can_create_stock"
on "public"."wine_branch_stock"
as permissive
for insert
to public
with check (((wine_id IN ( SELECT wines.id
   FROM wines
  WHERE (wines.owner_id = auth.uid()))) AND (branch_id IN ( SELECT branches.id
   FROM branches
  WHERE (branches.owner_id = auth.uid())))));


create policy "owner_can_delete_their_stock"
on "public"."wine_branch_stock"
as permissive
for delete
to public
using ((wine_id IN ( SELECT wines.id
   FROM wines
  WHERE (wines.owner_id = auth.uid()))));


create policy "owner_can_update_their_stock"
on "public"."wine_branch_stock"
as permissive
for update
to public
using ((wine_id IN ( SELECT wines.id
   FROM wines
  WHERE (wines.owner_id = auth.uid()))))
with check ((wine_id IN ( SELECT wines.id
   FROM wines
  WHERE (wines.owner_id = auth.uid()))));


create policy "owner_can_view_their_stock"
on "public"."wine_branch_stock"
as permissive
for select
to public
using ((wine_id IN ( SELECT wines.id
   FROM wines
  WHERE (wines.owner_id = auth.uid()))));


create policy "staff_can_create_owner_stock"
on "public"."wine_branch_stock"
as permissive
for insert
to public
with check (((wine_id IN ( SELECT wines.id
   FROM wines
  WHERE (wines.owner_id IN ( SELECT users.owner_id
           FROM users
          WHERE ((users.id = auth.uid()) AND (users.owner_id IS NOT NULL)))))) AND (branch_id IN ( SELECT branches.id
   FROM branches
  WHERE (branches.owner_id IN ( SELECT users.owner_id
           FROM users
          WHERE ((users.id = auth.uid()) AND (users.owner_id IS NOT NULL))))))));


create policy "staff_can_update_owner_stock"
on "public"."wine_branch_stock"
as permissive
for update
to public
using ((wine_id IN ( SELECT wines.id
   FROM wines
  WHERE (wines.owner_id IN ( SELECT users.owner_id
           FROM users
          WHERE ((users.id = auth.uid()) AND (users.owner_id IS NOT NULL)))))))
with check ((wine_id IN ( SELECT wines.id
   FROM wines
  WHERE (wines.owner_id IN ( SELECT users.owner_id
           FROM users
          WHERE ((users.id = auth.uid()) AND (users.owner_id IS NOT NULL)))))));


create policy "staff_can_view_owner_stock"
on "public"."wine_branch_stock"
as permissive
for select
to public
using ((wine_id IN ( SELECT wines.id
   FROM wines
  WHERE (wines.owner_id IN ( SELECT users.owner_id
           FROM users
          WHERE ((users.id = auth.uid()) AND (users.owner_id IS NOT NULL)))))));


create policy "users_can_view_wines_in_exams"
on "public"."wines"
as permissive
for select
to public
using ((id IN ( SELECT tasting_exam_wines.wine_id
   FROM tasting_exam_wines
  WHERE (tasting_exam_wines.exam_id IN ( SELECT tasting_exams.id
           FROM tasting_exams
          WHERE (tasting_exams.owner_id = ( SELECT COALESCE(users.owner_id, users.id) AS "coalesce"
                   FROM users
                  WHERE (users.id = auth.uid()))))))));


create policy "wines_delete_owner_staff"
on "public"."wines"
as permissive
for delete
to public
using (((owner_id = auth.uid()) OR (owner_id = ( SELECT u.owner_id
   FROM users u
  WHERE (u.id = auth.uid())))));


create policy "wines_insert_owner"
on "public"."wines"
as permissive
for insert
to public
with check (((owner_id = auth.uid()) OR ((owner_id = ( SELECT u.owner_id
   FROM users u
  WHERE (u.id = auth.uid()))) AND (( SELECT u.owner_id
   FROM users u
  WHERE (u.id = auth.uid())) IS NOT NULL))));


create policy "wines_select_owner_staff"
on "public"."wines"
as permissive
for select
to public
using (((owner_id = auth.uid()) OR (owner_id = ( SELECT u.owner_id
   FROM users u
  WHERE (u.id = auth.uid())))));


create policy "wines_update_owner_staff"
on "public"."wines"
as permissive
for update
to public
using (((owner_id = auth.uid()) OR (owner_id = ( SELECT u.owner_id
   FROM users u
  WHERE (u.id = auth.uid())))))
with check (((owner_id = auth.uid()) OR (owner_id = ( SELECT u.owner_id
   FROM users u
  WHERE (u.id = auth.uid())))));


create policy "read canonical for all auth"
on "public"."wines_canonical"
as permissive
for select
to authenticated
using (true);


CREATE TRIGGER trg_enforce_branch_limit BEFORE INSERT ON public.branches FOR EACH ROW EXECUTE FUNCTION enforce_branch_limit();

CREATE TRIGGER trigger_update_cocktail_menu_updated_at BEFORE UPDATE ON public.cocktail_menu FOR EACH ROW EXECUTE FUNCTION update_cocktail_menu_updated_at();

CREATE TRIGGER trigger_update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION update_subscriptions_updated_at();

CREATE TRIGGER trigger_update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION update_subscriptions_updated_at();

CREATE TRIGGER trigger_update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION update_subscriptions_updated_at();

CREATE TRIGGER trigger_check_exam_limit BEFORE INSERT ON public.tasting_exams FOR EACH ROW EXECUTE FUNCTION check_exam_limit_per_branch();

CREATE TRIGGER trg_enforce_free_user_limits_on_update BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION enforce_free_user_limits_on_update();

CREATE TRIGGER trg_enforce_wine_limit BEFORE INSERT ON public.wines FOR EACH ROW EXECUTE FUNCTION enforce_wine_limit();

CREATE TRIGGER trigger_disable_exam_on_wine_delete AFTER DELETE ON public.wines FOR EACH ROW EXECUTE FUNCTION disable_exam_if_wine_deleted();

CREATE TRIGGER t_wines_canonical_updated BEFORE UPDATE ON public.wines_canonical FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trigger_normalize_wines_canonical_country BEFORE INSERT OR UPDATE ON public.wines_canonical FOR EACH ROW EXECUTE FUNCTION trigger_normalize_country();


