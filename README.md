# User Authentication App

Full-stack приложение: регистрация, вход, настройки аккаунта и админ-панель.

## Возможности

- Регистрация / вход (bcrypt, сессии express-session)
- Восстановление пароля по email (Resend)
- Account Settings: смена email и пароля, удаление аккаунта, запрос прав админа
- Admin Console: пользователи, запросы на права админа (approve / decline),
  Infrastructure (реальные метрики БД и Node), Security Logs
- Вход администратора: главный админ из `.env` + пользователи, одобренные через Admin Requests

## Структура

- `server.js`, `db.js`, `schema.sql` — бэкенд и миграция (выполняется при старте, идемпотентна)
- `public/css/` — **все стили**: `base.css`, `icons.css` (иконки как CSS-маски), `auth.css`, `account.css`, `admin.css`
- `public/js/` — только поведение (`common.js` — общие помощники)

## Запуск

```bash
npm install
cp .env.example .env   # заполнить значения
npm start              # http://localhost:3000
```

При старте сервер добавляет в БД колонки `users.is_admin`, `users.password_updated_at`
и таблицу `admin_requests` (`IF NOT EXISTS`, существующие данные не трогаются).

В продакшене обязательно задайте `APP_URL`. Адрес отправителя `onboarding@resend.dev`
работает только для тестов (письма уходят лишь владельцу аккаунта Resend).
