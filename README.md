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
docker compose up -d   # Postgres + pgvector local
npm install
npm run build -w @jarvis/protocol
npm run dev:server     # porta 8787
npm run dev:hud        # http://localhost:5173
```

Na primeira abertura o HUD pede o token (`JARVIS_TOKEN`). As migrations rodam sozinhas quando o servidor sobe.

## Memória

- **Perfil** (`perfil`): itens curtos sobre a pessoa, por categoria, com confiança e origem
  (percebido, você disse, você corrigiu). O que a pessoa disse ou corrigiu só muda com outra fala dela.
- **Reflexão**: depois de 2 min sem mensagens (ou 20 acumuladas, ou ao desconectar), o modelo lê a conversa
  e propõe mudanças no perfil e uma lembrança. A conversa crua é apagada 30 dias depois de refletida.
- **Lembranças** (`episodios`): resumos com embedding; as mais parecidas com a mensagem entram no prompt.
- No HUD, `/perfil` abre o painel para ver, corrigir, esquecer e adicionar.

## Testes

```bash
npm test -w @jarvis/server
# com o banco: crie um banco descartável e passe TEST_DATABASE_URL
TEST_DATABASE_URL=postgres://jarvis:jarvis-local@127.0.0.1:54329/jarvis_teste npm test -w @jarvis/server
```
