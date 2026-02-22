# INFOCO Design System — Phase 0: Token Foundation

## Princípio

> **Nenhuma cor Tailwind nativa (emerald-500, amber-600, red-500…) deve ser usada em componentes.**
> Use apenas tokens semânticos definidos em `src/index.css` e mapeados em `tailwind.config.ts`.

---

## 1. Nomenclatura dos Tokens

| Grupo | Token CSS | Classe Tailwind | Propósito |
|---|---|---|---|
| **Brand** | `--brand` | `bg-brand`, `text-brand` | Cor institucional principal |
| | `--brand-foreground` | `text-brand-foreground` | Texto sobre brand |
| | `--brand-soft` | `bg-brand-soft` | Background sutil brand |
| | `--brand-hover` | `hover:bg-brand-hover` | Estado hover |
| **Neutral** | `--neutral-50..900` | `bg-neutral-50`, `text-neutral-700`… | Escala cinza temática |
| **Success** | `--success` | `text-success`, `bg-success` | Positivo, concluído, lucro |
| | `--success-soft` | `bg-success-soft` | Badge/alert background |
| | `--success-muted` | `text-success-muted` | Borda, ícone discreto |
| **Warning** | `--warning` | `text-warning`, `bg-warning` | Atenção, pendente, desconto alto |
| | `--warning-soft` | `bg-warning-soft` | Badge/alert background |
| | `--warning-muted` | `text-warning-muted` | Borda, ícone discreto |
| **Danger** | `--danger` | `text-danger`, `bg-danger` | Erro, atraso, ruptura |
| | `--danger-soft` | `bg-danger-soft` | Badge/alert background |
| | `--danger-muted` | `text-danger-muted` | Borda, ícone discreto |
| **Info** | `--info` | `text-info`, `bg-info` | Informativo, sincronizando |
| | `--info-soft` | `bg-info-soft` | Badge/alert background |
| | `--info-muted` | `text-info-muted` | Borda, ícone discreto |
| **Focus** | `--focus-ring` | `ring-focus` | Anel de foco acessibilidade |
| **DataViz** | `--chart-1..8` | `text-chart-1`, `bg-chart-1`… | Paleta de gráficos |

---

## 2. Tabela de Migração: Cores Hardcoded → Tokens

| Antes (hardcoded) | Depois (token) | Uso típico |
|---|---|---|
| `text-emerald-600`, `text-green-500` | `text-success` | Valor positivo, lucro |
| `bg-emerald-50`, `bg-green-500/10` | `bg-success-soft` | Badge, alert success |
| `border-emerald-500` | `border-success` | Card success |
| `text-amber-600`, `text-yellow-500` | `text-warning` | Alerta, pendência |
| `bg-amber-50`, `bg-yellow-500/10` | `bg-warning-soft` | Badge, alert warning |
| `border-amber-500`, `border-yellow-500` | `border-warning` | Card warning |
| `text-red-500`, `text-red-600` | `text-danger` | Erro, atraso, negativo |
| `bg-red-50`, `bg-red-500/10` | `bg-danger-soft` | Badge, alert danger |
| `border-red-500` | `border-danger` | Card danger |
| `text-blue-500`, `text-indigo-600` | `text-info` | Informativo, loading |
| `bg-blue-50`, `bg-blue-500/10` | `bg-info-soft` | Badge, alert info |
| `text-purple-600` | `text-chart-4` | DataViz (série 4) |
| `text-orange-600` | `text-chart-8` | DataViz (série 8) |
| `text-teal-700` | `text-chart-6` | DataViz (série 6) |
| `text-gray-400` | `text-neutral-400` | Texto desabilitado |
| `bg-slate-500/10` | `bg-neutral-100` | Background neutro |

---

## 3. Regras de Uso

### ✅ Faça
```tsx
// Ícone de status positivo
<CheckCircle className="h-4 w-4 text-success" />

// Alert de aviso
<Alert className="border-warning bg-warning-soft">

// Badge de erro
<Badge className="bg-danger-soft text-danger">Atrasado</Badge>

// Gráfico (cores sequenciais)
const COLORS = [
  'hsl(var(--chart-1))', 'hsl(var(--chart-2))',
  'hsl(var(--chart-3))', 'hsl(var(--chart-4))',
];
```

### ❌ Não faça
```tsx
// PROIBIDO: cores Tailwind nativas
<span className="text-emerald-600">...</span>
<div className="bg-amber-50">...</div>
<Card className="border-green-500/30">...</Card>
```

---

## 4. Variantes de Cada Token

Cada token semântico possui **5 variantes**:

| Variante | Sufixo | Exemplo | Quando usar |
|---|---|---|---|
| **DEFAULT** | (nenhum) | `text-success` | Texto, ícone principal |
| **foreground** | `-foreground` | `text-success-foreground` | Texto sobre bg-success |
| **soft** | `-soft` | `bg-success-soft` | Background de badge/alert |
| **muted** | `-muted` | `border-success-muted` | Borda sutil, ícone discreto |
| **hover** | `-hover` | `hover:bg-success-hover` | Estado hover |

---

## 5. DataViz (chart-1 a chart-8)

Paleta fixa de 8 cores para gráficos. Usar em ordem sequencial:

| Token | Light HSL | Papel sugerido |
|---|---|---|
| `chart-1` | 220 70% 50% (azul brand) | Série principal |
| `chart-2` | 152 60% 40% (verde) | Série secundária |
| `chart-3` | 38 92% 50% (amber) | Série terciária |
| `chart-4` | 280 60% 55% (roxo) | Série 4 |
| `chart-5` | 0 72% 51% (vermelho) | Série 5 |
| `chart-6` | 190 80% 42% (teal) | Série 6 |
| `chart-7` | 340 65% 55% (rosa) | Série 7 |
| `chart-8` | 30 80% 55% (laranja) | Série 8 |

---

## Status

- [x] **Phase 0**: Tokens definidos em `index.css` + `tailwind.config.ts`
- [x] **Phase 1**: Migrar componentes P0 (SalesKPICards, VendasDiariasTable, FinanceiroKPICards, OsKpiCards, AdminSyncPage)
- [x] **Phase 1b**: Migrar componentes P1 (OtbKPICards, OtbPainelAcoes)
- [ ] **Phase 2**: Migrar componentes P2 (charts, tabelas restantes, inteligência)
- [ ] **Phase 3**: Remover safelist de cores nativas
