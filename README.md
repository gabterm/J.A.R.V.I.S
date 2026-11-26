# J.A.R.V.I.S.

Assistente pessoal com interface em HUD. Em reescrita: app Android (HUD) + servidor Node que conversa com a OpenAI.

## Estrutura

| Pasta | O que é |
|---|---|
| `apps/hud` | Interface (HTML/CSS/JS, Vite). Vira o app Android. |
| `apps/server` | Servidor Fastify: WebSocket `/ws`, login por token, conversa com a OpenAI. |
| `packages/protocol` | Mensagens trocadas entre app e servidor (zod). |

## Rodar local

```bash
cp .env.example .env   # preencha OPENAI_API_KEY e JARVIS_TOKEN
npm install
npm run build -w @jarvis/protocol
npm run dev:server     # porta 8787
npm run dev:hud        # http://localhost:5173
```

Na primeira abertura o HUD pede o token (`JARVIS_TOKEN`).
