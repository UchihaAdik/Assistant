export type Category = 'sport' | 'task' | 'finance' | 'note' | 'mood' | 'other';

export interface LifeRecord {
  id: string;
  userId?: string | null;
  category: Category;
  summary: string;
  details: string;
  emoji: string;
  createdAt: string;
  routineId?: string | null;
  finance?: { amount: number; currency: string; type: string } | null;
  sport?: { duration?: number | null; sets?: number | null; reps?: number | null } | null;
  task?: { deadline?: string | null; priority: string; done: boolean; doneAt?: string | null; recurrence?: string | null } | null;
  note?: { pinned: boolean } | null;
  mood?: { score: number } | null;
}

export interface ParsedRecord {
  category: Category;
  summary: string;
  details: string;
  emoji: string;
  amount: number | null;
  deadline: string | null;
  recurrence: string | null;
  score: number | null;
}

export interface Stats {
  categoryStats: { [key: string]: number };
  financeByDay: { date: string; amount: number }[];
  sportByDay: { date: string; count: number }[];
  moodByDay: { date: string; averageScore: number }[];
  total: number;
  pendingTasks: number;
  streak: number;
}

export interface Budget {
  id: string;
  category: string;
  amount: number;
  period: string;
  spent: number;
}

export interface BudgetResponse {
  budgets: Budget[];
  monthlySpend: number;
}

export type ChatMessage = {
  id: string;
  text: string;
  type: 'user' | 'assistant';
  answerType?: 'records' | 'answer';
  records?: ParsedRecord[];
  saved?: boolean;
  loading?: boolean;
  error?: string;
};
