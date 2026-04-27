
Objetivo: colocar a integração da REDE em condição real de ativação para Gestão de Vendas, alinhando o sistema ao retorno da REDE: credenciais já emitidas para o CNPJ matriz, acesso consolidado por PV Matriz e exigência de Opt-in prévio em Gestão de Acessos.

Situação atual do sistema
- Já existe base pronta para ativação:
  - tela administrativa em `src/pages/AdminAdquirentesPage.tsx`
  - credenciais por ambiente em `adquirentes_config`
  - Edge Function `supabase/functions/rede-gestao-vendas/index.ts`
  - sincronização consolidada em `supabase/functions/sync-vendas-cartao/index.ts`
- O sistema já suporta o modelo operacional principal:
  - OAuth para Gestão de Vendas via secrets já configurados
  - consulta consolidada por `parentCompanyNumber` (PV Matriz)
  - mapeamento do `merchant.companyNumber` da REDE para `cod_empresa`
- Gap atual:
  - não há fluxo operacional de Opt-in dentro do sistema
  - não há status explícito de “credencial pronta” vs “produção liberada”
  - `rede-gestao-vendas` ainda envia `subsidiaries` por padrão, o que precisa ser ajustado conforme a regra documentada

Plano de adequação

1. Ajustar a Edge Function de Gestão de Vendas
- Atualizar `supabase/functions/rede-gestao-vendas/index.ts` para refletir a regra oficial:
  - omitir `subsidiaries` no sandbox
  - permitir `subsidiaries` apenas quando realmente necessário
  - melhorar mensagens de erro para diferenciar:
    - credencial inválida
    - Opt-in ainda não solicitado
    - solicitação enviada, mas sem aceite no portal
    - integração ativa
- Manter `parentCompanyNumber` como identificador central do grupo.

2. Formalizar o fluxo de ativação na tela administrativa
- Evoluir `src/pages/AdminAdquirentesPage.tsx` para incluir um bloco “Ativação Gestão de Vendas”.
- Exibir checklist operacional por ambiente:
  - credenciais cadastradas
  - PV Matriz preenchido
  - ambiente selecionado
  - Opt-in solicitado
  - aceite concluído no portal
  - teste de conectividade aprovado
- Deixar claro no UI quando a integração está:
  - configurada
  - aguardando aceite
  - pronta para uso

3. Adicionar suporte operacional ao Opt-in
- Criar uma nova Edge Function dedicada ao fluxo de Gestão de Acessos, por exemplo `rede-gestao-acessos`.
- Implementar ações iniciais:
  - solicitar Opt-in
  - consultar status da solicitação, se a API permitir
- Caso a API não devolva um status suficiente, salvar internamente:
  - data da solicitação
  - referência da tentativa
  - instrução operacional para aceite manual no portal

4. Persistir o status da ativação
- Estender `adquirentes_config` ou criar tabela auxiliar para guardar o estado operacional da ativação.
- Campos recomendados:
  - `gv_optin_requested_at`
  - `gv_optin_status`
  - `gv_optin_reference`
  - `gv_approved_at`
  - `gv_last_healthcheck_at`
  - `gv_last_healthcheck_status`
- Isso permite rastreabilidade e evita controle manual fora do sistema.

5. Ajustar a experiência de teste no admin
- Separar ações de validação em `AdminAdquirentesPage`:
  - teste e.Rede
  - teste Gestão de Vendas
  - solicitar Opt-in
  - validar ativação
- O teste de Gestão de Vendas deve sinalizar claramente:
  - credenciais válidas
  - acesso aguardando aprovação
  - integração ativa e consumível

6. Revisar o cadastro produtivo por loja
- Confirmar no admin:
  - `pv_matriz_production`
  - `merchant_id_production` por loja
  - configs ativas por `cod_empresa`
- Garantir que todas as lojas produtivas tenham mapeamento suficiente para o `sync-vendas-cartao` converter o retorno da REDE em `cod_empresa`.

7. Validar a sincronização consolidada
- Ajustar `supabase/functions/sync-vendas-cartao/index.ts` apenas onde necessário para permanecer compatível com:
  - consulta por PV Matriz
  - paginação da API
  - mapeamento de `merchant.companyNumber`
- Preservar a lógica atual de deduplicação, criação de recebíveis e identificação de PVs sem mapeamento.

8. Fluxo operacional esperado após a entrega
- Admin cadastra ou revisa credenciais e PV Matriz.
- Admin dispara a solicitação de Opt-in pelo sistema.
- Sistema registra que a solicitação foi enviada e orienta o aceite no portal da REDE.
- Após o aceite, o teste de Gestão de Vendas passa a retornar sucesso.
- O sync consolidado passa a buscar vendas reais e distribuir por `cod_empresa`.

Arquivos a atualizar
- `src/pages/AdminAdquirentesPage.tsx`
- `supabase/functions/rede-gestao-vendas/index.ts`
- `supabase/functions/sync-vendas-cartao/index.ts`
- nova Edge Function para Gestão de Acessos
- migração para persistir status do Opt-in/ativação

Detalhes técnicos
- As secrets necessárias para Gestão de Vendas já existem no projeto.
- A principal lacuna atual é operacional: registrar e acompanhar o Opt-in antes do consumo produtivo.
- A arquitetura existente já está próxima do cenário final; o trabalho principal é refinar o backend e expor o fluxo certo no admin.
- O `sync-vendas-cartao` já está preparado para o modelo consolidado por matriz, então a ativação depende mais do status da autorização do que de redesign estrutural.

Entregável esperado
- Tela de Adquirentes refletindo o fluxo real de ativação da REDE.
- Sistema capaz de registrar e acompanhar o Opt-in.
- Testes administrativos mais claros para produção.
- Integração de Gestão de Vendas pronta para operar assim que o aceite for concluído no portal.
