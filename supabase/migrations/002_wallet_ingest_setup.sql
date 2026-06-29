-- Ingesta automática de gastos (Google Wallet → Edge Function wallet-ingest)
-- Aplicada vía MCP el 2026-06-29.

-- 1) Mapeo de tarjeta por últimos 4 dígitos
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS last4 text;

-- 2) Reglas comercio -> categoría (match por substring, case-insensitive)
CREATE TABLE IF NOT EXISTS public.category_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pattern text NOT NULL,         -- se busca: merchant ILIKE '%pattern%'
  category_name text NOT NULL,   -- se resuelve al category del mes por nombre
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.category_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS category_rules_all ON public.category_rules;
CREATE POLICY category_rules_all ON public.category_rules
  FOR ALL USING (profile_id IN (SELECT visible_profile_ids()));

-- 3) Secreto de ingesta (header x-ingest-secret). Solo service_role puede leerlo.
CREATE TABLE IF NOT EXISTS public.ingest_config (
  id int PRIMARY KEY DEFAULT 1,
  secret text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT ingest_config_singleton CHECK (id = 1)
);

ALTER TABLE public.ingest_config ENABLE ROW LEVEL SECURITY;
-- Sin policies: solo el service_role (Edge Function) puede leerlo.

INSERT INTO public.ingest_config (id, secret)
SELECT 1, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE NOT EXISTS (SELECT 1 FROM public.ingest_config WHERE id = 1);
