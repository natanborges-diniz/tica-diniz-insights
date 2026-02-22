# INFOCO System Design — Overlays & Action Bar

## Componentes

| Componente | Arquivo | Propósito |
|---|---|---|
| `ActionBar` | `src/components/system/ActionBar.tsx` | Barra sticky no rodapé para Salvar/Descartar |
| `BaseSheet` | `src/components/system/BaseSheet.tsx` | Drawer lateral padronizado (header fixo, body scroll, footer) |
| `BaseDialog` | `src/components/system/BaseDialog.tsx` | Modal central padronizado (header fixo, body scroll, footer) |
| `useDirtyGuard` | `src/components/system/dirty/useDirtyGuard.ts` | Hook para dirty state + proteção ao fechar |

---

## Regras de Uso

### Quando usar cada overlay

| Situação | Componente | Size |
|---|---|---|
| Detalhe de item (leitura + edição leve) | `BaseSheet` | `default` |
| Detalhe complexo ou com tabela interna | `BaseSheet` | `wide` |
| Formulário de criação/edição curto | `BaseDialog` | `sm` |
| Formulário com muitos campos ou preview | `BaseDialog` | `md` |
| Confirmação destrutiva | `AlertDialog` (shadcn direto) | — |
| Formulário que edita inline em tela | `ActionBar` (sticky na tela) | — |

### ActionBar

- **Visível** apenas quando `isDirty === true`
- **Estados**: `idle` → `loading` → `success` (auto-hide após 2s)
- Sempre sticky no `bottom: 0` do container
- Botão primário à direita, cancelar à esquerda do primário
- Usa tokens: `bg-background`, `border-t`, `text-success` para feedback

### BaseSheet

- Header fixo com título + descrição opcional
- Body com `overflow-y-auto` (scroll interno)
- Footer opcional fixo no bottom (para botões de ação)
- Sizes: `default` (max-w-md), `wide` (max-w-2xl)

### BaseDialog

- `max-h-[80vh]` para nunca ultrapassar viewport
- Header fixo com título + descrição
- Body com scroll interno
- Footer fixo no bottom
- Sizes: `sm` (max-w-md), `md` (max-w-2xl)

### DirtyGuard

```tsx
const { isDirty, setDirty, setClean, guardClose } = useDirtyGuard();

// Em inputs:
<Input onChange={(e) => { setValue(e.target.value); setDirty(); }} />

// Em overlays:
<BaseSheet
  open={open}
  onOpenChange={(o) => { if (guardClose(o)) setOpen(o); }}
  ...
/>

// Após salvar:
await save();
setClean();
```

- Intercepta `beforeunload` (refresh/fechar aba)
- `guardClose()` usa `window.confirm()` para overlays
- Chamar `setClean()` após salvar com sucesso

---

## Anti-patterns

| ❌ Não faça | ✅ Faça |
|---|---|
| Dialog sem max-height | Use `BaseDialog` (já tem 80vh) |
| Sheet sem scroll no body | Use `BaseSheet` (body tem overflow-y-auto) |
| Botão Salvar no topo da página | Use `ActionBar` sticky no bottom |
| Fechar overlay com dirty sem confirmar | Use `useDirtyGuard` + `guardClose` |
| Dialog dentro de Dialog | Use Sheet → Dialog ou repensar o fluxo |

---

## Playground

Página de teste: `src/pages/_SystemPlayground.tsx` (rota: `/dev/playground`)

Disponível apenas em desenvolvimento para validar componentes visuais.
