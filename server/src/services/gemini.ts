import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

/* ── Shared date context ── */
function makeDateContext() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayISO = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const tomorrowD = new Date(now); tomorrowD.setDate(tomorrowD.getDate() + 1);
  const tomorrowISO = `${tomorrowD.getFullYear()}-${pad(tomorrowD.getMonth() + 1)}-${pad(tomorrowD.getDate())}`;
  const todayLabel = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return { todayISO, tomorrowISO, todayLabel };
}

/* ════════════════════════════════
   PROCESS MESSAGE
   Returns parsed records OR signals a question
════════════════════════════════ */
const PROCESS_SYSTEM = `Ты личный AI-ассистент для трекинга жизни.

Определи тип сообщения:

▶ Если пользователь записывает новую информацию (события, траты, задачи, тренировки, мысли, планы, настроение) →
  Верни JSON-массив записей внутри тега <records>.

▶ Если пользователь задаёт вопрос о своих данных (что запланировано, сколько потратил, какие задачи, что делал, и т.д.) →
  Верни ТОЛЬКО: <question>{"scope":"tasks"}</question>
  scope может быть: "tasks", "finance", "sport", "mood", "all"

ВАЖНО: создавай записи ТОЛЬКО из того, что написано. Не добавляй ничего лишнего.

Категории для записей:
- sport — спорт, тренировки, физическая активность
- task — задачи, дела, напоминания, планы
- finance — траты, доходы, финансы (amount в рублях)
- note — заметки, мысли, наблюдения
- mood — настроение, жалобы, радость (score от 1 до 10)
- other — всё остальное

Формат каждой записи:
- category: одна из категорий выше
- summary: краткое название 3-5 слов на русском
- details: одно предложение с деталями на русском
- emoji: один подходящий эмодзи
- amount: число в рублях или null (только для finance)
- deadline: дата в формате YYYY-MM-DD или null. ВАЖНО: Если есть recurrence (повтор), оставь deadline равным null — сервер сам вычислит ближайшую дату.
- recurrence: строка "daily", "weekly", "monthly", "yearly" или null. ВАЖНО: Если указаны конкретные дни недели (например "понедельник, среда, пятница" или "по будням"), верни формат "weekly-1,3,5" (где 1=Пн, 2=Вт, 3=Ср, 4=Чт, 5=Пт, 6=Сб, 7=Вс). Обязательно используй этот формат для регулярных тренировок или дел.
- score: число от 1 до 10 или null (только для mood, оценка настроения: 1 - ужасно, 10 - отлично)

Верни ТОЛЬКО один из двух вариантов — <records> или <question>. Никакого другого текста.`;

export interface ParsedRecord {
  category: string;
  summary: string;
  details: string;
  emoji: string;
  amount: number | null;
  deadline: string | null;
  recurrence: string | null;
  score: number | null;
}

export type ProcessResult =
  | { type: 'records'; records: ParsedRecord[] }
  | { type: 'question'; scope: string };

export async function processMessage(text: string): Promise<ProcessResult> {
  const { todayISO, tomorrowISO, todayLabel } = makeDateContext();
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');

  const dateCtx = `Сегодня: ${todayISO} (${todayLabel}).
ОБЯЗАТЕЛЬНО для поля deadline: возвращай дату в формате YYYY-MM-DD.
- "завтра" → "${tomorrowISO}"
- "20 число" → "${now.getFullYear()}-${pad(now.getMonth() + 1)}-20"
- "20 мая" → "${now.getFullYear()}-05-20"
- если месяц не указан — текущий месяц (${pad(now.getMonth() + 1)})
- если дата уже прошла — переноси на следующий месяц`;

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: PROCESS_SYSTEM + '\n\n' + dateCtx },
      { role: 'user', content: text },
    ],
    temperature: 0.2,
    max_tokens: 1024,
  });

  const response = completion.choices[0]?.message?.content ?? '';

  // Check for question
  const qMatch = response.match(/<question>([\s\S]*?)<\/question>/);
  if (qMatch) {
    try {
      const { scope } = JSON.parse(qMatch[1]) as { scope: string };
      return { type: 'question', scope: scope || 'all' };
    } catch {
      return { type: 'question', scope: 'all' };
    }
  }

  // Parse records
  const rMatch = response.match(/<records>([\s\S]*?)<\/records>/);
  if (!rMatch) {
    throw new Error(`Не удалось распарсить ответ: ${response.slice(0, 200)}`);
  }

  console.log('[AI raw records]', JSON.stringify(JSON.parse(rMatch[1])));
  const parsed = JSON.parse(rMatch[1]);
  const records: ParsedRecord[] = Array.isArray(parsed) ? parsed : [parsed];

  return {
    type: 'records',
    records: records.map((r) => ({
      category: r.category || 'other',
      summary: r.summary || 'Без названия',
      details: r.details || '',
      emoji: r.emoji || '📌',
      amount: typeof r.amount === 'number' ? r.amount : null,
      deadline: r.deadline || null,
      recurrence: r.recurrence || null,
      score: typeof r.score === 'number' ? r.score : null,
    })),
  };
}

/* ════════════════════════════════
   ANSWER QUESTION
   Gets user records from DB, returns natural language answer
════════════════════════════════ */
interface CompactRecord {
  id: string;
  type: string;
  what: string;
  details: string;
  when: string;
  deadline?: string | null;
  done?: boolean;
  amount?: number;
  currency?: string;
  financeType?: string;
}

function compactRecord(r: Record<string, unknown>): CompactRecord {
  const createdAt = r.createdAt instanceof Date
    ? r.createdAt.toISOString().split('T')[0]
    : String(r.createdAt).split('T')[0];

  const base: CompactRecord = {
    id: String(r.id),
    type: String(r.category),
    what: String(r.summary),
    details: String(r.details),
    when: createdAt,
  };

  const task = r.task as Record<string, unknown> | null | undefined;
  const finance = r.finance as Record<string, unknown> | null | undefined;
  const mood = r.mood as Record<string, unknown> | null | undefined;

  if (task) {
    base.deadline = task.deadline as string | null;
    base.done = task.done as boolean;
  }
  if (finance) {
    base.amount = finance.amount as number;
    base.currency = 'RUB';
    base.financeType = finance.type as string;
  }
  if (mood && typeof mood.score === 'number') {
    base.details += ` [Настроение: ${mood.score}/10]`;
  }
  return base;
}

export async function answerQuestion(
  question: string,
  dbRecords: Record<string, unknown>[],
  todayISO: string
): Promise<string> {
  const compact = dbRecords.map(compactRecord);
  const dataStr = compact.length > 0
    ? JSON.stringify(compact, null, 1)
    : 'Записей не найдено.';

  const systemPrompt = `Ты личный ассистент для трекинга жизни.
Отвечай кратко, дружелюбно, на русском языке. Используй эмодзи умеренно.
Не выдумывай данные которых нет. Если данных нет — честно скажи.
Сегодня: ${todayISO}.

Данные пользователя:
${dataStr}`;

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ],
    temperature: 0.5,
    max_tokens: 512,
  });

  return completion.choices[0]?.message?.content?.trim() ?? 'Не смог ответить на вопрос.';
}

/* ════════════════════════════════
   WEEKLY DIGEST
════════════════════════════════ */
export async function weeklyDigest(
  records: Record<string, unknown>[],
  todayISO: string
): Promise<string> {
  const compact = records.map(compactRecord);

  const systemPrompt = `Ты личный ассистент для трекинга жизни.
Составь краткий дайджест за прошедшую неделю на русском языке.
Структура ответа:
1. Краткое резюме (1-2 предложения)
2. Что сделано: выполненные задачи, тренировки
3. Финансы: сколько потрачено (если есть данные)
4. Незакрытые задачи (если есть)
5. Один совет или наблюдение

Используй эмодзи умеренно. Будь конкретным — называй суммы, количества.
Если данных нет за какой-то раздел — пропусти его.
Сегодня: ${todayISO}.`;

  const dataStr = compact.length > 0
    ? JSON.stringify(compact, null, 1)
    : 'За эту неделю записей не найдено.';

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Вот мои данные за неделю:\n${dataStr}\n\nСделай дайджест.` },
    ],
    temperature: 0.6,
    max_tokens: 700,
  });

  return completion.choices[0]?.message?.content?.trim() ?? 'Не удалось сформировать дайджест.';
}

/** @deprecated use processMessage */
export async function parseWithGemini(text: string): Promise<ParsedRecord[]> {
  const result = await processMessage(text);
  if (result.type === 'records') return result.records;
  return [];
}

export async function generateInsight(records: Record<string, unknown>[]): Promise<string> {
  const prompt = `Ты умный личный AI-аналитик. Проанализируй логи жизни пользователя за последние пару недель.
Найди 1 ОДИН самый мощный, нетривиальный паттерн (инсайт) или корреляцию.
Например: "В дни, когда вы тратите больше 1500 руб, ваше настроение падает" или "Спорт регулярно повышает вашу продуктивность выполнения задач".
Пиши коротко, 1-2 предложения, дружелюбно, используй пару эмодзи. Не описывай сами данные, дай именно ВЫВОД.

Данные пользователя:
${JSON.stringify(records.map(r => {
  const rec = r as any;
  return { date: rec.createdAt, cat: rec.category, summary: rec.summary, amount: rec.finance?.amount, mood: rec.mood?.score, done: rec.task?.done };
}))}
`;
  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: 'Ты коротко выдаешь инсайты.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 300
  });
  return completion.choices[0]?.message?.content?.trim() || 'Инсайт пока не готов.';
}
