Plano para corrigir o 400 recorrente da Haytek:

1. Ajustar o `haytek-proxy` para sanitizar dioptrias imediatamente antes do envio à API Haytek.
   - Remover qualquer `+` de `spherical`, `cylindrical` e `addition`.
   - Garantir exatamente 2 casas decimais.
   - Preservar valores negativos com `-`.
   - Aplicar em OD e OE.

2. Manter a correção existente na tela, mas não depender dela.
   - O log mostra que o frontend publicado ainda enviou `+3.00`, `+0.25`, `+1.00`.
   - Sanitizar no proxy evita falha mesmo se houver cache, tela antiga, outro fluxo ou payload manual.

3. Melhorar o retorno do erro Haytek para mostrar a mensagem real da API.
   - Hoje a tela recebe só `HTTP 400`, apesar de a API retornar `errors[]` detalhado.
   - O proxy deve repassar `errors.join("; ")` quando existir.

4. Atualizar a memória/spec Haytek com a regra defensiva.
   - Dioptrias Haytek: string numérica com 2 casas, sem `+`, normalizada também no proxy antes de enviar.

Validação:
- Reenviar OS 95485 deve gerar payload com `"spherical":"3.00"`, `"addition":"1.00"`, `"left.spherical":"0.25"`.
- Se houver novo 400, a mensagem exibida deverá ser a resposta detalhada da Haytek, não apenas `HTTP 400`.