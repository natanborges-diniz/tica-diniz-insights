
-- Tabela de cache para OS Hub de Receitas
CREATE TABLE public.os_hub_receitas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cod_os INTEGER NOT NULL,
  numero_os TEXT,
  cod_empresa INTEGER NOT NULL,
  empresa TEXT,
  cliente TEXT,
  cod_cliente INTEGER,
  telefone TEXT,
  etapa TEXT,
  status_atraso TEXT,
  atraso_dias INTEGER DEFAULT 0,
  data_emissao TIMESTAMP WITH TIME ZONE,
  data_previsao TIMESTAMP WITH TIME ZONE,
  data_entrada TIMESTAMP WITH TIME ZONE,
  data_saida TIMESTAMP WITH TIME ZONE,
  total NUMERIC(15,2) DEFAULT 0,
  usuario TEXT,
  
  -- Receita OD (olho direito)
  od_longe_esf NUMERIC(8,2),
  od_longe_cil NUMERIC(8,2),
  od_longe_eixo INTEGER,
  od_perto_esf NUMERIC(8,2),
  od_perto_cil NUMERIC(8,2),
  od_perto_eixo INTEGER,
  od_adicao NUMERIC(8,2),
  od_dnp NUMERIC(8,2),
  od_altura NUMERIC(8,2),
  
  -- Receita OE (olho esquerdo)
  oe_longe_esf NUMERIC(8,2),
  oe_longe_cil NUMERIC(8,2),
  oe_longe_eixo INTEGER,
  oe_perto_esf NUMERIC(8,2),
  oe_perto_cil NUMERIC(8,2),
  oe_perto_eixo INTEGER,
  oe_adicao NUMERIC(8,2),
  oe_dnp NUMERIC(8,2),
  oe_altura NUMERIC(8,2),
  
  -- Prismas
  prisma TEXT,
  prisma1 TEXT,
  
  -- Imagens
  imagem_receita TEXT,
  url_imagem_receita TEXT,
  imagem_armacao TEXT,
  url_imagem_armacao TEXT,
  imagem_tracer TEXT,
  
  -- Observações
  observacao_os TEXT,
  observacao_lente TEXT,
  observacao_pendencia TEXT,
  
  -- Controle
  tem_receita BOOLEAN DEFAULT FALSE,
  tem_imagem BOOLEAN DEFAULT FALSE,
  cache_loaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Constraint de unicidade
  CONSTRAINT uq_os_hub_cod_os UNIQUE (cod_os)
);

-- Índices para busca rápida
CREATE INDEX idx_os_hub_cod_empresa ON public.os_hub_receitas(cod_empresa);
CREATE INDEX idx_os_hub_data_emissao ON public.os_hub_receitas(data_emissao);
CREATE INDEX idx_os_hub_status ON public.os_hub_receitas(status_atraso);
CREATE INDEX idx_os_hub_etapa ON public.os_hub_receitas(etapa);
CREATE INDEX idx_os_hub_cliente ON public.os_hub_receitas(cliente);
CREATE INDEX idx_os_hub_cache_loaded ON public.os_hub_receitas(cache_loaded_at);

-- RLS: Desabilitar pois não há autenticação de usuário neste sistema
ALTER TABLE public.os_hub_receitas ENABLE ROW LEVEL SECURITY;

-- Política pública (sem auth no sistema)
CREATE POLICY "Allow all access to os_hub_receitas"
  ON public.os_hub_receitas
  FOR ALL
  USING (true)
  WITH CHECK (true);
