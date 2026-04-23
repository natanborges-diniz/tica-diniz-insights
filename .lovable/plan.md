
Objetivo: adicionar o fornecedor OptView no mesmo padrão operacional de Hoya, Zeiss e Haytek, com tela de pedido integrada, persistência/auditoria, DE/PARA de produtos, configuração administrativa por ambiente e tracking — respeitando a limitação atual da documentação, que hoje cobre somente o envio do pedido via SOAP/XML.

1. Escopo da Fase 1: OptView com envio completo de pedido
- Implementar a integração inicial focada em criação de pedido, porque a documentação recebida descreve:
  - serviço SOAP/WSDL `WsLabotica`
  - método de inserção `Inserir_Pedido` / `INSERIRPEDIDO`
  - payload XML `LISTA_PEDIDO > PEDIDO > RECEITA > SERVICOS`
- Tratar tracking e catálogo como frentes preparadas arquiteturalmente, mas dependentes de documentação complementar do fornecedor.

2. Base de dados e configuração
- Criar tabela `optview_empresa_config` no mesmo padrão de `hoya_empresa_config`, `zeiss_empresa_config` e `haytek_empresa_config`.
- Campos recomendados:
  - `cod_empresa`
  - `alias`
  - `cnpj`
  - `codigo_cadastral_optview` (mapeia `CD_CODIGOCADASTRAL`)
  - `login_site`
  - `senha_site`
  - `login_restrito`
  - `ativo`
  - timestamps
- Inserir o fornecedor `OPTVIEW` em `fornecedor_configuracao`, aproveitando o modelo já existente para:
  - `ambiente`
  - `base_url_staging`
  - `base_url_production`
  - eventual chave/API futura, se o fornecedor exigir depois
- Reutilizar as tabelas existentes:
  - `fornecedor_produto_depara`
  - `pedidos_fornecedor`
  - `pedido_status_history`
  - `pedido_alertas`
- Aplicar RLS no padrão atual: leitura/admin para configuração, service role para edge functions.

3. Edge Function do fornecedor
- Criar `supabase/functions/optview-proxy/index.ts` no mesmo modelo de `zeiss-proxy` e `haytek-proxy`.
- Responsabilidades da função:
  - validar JWT com `authGuard`
  - carregar ambiente em `fornecedor_configuracao`
  - carregar credenciais da loja em `optview_empresa_config`
  - montar XML no encoding esperado pelo fornecedor
  - chamar o endpoint SOAP/WSDL do OptView
  - registrar auditoria completa em `pedidos_fornecedor`
  - suportar idempotência por hash do payload + empresa + OS + ambiente
- Ações iniciais da função:
  - `criar-pedido`
  - `historico-pedidos`
  - `timeline-pedido`
- Ações preparadas, mas só implementáveis após nova documentação:
  - `listar-produtos`
  - `listar-servicos`
  - `consultar-pedido`
  - `atualizar-tracking`

4. Mapeamento do XML OptView
- Construir um mapper explícito do OS Hub para o XML do fornecedor.
- Campos principais já suportáveis com os dados atuais do sistema:
  - OS/paciente/médico/CRM
  - esférico, cilíndrico, eixo, adição
  - DNP longe/perto
  - altura OD/OE
  - prisma
  - medidas da armação: ponte, horizontal, vertical, diagonal
  - tipo/modelo de armação
  - produto OD/OE
  - serviços/tratamentos
- Regras especiais do OptView identificadas na documentação:
  - `FK_PRODUTOOD` e `FK_PRODUTOOE` exigem DE/PARA
  - `FK_ARMACAO` exige DE/PARA do tipo de armação
  - `FK_ARO` exige DE/PARA do modelo/formato da armação
  - `TG_ENVARO` precisa ser controlado pela UI
  - `DS_MODELOOD` / `DS_MODELOOE` podem ser enviados para nome comercial/certificado
  - `TRACER > DS_LEITURA` aceita conteúdo VCA em base64
- Normalizar formatação numérica no padrão do fornecedor:
  - decimais com vírgula
  - campos vazios quando opcionais
  - fallback entre visão simples / perto / longe conforme receita existente

5. Estratégia de catálogo e DE/PARA
- Como não há documentação de API de catálogo, a Fase 1 deve usar catálogo local/manual.
- Criar suporte OptView em `fornecedor_produto_depara` com:
  - produto OD/OE (`FK_PRODUTO*`)
  - serviços/tratamentos (`SERVICOS > ITEM > FK_PRODUTO`)
  - tipo de armação (`FK_ARMACAO`)
  - aro/modelo (`FK_ARO`)
- Recomendo criar também tabelas específicas para catálogo manual OptView:
  - `optview_produtos`
  - `optview_servicos`
  - `optview_tipos_armacao`
  - `optview_modelos_aro`
- Isso evita depender de texto livre no admin e permite seleção estruturada na UI.
- Quando o fornecedor enviar documentação oficial de catálogo, essa camada pode ser trocada por sincronização/API sem reescrever a tela de pedido.

6. Frontend: serviço cliente
- Criar `src/services/optviewService.ts` no mesmo padrão de `hoyaService`, `zeissService` e `haytekService`.
- Expor tipos e chamadas:
  - `criarPedidoOptview`
  - `listarHistoricoPedidosOptview`
  - `listarTimelinePedidoOptview`
  - futuramente `consultarPedidoOptview`, `atualizarTrackingOptview`, `listarProdutosOptview`
- Padronizar mensagens de erro e código de correlação.

7. Frontend: matching e montagem do pedido
- Criar `src/services/optviewMatchingService.ts`.
- Reutilizar a estratégia vigente:
  - primeiro consulta DE/PARA
  - depois matching textual por descrição do ERP
  - usuário confirma ou corrige manualmente
- Como o fornecedor trabalha com mais de um tipo de código (produto, serviço, armação, aro), o matching deve ser dividido em blocos:
  - lente principal
  - serviços/tratamentos
  - tipo de armação
  - modelo/aro
- Persistir confirmações manuais em `fornecedor_produto_depara`.

8. Frontend: nova tela de pedido
- Criar `src/pages/PedidoOptviewPage.tsx` no padrão de `PedidoZeissPage` / `PedidoHaytekPage`.
- Fluxo da tela:
  - carregar OS e receita via `fetchSingleOsRecipe`
  - carregar catálogos locais OptView
  - sugerir lente via matching
  - permitir revisão da prescrição
  - permitir revisão da armação
  - permitir seleção de serviços/tratamentos
  - permitir indicar envio de armação e uso de tracer
  - enviar pedido
- Itens de UX que devem seguir o padrão atual:
  - confirmação explícita de produto/receita/armação
  - bloqueio de envio com erro de validação
  - prevenção de duplicidade por pedido já existente
  - badge/origem “DE/PARA automático”, “Match inteligente” ou “Seleção manual”

9. Frontend: tracking e navegação
- Preparar rota `/os/pedido-optview` e `/os/tracking-optview`.
- Atualizar:
  - `src/App.tsx`
  - breadcrumbs
  - sidebar de acompanhamento
  - badges/alertas por fornecedor
  - cards/atalhos no Monitor de OS
- Para a Fase 1, a página de tracking pode existir em modo parcial:
  - histórico local dos pedidos enviados
  - timeline interna baseada em `pedido_status_history`
  - mensagem clara de “consulta online pendente de documentação do fornecedor”
- Quando houver documentação de tracking, ativar:
  - consulta avulsa
  - atualização de status
  - alertas de status negativo

10. Administração
- Estender `AdminFornecedoresPage` para incluir a aba `OPTVIEW`.
- Adicionar gestão por empresa para:
  - código cadastral
  - login
  - senha
  - login restrito
  - alias
  - status ativo
- Criar seção administrativa para catálogo/manual mapping do OptView:
  - produtos
  - serviços
  - tipos de armação
  - modelos de aro

11. Tracking futuro: dependências bloqueantes
- A documentação atual não mostra método de:
  - consulta de pedido por número/OS
  - status de produção
  - histórico
  - rastreio/logística
  - listagem de produtos/serviços
- Assim, o tracking “igual aos demais” fica dividido em duas etapas:
  - Fase 1: tracking interno/auditoria do que foi enviado
  - Fase 2: tracking online real, quando o fornecedor enviar WSDL/métodos de consulta

12. Sequência recomendada de implementação
- Etapa A: modelagem DB + RLS + cadastro do fornecedor
- Etapa B: edge function `optview-proxy` com criação de pedido SOAP/XML
- Etapa C: serviço frontend + tipos OptView
- Etapa D: catálogo manual + matching + DE/PARA
- Etapa E: tela `PedidoOptviewPage`
- Etapa F: admin/configuração OptView
- Etapa G: tracking parcial interno + navegação
- Etapa H: tracking online real quando o fornecedor enviar documentação complementar

Detalhes técnicos
- A integração OptView não deve chamar SOAP diretamente do frontend; a chamada deve passar por Edge Function autenticada, como já ocorre com os outros fornecedores.
- O XML deverá ser gerado no backend, não na UI.
- O `TRACER` deve ser tratado como opcional e preparado para receber VCA em base64 quando houver arquivo disponível.
- Os campos `FK_ARMACAO`, `FK_ARO`, `FK_PRODUTOOD/OE` e `SERVICOS.ITEM.FK_PRODUTO` exigem catálogo/mapeamento local para a primeira versão.
- A estrutura existente de `pedidos_fornecedor`, `pedido_status_history` e `pedido_alertas` já suporta OptView sem redesign.
- O maior risco atual não é técnico: é documental. Sem WSDL completo e sem métodos de catálogo/tracking, a primeira entrega viável é “pedido integrado + auditoria + histórico interno”, deixando “consulta online do status” para a segunda etapa.

Entregável esperado após implementação
- Usuário abre uma OS, escolhe “Pedido OptView”, revisa receita/armação/produtos/serviços, envia o pedido ao fornecedor e vê o registro salvo no sistema com histórico interno.
- Admin configura ambiente e credenciais por loja.
- Quando o fornecedor liberar documentação adicional, o mesmo fluxo evolui para catálogo online e tracking completo sem trocar a arquitetura principal.
