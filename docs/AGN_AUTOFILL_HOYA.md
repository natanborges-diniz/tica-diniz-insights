# AGN AutoFill Hoya — Diagnóstico AS-IS

> Documento agnóstico que mapeia o estado atual dos dados, form state, matching e pontos de inserção  
> relevantes para o auto-preenchimento do pedido Hoya (`/os/pedido`).  
> **Nenhuma proposta de implementação.**

---

## 1. Inventário de Campos da Receita (`OsHubRecord`)

### 1.1 Campos USADOS hoje no form (`PedidoFornecedorPage.tsx`)

| Campo OsHubRecord | Mapeado para | Linha | Confiabilidade |
|---|---|---|---|
| `odLongeEsf` | `prescOd.esferico` | L141 | Alta — campo primário da OS |
| `odLongeCil` | `prescOd.cilindrico` | L142 | Alta |
| `odLongeEixo` | `prescOd.eixo` | L143 | Alta (quando cil ≠ 0) |
| `odAdicao` | `prescOd.adicao` | L144 | Alta para progressivas; null em monofocais |
| `odDnp` | `prescOd.dnpLonge` | L145 | Média — depende de cadastro; fallback via `od_dp` |
| `odAltura` | `prescOd.alturaPupilar` | L146 | Baixa — frequentemente null |
| `oeLongeEsf` | `prescOe.esferico` | L152 | Alta |
| `oeLongeCil` | `prescOe.cilindrico` | L153 | Alta |
| `oeLongeEixo` | `prescOe.eixo` | L154 | Alta (quando cil ≠ 0) |
| `oeAdicao` | `prescOe.adicao` | L155 | Alta para progressivas |
| `oeDnp` | `prescOe.dnpLonge` | L156 | Média |
| `oeAltura` | `prescOe.alturaPupilar` | L157 | Baixa |
| `prisma` | via `mapPrismasFromOs()` → `prescOd.prismaH/basePrismaH` | L139 | Baixa — formato string, parsing necessário |
| `prisma1` | via `mapPrismasFromOs()` → `prescOe.prismaH/basePrismaH` | L139 | Baixa |
| `caHorizontal` | `armacao.larguraLente` | L165 | Média — nem toda OS tem armação |
| `aaVertical` | `armacao.alturaLente` | L166 | Média |
| `ponte` | `armacao.ponteLente` | L167 | Média |
| `cliente` | `usuarioFinal` | L169 | Alta |
| `lenteOdDescricao` | entrada para matching (L203) | L203 | Alta — mas formato varia |
| `lenteOeDescricao` | fallback de matching (L203) | L203 | Alta — geralmente igual OD |
| `codOs` / `numeroOs` | `payload.os` | L315 | Alta |
| `codEmpresa` | param do `criarPedidoHoya()` | L398 | Alta |

### 1.2 Campos DISPONÍVEIS mas NÃO usados

| Campo OsHubRecord | Potencial para AutoFill | Confiabilidade |
|---|---|---|
| `odPertoEsf` / `odPertoCil` / `odPertoEixo` | Nenhum uso direto no payload Hoya | Média |
| `oePertoEsf` / `oePertoCil` / `oePertoEixo` | Idem | Média |
| `dp` (DP total) | Poderia derivar DNP se OD/OE individuais faltam | Média |
| `pertoDp` | Campo `dnpPerto` do payload (hoje sempre `null`) | Baixa |
| `distanciaLeitura` | Campo `dadosMedida.distanciaLeitura` (hoje `null` hardcoded L362) | Baixa |
| `distanciaProgressao` | Não mapeado no payload Hoya | Baixa |
| `distanciaVertice` | Não mapeado no payload Hoya | Baixa |
| `diametro` | Não mapeado no payload Hoya | Média |
| `ta` / `md` / `he` / `st` | Medidas de armação extendidas — não usadas | Baixa |
| `prismaAngulo` / `prismaEixo` | Prisma por ângulo (não por base H/V) — incompatível com formato Hoya | Baixa |
| `prisma1Angulo` / `prisma1Eixo` | Idem | Baixa |
| `observacaoOs` | Poderia pre-popular `observacao` do payload | Alta |
| `observacaoLente` | Idem ou complementar | Média |
| `observacaoReceita` | Idem | Média |
| `vendedor` | Não mapeado | Alta |
| `usuario` | Não mapeado (solicitante) | Alta |
| `imagemReceita` / `imagemArmacao` / `imagemTracer` | Exibição apenas, sem uso no payload | N/A |

### 1.3 Hierarquia de fallback (implementada em `osHubService.ts` L279-387)

```
OS fields (osl.*) → receita_lente_cliente (ocrl_*) → cadastro cliente (cliente_*)
```

A função `coalesce()` (L268-277) prioriza o primeiro valor não-null/não-zero, com tratamento especial para `0` como valor válido.

---

## 2. Diagnóstico do Form State

### 2.1 Tipos de state

| State | Tipo interno | Conversão no payload |
|---|---|---|
| `prescOd.esferico` | `string` | `Number()` em L329 — string vazia → `NaN` → tratado como `null` via ternário |
| `prescOd.cilindrico` | `string` | `Number()` em L330 |
| `prescOd.eixo` | `string` | `Number()` em L331 |
| `prescOd.adicao` | `string` | `Number()` em L332 |
| `prescOd.dnpLonge` | `string` | `Number()` em L337 |
| `prescOd.alturaPupilar` | `string` | `Number()` em L339 |
| `prescOd.prismaH` | `string` | `Number()` em L333 |
| `prescOd.basePrismaH` | `string` | passado direto em L334 |
| `prescOd.prismaV` | `string` | `Number()` em L335 |
| `prescOd.basePrismaV` | `string` | passado direto em L336 |
| `prescOe.*` | `string` (idem) | mesma lógica L341-351 |
| `armacao.larguraLente` | `string` | `Number()` em L358 |
| `armacao.alturaLente` | `string` | `Number()` em L359 |
| `armacao.ponteLente` | `string` | `Number()` em L360 |
| `tipoServico` | `number` (init: `4`) | direto em L319 |
| `tipoArmacao` | `number` (init: `1`) | direto em L364 |
| `observacao` | `string` | direto em L317 |
| `usuarioFinal` | `string` | direto em L368 |
| `selectedAltura` | `string` (codigoAltura stringificado) | `Number()` em L265 |
| `selectedTratamento` | `string` (formato `"codTrat_boolCor"`) | `split("_")` → `Number()` / `=== "true"` em L261-263 |
| `selectedFotossensivel` | `string` (`"none"` ou código) | `Number()` em L266 |
| `selectedColoracao` | `string` (`"none"` ou código) | direto em L320 |
| `camposComplementaresValues` | `Record<number, string>` | direto em L373-376 |

### 2.2 Padrão de conversão string → number

Todos os campos de prescrição usam o padrão:
```ts
prescOd.esferico ? Number(prescOd.esferico) : null
```

**Risco:** Se o auto-fill setar o valor como `number` diretamente no state (em vez de `string`), o ternário `prescOd.esferico ? ...` retornará `true` para `0`, mas o `Number("0")` funciona corretamente. O risco real é se o auto-fill usar `0` como number em um state declarado como string — o `<Input>` renderizará `"0"` corretamente via `String()` implícito, mas TypeScript marcará type mismatch.

### 2.3 Pontos onde AutoFill pode quebrar binding visual

1. **Inputs controlados (`<Input value={prescOd.esferico}>`):** Se o auto-fill setar o state antes do render, o Input refletirá o valor. Sem risco direto.

2. **Selects controlados (`<Select value={selectedAltura}>`):** O valor deve ser uma string que exista nas options. Se o auto-fill setar um `codigoAltura` que não existe no `selectedGroup.alturasDisponiveis`, o Select ficará vazio/inconsistente.

3. **useEffect cascata (L259-280):** O efeito que resolve `findExactProduct` depende de `[selectedGroup, selectedAltura, selectedTratamento, selectedFotossensivel]`. Se o auto-fill setar esses 4 valores simultaneamente via `setState` batch, o React pode disparar o efeito uma única vez (batch) ou múltiplas vezes dependendo do contexto (event handler vs setTimeout). **Risco de corrida.**

4. **Reset de `camposComplementaresValues` (L279):** Sempre que `selectedGroup`, `selectedAltura`, `selectedTratamento` ou `selectedFotossensivel` mudam, o `setCamposComplementaresValues({})` é chamado. Se o auto-fill preencher campos complementares ANTES de setar produto, eles serão resetados.

---

## 3. Diagnóstico das Descrições de Lente

### 3.1 Formato das descrições no ERP (campo `lenteOdDescricao` / `lenteOeDescricao`)

Exemplos típicos (baseados na análise do parser em `hoyaMatchingService.ts`):

| Padrão ERP | Tokens detectados |
|---|---|
| `"HOYA PR ARGOS 1.67 LONG"` | fornecedor=HOYA, tipo=progressiva, desenho=Argos, material=167, tratamento=HV LongLife |
| `"HOYA MONO NULUX 1.60 INC"` | fornecedor=HOYA, tipo=monofocal, desenho=Nulux, material=160, tratamento=HV HARD Anti-Risco |
| `"HOYA PR ID MYSTYLE 1.74 LONGBLUE SENSITY 2 CZ"` | fornecedor=HOYA, tipo=progressiva, desenho=iD MyStyle, material=174, tratamento=HV LL Bluecontrol, foto=Sensity 2, cor=CZ |
| `"ZEISS PR 1.67 DURAVISION"` | fornecedor=ZEISS — **não processável pelo match Hoya** |
| `"LG DMAX PR 1.56 INC"` | fornecedor=PROPRIA — **não processável pelo match Hoya** |
| `"HOYA PR SUMMIT 1.50 NORISK"` | fornecedor=HOYA, tipo=progressiva, desenho=Summit, material=150, tratamento=NoRisk |

### 3.2 Parsing atual (`parseErpDescription`, L97-193)

O parser extrai tokens por `split(/\s+/)` e `includes()`:

| Atributo | Método de detecção | Limitações |
|---|---|---|
| `tipoLente` | tokens: PR/PROG/PROGRESSIVA vs MONO/SV | Não detecta "bifocal" |
| `fornecedor` | keywords: HOYA/ZEISS/ESSILOR/VARILUX/DMAX/DNZ | Ordem fixa, primeiro match vence |
| `materialIndex` | substring: "1.50", "1.67" etc → mapa para "150", "167" | `"1.53"` → `"TVX"` (Trivex) |
| `desenho` | substring case-insensitive de `KNOWN_DESENHOS` | Lista fixa de 13 desenhos; novos desenhos não detectados |
| `tratamento` | combinação de keywords: LONG, INC, NORISK, BLUECONTROL | Detecção sequencial com prioridade LONGBLUE > INC > NORISK > LONG |
| `fotossensivel` | substring "SENSITY" + tipo (2/Original) + cor (CZ/MR/VD) | Default para "Original" se não especificado |

### 3.3 Comparação com catálogo Hoya (DescricaoCadunif)

O catálogo Hoya retorna produtos com campos estruturados (`desenho`, `material`, `tratamento`, `fotossensivel`), **não** uma string concatenada equivalente. A comparação é feita campo-a-campo pelo scoring engine, não por string similarity.

**Gap:** O parser ERP decompõe a string → atributos, e o scoring compara atributos contra campos do catálogo. Se a descrição ERP contiver variações não mapeadas (ex: "LIFESTYLE" vs "Lifestyle", "TRUEFORM" vs "TrueForm"), a detecção funciona porque usa `toUpperCase()`. Mas se o ERP usar abreviações não cadastradas (ex: "ARG" para "Argos"), não será detectado.

---

## 4. Diagnóstico do Match Atual

### 4.1 Consulta DE/PARA (`PedidoFornecedorPage.tsx` L206-221)

```
Chave exata: fornecedor = "HOYA" AND descricao_local = descricao (string completa)
```

- Tabela: `fornecedor_produto_depara`
- Retorno: `codigo_fornecedor` (codigoProduto do HoyaProduto)
- Se encontrado → `setProdutoSelecionado(match)` direto, **sem** passar pelo scoring
- Se não encontrado → cai no matching inteligente

**Risco para AutoFill:** O DE/PARA seta o `produtoSelecionado` diretamente sem popular `selectedGroup`, `selectedAltura`, `selectedTratamento`, `selectedFotossensivel`. Isso significa que:
- Os selects de Família/Altura/Tratamento/Foto ficam **vazios** na UI
- O `useEffect` de resolução (L259-280) **não é disparado** (porque `selectedGroup` é null)
- Campos complementares do produto não são carregados via reset

### 4.2 Scoring (`matchProducts`, `hoyaMatchingService.ts` L328-438)

**Fluxo:**
1. Filtro por prescrição (`isGrauCompativel`, L208-243) — remove produtos fora do range
2. Filtro por tipo de lente (progressiva/monofocal, L341-347)
3. Score individual por produto (`calcScore`, L245-326)
4. Agrupamento por `codigoDesenho_codigoMaterial` (L356-415)
5. Ordenação por score decrescente (L418-419)

**Pesos do scoring:**

| Critério | Pontuação | Condição |
|---|---|---|
| Desenho | +35 | `produto.desenho.toUpperCase().includes(parsed.desenho)` |
| Material | +25 | `produto.material === parsed.materialIndex` (igualdade exata) |
| Tratamento (exato) | +20 | `includes()` bidirecional |
| Tratamento (parcial) | +15 | via `TREATMENT_MAP` cross-reference |
| Fotossensível (presente) | +10 | `codigoFotossensivel != null` |
| Fotossensível (tipo) | +5 | tipo matching ("Original", "2") |
| Não-fotossensível match | +5 | ambos sem foto |
| Bluecontrol/COR | +5 | nome contém "COR" ou tratamento contém "bluecontrol" |
| Tipo lente | +5 | progressiva↔Visao Progressiva, monofocal↔Visao Simples |

**Score máximo teórico:** 100 (35+25+20+10+5+5)

**Não há limiar mínimo.** O top-1 é sempre selecionado, mesmo com score baixo.

**Desempate:** Ordem estável do `sort()` — em caso de empate, o primeiro produto inserido no array vence.

### 4.3 Resolução de produto exato (`findExactProduct`, L473-494)

```ts
findExactProduct(produtos, codigoDesenho, codigoMaterial, codigoAltura, codigoTratamento, codigoFotossensivel, isCor)
```

**Critérios (todos AND):**
1. `codigoDesenho` === (obrigatório)
2. `codigoMaterial` === (obrigatório)
3. `codigoAltura` === (se não null)
4. `codigoTratamento` === (obrigatório)
5. `codigoFotossensivel` === (se não null; se null, produto deve ter null)
6. `isCor` → nome contém " COR" (booleano)

**Retorna:** primeiro produto que atende todos os critérios, ou `null`.

### 4.4 Campos obrigatórios: UI vs Validação

| Campo | Obrigatório na UI | Obrigatório na Validação |
|---|---|---|
| `codigoProduto` | Sim (botão desabilitado sem produto) | Sim (`validateHoyaPayload` L69-71) |
| `os` (número) | Implícito (vem do URL param) | Sim (L64-66) |
| `Altura` (Select) | Visual (`*` no label, L635) | **Não** — validação não checa |
| `Tratamento` (Select) | Visual (`*` no label, L654) | **Não** — validação não checa (implícito via produto) |
| `Esférico/Cilíndrico OD` | Não indicado visualmente | Sim — ao menos um obrigatório (L28-34) |
| `Eixo OD` | Não indicado | Sim — se cilíndrico ≠ 0 (L36-42) |
| `DNP OD` | Não indicado | Sim (L44-50) |
| `Esférico/Cilíndrico OE` | Não indicado | Sim — ao menos um obrigatório |
| `Eixo OE` | Não indicado | Sim — se cilíndrico ≠ 0 |
| `DNP OE` | Não indicado | Sim |
| `Adição` | Não indicado | Warning (L78-84) |
| `Altura pupilar` | Não indicado | Warning (L87-93) |
| `Largura lente` | Não indicado | Warning (L96-98) |
| `Usuário final` | Não indicado | Warning (L101-103) |
| `Campos complementares` | Dinâmico (por produto) | Sim — se `obrigatorio: true` (L106-128) |

---

## 5. Pontos de Inserção do AutoFill

### 5.1 Auto-fill de dioptrias OD/OE

**Ponto atual:** `useEffect` em L130-178, disparado por `[codOs, codEmpresa]`.

**O que já faz:** Preenche `prescOd.*`, `prescOe.*`, `armacao.*`, `usuarioFinal` a partir da `OsHubRecord`.

**Conclusão:** Dioptrias **já são** auto-preenchidas. Não há lacuna aqui, exceto:
- `dnpPerto` → sempre `null` (L338, L350) — campo `pertoDp` disponível mas não usado
- `distanciaLeitura` → sempre `null` (L362) — campo `distanciaLeitura` disponível mas não usado
- Prismas verticais → sempre `null` (L335-336, L347-348) — não há fonte de dados separada

### 5.2 Auto-fill de produto principal (`codigoProduto`)

**Ponto atual:** `useEffect` em L201-256, disparado por `[os, produtos]`.

**Fluxo:**
1. Obtém `descricao` = `os.lenteOdDescricao || os.lenteOeDescricao`
2. Consulta DE/PARA → se HIT, `setProdutoSelecionado(match)` e **return** (sem scoring)
3. Se MISS → `matchProducts()` → `setMatchResult()` → `setSelectedGroup(bestGroup)`
4. Pre-selects: tratamento e fotossensível (L238-249)
5. **NÃO** pre-seleciona altura (L237 — ausente)
6. **NÃO** chama `setProdutoSelecionado` diretamente — depende do `useEffect` L259-280

**Melhor ponto para inserir AutoFill de produto:** Dentro do `useEffect` L201-256, após `setSelectedGroup(bestGroup)`, adicionando lógica para:
- Auto-selecionar altura (se única ou se parseable da descrição)
- Auto-selecionar tratamento (já parcialmente feito L238-245)
- Disparar resolução do produto exato

### 5.3 Riscos de corrida com useEffects

| useEffect | Deps | Risco |
|---|---|---|
| L130 (Load OS) | `[codOs, codEmpresa]` | Nenhum — executa uma vez |
| L181 (Load catálogo) | `[]` | Nenhum — executa uma vez |
| L201 (Matching) | `[os, produtos]` | **Médio** — depende de ambos states estarem prontos; `os` e `produtos` carregam em paralelo, o efeito só roda quando ambos estão disponíveis |
| L259 (Resolve exact) | `[selectedGroup, selectedAltura, selectedTratamento, selectedFotossensivel]` | **Alto** — se AutoFill setar esses 4 valores em sequência rápida, pode disparar múltiplas resoluções intermediárias com combinações parciais. Cada disparo reseta `camposComplementaresValues` (L279) |

**Ordem de execução esperada com AutoFill:**
```
1. OS carrega → prescOd/Oe populados
2. Catálogo carrega → produtos populados
3. Matching dispara (os+produtos prontos):
   a. DE/PARA HIT → produtoSelecionado direto (sem useEffect L259)
   b. DE/PARA MISS → matchResult → selectedGroup setado
      → AutoFill deveria setar: selectedAltura, selectedTratamento, selectedFotossensivel
      → useEffect L259 dispara → findExactProduct → setProdutoSelecionado
      → camposComplementaresValues resetados para {}
      → Se AutoFill preencheu campos complementares ANTES, serão perdidos
```

**Conclusão:** O auto-fill de campos complementares DEVE ocorrer APÓS a resolução do produto exato (L259-280 completo), nunca antes.

### 5.4 Fluxo DE/PARA: lacuna de estado

Quando o DE/PARA faz HIT (L215-219):
- `setProdutoSelecionado(match)` é chamado diretamente
- `selectedGroup` permanece `null`
- `selectedAltura`, `selectedTratamento`, `selectedFotossensivel` permanecem no valor default
- A seção "Match Inteligente" da UI **não é renderizada** (L569: `matchResult && matchResult.groups.length > 0`)
- O usuário **não pode** alterar altura/tratamento/foto sem primeiro abrir busca manual

**Risco para AutoFill:** Se o DE/PARA retorna um produto que precisa de campos complementares, eles serão renderizados (via `produtoSelecionado.camposComplementares`), mas sem o contexto de família/grupo para o usuário navegar alternativas.

---

## Apêndice A — Arquivos e Linhas de Referência

| Arquivo | Responsabilidade |
|---|---|
| `src/pages/PedidoFornecedorPage.tsx` (1073 linhas) | Form state, useEffects, payload assembly, UI |
| `src/services/hoyaMatchingService.ts` (494 linhas) | Parser ERP, scoring, grouping, findExactProduct |
| `src/services/hoyaValidationService.ts` (183 linhas) | Validação bloqueante/warning, prismas |
| `src/services/hoyaService.ts` (293 linhas) | Proxy calls, types (HoyaProduto, HoyaPedidoPayload) |
| `src/services/osHubService.ts` (692 linhas) | Fetch OS, coalesce, mapper raw→record |
| `supabase/functions/hoya-proxy/index.ts` | Gateway edge function |
| Tabela `fornecedor_produto_depara` | DE/PARA persistente (chave: fornecedor+descricao_local) |
| Tabela `pedidos_fornecedor` | Histórico + idempotência |
| Tabela `hoya_catalogo_cache` | Cache de catálogo 24h |

## Apêndice B — Campos do payload Hoya com origem

| Campo payload | Origem | Tipo final |
|---|---|---|
| `os` | `os.numeroOs \|\| os.codOs` → `String()` | string |
| `especificacoes.codigoProduto` | `produtoSelecionado.codigoProduto` | number |
| `especificacoes.tipoServico` | state `tipoServico` (default `4`) | number |
| `especificacoes.codigoColoracao` | state `selectedColoracao` | string \| null |
| `especificacoes.codigoDesenho` | `produtoSelecionado.codigoDesenho` | number |
| `especificacoes.codigoAltura` | `produtoSelecionado.codigoAltura` | number \| undefined |
| `especificacoes.codigoMaterial` | `produtoSelecionado.codigoMaterial` | number |
| `especificacoes.codigoTratamento` | `produtoSelecionado.codigoTratamento` | number |
| `especificacoes.codigoFotossensivel` | `produtoSelecionado.codigoFotossensivel` | number \| undefined |
| `prescricao.direito.*` | state `prescOd.*` → `Number()` | number \| null |
| `prescricao.esquerdo.*` | state `prescOe.*` → `Number()` | number \| null |
| `prescricao.afinamentoPrismatico` | derivado: `!!(prismaH \|\| prismaV)` | boolean |
| `prescricao.equilibrioLente` | hardcoded `false` | boolean |
| `dadosMedida.larguraLente` | state `armacao.larguraLente` → `Number()` | number \| undefined |
| `dadosMedida.alturaLente` | state `armacao.alturaLente` → `Number()` | number \| undefined |
| `dadosMedida.ponteLente` | state `armacao.ponteLente` → `Number()` | number \| undefined |
| `dadosMedida.distanciaLeitura` | hardcoded `null` | null |
| `armacao.tipoArmacao` | state `tipoArmacao` (default `1`) | number |
| `armacao.comPolimento` | hardcoded `false` | boolean |
| `garantia.usuarioFinal` | state `usuarioFinal` \|\| `os.cliente` | string |
| `garantia.inicialUsuario` | hardcoded `""` | string |
| `camposComplementares` | `camposComplementaresValues` (dinâmico por produto) | array \| undefined |
