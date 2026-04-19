import type { Category } from '../types';

const CONFIG: Record<Category, { label: string; color: string; bg: string }> = {
  sport:   { label: 'Спорт',    color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
  task:    { label: 'Задача',   color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
  finance: { label: 'Финансы',  color: '#cc785c', bg: 'rgba(204,120,92,0.15)' },
  note:    { label: 'Заметка',  color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
  other:   { label: 'Другое',   color: '#8e8ea0', bg: 'rgba(142,142,160,0.1)' },
};

export default function CategoryBadge({ category }: { category: Category }) {
  const c = CONFIG[category] ?? CONFIG.other;
  return (
    <span
      className="text-[11px] font-medium px-2 py-0.5 rounded-md"
      style={{ color: c.color, background: c.bg }}
    >
      {c.label}
    </span>
  );
}
