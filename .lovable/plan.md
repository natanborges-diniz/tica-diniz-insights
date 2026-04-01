

## Plano Revisado: Fluxo Completo de Contas a Pagar (com Conciliação DDA)

### O que já existe

A edge function `btg-dda` já possui `conciliar_auto` que:
- Busca títulos DDA pendentes no banco (tabela `btg_dda_titulos`)
- Consulta parcelas a pagar do ERP via Firebird Bridge
- Faz match por **CNPJ + valor + vencimento** (preciso) ou **valor + vencimento** (fallback)
- Marca os títulos DDA como `CONCILIADO`

**Lacuna**: essa conciliação vive isolada na tela Banking DDA e não alimenta o ledger (`lancamentos_financeiros`). O match confirma que "o banco reconhece aquele boleto", mas não cria/atualiza o lançamento financeiro correspondente.

### Ajuste ao plano: etapa DDA → Ledger

Ao importar parcelas do ERP para o ledger (action `importar_erp_auto`), o sistema deve **cruzar automaticamente com DDA** para enriquecer o lançamento:

```text
parcelas_cache (ERP a Pagar)
        │
        ├── Match com btg_dda_titulos?
        │     ├── SIM → Lançamento criado com:
        │     │         - btg_dda_id preenchido
        │     │         - linha_digitavel nos dados_extras
        │     │         - status: PREVISTO (pronto para borderô)
        │     │         - Badge visual: "✓ DDA Confirmado"
        │     │
        │     └── NÃO → Lançamento criado com:
        │               - btg_dda_id = null
        │               - Badge visual: "⚠ Sem DDA"
        │               - Pode ser boleto não registrado ou outra forma
        │
        └── Títulos DDA sem match no ERP:
              → Lançamentos sugeridos com requer_validacao=true
              → Badge: "DDA sem parcela ERP"
```

### Alterações

**1. `supabase/functions/financeiro-lancamentos/index.ts`** — Action `importar_erp_auto`

- Após consultar `parcelas_cache` tipo PAGAR, buscar `btg_dda_titulos` pendentes da mesma empresa
- Cruzar por CNPJ + valor + vencimento (mesma lógica do `btg-dda`)
- Se match: preencher `btg_dda_id` e salvar `linha_digitavel` em `dados_extras`
- Após processar todas as parcelas ERP, varrer DDA órfãos (sem match) e criar lançamentos sugeridos com `requer_validacao=true`, `origem='DDA'`

**2. `supabase/functions/financeiro-lancamentos/index.ts`** — Action `enviarBorderoBtg`

- Para lançamentos com `btg_dda_id` preenchido e `linha_digitavel` em `dados_extras`, montar payload tipo `BANKSLIP` automaticamente (o boleto já é conhecido via DDA)

**3. `src/pages/FinanceiroHubPage.tsx`** — Indicadores visuais

- Badge "✓ DDA" verde em lançamentos que possuem `btg_dda_id`
- Badge "⚠ Sem DDA" amarelo em lançamentos a pagar sem vínculo DDA
- Badge "DDA sem ERP" laranja em lançamentos sugeridos vindos do DDA
- No botão "Importar ERP", incluir resultado: "X importados, Y vinculados ao DDA, Z DDA órfãos criados"

**4. `src/pages/FinanceiroHubPage.tsx`** — Sheet "Preparar Pagamento"

- Quando o lançamento tem `btg_dda_id` e `linha_digitavel`, pré-selecionar tipo "Boleto" e preencher código de barras automaticamente
- Exibir dados do DDA (emissor, banco) como referência

**5. Demais itens do plano original** (mantidos sem alteração)

- Botão "Importar ERP" no header
- Formulário com dados bancários do beneficiário
- Classificação DRE obrigatória na criação
- Action `confirmar_processamento` para baixa pós-banco
- Borderôs com payload estruturado por tipo

### Fluxo revisado

```text
┌──────────────┐     ┌─────────────┐     ┌──────────────────┐
│  Parcelas    │────▶│  Importar   │────▶│  Ledger           │
│  ERP (cache) │     │  do ERP     │     │  (PREVISTO)       │
└──────────────┘     │             │     │  ┌──────────────┐ │
                     │  ┌────────┐ │     │  │ ✓ DDA vinc.  │ │
┌──────────────┐     │  │ Cross  │ │     │  │ ⚠ Sem DDA    │ │
│  DDA Títulos │────▶│  │ Match  │─│────▶│  │ 🔶 DDA órfão │ │
│  (BTG Banco) │     │  └────────┘ │     │  └──────────────┘ │
└──────────────┘     └─────────────┘     └────────┬─────────┘
                                                  │
                                    ┌─────────────▼──────────┐
                                    │ Preparar Pagamento      │
                                    │ (auto-preenche boleto   │
                                    │  se DDA vinculado)      │
                                    └─────────────┬──────────┘
                                                  │
                                         Borderô → BTG → Baixa
```

### Detalhes técnicos

| Arquivo | Alteração |
|---|---|
| `supabase/functions/financeiro-lancamentos/index.ts` | Action `importar_erp_auto`: cross-match parcelas×DDA; criar órfãos DDA; `enviarBorderoBtg`: payload BANKSLIP auto para DDA; action `confirmar_processamento` |
| `src/pages/FinanceiroHubPage.tsx` | Botão importar ERP; badges DDA; sheet preparar pagamento com auto-preenchimento; classificação obrigatória |

### O que NÃO muda
- Tabela `btg_dda_titulos` (estrutura inalterada)
- Edge function `btg-dda` (importação e conciliação isolada continuam funcionando)
- Nenhuma migração SQL necessária (`dados_extras` jsonb já suporta os campos extras)

