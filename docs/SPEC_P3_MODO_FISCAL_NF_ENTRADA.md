# SPEC P3 — Modo Fiscal: entrada de NF amarrada a pedido

> Desenhada com o stakeholder em 30/07/2026, sobre P1 (conciliação), P2 (ledger
> único) e P2.5 (governança/lastros — em implementação). Fecha a lacuna do
> `MAPEAMENTO_FINANCEIRO.md` §3: Pedido → NF → Contas a Pagar → CMV.

---

## 1. Problema e princípio

Hoje o título de fornecedor só existe quando o fiscal digita a nota no Dataweb.
Se a nota chega tarde ou é esquecida, o fechamento do dia sai errado e o CMV não
fecha. O modo fiscal **inverte a dependência**: a NF-e entra no nosso sistema no
dia em que chega (o XML é a fonte), já amarrada ao pedido — a digitação no ERP
vira conferência, não pré-requisito.

**Trava de CMV (exigência do stakeholder):** NF de mercadoria sem pedido
correspondente **não gera conta a pagar** — fica retida na fila "NF sem pedido".
Só entra custo o que nasceu de um pedido nosso.

## 2. Dois regimes por tipo de mercadoria (decisão do stakeholder)

| Regime | Produtos | Entrada no Dataweb? | Fonte da verdade |
|---|---|---|---|
| **LENTE_ENCOMENDA** | Lentes oftálmicas sob encomenda (não movimentam estoque) | **Não** — fluxo inteiramente no nosso sistema | NF no nosso sistema (financeiro e fiscal-gerencial) |
| **ESTOQUE** | Armações, solares, acessórios, lentes de contato | **Sim** — entrada dupla (Dataweb p/ estoque/contábil) | NF no nosso sistema (financeiro); Dataweb (estoque); reconciliação automática entre os dois |

O regime é inferido pelos itens da NF (CFOP/NCM + cadastro do fornecedor) com
override manual no ato da conferência.

## 3. As duas origens de pedido (decisão do stakeholder)

Nem todo fornecedor é pedido pelo nosso sistema, mas **toda OS tem pedido no
Dataweb**. O match precisa cobrir os dois mundos:

1. **Pedido interno** — `pedidos_fornecedor` (Hoya/Zeiss/Haytek, já existe, com
   `numero_pedido` por OS).
2. **Pedido ERP** — pedidos de compra do Dataweb, atrelados às OS. **Novo na
   bridge**: endpoint `GET /api/v1/compras/pedidos` expondo nº do pedido, OS
   vinculada, fornecedor (CNPJ), data, valor e situação (query nova em
   `queries/compras/`, com checagem de schema em runtime como o resto da bridge).
   Espelhado em `pedidos_erp_cache` pelo mesmo padrão do `sync-parcelas`
   (chave dura = PK do pedido no Firebird).

### Cascata de match NF → pedido

1. `xPed`/`xNEmp` do XML (campo padrão da NF-e para nº do pedido do comprador)
   → busca em `pedidos_fornecedor.numero_pedido` **e** `pedidos_erp_cache`.
2. Sem xPed: CNPJ do emitente + valor total (tolerância 1%) + janela de datas
   contra pedidos em aberto das duas origens.
3. Ambíguo ou sem match → fila **"NF sem pedido"** (retida; analista aponta o
   pedido manualmente — nunca o sistema chuta, mesmo padrão do motor P1).

## 4. Modelo de dados (1 migration + bridge)

```sql
CREATE TABLE public.notas_fiscais_entrada (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa INTEGER NOT NULL,
  chave_acesso TEXT NOT NULL UNIQUE,          -- 44 dígitos; idempotência do upload
  numero_nf TEXT NOT NULL,
  serie TEXT,
  emitente_cnpj TEXT NOT NULL,
  emitente_nome TEXT NOT NULL,
  data_emissao DATE NOT NULL,
  valor_total NUMERIC NOT NULL,
  regime TEXT NOT NULL,                       -- LENTE_ENCOMENDA | ESTOQUE
  status TEXT NOT NULL DEFAULT 'RECEBIDA',    -- RECEBIDA | SEM_PEDIDO | AMARRADA | TITULOS_GERADOS | RECONCILIADA_ERP | DIVERGENTE
  pedido_origem TEXT,                         -- INTERNO | ERP
  pedido_interno_id UUID,                     -- pedidos_fornecedor
  pedido_erp_id BIGINT,                       -- pedidos_erp_cache (chave dura Firebird)
  xped_extraido TEXT,
  xml_storage_path TEXT NOT NULL,             -- XML bruto guardado (auditoria)
  itens JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{descricao, ncm, cfop, qtd, valor}]
  duplicatas JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{numero, vencimento, valor}] do bloco <cobr>
  match_metodo TEXT,                          -- XPED | CNPJ_VALOR | MANUAL
  erp_titulo_conciliado BOOLEAN NOT NULL DEFAULT false,
  criado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`lancamentos_financeiros`: `ADD COLUMN nf_entrada_id UUID` — títulos gerados pela
NF apontam para ela (lastro A da governança, selo 🟢 na mesa).

`fornecedores` (ou tabela equivalente): flag `modo_fiscal BOOLEAN` — a migração é
**por fornecedor, gradual**.

## 5. Fluxo

```
XML chega (upload; e-mail/SEFAZ na v2)
  → parse (chave, emitente, itens, duplicatas, xPed)
  → dedup por chave_acesso (reimportar = no-op)
  → match pedido (cascata §3) ──sem match──▶ fila "NF sem pedido" (retida)
  → AMARRADA: gera 1 título por duplicata (vencimento/valor do XML),
    lastro NF, natureza 3.8.x pela categoria dos itens, status PREVISTO
  → títulos entram na mesa de aprovação como 🟢
  → DDA do boleto casa com o título (já existe) → borderô → BTG → extrato (P1)
```

**Regime ESTOQUE — reconciliação com o ERP:** quando o Dataweb digitar a mesma
nota, o sync-ledger vai criar o título ERP espelho. O reconciliador casa por
(CNPJ emitente + número NF, fallback valor+vencimento) e **funde**: o título da
NF ganha `erp_parcela_id` (vira o registro único), a NF fica RECONCILIADA_ERP.
Divergência de valor/parcelas → status DIVERGENTE + alerta (fiscal digitou errado
ou NF errada). Fornecedor `modo_fiscal=true` ⇒ sync-ledger **não cria** título
novo para notas já presentes (evita duplicar); fornecedor não migrado ⇒ fluxo
atual intacto.

**Regime LENTE_ENCOMENDA:** sem reconciliação — o título da NF é o registro
único e definitivo. CMV por OS: como o pedido aponta a OS, o custo da lente
fecha na OS (margem por OS vira subproduto natural, exposto depois no Hub OS).

## 6. Relatórios de cobrança (novos, resolvem a "nota esquecida")

- **NF recebida sem entrada no ERP** (regime ESTOQUE, >N dias sem reconciliar) —
  cobrar o fiscal; o fechamento do dia não espera, mas a pendência fica visível.
- **Pedido entregue sem NF** (pedido com tracking entregue há >N dias sem NF
  amarrada) — cobrar o fornecedor.
- **Fila NF sem pedido** — anomalia de processo (compra fora do fluxo?).

## 7. Plano de entrega

| Etapa | Entrega | Depende de |
|---|---|---|
| **F0** | Bridge: query + endpoint de pedidos de compra do Dataweb (descoberta de schema incluída) + `pedidos_erp_cache` + sync | — (repo firebird-bridge) |
| **F1** | Migration + upload de XML + parser (chave/itens/duplicatas/xPed) + match cascata + fila NF sem pedido | F0 |
| **F2** | Geração de títulos por duplicata (lastro NF) + regime LENTE_ENCOMENDA completo + tela de conferência | F1, G1 (lastros) |
| **F3** | Regime ESTOQUE: reconciliação ERP + flag `modo_fiscal` por fornecedor + status DIVERGENTE | F2 |
| **F4** | Relatórios (§6) + captura por e-mail; manifestação SEFAZ avaliada como v2 | F3 |

### Critérios de aceite

- Upload do mesmo XML 3x → 1 nota (dedup por chave de acesso).
- NF com xPed válido → amarrada e títulos gerados sem toque humano.
- NF sem pedido → retida; **nenhum** título criado.
- NF de lente sob encomenda → título único no sistema, CMV na competência da
  emissão, custo visível na OS.
- NF de armação digitada depois no Dataweb → reconciliada sem duplicar título;
  valor divergente → alerta, não fusão silenciosa.
- Fechamento do dia não depende de digitação no ERP para nenhuma NF recebida.

## 8. Pendências de descoberta

1. Schema dos pedidos de compra no Firebird (tabelas/colunas; F0 começa por aí,
   no repo firebird-bridge).
2. Se os laboratórios preenchem `xPed` consistentemente (amostra de XMLs reais
   define o peso da cascata 1 vs 2).
3. Onde guardar o XML (Supabase Storage, bucket privado — sugestão).
4. Cadastro de fornecedores: existe tabela própria ou deriva de `pessoa` do ERP?
   (define onde mora o flag `modo_fiscal`).
