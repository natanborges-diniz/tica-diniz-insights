
Objetivo: concluir a configuração administrativa do fornecedor OptView na tela de Fornecedores, cadastrando login/senha por loja com os aliases padrão já usados no sistema, para que o payload do pedido carregue automaticamente a credencial correta conforme `cod_empresa`.

Escopo confirmado
- A estrutura de banco do OptView já existe:
  - `optview_empresa_config`
  - `optview_produtos`
  - `optview_servicos`
  - `optview_tipos_armacao`
  - `optview_modelos_aro`
- A Edge Function `optview-proxy` já lê `optview_empresa_config` por `cod_empresa` e usa:
  - `alias`
  - `codigo_cadastral_optview`
  - `login_site`
  - `senha_site`
  - `login_restrito`
- O que falta é expor e operacionalizar isso em `AdminFornecedoresPage`, além de popular os registros das lojas com os aliases corretos.

Mapeamento das lojas para o sistema
Usarei os aliases existentes do sistema com a correspondência mais próxima já validada no banco:

```text
cod 1  -> DINIZ PRIMITIVA I       -> login PEDIDOS@DINIZOSASCO1       -> senha osasco
cod 2  -> DINIZ PRIMITIVA II      -> login PEDIDOS@DINIZPRIMITIVA2    -> senha 1073
cod 9  -> DINIZ ANTONIO AGU       -> login PEDIDOS@DINIZANTONIOAGU    -> senha 18319
cod 18 -> DINIZ SUPER SHOPPING    -> login PEDIDOS@DINIZSUPER         -> senha 31822
cod 6  -> DINIZ UNIAO             -> login pedidos@uniao              -> senha 31821
cod 17 -> DINIZ STO ANTONIO       -> login PEDIDOS@DINIZSANTOANTONIO  -> senha 31823
cod 4  -> DINIZ CARAPICUIBA       -> login PEDIDOS@DINIZCARAPICUIBA   -> senha 31824
cod 16 -> DINIZ BARUERI           -> login PEDIDOS@BARUERI            -> senha 31825
cod 15 -> DINIZ ITAPEVI           -> login PEDIDOS@DINIZITAPEVI       -> senha 31826
```

Decisões aplicadas
- “DINIZ SUPER SHOPPING” deve apontar para `cod_empresa = 18`.
- `cod_empresa = 13` (“DINIZ SUPER”) ficará sem configuração nesta etapa.
- `cod_empresa = 14` (“DINIZ JANDIRA”) ficará sem configuração nesta etapa.

Implementação proposta

1. Atualizar a tela administrativa do fornecedor
- Estender `src/pages/AdminFornecedoresPage.tsx` para incluir a aba `OPTVIEW` em:
  - `FORNECEDORES`
  - `FORNECEDOR_LABELS`
- Reaproveitar a estrutura já usada por Hoya/Zeiss/Haytek:
  - subaba “Credenciais & Ambiente” com `CredenciaisSection`
  - subaba “Empresas” com uma nova `OptviewEmpresasSection`

2. Criar a seção de empresas do OptView
- Implementar `OptviewEmpresasSection` no mesmo arquivo, seguindo o padrão das seções existentes.
- Ler dados de `optview_empresa_config`.
- Permitir edição por linha de:
  - `alias`
  - `cnpj`
  - `codigo_cadastral_optview`
  - `login_site`
  - `senha_site`
  - `login_restrito`
  - `ativo`
- Como OptView usa mais campos que Hoya/Zeiss/Haytek, não basta reutilizar `EmpresasTable` atual sem adaptação; será criada uma tabela específica para OptView.

3. Pré-popular os registros das lojas OptView
- Inserir/atualizar os registros em `optview_empresa_config` para os 9 códigos confirmados.
- Popular `alias` com o padrão oficial do sistema.
- Popular `login_site` e `senha_site` com as credenciais fornecidas.
- Manter `codigo_cadastral_optview`, `cnpj` e `login_restrito` editáveis para preenchimento complementar no admin.
- Não criar registro ativo para:
  - `cod_empresa = 13`
  - `cod_empresa = 14`

4. Preservar a lógica de montagem do payload
- Não alterar a lógica-base do `optview-proxy`.
- Garantir apenas que a configuração administrativa abasteça corretamente os campos já consumidos pela função.
- Resultado esperado:
  - ao enviar um pedido com `codEmpresa = X`, a função carregará a credencial da loja X automaticamente.

5. Melhorias de UX na tela
- Exibir status visual por linha:
  - “Configurada” quando houver pelo menos `alias + login_site + senha_site`
  - “Pendente” quando faltar credencial essencial
- Manter máscara para CNPJ.
- Mascarar visualmente a senha no input, com botão mostrar/ocultar, para manter o padrão de segurança da página.
- Exibir observação clara de que o “Alias” deve seguir o padrão interno da loja para rastreabilidade.

6. Validação funcional após implementação
- Verificar se a aba `OPTVIEW` aparece ao lado de HOYA / ZEISS / HAYTEK.
- Confirmar que as 9 lojas aparecem com os aliases corretos.
- Confirmar que `cod_empresa 13` e `14` não entram como configuradas.
- Validar que a edição manual posterior de `codigo_cadastral_optview` e `login_restrito` fica disponível no admin.
- Validar que o carregamento por `cod_empresa` continua compatível com `optview-proxy`.

Arquivos a atualizar
- `src/pages/AdminFornecedoresPage.tsx`
- migração/operação de dados para popular `optview_empresa_config` com as lojas e credenciais iniciais

Detalhes técnicos
- Como isso envolve alteração de dados existentes da tabela `optview_empresa_config`, a população das credenciais deve ser feita como operação de dados, não como mudança estrutural.
- A estrutura atual do banco já suporta o caso de uso; não há necessidade de nova tabela.
- O alias mais consistente para OptView será o