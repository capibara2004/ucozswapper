# UcozSwapper — технический запуск

Production-развёртывание в uCoz Server Scripts описано в `DEPLOY-UCOZ.md`.

## Требования

- Git 2.x.
- Node.js `^20.19.0` или `>=22.12.0`; рекомендуется актуальная LTS 22+.
- npm из комплекта Node.js.

Python, глобальный Vite/Fastify/ucoz-mcp и GitHub CLI не требуются. Sharp ставится как dev-зависимость frontend.

## Установка

Из корня проекта в CMD:

```cmd
npm ci
npm --prefix client ci
npm --prefix server ci
copy server\.env.example server\.env
```

## Конфигурация

Секреты находятся только в `server\.env`, который исключён из Git:

```dotenv
PORT=3001
NODE_ENV=development
DEMO_FALLBACK=true

ZENROWS_API_KEY=
ZENROWS_CAPTURE_XHR=false
ZENROWS_EMPTY_RETRY=true

NEXUS_API_KEY=
NEXUS_API_BASE_URL=https://api.nexus-hub.tech/v1
NEXUS_MODEL=gemini-3.8-flash
AI_DEMO_FALLBACK=false

UCOZ_SITE_URL=
UCOZ_PUBLISH_MODE=ftp
UCOZ_API_TOKEN=
UCOZ_FTP_HOST=
UCOZ_FTP_USER=
UCOZ_FTP_PASS=
```

`WB_API_TOKEN`, `OZON_CLIENT_ID` и `OZON_API_KEY` приложением не используются: обе поддерживаемые площадки (WB и Avito) сейчас разбираются через ZenRows.

Ключ пользователя для `POST /api/publish/uapi` в `.env` не нужен: UI отправляет его один раз в body, сервер использует его для одного Pages-запроса и не сохраняет.

## Запуск

```cmd
npm run dev
```

- frontend: `http://127.0.0.1:5173`;
- backend: `http://127.0.0.1:3001`;
- Vite проксирует `/api/*` на backend.

Отдельно:

```cmd
npm run dev:client
npm run dev:server
```

## Проверки

```cmd
npm run build
npm --prefix server run smoke:generate
curl http://127.0.0.1:3001/api/health
```

`smoke:generate` делает реальный Nexus/Gemini запрос и проверяет JSON, случайный preset и HTML gallery controls. Он расходует квоту LLM.

Основные endpoints:

- `GET /api/health` — состояние интеграций;
- `POST /api/parse` — WB URL → ProductDTO;
- `POST /api/generate` — ProductDTO → AI content + random design + HTML;
- `POST /api/publish` — configured demo-uCoz;
- `POST /api/publish/uapi` — новая Pages-страница на пользовательском uCoz.

## uAPI publication

Для пользовательского сайта нужны:

1. HTTPS URL сайта uCoz.
2. uAPI key формата `sk_live_...` с минимальными правами на модуль Pages.
3. Включённый модуль Pages на целевом сайте.

В production backend принимает ключи только по HTTPS с учётом reverse-proxy headers. Перед публичным запуском дополнительно включить rate limit, redaction чувствительных полей в логах и ограничение body size.

## Git hygiene

Перед первым commit:

```cmd
git status --short
git diff
git diff --cached
```

Не коммитить `.env`, `node_modules`, `client\dist`, логи, дампы запросов и API keys. Все ключи, показанные в чатах или скриншотах, необходимо ротировать.
