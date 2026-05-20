## Bug confirmado

Cruzando os prints da OS 96999:

| Olho | Esf (origem) | Adição enviada à Zeiss |
|------|--------------|------------------------|
| OD   | -2.00        | 2.00 |
| OE   | -2.50        | 2.50 |

A adição é exatamente `0 − esférico_longe`. Esse é o cálculo da **Regra 3** de `src/utils/prescricaoResolver.ts`:

```ts
const adicaoCalculada = +(pertoEsf - longeEsf).toFixed(2);
```

Quando o Firebird devolve `OD_PERTO_ESF = 0` (ou `OD_PERTO_CIL = 0`) em vez de `null`, o resolver entende que existe "perto preenchido" (`temPerto = true`), entra na Regra 3 e gera adição fantasma = `0 − (−2) = 2`. Caso clássico de **zero tratado como valor**.

A receita verdadeira (print 1) mostra Adição = 0.00, ou seja, é monofocal de longe — não deveria ter adição alguma.

## Causa raiz

```ts
const temPerto = input.pertoEsf != null || input.pertoCil != null;
```
`0 != null` é `true`, então `temPerto` vira `true` mesmo quando o ERP só preencheu zeros. A Regra 3 dispara e inventa a adição.

O mesmo problema afeta a Regra 1 ("só perto preenchido") sempre que perto vier zerado.

## Fix proposto

**Único arquivo: `src/utils/prescricaoResolver.ts`**

1. Tratar `0` como "não preenchido" nos detectores `temLonge` / `temPerto`:
   ```ts
   const isFilled = (v: number | null) => v != null && v !== 0;
   const temLonge = isFilled(input.longeEsf) || isFilled(input.longeCil);
   const temPerto = isFilled(input.pertoEsf) || isFilled(input.pertoCil);
   ```
2. Reforçar a Regra 3: só calcular adição quando **ambos** `longeEsf` e `pertoEsf` estiverem realmente preenchidos (não-zero) e o resultado for clinicamente válido (≥ 0.5):
   ```ts
   if (temLonge && temPerto && !temAdicao
       && isFilled(input.longeEsf) && isFilled(input.pertoEsf)) {
     const diff = +(input.pertoEsf! - input.longeEsf!).toFixed(2);
     return {
       esferico: input.longeEsf,
       cilindrico: input.longeCil,
       eixo: input.longeEixo,
       adicao: diff >= 0.5 ? diff : null,
       origem: "calculado",
     };
   }
   ```
3. Garantir que o caminho padrão "só longe" devolva `adicao: input.adicao || null` (sem `0` virando adição).

## Validação

1. Testes unitários em `src/utils/__tests__/prescricaoResolver.test.ts` (criar):
   - Longe = −2, perto/adição = 0 → `adicao = null` (caso OS 96999)
   - Longe = −2, perto = 0, adição = 2 → respeita adição informada
   - Longe = −2, perto = 0, sem adição → `adicao = null`
   - Longe = 0, perto = +2 → Regra 1, esférico = +2, sem adição
   - Longe = −2, perto = 0, com perto_cil ≠ 0 → não inventa adição
2. Recarregar `/pedido/zeiss/96999` no preview, confirmar que os campos Adição ficam vazios e a auto-validação não dispara warnings de adição.
3. Subir para o usuário validar uma OS multifocal real (com adição de verdade) para garantir que não regrediu.

## Escopo / fora do escopo

- **Dentro**: só `prescricaoResolver.ts` e o teste novo. O resolver é usado por Hoya, Zeiss e Haytek — o fix beneficia os três.
- **Fora**: não mexer em `osHubService.ts` (o coalesce `cliente_adicao` é só fallback e não foi a causa aqui), nem na tela do pedido, nem no payload Zeiss.

## Pergunta

Posso aplicar exatamente esse fix (tratar `0` como "não preenchido" + exigir adição calculada ≥ 0.5) ou você quer um limiar diferente (ex.: ≥ 0.25)?