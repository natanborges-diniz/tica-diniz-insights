# AGN AS-IS — Pedido Hoya (`/os/pedido`)

> Documento agnóstico do fluxo atual de geração de pedido Hoya.  
> **Objetivo**: mapear o comportamento existente sem propor mudanças.  
> **Data**: 2026-02-14

---

## 1. Diagrama do Fluxo Fim-a-Fim

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                         FLUXO DE GERAÇÃO DE PEDIDO HOYA                             │
└──────────────────────────────────────────────────────────────────────────────────────┘

  ┌─────────────┐     ┌────────────────────┐     ┌──────────────────────┐
  │ OS Monitor  │────▶│ Pop-up /os/pedido   │────▶│ 1. Carregar OS       │
  │ (OsDashboard│     │ ?codOs=X&codEmpresa │     │ fetchSingleOsRecipe  │
  │  click)     │     │                    │     │ (osHubService.ts)    │
  └─────────────┘     └────────────────────┘     └──────────┬───────────┘
                                                            │
                                                            ▼
                                                 ┌──────────────────────┐
                                                 │ 2. Carregar Catálogo │
                                                 │ listarProdutosHoya   │
                                                 │ → hoya-proxy cache   │
                                                 └──────────┬───────────┘
                                                            │
                          ┌─────────────────────────────────┼──────────────────────┐
                          ▼                                 ▼                      ▼
                ┌──────────────────┐            ┌─────────────────┐     ┌──────────────────┐
                │ 3a. DE/PARA      │            │ 3b. Match Intel.│     │ 3c. Busca Manual │
                │ fornecedor_      │            │ matchProducts   │     │ (fallback UI)    │
                │ produto_depara   │            │ (hoyaMatching   │     │                  │
                │ (Supabase)       │            │  Service.ts)    │     │                  │
                └───────┬──────────┘            └───────┬─────────┘     └────────┬─────────┘
                        │                               │                        │
                        └───────────────┬───────────────┘────────────────────────┘
                                        ▼
                              ┌──────────────────────┐
                              │ 4. Seleção do Produto │
                              │ Família → Altura →    │
                              │ Tratamento → Foto →   │
                              │ Coloração → Exact     │
                              │ (findExactProduct)    │
                              └──────────┬───────────┘
                                         ▼
                              ┌──────────────────────┐
                              │ 5. Preencher Form     │
                              │ Prescrição (OS→form)  │
                              │ Armação (OS→form)     │
                              │ Prismas (mapPrismas)  │
                              │ Config (defaults)     │
                              │ Campos Complem.(F4.4) │
                              └──────────┬───────────┘
                                         ▼
                              ┌──────────────────────┐
                              │ 6. Validar Payload    │
                              │ validateHoyaPayload   │
                              │ (hoyaValidation       │
                              │  Service.ts)          │
                              │ → erros = BLOQUEIA    │
                              │ → warnings = EXIBE    │
                              └──────────┬───────────┘
                                         │ (se valid)
                                         ▼
                              ┌──────────────────────┐
                              │ 7. Montar Payload     │
                              │ HoyaPedidoPayload     │
                              │ (PedidoFornecedor     │
                              │  Page.tsx L314-378)    │
                              └──────────┬───────────┘
                                         ▼
                              ┌──────────────────────┐
                              │ 8. Enviar             │
                              │ criarPedidoHoya →     │
                              │ callHoyaProxy("criar- │
                              │ pedido") → Edge Fn    │
                              └──────────┬───────────┘
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │ 9. Edge Function hoya-proxy                  │
                  │ ┌──────────────────────────────────────────┐ │
                  │ │ a) Idempotency check (SHA-256 key)       │ │
                  │ │ b) fetchWithRetry → POST /pedido         │ │
                  │ │ c) Audit → pedidos_fornecedor INSERT     │ │
                  │ └──────────────────────────────────────────┘ │
                  └──────────────────┬───────────────────────────┘
                                     ▼
                  ┌──────────────────────────────────────────────┐
                  │ 10. Pós-envio (UI)                           │
                  │ a) Salvar DE/PARA (upsert)                   │
                  │ b) Exibir confirmação (nº pedido + status)   │
                  └──────────────────────────────────────────────┘
```

---

## 2. Inventário de Regras Atuais

### 2.1 Regras de Match (3 camadas, em ordem de prioridade)

| Camada | Descrição | Arquivo | Linha |
|--------|-----------|---------|-------|
| **1. DE/PARA** | Consulta `fornecedor_produto_depara` por `fornecedor='HOYA'` + `descricao_local` = descrição OD da OS. Se encontrar `codigo_fornecedor`, localiza no catálogo e seleciona diretamente. | `PedidoFornecedorPage.tsx` | L207-221 |
| **2. Match Inteligente** | `matchProducts()` — parsing da descrição ERP → scoring por atributos → agrupamento por família | `hoyaMatchingService.ts` | L328-438 |
| **3. Busca Manual** | Input de texto filtrando `produtos` por nome ou código. Fallback visual. | `PedidoFornecedorPage.tsx` | L794-844 |

#### Critérios de Scoring (camada 2)

| Atributo | Peso | Fonte do parse |
|----------|------|----------------|
| Desenho | +35 | Tokens conhecidos: Argos, MyStyle, Nulux, etc. |
| Material (índice) | +25 | Mapeamento `1.50→150`, `1.53→TVX`, `1.60→160`, etc. |
| Tratamento | +20 (exato) / +15 (parcial) | LONG→HV LongLife, INC→HARD Anti-Risco, LONGBLUE→HV LL Bluecontrol |
| Fotossensível | +10 (presente) / +5 (tipo match) | Detecção de "SENSITY" + tipo (Original/2) + cor (CZ/MR/VD) |
| Não-fotossensível | +5 | Produto sem `codigoFotossensivel` |
| Bluecontrol/COR | +5 | "COR" no nome do produto ou "bluecontrol" no tratamento |
| Tipo lente | +5 | Progressiva ↔ "Visao Progressiva", Monofocal ↔ "Visao Simples" |

**Filtro prévio**: Prescrição compatível (`isGrauCompativel`) — verifica esférico, cilíndrico e adição dentro dos ranges do produto.

### 2.2 Regras de Validação

**Arquivo**: `hoyaValidationService.ts` — `validateHoyaPayload()`

#### Bloqueantes (errors → impede envio)

| Campo | Regra | Linha |
|-------|-------|-------|
| `os` | Obrigatório, ≠ "0" | L64-66 |
| `especificacoes.codigoProduto` | Obrigatório | L69-71 |
| `prescricao.OD/OE.esferico/cilindrico` | Ao menos um ≠ null por olho | L28-34 |
| `prescricao.OD/OE.eixo` | Obrigatório se cilíndrico ≠ null e ≠ 0 | L36-42 |
| `prescricao.OD/OE.dnpLonge` | Obrigatório | L44-50 |
| `camposComplementares[].obrigatorio` | Valor não-vazio + dentro do range min/max | L106-127 |

#### Avisos (warnings → exibe mas não bloqueia)

| Campo | Regra | Linha |
|-------|-------|-------|
| `prescricao.adicao` | Sem adição em ambos os olhos | L78-84 |
| `prescricao.alturaPupilar` | Sem altura pupilar em ambos | L87-93 |
| `dadosMedida.larguraLente` | Não informada | L96-98 |
| `garantia.usuarioFinal` | Não informado | L101-103 |

### 2.3 Defaults Aplicados

| Campo | Valor default | Onde | Evidência |
|-------|---------------|------|-----------|
| `tipoServico` | `4` (Sem montagem) | UI state init | `PedidoFornecedorPage.tsx` L106 |
| `tipoArmacao` | `1` (Plástica/Acetato) | UI state init | L107 |
| `observacao` | `""` (vazio) | UI state init | L108 |
| `armacao.comPolimento` | `false` | Payload build | L366 |
| `prescricao.afinamentoPrismatico` | `true` se houver prisma OD ou OE | Payload build | L354 |
| `prescricao.equilibrioLente` | `false` | Payload build | L355 |
| `dadosMedida.distanciaLeitura` | `null` | Payload build | L362 |
| `prescricao.*.dnpPerto` | `null` | Payload build | L338, L350 |
| `garantia.inicialUsuario` | `""` | Payload build | L369 |
| `garantia.nomeMedico` | não enviado (undefined) | Payload build | — |
| `camposComplementares[].valor` | `valorPadrao` do catálogo se user não alterou | Payload build | L375 |
| `codigoColoracao` | `null` se "none" selecionado | Payload build | L320 |

---

## 3. Mapa de Campos

| Campo Payload Hoya | Origem Atual | Obrig.? | Onde Aplicado |
|---------------------|-------------|---------|---------------|
| `os` | `os.numeroOs \|\| os.codOs` — OS Hub | ✅ | UI→Payload (L315) |
| `observacao` | User input (textarea) | ❌ | UI (L108) |
| `codigoCliente` | Não enviado atualmente | ❌ | — |
| `voucher` | Não enviado atualmente | ❌ | — |
| `especificacoes.codigoProduto` | Match/DE-PARA/Manual → `produtoSelecionado.codigoProduto` | ✅ | UI→Payload (L318) |
| `especificacoes.tipoServico` | Default `4` / user select | ✅ | UI (L106, L1006-1014) |
| `especificacoes.codigoColoracao` | User select / null | ❌ | UI (L699-714) |
| `especificacoes.codigoDesenho` | `produtoSelecionado` (catálogo) | ✅ | Catálogo→Payload (L321) |
| `especificacoes.codigoAltura` | `produtoSelecionado` (catálogo, seleção user) | ❌* | Catálogo→Payload (L322) |
| `especificacoes.codigoMaterial` | `produtoSelecionado` (catálogo) | ✅ | Catálogo→Payload (L323) |
| `especificacoes.codigoTratamento` | `produtoSelecionado` (catálogo, seleção user) | ✅ | Catálogo→Payload (L324) |
| `especificacoes.codigoFotossensivel` | `produtoSelecionado` / null | ❌ | Catálogo→Payload (L325) |
| `prescricao.direito.esferico` | OS (odLongeEsf) → form editável | ✅** | OS→UI→Payload (L141, L329) |
| `prescricao.direito.cilindrico` | OS (odLongeCil) → form editável | ✅** | OS→UI→Payload (L142, L330) |
| `prescricao.direito.eixo` | OS (odLongeEixo) → form editável | Cond.*** | OS→UI→Payload (L143, L331) |
| `prescricao.direito.adicao` | OS (odAdicao) → form editável | ❌ | OS→UI→Payload (L144, L332) |
| `prescricao.direito.prismaH` | OS (prisma) → `mapPrismasFromOs` → form | ❌ | OS→Service→UI→Payload (L147, L333) |
| `prescricao.direito.basePRPrismaH` | OS (prisma) → `mapPrismasFromOs` → form | ❌ | OS→Service→UI→Payload (L148, L334) |
| `prescricao.direito.prismaV` | Sempre `null` (ERP não separa V) → form | ❌ | Default→UI→Payload (L149, L335) |
| `prescricao.direito.basePRPrismaV` | Sempre `null` → form | ❌ | Default→UI→Payload (L150, L336) |
| `prescricao.direito.dnpLonge` | OS (odDnp) → form editável | ✅ | OS→UI→Payload (L145, L337) |
| `prescricao.direito.dnpPerto` | Sempre `null` (hardcoded) | ❌ | Default (L338) |
| `prescricao.direito.alturaPupilar` | OS (odAltura) → form editável | ❌ (warn) | OS→UI→Payload (L146, L339) |
| `prescricao.esquerdo.*` | Idem OE — mesma lógica | — | — |
| `prescricao.afinamentoPrismatico` | `true` se prisma OD ou OE preenchido | ❌ | UI→Payload (L354) |
| `prescricao.equilibrioLente` | `false` (hardcoded) | ❌ | Default (L355) |
| `dadosMedida.larguraLente` | OS (caHorizontal) → form editável | ❌ (warn) | OS→UI→Payload (L165, L358) |
| `dadosMedida.alturaLente` | OS (aaVertical) → form editável | ❌ | OS→UI→Payload (L166, L359) |
| `dadosMedida.ponteLente` | OS (ponte) → form editável | ❌ | OS→UI→Payload (L167, L360) |
| `dadosMedida.distanciaLeitura` | `null` (hardcoded) | ❌ | Default (L362) |
| `armacao.tipoArmacao` | Default `1` / user select | ✅ | UI (L107, L986-994) |
| `armacao.comPolimento` | `false` (hardcoded) | ❌ | Default (L366) |
| `armacao.marca` | Não enviado | ❌ | — |
| `armacao.modelo` | Não enviado | ❌ | — |
| `armacao.cor` | Não enviado | ❌ | — |
| `armacao.formaArmacao` | Não enviado | ❌ | — |
| `garantia.usuarioFinal` | OS (cliente) → form editável | ❌ (warn) | OS→UI→Payload (L169, L368) |
| `garantia.inicialUsuario` | `""` (hardcoded) | ❌ | Default (L369) |
| `garantia.nomeMedico` | Não enviado | ❌ | — |
| `garantia.crmMedico` | Não enviado | ❌ | — |
| `camposComplementares[]` | Catálogo (definição) + user input / valorPadrao | Cond.**** | Catálogo→UI→Payload (L372-377) |

> \* Obrigatório pela UI (sem altura = warning "selecione a altura"), não pela validação service.  
> \** Ao menos esférico OU cilíndrico deve ser não-null por olho.  
> \*** Obrigatório se cilíndrico ≠ null e ≠ 0.  
> \**** Obrigatório se `campo.obrigatorio === true` no catálogo.

---

## 4. Pontos de Acoplamento e Riscos

### 4.1 Onde o auto-fill pode quebrar comportamento

| Ponto | Risco | Detalhe |
|-------|-------|---------|
| **Prescrição string→number** | O form armazena tudo como `string` (L112-119). Conversão para `Number()` no build do payload (L329-351). Um auto-fill que sete valores numéricos diretamente pode bypassar a representação string e causar campos vazios no form enquanto o payload tem valor. | `PedidoFornecedorPage.tsx` |
| **DE/PARA override** | Se o DE/PARA encontra match (L207-221), pula o match inteligente inteiramente. Um auto-fill que dependa do match inteligente (ex: pré-selecionar família) será ignorado se houver DE/PARA salvo. | `PedidoFornecedorPage.tsx` |
| **useEffect cascata** | A seleção do produto depende de 3 useEffects encadeados: (1) OS load → (2) matching → (3) product resolution via `findExactProduct`. Qualquer auto-fill que quebre a sequência (ex: setar `selectedGroup` antes de `matchResult`) causa estado inconsistente. | `PedidoFornecedorPage.tsx` L130-280 |
| **Prisma vertical sempre null** | `mapPrismasFromOs` retorna `odPrismaV: null` e `oePrismaV: null` (L176-180). Se o ERP passar a enviar prisma vertical, o campo ficará null no payload. | `hoyaValidationService.ts` L176-180 |
| **Cooldown de 3s** | Botão desabilitado 3s após clique (L312). Um auto-submit ou retry rápido pode colidir com o cooldown. | `PedidoFornecedorPage.tsx` L302-305 |
| **Campos complementares reset** | `setCamposComplementaresValues({})` é chamado toda vez que o produto muda (L279). Um auto-fill que setar campos complementares antes do produto estabilizar perderá os valores. | `PedidoFornecedorPage.tsx` L278-279 |

### 4.2 Duplicidade de Responsabilidade

| Responsabilidade | UI (`PedidoFornecedorPage`) | Service (`hoyaMatchingService`, `hoyaValidationService`) | Edge (`hoya-proxy`) |
|------------------|----|---------|------|
| **Validação de campos obrigatórios** | Chama `validateHoyaPayload` e bloqueia submit se invalid (L380-396) | Contém todas as regras (L55-135) | Não valida campos — confia no frontend |
| **Parsing de prisma** | Exibe form editável com valores parsed | `mapPrismasFromOs` faz parsing de string → valor + base (L140-183) | Não faz parsing — recebe payload pronto |
| **Matching de produto** | Decide qual camada usar (DE/PARA vs match vs manual) e gerencia estado | `matchProducts` e `parseErpDescription` fazem o scoring | Não participa — recebe `codigoProduto` final |
| **Idempotência** | Cooldown 3s no botão | Não participa | Hash SHA-256 do payload + verificação em `pedidos_fornecedor` |
| **Salvamento DE/PARA** | Faz upsert após envio bem-sucedido (L414-423) | Não participa | Não participa |
| **Auditoria** | Não participa | Não participa | INSERT em `pedidos_fornecedor` (L583-597) |

### 4.3 Dados não enviados (oportunidades de auto-fill)

Campos presentes no `HoyaPedidoPayload` mas que **nunca são preenchidos** hoje:

- `codigoCliente` — existe no payload type, nunca setado
- `voucher` — existe no payload type, nunca setado
- `armacao.marca/modelo/cor` — existe no payload type, nunca setado
- `armacao.formaArmacao` — existe no payload type, nunca setado
- `garantia.nomeMedico/crmMedico` — existe no payload type, nunca setado
- `prescricao.*.dnpPerto` — hardcoded `null`
- `dadosMedida.distanciaLeitura` — hardcoded `null`

### 4.4 Cadeia de Dados: OS Hub → Payload

```
Firebird Bridge (/os/hub-receitas)
    ↓  OsHubRaw (snake_case, ~160 campos)
mapRawToRecord (osHubService.ts L279-388)
    ↓  OsHubRecord (camelCase, ~55 campos)
    ↓  coalesce: OS fields → ocrl fields → cliente fields
PedidoFornecedorPage useEffect (L130-178)
    ↓  Popula states: prescOd/Oe (strings), armacao (strings)
    ↓  mapPrismasFromOs(os) → prisma strings parsed
handleEnviarPedido (L297-439)
    ↓  Number() conversions → HoyaPedidoPayload object
callHoyaProxy("criar-pedido") → hoyaService.ts L192-202
    ↓  supabase.functions.invoke("hoya-proxy", body)
hoya-proxy Edge Function (L238-283)
    ↓  Idempotency check → fetchWithRetry POST → audit INSERT
    ↓  Response → HoyaPedidoResponse
```

---

## 5. Arquivos Envolvidos (Inventário)

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/pages/PedidoFornecedorPage.tsx` (1073 linhas) | UI completa: load OS, load catálogo, match, form, validação, submit, pós-envio |
| `src/services/hoyaService.ts` | Types + wrappers para Edge Function (callHoyaProxy) |
| `src/services/hoyaMatchingService.ts` (494 linhas) | Parser ERP, scoring, agrupamento, findExactProduct, detectSupplier |
| `src/services/hoyaValidationService.ts` (183 linhas) | validateHoyaPayload, mapPrismasFromOs |
| `src/services/osHubService.ts` (692 linhas) | Fetch OS do Firebird, mapRawToRecord, cache Supabase |
| `supabase/functions/hoya-proxy/index.ts` (631 linhas) | Gateway Hoya: auth, cache, idempotência, fetchWithRetry, audit |
| **Tabela `pedidos_fornecedor`** | Auditoria de envios (cod_os, payload, response, idempotency_key) |
| **Tabela `fornecedor_produto_depara`** | Mapeamento persistente descrição ERP → código Hoya |
| **Tabela `hoya_catalogo_cache`** | Cache 24h do catálogo de produtos Hoya |
| **Tabela `pedido_status_history`** | Timeline de mudanças de status (pós-envio) |

---

*Documento gerado automaticamente a partir da análise estática do código-fonte. Nenhuma implementação proposta.*
