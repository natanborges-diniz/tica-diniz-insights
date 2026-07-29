# SPEC P2.5 — Governança de Pagamentos (mesa de aprovação)

> Desenhada com o stakeholder em 29-30/07/2026, sobre o P1 (conciliação 3 vias) e
> P2 (ledger único) já em produção. Objetivo: **nenhum pagamento sem lastro** —
> o financeiro só paga o que a empresa de fato deve, com processo que resiste a
> fraude e a auditoria, sem travar a operação.

---

## 1. Princípio e lastros

Todo lançamento a pagar precisa de exatamente **um lastro** para entrar em borderô:

| Lastro | O que é | Cobre | Como o sistema valida |
|---|---|---|---|
| **A — Título ERP** | Parcela vinda do Dataweb via chave dura (`erp_parcela_id`) — nasce de documento de entrada/NF | Fornecedores, tudo com nota | já existe (sync-ledger); P3 apertará NF↔pedido |
| **B — Rubrica autorizada** | Cadastro prévio aprovado pelo master: favorecido exato, natureza DRE, periodicidade, valor com faixa de tolerância | Aluguel, consumo (água/luz/telecom), contratos (franquia, BPO, software), impostos recorrentes, **folha** | nova tabela `rubricas_autorizadas` (§3) |
| **C — Exceção emergencial** | Conta avulsa sem previsão: **analista lança com justificativa obrigatória → master aprova individualmente** | Emergências reais | fluxo próprio, fora do borderô padrão (§5) |

DDA sozinho **não é lastro** — é evidência de cobrança. Boleto do DDA só é pagável
se casar com título ERP (lastro A) ou rubrica (B); DDA sem correspondente = investigar
(golpe do boleto). O caminho de "pagamento avulso BTG" (tela própria) é desativado
para pagar — pagar é sempre via borderô ou via exceção C.

**Decisão do stakeholder (registrada):** a autorização bancária final permanece no
canal BTG (app/internet banking). Nosso sistema aprova e envia via API; o dinheiro
só se move após a confirmação no BTG — duas barreiras em sistemas independentes.
Não configurar auto-execução de API na conta.

## 2. Papéis e separação de funções

> **Decisão do stakeholder (30/07, revisada):** modelo simplificado em DOIS papéis —
> **operador cria, admin aprova**. Sem papel "master" (o valor de enum existe no
> banco mas não é usado). Toda aprovação acontece na Mesa de Aprovação (única
> superfície; o Hub apenas encaminha para lá).

| Papel | Pode | Não pode |
|---|---|---|
| **operador** (qualquer usuário autorizado no módulo) | criar/classificar lançamentos, montar borderô, cadastrar rubrica (rascunho), lançar exceção C com justificativa | aprovar qualquer coisa |
| **admin** | tudo do operador + aprovar borderôs, rubricas e exceções na Mesa; gerir regras | aprovar item **criado por si** (trava criador≠aprovador vale para todos) |

Trava de sistema: `aprovado_por <> criado_por` em borderô, rubrica e exceção.
Alçada opcional por valor (v2): acima de R$ X, exigir segundo admin.

## 3. Modelo de dados (1 migration)

```sql
CREATE TABLE public.rubricas_autorizadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa INTEGER,                        -- NULL = todas as lojas
  descricao TEXT NOT NULL,                    -- "Aluguel loja Centro", "Energia CEMIG"
  favorecido_nome TEXT NOT NULL,
  favorecido_documento TEXT,                  -- CNPJ/CPF (obrigatório p/ PIX/TED)
  favorecido_chave TEXT,                      -- chave PIX ou conta — EXATA
  conta_numero TEXT NOT NULL,                 -- conta do dre_plano_contas (natureza/categoria derivadas)
  periodicidade TEXT NOT NULL DEFAULT 'MENSAL', -- MENSAL | SEMANAL | ANUAL | AVULSA_RECORRENTE
  valor_esperado NUMERIC,                     -- NULL = só teto
  tolerancia_pct NUMERIC NOT NULL DEFAULT 10, -- faixa aceita sem re-aprovação
  valor_teto NUMERIC NOT NULL,                -- acima disso NUNCA passa sem master
  vigencia_inicio DATE NOT NULL DEFAULT current_date,
  vigencia_fim DATE,
  status TEXT NOT NULL DEFAULT 'RASCUNHO',    -- RASCUNHO | ATIVA | SUSPENSA
  criado_por UUID NOT NULL,
  aprovado_por UUID,                          -- master; CHECK (aprovado_por <> criado_por)
  aprovado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Em `lancamentos_financeiros`: `ADD COLUMN rubrica_id UUID`, `ADD COLUMN lastro TEXT`
(`ERP` | `RUBRICA` | `EXCECAO`), `ADD COLUMN justificativa TEXT` (obrigatória se
EXCECAO). Backfill: origem='ERP' → lastro='ERP'; os 21 recorrentes marcados MANUAL
na limpeza de 29/07 são os primeiros candidatos a virar rubrica.

**Alterar favorecido_chave ou valor_teto de rubrica ATIVA → volta a RASCUNHO e exige
re-aprovação do master** (é o ataque clássico: trocar a chave PIX do aluguel).

## 4. Mesa de aprovação (UI — evolução do Hub)

Tela única de aprovação para o master. Cada lançamento pendente com **selo de lastro**:

| Selo | Significado | Ação esperada |
|---|---|---|
| 🟢 verde | Título ERP (nota) ou DDA casado com título | aprovar em lote |
| 🔵 azul | Rubrica dentro da faixa | aprovar em lote |
| 🟡 amarelo | Rubrica **fora da faixa** (mostra o desvio: "Energia +38% vs esperado") | olhar e decidir |
| 🔴 vermelho | Exceção emergencial (justificativa do analista à vista) | aprovar individual |

Regras de montagem: **borderô só aceita 🟢/🔵/🟡-aprovado**; 🔴 nunca entra em
borderô (fluxo próprio §5); lançamento sem lastro nenhum não é aprovável — aparece
numa lista "sem lastro" para o analista resolver (vincular título, criar rubrica ou
justificar exceção).

Fluxo completo: analista monta → master aprova na mesa (lote pros verdes/azuis) →
sistema envia à API BTG (segundos) → master confirma no app BTG (≈2 min no total) →
banco executa → webhook/polling baixa sozinho → extrato concilia (P1). Nenhuma
espera relevante entre aprovação interna e chegada ao banco.

## 5. Exceção emergencial (lastro C)

1. Analista cria com `lastro='EXCECAO'` + justificativa obrigatória (mín. 20 chars)
   + favorecido completo. Não entra em borderô.
2. Master vê na mesa (🔴), aprova **individualmente** → vira pagamento avulso BTG
   (único uso remanescente desse caminho) → confirmação no app BTG.
3. Relatório mensal de exceções (quem, quanto, justificativa, frequência por
   favorecido) — exceção recorrente é sinal de rubrica faltando, e o relatório
   sugere a conversão.

## 6. Casos de uso mapeados

- **Conta de consumo** (valor varia): rubrica com `valor_esperado` + `tolerancia_pct`.
  Fatura chega (DDA ou lançamento do analista) → dentro da faixa = 🔵; fora = 🟡 com
  desvio calculado. Ajuste fino do valor real é automático — o que se aprova é a rubrica.
- **Recorrente via PIX/TED** (aluguel, franquia): rubrica com `favorecido_chave` exata.
  Pagamento só monta se a chave de destino = cadastrada. Mudou a chave? Re-aprovação.
- **Folha**: rubrica por funcionário (conta cadastrada) + teto por lote mensal
  aprovado; pagamento fora da lista ou acima do total do lote não monta. (v2: import
  do arquivo de folha.)
- **Boleto de fornecedor**: DDA casa com título ERP → 🟢 automático (já funciona hoje;
  a mesa só o torna visível).

## 7. Plano de entrega

| Etapa | Entrega | Depende de |
|---|---|---|
| **G1** | Migration (rubricas + lastro/justificativa) + papéis analista/master + backfill lastro | — |
| **G2** | Validação de lastro no `financeiro-lancamentos` (borderô rejeita sem lastro; criador≠aprovador; rubrica: favorecido/faixa/teto) — módulo puro testável | G1 |
| **G3** | Mesa de aprovação (UI) com selos + CRUD de rubricas + fila de exceções | G2 |
| **G4** | Relatório mensal de exceções + alertas (rubrica vencendo, exceções recorrentes) | G3 |

### Critérios de aceite

- Lançamento sem lastro não entra em borderô (nem via API direta).
- Rubrica com chave PIX alterada exige re-aprovação antes do próximo pagamento.
- Conta de consumo 38% acima do esperado aparece 🟡 com o desvio; dentro da faixa, 🔵.
- Analista não consegue aprovar nada; master não aprova o que criou.
- Exceção sem justificativa é rejeitada na criação.
- Fluxo ponta a ponta: aprovar na mesa → confirmar no BTG → baixa automática →
  conciliação P1 fecha os três lados sem toque.

## 8. Pendências de decisão

1. Valor de alçada para segundo aprovador (v2) — sugerido R$ 10.000.
2. Quem além do stakeholder terá papel master (mínimo 2, para a trava
   criador≠aprovador não travar a operação em férias).
3. Folha: v1 com rubricas por funcionário ou já com import de arquivo?
