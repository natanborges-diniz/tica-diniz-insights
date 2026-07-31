# Manual Prático — Mesa de Aprovação e Fluxo de Pagamentos

> Para os testes em produção (ago/2026). Duas pessoas: **operador** (Felix — cria
> e envia) e **admin** (aprova desvios e confirma no banco). Leitura: 5 minutos.

---

## A ideia em uma frase

**Todo pagamento carrega um selo que diz por que ele pode ser pago** — e só o que
foge do padrão passa pela sua mesa.

## Os selos (aparecem na Mesa de Aprovação)

| Selo | O que significa | O que fazer |
|---|---|---|
| 🟢 **Nota / título** | Dívida documentada: veio do ERP (nota fiscal) | Nada — flui sozinho |
| 🔵 **Rubrica na faixa** | Recorrente pré-aprovado (aluguel, energia...), valor dentro do combinado | Nada — flui sozinho |
| 🟡 **Fora da faixa** | Rubrica ok, mas valor fugiu da tolerância (mostra o desvio: "+38%") | **Admin decide** na Mesa |
| 🔴 **Exceção** | Conta avulsa emergencial, com justificativa do operador | **Admin aprova individualmente** |
| ⚪ **Sem lastro** | Nenhuma comprovação de dívida | **Impagável** — resolver antes (vincular título, criar rubrica ou justificar exceção) |

## Fluxo do dia a dia

### Operador (Felix)

1. **Contas a Pagar**: os títulos do ERP entram sozinhos toda manhã (~8h).
   Selecione os que vencem, prepare o pagamento (PIX/boleto) e **monte o borderô**.
2. **Enviar BTG**: se o borderô está 100% verde/azul, o botão envia direto —
   sem esperar ninguém. Se tiver item fora da faixa, o sistema bloqueia e lista
   o que precisa do admin na Mesa.
3. **Conta manual** (Novo Lançamento): o formulário exige o lastro — escolha a
   **rubrica** (recorrentes) ou marque **exceção** com justificativa (mín. 20
   caracteres). Sem lastro, o botão não habilita.
4. **Rubrica nova**: cadastre em Financeiro → Rubricas (nasce em rascunho; o
   admin ativa). Use "Sugerir do histórico" para não digitar do zero.

### Admin (você)

1. **App BTG** (o seu ato principal): confirmar os lotes enviados — confira
   favorecidos e total antes da biometria. É aqui que o dinheiro se move.
2. **Mesa de Aprovação** (1× ao dia, 2 min): o que estiver lá é desvio —
   🟡 fora da faixa (decida com o desvio à vista), 🔴 exceções (leia a
   justificativa), ⚪ sem lastro (devolva ao operador). Vazio = dia normal.
3. **Card "Cobranças no banco sem entrada no ERP"**: boletos que chegaram pelo
   DDA sem nota lançada — mande o fiscal dar entrada ANTES do vencimento.
   Emissor desconhecido? Investigue: pode ser boleto golpe.
4. **Rubricas em rascunho**: ative as que o operador cadastrou (você não
   consegue ativar as que você mesmo criou — é proposital).

## Regras de ouro (o que o sistema NÃO deixa fazer)

- Pagar sem lastro — por nenhum caminho, nem por engano.
- Pagar acima do teto da rubrica, ou para favorecido/chave PIX diferente do
  cadastrado (mudou a chave? a rubrica volta para rascunho e exige re-ativação).
- Exceção entrar em borderô — sempre individual, sempre com justificativa.
- Quem criou aprovar a própria criação (rubrica, exceção, borderô com pendência).

## O que acontece sozinho (não fazer manualmente)

- Títulos do ERP entram todo dia ~8h. Extrato do banco ~6:20. Conciliação ~9:10.
- Pagamento confirmado no BTG baixa sozinho em até 30 min (não clicar em
  "Confirmar Processado" — se precisar dele, é bug: reportar).
- No dia seguinte ao pagamento, a linha do extrato casa sozinha com o lançamento.
- Provisões das rubricas: horizonte de 12 meses mantido automaticamente; quando
  o título real chega do ERP, substitui a provisão do mês (nunca duplica).

## Roteiro do primeiro teste (30 min, os dois juntos)

1. Operador monta um borderô pequeno (2–3 títulos verdes) → **Enviar BTG** →
   deve ir direto, sem pedir aprovação.
2. Admin confirma no app BTG → aguardar: os lançamentos devem virar BAIXADOS
   sozinhos (≤30 min).
3. Operador cria uma exceção de teste (justificativa qualquer com 20+ chars) →
   admin vê o 🔴 na Mesa com a justificativa → aprova.
4. Operador tenta criar lançamento sem lastro → o botão deve ficar desabilitado.
5. Operador cadastra uma rubrica de teste → tenta ativar (deve falhar) → admin
   ativa → **Provisionar 12 meses** → conferir os previstos no Fluxo de Caixa.
6. No dia seguinte: Conciliação Bancária → o débito do teste deve estar
   conciliado automaticamente com o extrato.

**Passou nos 6? O sistema está operando como desenhado.**

## Como reportar problema

Tela + loja + documento/valor + o que esperava vs. o que aconteceu (+ print).
Sem o caso concreto, não é acionável.
