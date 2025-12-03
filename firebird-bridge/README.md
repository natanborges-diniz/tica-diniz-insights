# Firebird Bridge - Óticas Diniz

Bridge HTTP para acessar dados do Firebird via REST API.

## Deploy no Railway.app

1. Crie uma conta em https://railway.app
2. Crie um novo projeto e conecte este repositório
3. Configure as variáveis de ambiente:

```
FB_HOST=201.20.35.230
FB_PORT=3050
FB_DATABASE=E:\FTPBackup\Integracao\SPOSASCO.DATAWEB.CERT
FB_USER=SYSDBA
FB_PASSWORD=masterkey
```

4. Deploy automático será feito

## Endpoints

- `GET /health` - Health check
- `GET /api/kpis?dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD&codEmpresa=X` - KPIs do dashboard
- `GET /api/vendas-por-dia?dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD&codEmpresa=X` - Vendas por dia
- `GET /api/vendas-por-loja?dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD` - Vendas por loja
- `GET /api/empresas` - Lista de empresas/lojas

## Teste local

```bash
npm install
npm start
```

Acesse: http://localhost:3000/health
