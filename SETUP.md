# AnalysisMyLife — Инструкция по запуску

## 1. Предварительные требования

- Node.js 20+
- npm 10+
- Аккаунт Supabase (база данных)
- API ключ Google Gemini (бесплатно)

## 2. Клонирование и установка

```bash
# Установить все зависимости
npm run install:all
```

## 3. Настройка переменных окружения

```bash
cp .env.example .env
```

Отредактируй `.env`:

```env
DATABASE_URL=postgresql://postgres:[пароль]@db.[project-id].supabase.co:5432/postgres
GEMINI_API_KEY=AIzaSy...
PORT=3001
```

**Получить DATABASE_URL из Supabase:**
Settings → Database → Connection string → URI

**Получить GEMINI_API_KEY:**
https://aistudio.google.com/app/apikey

## 4. Настройка базы данных

```bash
# Синхронизировать схему с Supabase
npm run db:push

# Сгенерировать Prisma клиент
npm run db:generate
```

## 5. Запуск в режиме разработки

```bash
npm run dev
```

- Клиент: http://localhost:5173
- Сервер: http://localhost:3001

## 6. Деплой

### Frontend → Vercel

```bash
cd client
# В настройках Vercel добавь переменную:
# VITE_API_URL=https://your-server-url.railway.app
```

### Backend → Railway / Render

В настройках добавь переменные:
- `DATABASE_URL`
- `GEMINI_API_KEY`
- `PORT=3001`
- `CLIENT_URL=https://your-app.vercel.app`

## Структура проекта

```
.
├── prisma/
│   └── schema.prisma        # Схема БД
├── server/
│   └── src/
│       ├── index.ts          # Express сервер
│       ├── lib/prisma.ts     # Prisma клиент
│       ├── services/gemini.ts # Gemini AI
│       └── routes/           # API endpoints
├── client/
│   └── src/
│       ├── pages/Chat.tsx    # Чат-интерфейс
│       ├── pages/Dashboard.tsx # Графики
│       └── pages/Records.tsx  # Список записей
└── .env                      # Секреты (не коммитить!)
```
