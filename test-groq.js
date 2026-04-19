import { Groq } from 'groq-sdk';
import 'dotenv/config';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function run() {
  const PROCESS_SYSTEM = `Ты личный AI-ассистент для трекинга жизни.
Формат каждой записи:
- category: строго одно из "finance", "sport", "task", "note", "mood", "other"
- recurrence: строка "daily", "weekly", "monthly", "yearly" или null. ВАЖНО: Если указаны конкретные дни недели (например "понедельник, среда, пятница" или "по будням"), верни формат "weekly-1,3,5" (где 1=Пн, 2=Вт, 3=Ср, 4=Чт, 5=Пт, 6=Сб, 7=Вс).
Верни ТОЛЬКО один из двух вариантов — <records> или <question>. Никакого другого текста.`;
  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: PROCESS_SYSTEM },
      { role: 'user', content: 'Каждую среду и пятницу ходить в зал' }
    ]
  });
  console.log(completion.choices[0]?.message?.content);
}
run();
