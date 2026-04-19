import type { ParsedRecord, Category } from '../types';
import CategoryBadge from './CategoryBadge';

interface Props {
  record: ParsedRecord;
}

export default function RecordCard({ record }: Props) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl p-3"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <span className="text-xl leading-none mt-0.5 flex-shrink-0">{record.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="font-medium text-[#ececec] text-sm">{record.summary}</span>
          <CategoryBadge category={record.category as Category} />
        </div>
        <p className="text-xs leading-relaxed" style={{ color: '#8e8ea0' }}>{record.details}</p>
        {(record.amount != null || record.deadline) && (
          <div className="flex flex-wrap gap-3 mt-1.5">
            {record.amount != null && (
              <span className="text-xs font-medium" style={{ color: '#cc785c' }}>
                {record.amount.toLocaleString('ru')} ₽
              </span>
            )}
            {record.deadline && (
              <span className="text-xs" style={{ color: '#8e8ea0' }}>⏰ {record.deadline}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
