
-- BTG Banking — Fase 1: Tabelas Base (fix)

-- 1. btg_contas_bancarias
CREATE TABLE public.btg_contas_bancarias (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cod_empresa integer NOT NULL UNIQUE,
  cnpj text,
  account_id text,
  company_id text,
  agencia text,
  conta text,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.btg_contas_bancarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read btg_contas_bancarias"
  ON public.btg_contas_bancarias FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin write btg_contas_bancarias"
  ON public.btg_contas_bancarias FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access btg_contas_bancarias"
  ON public.btg_contas_bancarias FOR ALL
  USING (true)
  WITH CHECK (true);

-- 2. btg_tokens
CREATE TABLE public.btg_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cod_empresa integer NOT NULL UNIQUE,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz NOT NULL,
  scopes text[],
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.btg_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access btg_tokens"
  ON public.btg_tokens FOR ALL
  USING (true)
  WITH CHECK (true);
