## Problema confirmado

Verifiquei os 10 últimos pedidos Zeiss em produção (tabela `pedidos_fornecedor`, fornecedor `ZEISS`): todos os pedidos surfaçados foram enviados com **apenas 1 serviço** (`"76"` ou `"124"`) e **sem nenhum tratamento BlueGuard** — exatamente o que o stakeholder reportou.

Causa raiz: em `src/components/zeiss-pedido/ZeissServicosSection.tsx` os serviços são carregados da API Zeiss e exibidos como checkboxes **sem nenhuma pré-seleção**. O operador precisa marcar BlueGuard manualmente toda vez, e nas últimas semanas isso vem sendo esquecido. Além disso, o reset de serviços é disparado em vários pontos de `PedidoZeissPage.tsx` (linhas 321, 365, 979) sempre zerando a lista.

A regra Zeiss confirmada pelo stakeholder:
- **Lente surfaçada (não-LP)** → BlueGuard é tecnologia padrão, deve vir **marcado por padrão**.
- **Lente surfaçada COM coloração** → Zeiss obriga retirar BlueGuard; deve ser **desmarcado e bloqueado** (não-clicável) enquanto houver cor selecionada.
- **Lente Pronta (`LP*`)** → não aplica (não tem tratamentos surfaçados).

## Mudanças propostas

### 1. `ZeissServicosSection.tsx` — detectar e auto-marcar BlueGuard

- Após carregar `servicos`, identificar o serviço BlueGuard procurando no `nome` por `/BLUE\s*GUARD/i` (regex tolerante a variações tipo "BlueGuard", "BLUE GUARD", "Blue Guard DV"). Guardar o `cod` desse serviço em estado local `blueguardCod`.
- Receber duas novas props vindas da página pai:
  - `autoSelectBlueguard: boolean` → quando `true` (lente surfaçada) e ainda não há `blueguardCod` na lista `selectedServicos` e não há coloração, marcar automaticamente assim que o catálogo carrega.
  - (não precisa de prop nova para "bloquear" — usamos `selectedCor` que já é prop).
- No `<label>` do checkbox do BlueGuard:
  - se `selectedCor !== "none"`: renderizar `Checkbox disabled`, com `opacity-60` e tooltip/badge "Indisponível com coloração".
  - manter o restante dos serviços livres.
- Novo `useEffect` reagindo a `selectedCor`:
  - se `selectedCor !== "none"` e `blueguardCod` está em `selectedServicos` → remover (chama `onServicosChange`).
  - se `selectedCor === "none"` e `autoSelectBlueguard` e BlueGuard não está marcado → marcar de volta.

### 2. `PedidoZeissPage.tsx` — passar a flag e preservar comportamento

- Calcular `const isSurfacada = !odIsLentePronta && (!oeProduct || !oeIsLentePronta);` reutilizando `isLentePronta` já importado e os produtos OD/OE atuais.
- Passar `autoSelectBlueguard={isSurfacada}` ao `<ZeissServicosSection>`.
- Manter os resets atuais (`setSelectedServicos([])` em troca de produto / corridor / limpar) — o auto-select reaplica BlueGuard quando o novo catálogo carregar.

### 3. Sem mudanças no Edge Function `zeiss-proxy`

O payload já encaminha `servicos[]` corretamente — o problema é puramente de UI/default. Não mexer no proxy nem em `zeissService.ts`.

### 4. Não-objetivos

- Não criar config por loja para o código BlueGuard (a detecção por nome no catálogo basta e funciona para qualquer empresa).
- Não alterar pedidos já gravados.
- Não tocar em Hoya/Haytek.

## Detalhes técnicos

Trecho-chave em `ZeissServicosSection.tsx` (pseudo-diff):

```tsx
const blueguardCod = useMemo(
  () => servicos.find(s => /BLUE\s*GUARD/i.test(s.nome))?.cod ?? null,
  [servicos]
);
const corBloqueia = selectedCor && selectedCor !== "none";

useEffect(() => {
  if (!blueguardCod) return;
  const marcado = selectedServicos.includes(blueguardCod);
  if (corBloqueia && marcado) {
    onServicosChange(selectedServicos.filter(c => c !== blueguardCod));
  } else if (!corBloqueia && autoSelectBlueguard && !marcado) {
    onServicosChange([...selectedServicos, blueguardCod]);
  }
}, [blueguardCod, corBloqueia, autoSelectBlueguard]);
```

## Validação após implementar

1. Abrir `/pedidos-zeiss` em uma OS com lente surfaçada → BlueGuard já vem marcado.
2. Selecionar uma cor → BlueGuard é desmarcado e fica disabled com label de aviso.
3. Voltar para "Sem coloração" → BlueGuard volta marcado.
4. Selecionar uma Lente Pronta (LP…) → BlueGuard não aparece marcado (catálogo da família LP normalmente não traz BlueGuard, mas se trouxer não auto-marcamos).
5. Enviar um pedido teste e conferir no banco que `payload.sao.pedido.servicos` contém o código do BlueGuard.
