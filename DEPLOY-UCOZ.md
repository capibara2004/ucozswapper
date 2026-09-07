# Развёртывание UcozSwapper в uCoz Server Scripts

## 1. Подготовить production-каталог

Из корня проекта выполните:

```cmd
npm run deploy:ucoz
```

Команда собирает React-приложение и создаёт каталог `deploy\ucozswapper` со всем, что требуется серверу:

- `app.js` — точка входа Passenger;
- `package.json` и `package-lock.json` — backend-зависимости;
- `server\src` — Fastify API;
- `client\dist` — готовый frontend.

`node_modules` и `.env` в этот каталог не включаются.

## 2. Создать Node.js-приложение в панели uCoz

Используйте такие значения:

- версия Node.js: `22.23.0`;
- режим: `Продакшн`;
- корень приложения: суффикс `ucozswapper` внутри предложенного каталога `app_node`;
- URL приложения: суффикс `ucozswapper` после выделенного домена `usites.app`;
- файл запуска: `app.js`;
- Passenger log: файл `passenger.log` внутри предложенного каталога `logs`.

Не задавайте `PORT`: его передаёт среда запуска. `NODE_ENV=production` выставляется выбранным режимом приложения.

## 3. Переменные окружения

Не нужно переносить в панель каждую строку из локального `server\.env`. Для основной цепочки «парсинг → AI → preview» обязательны только два секрета:

```text
ZENROWS_API_KEY=<секрет>
NEXUS_API_KEY=<секрет>
```

Следующие настройки можно добавить явно; если их не указывать, приложение использует показанные значения по умолчанию:

```text
NEXUS_API_BASE_URL=https://api.nexus-hub.tech/v1
NEXUS_MODEL=gemini-3.8-flash
DEMO_FALLBACK=false
AI_DEMO_FALLBACK=false
ZENROWS_CAPTURE_XHR=false
ZENROWS_EMPTY_RETRY=true
```

`PORT` добавлять нельзя — его назначает Passenger. `NODE_ENV` отдельно добавлять не требуется: режим «Продакшн» устанавливает `NODE_ENV=production`.

Для кнопки `Demo uCoz`, публикующей HTML через MCP → FTP, дополнительно нужны:

```text
UCOZ_PUBLISH_MODE=ftp
UCOZ_SITE_URL=https://<demo-site>
UCOZ_FTP_HOST=<ftp-host>
UCOZ_FTP_USER=<ftp-user>
UCOZ_FTP_PASS=<ftp-password>
```

`UCOZ_API_TOKEN` нужен только для режима публикации `pages` через MCP. Для режима `ftp` достаточно URL сайта и трёх FTP-параметров. Пользовательская публикация через uAPI берёт ключ из защищённого HTTPS-запроса и не сохраняет его в `.env`.

`WB_API_TOKEN`, `OZON_CLIENT_ID` и `OZON_API_KEY` не добавляйте: текущая версия их не использует.

Секреты добавляйте только через блок переменных окружения в панели. Не загружайте `server\.env` и не коммитьте ключи в Git.

## 4. Загрузить файлы и установить зависимости

Через загрузчик панели или отдельный FTP для Server Scripts загрузите **содержимое** `deploy\ucozswapper` в фактический корень приложения `app_node\ucozswapper`. Не создавайте внутри него ещё один каталог `ucozswapper`, иначе `app.js` окажется уровнем ниже.

После загрузки:

1. Нажмите `Использовать package.json`.
2. Нажмите `Run NPM Install`.
3. Дождитесь успешного завершения установки.
4. Нажмите `Restart` у Node.js-приложения.

Важно: FTP сайта uCoz и FTP Server Scripts — разные хранилища. Для приложения используйте учётную запись из вкладки `FTP для серверных скриптов`.

## 5. Проверка

Откройте:

```text
https://<account>.usites.app/api/health
```

Ожидается JSON с `"ok": true`, `llm.configured: true`. Затем откройте корневой URL приложения, проверьте одну карточку WB, генерацию и оба варианта публикации.

Если приложение не запускается, сначала проверьте Passenger log и журнал npm, затем исправьте причину и снова нажмите `Restart`.
