# otw.fings.frontend.web

Frontend da Fings em React, TypeScript e Vite.

## Desenvolvimento com Docker

```bash
docker compose up --build
```

A aplicação fica disponível em `http://localhost:5175`. O código local é montado no container e o Vite atualiza a página automaticamente através de HMR.

Para usar outra porta no computador, define `FINGS_FRONTEND_PORT` no ficheiro `.env`. A porta interna do container continua a ser `5173`.

## Render Static Site

O ficheiro `render.yaml` permite criar o serviço através de um Render Blueprint. A configuração usa:

- build command: `npm ci && npm run build`;
- publish directory: `dist`;
- Node.js 22.13.0;
- rewrite de `/*` para `/index.html`, permitindo navegação direta em rotas SPA.

Antes do primeiro deploy, define `VITE_FINGS_API_URL` no Render com o URL público HTTPS da API. Variáveis `VITE_*` são incorporadas no bundle durante o build e não devem conter segredos.

Se o serviço for criado manualmente no dashboard do Render, escolhe **Static Site** e usa os mesmos valores de build e publish directory indicados acima.
# otw.fings.frontend.web
