-- Tabela de configuração de períodos de metas (dia início/fim do mês)
CREATE TABLE public.metas_periodos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  dia_inicio INTEGER NOT NULL DEFAULT 1,
  dia_fim INTEGER NOT NULL DEFAULT 31,
  mes_inicio INTEGER, -- mês do dia_inicio (pode ser mês anterior)
  mes_fim INTEGER, -- mês do dia_fim
  descricao TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(ano, mes)
);

-- Tabela de feriados
CREATE TABLE public.calendario_feriados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data DATE NOT NULL,
  descricao TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'NACIONAL', -- NACIONAL, ESTADUAL, MUNICIPAL
  uf TEXT, -- para feriados estaduais
  cidade TEXT, -- para feriados municipais
  recorrente BOOLEAN DEFAULT false, -- repete todo ano
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(data, tipo, uf, cidade)
);

-- Tabela de configuração de lojas (tipo e regras)
CREATE TABLE public.lojas_configuracao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cod_empresa INTEGER NOT NULL UNIQUE,
  tipo_loja TEXT NOT NULL DEFAULT 'RUA', -- RUA, SHOPPING
  abre_domingo BOOLEAN DEFAULT false,
  abre_feriado BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de exceções de funcionamento (datas específicas)
CREATE TABLE public.lojas_excecoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cod_empresa INTEGER NOT NULL,
  data DATE NOT NULL,
  aberto BOOLEAN NOT NULL, -- true = abre, false = fecha
  motivo TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(cod_empresa, data)
);

-- Alterar tabela metas_vendas para suportar novos campos
ALTER TABLE public.metas_vendas 
  ADD COLUMN IF NOT EXISTS dia_inicio INTEGER,
  ADD COLUMN IF NOT EXISTS dia_fim INTEGER;

-- Enable RLS
ALTER TABLE public.metas_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendario_feriados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lojas_configuracao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lojas_excecoes ENABLE ROW LEVEL SECURITY;

-- Policies for read access
CREATE POLICY "Public read metas_periodos" ON public.metas_periodos FOR SELECT USING (true);
CREATE POLICY "Public read calendario_feriados" ON public.calendario_feriados FOR SELECT USING (true);
CREATE POLICY "Public read lojas_configuracao" ON public.lojas_configuracao FOR SELECT USING (true);
CREATE POLICY "Public read lojas_excecoes" ON public.lojas_excecoes FOR SELECT USING (true);

-- Policies for service role full access
CREATE POLICY "Service role full access metas_periodos" ON public.metas_periodos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access calendario_feriados" ON public.calendario_feriados FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access lojas_configuracao" ON public.lojas_configuracao FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access lojas_excecoes" ON public.lojas_excecoes FOR ALL USING (true) WITH CHECK (true);

-- Trigger para updated_at
CREATE TRIGGER update_metas_periodos_updated_at
  BEFORE UPDATE ON public.metas_periodos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_lojas_configuracao_updated_at
  BEFORE UPDATE ON public.lojas_configuracao
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();