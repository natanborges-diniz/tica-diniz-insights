

## Explicação: PV Matriz vs PV Filiação

**PV (Ponto de Venda) de Filiação** = número único que a Rede atribui a **cada loja/CNPJ**. É o identificador individual da filial na rede de adquirência. Cada loja tem o seu.

**PV Matriz** = número especial que representa o **grupo/rede de lojas**. A API Gestão de Vendas usa esse PV como `parentCompanyNumber` para consultar todas as transações de todas as filiais de uma vez só. Só precisa existir **em uma** das configurações.

```text
PV Matriz (13381369) ── consulta consolidada de todo o grupo
  ├── PV Filiação Loja 1 (104171855) ── DINIZ PRIMITIVA I
  ├── PV Filiação Loja 2 (???) ── DINIZ PRIMITIVA II
  ├── PV Filiação Loja 4 (???) ── DINIZ CARAPICUIBA
  └── ...cada loja tem seu PV próprio
```

**Chave de Integração** → sim, é a **mesma** para todo o grupo. Todas as filiais compartilham a mesma chave `06689b236fef432d9104e6754865a72b`.

**Então o que falta?** → Criar os registros para as demais lojas, preenchendo automaticamente a chave de integração (compartilhada) e deixando apenas o **PV de Filiação** para você atualizar.

---

## Plano: Criar registros Rede para todas as lojas

### Situação atual
- **cod_empresa 1** (DINIZ PRIMITIVA I) — configurado com PV `104171855`, chave, PV Matriz `13381369` ✅
- **cod_empresa 4** (DINIZ CARAPICUIBA) — registro sandbox apenas, sem chave de produção ⚠️
- **Demais 9 lojas** — sem registro na tabela `adquirentes_config`

### O que será feito

**1. Migração SQL** — Inserir registros para todas as lojas ativas que ainda não possuem configuração Rede

Para cada loja será criado um registro com:
- `adquirente = 'REDE'`, `ambiente = 'production'`, `ativo = true`
- `integration_key_production` e `integration_key_encrypted` = `06689b236fef432d9104e6754865a72b` (chave compartilhada do grupo)
- `merchant_id_production` = `'PENDENTE'` (placeholder para você substituir pelo PV real)
- `pv_matriz_production` = `13381369` apenas no registro da empresa 1 (já existente)

Lojas a criar: cod_empresa 2, 6, 9, 13, 14, 15, 16, 17, 18
Atualizar: cod_empresa 4 (adicionar chave de produção)

**2. UI — Indicação visual na tela de Adquirentes**

- Na lista, lojas com PV = `'PENDENTE'` mostrarão badge amarelo "⚠ PV Pendente"
- Facilita identificar quais lojas ainda precisam do PV de filiação real

### O que você precisa fazer depois
Apenas acessar `/admin/adquirentes`, abrir cada loja e substituir `PENDENTE` pelo PV de filiação real fornecido pela Rede.

### Arquivos a modificar

| Arquivo | Alteração |
|---|---|
| Migração SQL | INSERT das 9 lojas + UPDATE da empresa 4 |
| `src/pages/AdminAdquirentesPage.tsx` | Badge "PV Pendente" para merchant_id = 'PENDENTE' |

