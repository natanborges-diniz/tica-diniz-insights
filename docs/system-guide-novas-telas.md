# Como construir telas novas — INFOCO System Design

> Guia rápido para qualquer dev criar telas consistentes sem copiar/colar.

---

## 1. Regras Obrigatórias

### ❌ PROIBIDO

| O que | Exemplo proibido | Usar no lugar |
|---|---|---|
| Cores Tailwind nativas em componentes | `text-emerald-600`, `bg-amber-50` | `text-success`, `bg-warning-soft` |
| `<Dialog>` / `<Sheet>` direto em páginas | `import { Dialog } from "@/components/ui/dialog"` | `import { BaseDialog } from "@/components/system/BaseDialog"` |
| Botão "Salvar" inline em cards/seções | `<Button onClick={save}>Salvar</Button>` dentro de card | `<ActionBar onSave={save} />` no footer/página |
| Fechar overlay com alterações sem confirmar | `onOpenChange(false)` direto | `useDirtyGuard().guardClose()` |

### ✅ OBRIGATÓRIO

- **Tokens semânticos** para todas as cores (ver `docs/system-design-infoco.md`)
- **BaseDialog** para modais (sm/md), **BaseSheet** para gavetas laterais (default/wide)
- **ActionBar** para qualquer fluxo de salvar/editar
- **useDirtyGuard** em qualquer tela com campos editáveis
- **A11Y básico**: labels em inputs, foco no primeiro campo, ESC fecha overlays

---

## 2. Criando um Dialog (modal)

```tsx
import { BaseDialog } from "@/components/system/BaseDialog";

<BaseDialog
  open={open}
  onOpenChange={setOpen}
  title="Título do Dialog"
  description="Descrição acessível"
  size="sm" // ou "md"
  footer={
    <>
      <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
      <Button onClick={handleSave} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Confirmar
      </Button>
    </>
  }
>
  {/* Conteúdo com scroll automático */}
  <div className="space-y-4">
    <Input autoFocus label="Campo" />
  </div>
</BaseDialog>
```

---

## 3. Criando um Sheet (gaveta lateral)

```tsx
import { BaseSheet } from "@/components/system/BaseSheet";

<BaseSheet
  open={open}
  onOpenChange={(v) => { if (guardClose(v)) setOpen(v); }}
  title="Editar Registro"
  subtitle="Contexto adicional"
  size="wide" // ou "default"
  headerExtra={<Badge className="bg-success-soft text-success">Ativo</Badge>}
  footer={
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={handleClose}>Fechar</Button>
      <Button onClick={handleSave}>Salvar</Button>
    </div>
  }
>
  {/* Seções do body */}
  <section>
    <h3 className="text-sm font-semibold mb-3">Dados Gerais</h3>
    <div className="grid grid-cols-2 gap-4">...</div>
  </section>
</BaseSheet>
```

---

## 4. Usando ActionBar + DirtyGuard

```tsx
import { ActionBar } from "@/components/system/ActionBar";
import { useDirtyGuard } from "@/components/system/dirty/useDirtyGuard";

function MinhaTelaEditavel() {
  const { isDirty, setDirty, setClean, guardClose } = useDirtyGuard();
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");

  const handleSave = async () => {
    setStatus("loading");
    await salvar();
    setStatus("success");
    setClean();
  };

  return (
    <>
      {/* ...conteúdo... */}
      <ActionBar
        visible={isDirty}
        status={status}
        onSave={handleSave}
        onCancel={() => { setClean(); }}
      />
    </>
  );
}
```

---

## 5. Tokens de Cor — Referência Rápida

| Significado | Token | Exemplo |
|---|---|---|
| Positivo, lucro, concluído | `success` | `text-success`, `bg-success-soft` |
| Alerta, pendência | `warning` | `text-warning`, `bg-warning-soft` |
| Erro, atraso, perda | `danger` | `text-danger`, `bg-danger-soft` |
| Informativo, loading | `info` | `text-info`, `bg-info-soft` |
| Marca/brand | `brand` | `text-brand`, `bg-brand-soft` |
| Gráficos (séries 1-8) | `chart-N` | `text-chart-1`, `bg-chart-4` |
| Neutro (escala cinza) | `neutral-N` | `text-neutral-400`, `bg-neutral-100` |

> Documentação completa: `docs/system-design-infoco.md`

---

## 6. Checklist DoD de UI (por PR)

- [ ] Zero cores Tailwind nativas (`grep -r "text-emerald\|text-amber\|bg-green" src/`)
- [ ] Overlays usam `BaseDialog` ou `BaseSheet` (nunca `Dialog`/`Sheet` direto)
- [ ] Fluxos de edição usam `ActionBar` (botão "Salvar" nunca inline)
- [ ] `useDirtyGuard` em telas com alterações pendentes
- [ ] A11Y: labels em inputs, `autoFocus` no primeiro campo de dialogs
- [ ] A11Y: `aria-sort` em colunas ordenáveis de tabelas
- [ ] Contraste validado em light e dark mode
- [ ] Footer de overlays tem "Cancelar" + ação primária

---

## 7. Estrutura de Arquivos

```
src/components/
├── system/
│   ├── ActionBar.tsx          # Barra de ações sticky
│   ├── BaseDialog.tsx         # Modal padronizado
│   ├── BaseSheet.tsx          # Gaveta lateral padronizada
│   └── dirty/
│       └── useDirtyGuard.ts   # Hook de dirty state
├── ui/                        # shadcn primitivos (NÃO usar direto em páginas)
│   ├── dialog.tsx             # ⛔ Use BaseDialog
│   ├── sheet.tsx              # ⛔ Use BaseSheet
│   └── ...
```
