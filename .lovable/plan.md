## Diagnóstico

O fix anterior aplicou auto-seleção silenciosa: se o BlueGuard é detectado, ele é marcado; senão, **nada acontece e nada é mostrado**. Como o operador não tem feedback visual claro, ele não percebe se a tecnologia entrou ou não. Além disso, a detecção depende de o catálogo Zeiss devolver um nome contendo "BLUE GUARD", o que pode falhar para algumas famílias ou variações ("Blue Protect", "BG", etc.) — nesse caso a UI fica completamente muda.

## O que mudar (apenas UI/lógica de apresentação no componente de serviços Zeiss)

### 1. Tornar o status do BlueGuard explícito e impossível de ignorar

No topo de `ZeissServicosSection`, acima da lista de tratamentos, renderizar uma **faixa de status dedicada** sempre que `autoSelectBlueguard` for `true` (lente surfaçada). Estados possíveis:

- **Incluído** (verde, ícone Shield): "BlueGuard incluído (padrão Zeiss para lentes surfaçadas)".
- **Removido por coloração** (âmbar, ícone Lock): "BlueGuard removido — incompatível com coloração selecionada. Para reativar, escolha 'Sem coloração'."
- **Não disponível neste produto** (vermelho discreto, ícone AlertTriangle): "Atenção: BlueGuard não foi encontrado no catálogo desta família. Verifique manualmente antes de enviar." — esse aviso é o que faltava: hoje o silêncio engana o operador.

A faixa é a **fonte primária de verdade**; o checkbox correspondente na lista fica destacado (borda accent + badge "Padrão Zeiss") quando incluído, e disabled + tachado quando bloqueado.

### 2. Detecção de BlueGuard mais robusta

Atualmente só varre `s.nome` com `/BLUE\s*GUARD/i`. Vamos:

- Procurar também em `s.descr` (quando vier).
- Aceitar variantes confirmadas pela Zeiss: `BLUE\s*GUARD`, `BLUEGUARD`, `BG\s*DV`, `DURAVISION\s+BLUE`. (Lista fechada para evitar falso-positivo com "Blue Protect" que é outro produto.)
- Logar uma única vez no console (`console.info`) o catálogo cru de serviços recebido para a família, com prefixo `[ZeissServicos]` — facilita identificar nomes reais no próximo teste sem precisar mexer no proxy.

### 3. Garantir que o efeito reaja quando o catálogo carrega depois

O `useEffect` atual depende de `[blueguardCod, corBloqueia, autoSelectBlueguard]`. Está correto em teoria (blueguardCod muda quando servicos chegam), mas quando o usuário troca de produto, `servicos` é resetado e recarregado; o efeito precisa também rodar de novo se `selectedServicos` for esvaziado por reset externo. Adicionar `servicos.length` à lista de dependências, e usar uma ref para evitar loop com `onServicosChange`.

### 4. Bloqueio visual mais óbvio quando há coloração

Quando `corBloqueia === true`:
- O `<SelectTrigger>` da coloração ganha uma nota inline: "Coloração ativa remove BlueGuard automaticamente."
- A linha do BlueGuard na lista fica com `line-through` no nome e o checkbox `disabled`.

### 5. Nenhuma mudança em

- `zeiss-proxy` Edge Function.
- `zeissService.ts`.
- Payload final enviado (continua sendo `servicos: [{codigo}]`; o auto-select só mexe na lista local).
- Pedidos já gravados.
- Fluxos Hoya / Haytek.

## Arquivos afetados

- `src/components/zeiss-pedido/ZeissServicosSection.tsx` — adiciona faixa de status, detecção ampliada, log diagnóstico, dependência extra do effect, estilo de bloqueio.
- `src/pages/PedidoZeissPage.tsx` — sem mudança funcional; manter prop `autoSelectBlueguard` como já está.

## Como validar depois

1. Abrir uma OS surfaçada → faixa verde "BlueGuard incluído" + checkbox marcado e destacado.
2. Selecionar uma cor → faixa muda para âmbar "Removido por coloração", checkbox disabled e tachado, payload de envio sem o código.
3. Voltar para "Sem coloração" → faixa volta verde e checkbox remarca.
4. Abrir uma família que comprovadamente não tem BlueGuard no catálogo (ex.: alguma LP, se chegar a renderizar a seção) → faixa vermelha de aviso aparece, operador é forçado a decidir.
5. Conferir no console o log `[ZeissServicos] catálogo` com os nomes reais — se aparecer um nome esperado de BlueGuard que ainda não casa, ampliamos a regex.
