

# Reconhecimento Automático de Produtos — Implementado

## Regras de Negócio Mapeadas

### Mapeamento ERP → Hoya
| ERP | Hoya |
|-----|------|
| PR, PROG | tipoLente: "Visao Progressiva" |
| MONO, SV | tipoLente: "Visao Simples" |
| ARGOS | desenho: "Argos" |
| 1.50 | material: "150" |
| 1.53 | material: "TVX" (Trivex) |
| 1.60 | material: "160" |
| 1.67 | material: "167" |
| LONG | tratamento: "HV LongLife" |
| LONGBLUE | tratamento: "HV LL Bluecontrol" (COR) |
| INC (sufixo) | tratamento: "HV HARD Anti-Risco" |
| NORISK | tratamento: "NoRisk" |
| CLEANEXTRA | tratamento: "CleanExtra" |
| SENSITY ORIGINAL | fotossensivel (código separado) |
| SENSITY 2 | fotossensivel (código separado) |
| CZ | Sensity cor cinza |
| DMAX, DNZ | Fornecedor "Própria" (não gera pedido) |

### Altura
- A altura (14, 18, etc.) é um campo de seleção obrigatório
- O sistema mostra todas as alturas disponíveis para o produto matched
- Exemplo: Argos tem versões com 14mm e 18mm

### Tags de Fornecedor no Monitor
- HOYA → Badge laranja
- ZEISS → Badge azul
- ESSILOR → Badge roxo
- DMAX/DNZ → Badge cinza "Própria"
- Detectado via palavras-chave na descrição da lente (lenteOdDescricao/lenteOeDescricao)

## Arquitetura

### Arquivos criados/modificados
- `src/services/hoyaMatchingService.ts` — Parser de descrição ERP, scoring, grouping, supplier detection
- `src/pages/PedidoFornecedorPage.tsx` — Auto-load catálogo, matching inteligente, seleção de altura/tratamento/fotossensível/coloração
- `src/components/os-hub/OsHubListPage.tsx` — Coluna "Fornecedor" com badges coloridos

### Fluxo de Matching (3 camadas)
1. **DE/PARA** — Consulta `fornecedor_produto_depara` para mapeamento existente
2. **Match Inteligente** — Parser + scoring por desenho/material/tratamento/fotossensível + filtro por prescrição
3. **Busca Manual** — Catálogo completo com busca textual (fallback)
