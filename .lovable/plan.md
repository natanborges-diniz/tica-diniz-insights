## Situação

Bridge `/estoque/completo?empresa=13` voltou a responder normalmente (20s, 150 itens). O timeout anterior era transitório.

A `sync-estoque-loja` agora chega até o UPSERT mas falha com:
```
invalid input syntax for type integer: "0.6"
```
→ 1 batch com erro, 0 registros gravados, tabela `estoque_sincronizado` segue vazia.

## Causa

Pelo menos um item do Bridge tem campo numérico fracionário (`0.6`) sendo enviado para uma coluna `integer` da `estoque_sincronizado`. Candidatos mais prováveis: `quantidade_estoque`, `quantidade_minima`, `dias_sem_venda`, ou alguma coluna de contagem.

## Plano (build mode)

1. **Confirmar a coluna culpada**
   - Ler schema atual de `estoque_sincronizado` (tipos das colunas numéricas).
   - Re-rodar o Bridge para loja 13 e inspecionar quais campos contêm decimais.

2. **Corrigir no código da edge function `sync-estoque-loja`**
   - Aplicar `Math.round(...)` (ou `Math.floor` para dias) ao normalizar **antes** do UPSERT em todos os campos mapeados para `integer`. Não trocar tipo da coluna — quantidade fracionária em estoque é ruído do ERP, arredondar é o comportamento correto pra esse painel.
   - Tolerar `null`/`undefined` sem quebrar (`v == null ? null : Math.round(Number(v))`).

3. **Endurecer o tratamento de erro**
   - Hoje 1 batch ruim aborta tudo silenciosamente (`total_erros: 1`, sem detalhe pro chamador). Adicionar:
     - log do primeiro item problemático do batch (cod_sku + valores) pra diagnóstico futuro;
     - retornar `erro` populado no JSON quando `total_erros > 0` (não só `null`).

4. **Re-testar**
   - `POST /sync-estoque-loja?empresa=13` → esperar `ok:true`, `total_registros≈150`, `total_erros:0`.
   - `SELECT cod_empresa, COUNT(*), MAX(atualizado_em) FROM estoque_sincronizado WHERE cod_empresa=13`.
   - Se passar, rodar 1 outra loja pra confirmar antes de habilitar fan-out.

## Fora de escopo

- Arquitetura de fila (sugerida no stack-overflow): não é mais necessária — Bridge respondeu em 20s, dentro do orçamento síncrono. Mantém o desenho atual.
- Sync das outras 10 lojas: só depois de validar loja 13.
