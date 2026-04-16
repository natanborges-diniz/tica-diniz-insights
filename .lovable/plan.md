

## Resumo

Sim, é totalmente viável. Hoje o sistema já consulta a "última etapa" da OS via Firebird Bridge (`/os/monitor-ultima-etapa`), mas esse endpoint exige **período + empresa** (retorna a lista do dashboard). Para o chatbot, precisamos de uma consulta pontual por **CPF ou número da OS**, retornando a etapa atual de forma rápida e segura.

A solução é criar uma **Edge Function pública para serviços** (`os-status-public`) aqui no Lens, autenticada via `X-Service-Key` (mesmo padrão já usado entre Lens e Connect & Flow), que o Connect & Flow chama durante o atendimento.

## Arquitetura

```text
Cliente no chat
   │  "Qual o status do meu óculos? CPF 123..."
   ▼
Connect & Flow (atendimento)
   │  POST /functions/v1/os-status-public
   │  Header: X-Service-Key: <INTERNAL_SERVICE_SECRET>
   │  Body: { cpf?: "...", os?: "..." }
   ▼
Lens — Edge Function `os-status-public`
   │  1. Valida X-Service-Key
   │  2. Normaliza CPF (só dígitos) ou OS
   │  3. Chama Firebird Bridge: /os/consulta-status?cpf=... ou ?os=...
   ▼
Firebird Bridge (novo endpoint enxuto)
   │  Query direta por CPF ou número da OS, todas as empresas
   ▼
Resposta: { os, etapa, statusAtraso, dataPrevisao, empresa, cliente }
```

## O que será criado/alterado

| # | Onde | Mudança |
|---|------|---------|
| 1 | **Firebird Bridge** (`firebird-bridge/index.js`) | Novo endpoint `GET /api/v1/os/consulta-status?cpf=...` ou `?os=...`. Reusa a mesma lógica de "última etapa" do monitor, mas filtrando por CPF (busca em todas as OSs ativas dos últimos 180 dias do cliente, retorna a mais recente) ou número de OS (match exato). Sem filtro de empresa — varre todas |
| 2 | **Lens — nova Edge Function** `supabase/functions/os-status-public/index.ts` | Endpoint público para serviços. Valida `X-Service-Key` contra `INTERNAL_SERVICE_SECRET`. Aceita `{ cpf?, os? }`. Chama o Bridge. Retorna payload limpo e amigável para o chatbot |
| 3 | **Lens — `supabase/config.toml`** | Adicionar bloco para a função com `verify_jwt = false` (autenticação é via X-Service-Key) |
| 4 | **Connect & Flow** (projeto separado) | No fluxo de atendimento, quando o cliente pedir status, coletar CPF ou OS e chamar `https://zmsfntqgxsstnbpzdled.supabase.co/functions/v1/os-status-public` com header `X-Service-Key`. Renderizar a resposta no chat |

## Contrato da Edge Function `os-status-public`

**Request:**
```json
POST /functions/v1/os-status-public
Headers: X-Service-Key: <secret compartilhado>
Body: { "cpf": "12345678900" }   // ou { "os": "98765" }
```

**Response sucesso (200):**
```json
{
  "encontrado": true,
  "resultados": [
    {
      "os": "98765",
      "etapa": "MONTAGEM",
      "statusAtraso": "NO_PRAZO",
      "atrasoDias": 0,
      "dataPrevisao": "2026-04-22",
      "dataEmissao": "2026-04-10",
      "empresa": "PRIMITIVA I",
      "cliente": "JOÃO DA SILVA",
      "vendedor": "MARIA"
    }
  ]
}
```

**Response não encontrado (200):**
```json
{ "encontrado": false, "mensagem": "Nenhuma OS encontrada para este CPF/OS." }
```

**Response erro (401/500):**
```json
{ "error": "X-Service-Key inválido" }
```

## Regras de busca

- **Por CPF:** retorna até 5 OSs mais recentes (últimos 180 dias) do cliente, ordenadas por data de emissão desc. Útil quando o cliente tem mais de uma OS aberta
- **Por OS:** retorna 1 resultado exato (match no número da OS)
- **CPF:** normalizar removendo pontos, traços e espaços antes da query
- **Sem dado sensível:** não expor telefone, valor total, endereço — só o necessário para informar status

## Segurança

- `X-Service-Key` validado contra `INTERNAL_SERVICE_SECRET` (já existe no Lens, mesma chave usada em payment-links e cross-login)
- `verify_jwt = false` na função (não precisa de usuário autenticado, é serviço-a-serviço)
- Rate limit implícito pelo throttle do Firebird Bridge
- O Connect & Flow guarda o secret server-side, **nunca exposto ao navegador do cliente**

## Próximos passos após aprovação

1. Implementar endpoint no Firebird Bridge (você precisará deployar a bridge)
2. Implementar Edge Function `os-status-public` no Lens (deploy automático)
3. Testar via curl com `X-Service-Key`
4. No projeto Connect & Flow, integrar a chamada no fluxo de atendimento

