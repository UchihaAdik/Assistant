import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchRecords, deleteRecord as apiDelete, updateTask, updateRecord, exportRecordsUrl } from '../api';
import type { LifeRecord, Category } from '../types';
import CategoryBadge from '../components/CategoryBadge';

/* ── constants ── */
const FILTERS = [
  { value: '', label: 'Все' },
  { value: 'finance', label: 'Финансы' },
  { value: 'sport', label: 'Спорт' },
  { value: 'task', label: 'Задачи' },
  { value: 'note', label: 'Заметки' },
  { value: 'other', label: 'Другое' },
];
const CAT_COLOR: Record<string, string> = {
  finance: '#e07050', sport: '#3dba6a', task: '#d4a017', note: '#4a90d9', other: '#666',
};
const CAT_BG: Record<string, string> = {
  finance: 'rgba(224,112,80,0.18)', sport: 'rgba(61,186,106,0.15)',
  task: 'rgba(212,160,23,0.15)', note: 'rgba(74,144,217,0.15)', other: 'rgba(100,100,100,0.15)',
};
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

/* ── cache: in-memory + localStorage ── */
const memCache: Record<string, LifeRecord[]> = {};
const LS_PREFIX = 'aml_rec_';
const CACHE_TTL = 60_000;

function lsGet(key: string): LifeRecord[] | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: LifeRecord[]; ts: number };
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch { return null; }
}
function lsSet(key: string, data: LifeRecord[]) {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify({ data, ts: Date.now() })); } catch { /* ignore */ }
}
function cacheInvalidate() {
  Object.keys(memCache).forEach(k => delete memCache[k]);
  Object.keys(localStorage)
    .filter(k => k.startsWith(LS_PREFIX))
    .forEach(k => localStorage.removeItem(k));
}

/* ── helpers ── */
function toYMD(d: Date) { return d.toISOString().split('T')[0]; }
function formatShort(iso: string) {
  return new Date(iso).toLocaleDateString('ru', { day: 'numeric', month: 'short' });
}
function formatDeadline(dl: string) {
  const m = dl.match(/^\d{4}-\d{2}-\d{2}/);
  if (m) return new Date(m[0] + 'T12:00').toLocaleDateString('ru', { day: 'numeric', month: 'long' });
  return dl;
}

/* ── Skeleton ── */
function Skeleton() {
  return (
    <div className="flex items-start gap-3 rounded-xl p-3.5 animate-pulse" style={{ background: '#2f2f2f' }}>
      <div className="w-8 h-8 rounded-lg flex-shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }} />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-3 rounded-full w-2/3" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <div className="h-2.5 rounded-full w-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
      </div>
    </div>
  );
}

/* ── RecordRow ── */
export interface RowActions {
  onDelete: (id: string, allFuture?: boolean) => void;
  onToggleDone: (id: string, done: boolean) => void;
  onReschedule: (id: string, deadline: string | null) => void;
  onEdit: (id: string, data: any) => void;
}

function RecordRow({ r, actions }: { r: LifeRecord; actions: RowActions }) {
  const [rescheduling, setRescheduling] = useState(false);
  const [dlInput, setDlInput] = useState(
    () => r.task?.deadline?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? ''
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({
    summary: '', details: '', amount: '', score: ''
  });
  const [delAllFuture, setDelAllFuture] = useState(false);

  const startEditing = () => {
    setEditData({
      summary: r.summary,
      details: r.details,
      amount: r.finance?.amount?.toString() ?? '',
      score: r.mood?.score?.toString() ?? ''
    });
    setEditing(true);
  };

  const isDone = r.task?.done ?? false;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: '#2f2f2f', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-start gap-2.5 px-3.5 pt-3 pb-2">
        {/* Checkbox для задач */}
        {r.task && (
          <button
            onClick={() => actions.onToggleDone(r.id, !isDone)}
            className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all"
            style={{
              borderColor: isDone ? '#4ade80' : '#555',
              background: isDone ? '#4ade80' : 'transparent',
            }}
          >
            {isDone && (
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        )}

        <span className="text-xl flex-shrink-0" style={{ opacity: isDone ? 0.4 : 1 }}>
          {r.emoji || '📌'}
        </span>

        <div className="flex-1 min-w-0" style={{ opacity: isDone ? 0.5 : 1 }}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap w-full">
              {editing ? (
                <input type="text" value={editData.summary} onChange={e => setEditData({ ...editData, summary: e.target.value })} className="w-full text-sm font-medium bg-transparent border-b outline-none" style={{ color: '#ececec', borderColor: '#cc785c' }} />
              ) : (
                <span
                  className="font-medium text-sm"
                  style={{ color: '#ececec', textDecoration: isDone ? 'line-through' : 'none' }}
                >
                  {r.summary}
                </span>
              )}
              {!editing && <CategoryBadge category={r.category as Category} />}
            </div>
            {!editing && <span className="text-[11px] flex-shrink-0" style={{ color: '#555' }}>{formatShort(r.createdAt)}</span>}
          </div>
          {editing ? (
            <input type="text" value={editData.details} onChange={e => setEditData({ ...editData, details: e.target.value })} className="w-full text-xs mt-1 bg-transparent border-b outline-none" style={{ color: '#8e8ea0', borderColor: 'rgba(255,255,255,0.1)' }} />
          ) : (
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#8e8ea0' }}>{r.details}</p>
          )}

          {r.finance && (
            <div className="mt-1.5">
              {editing ? (
                <input type="number" placeholder="Сумма" value={editData.amount} onChange={e => setEditData({ ...editData, amount: e.target.value })} className="w-20 text-xs bg-transparent border-b outline-none inline-block" style={{ color: '#ececec' }} />
              ) : (
                <span className="inline-block text-xs font-medium" style={{ color: r.finance.type === 'income' ? '#4ade80' : '#cc785c' }}>
                  {r.finance.type === 'income' ? '+' : ''}{r.finance.amount.toLocaleString('ru')} ₽
                </span>
              )}
            </div>
          )}

          {r.mood && (
            <div className="mt-1.5">
              {editing ? (
                <input type="number" placeholder="Настроение (1-10)" value={editData.score} onChange={e => setEditData({ ...editData, score: e.target.value })} className="w-20 text-xs bg-transparent border-b outline-none inline-block" style={{ color: '#a78bfa' }} />
              ) : (
                <span className="inline-block text-xs font-medium" style={{ color: '#a78bfa' }}>Настроение: {r.mood.score}/10</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Дедлайн задачи */}
      {r.task && (
        <div className="px-3.5 pb-2.5" style={{ marginLeft: r.task ? '2.25rem' : '0' }}>
          {rescheduling ? (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dlInput}
                onChange={e => setDlInput(e.target.value)}
                className="flex-1 text-xs rounded-lg px-2.5 py-1.5 outline-none"
                style={{ background: '#1d1d1d', color: '#ececec', border: '1px solid rgba(255,255,255,0.15)' }}
              />
              <button
                onClick={() => { setRescheduling(false); actions.onReschedule(r.id, dlInput || null); }}
                className="px-2.5 py-1 rounded-lg text-xs font-medium"
                style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}
              >
                Сохранить
              </button>
              <button
                onClick={() => setRescheduling(false)}
                className="px-2 py-1 text-xs"
                style={{ color: '#8e8ea0' }}
              >
                Отмена
              </button>
            </div>
          ) : (
            <button
              onClick={() => !isDone && setRescheduling(true)}
              className="flex items-center gap-1.5 text-xs"
              style={{ color: r.task?.deadline ? '#8e8ea0' : '#444', cursor: isDone ? 'default' : 'pointer' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              {r.task?.deadline
                ? formatDeadline(r.task.deadline)
                : isDone ? '—' : 'Добавить срок'}
            </button>
          )}
        </div>
      )}

      {/* Удаление и Редактирование */}
      <div
        className="flex items-center justify-end px-3 pb-2 gap-1"
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
      >
        {editing ? (
          <div className="flex items-center gap-2 py-0.5">
            <button
              onClick={() => {
                actions.onEdit(r.id, {
                  summary: editData.summary,
                  details: editData.details,
                  amount: editData.amount ? parseFloat(editData.amount) : undefined,
                  score: editData.score ? parseFloat(editData.score) : undefined
                });
                setEditing(false);
              }}
              className="px-2.5 py-1 rounded-lg text-xs font-medium"
              style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}
            >
              Сохранить
            </button>
            <button onClick={() => setEditing(false)} className="px-2 py-1 text-xs" style={{ color: '#8e8ea0' }}>Отмена</button>
          </div>
        ) : confirmDelete ? (
          <div className="flex flex-col gap-2 py-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: '#8e8ea0' }}>Удалить запись?</span>
              <button
                onClick={() => { setConfirmDelete(false); actions.onDelete(r.id, delAllFuture); }}
                className="px-2.5 py-1 rounded-lg text-xs font-medium"
                style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171' }}
              >
                Удалить
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 text-xs"
                style={{ color: '#8e8ea0' }}
              >
                Отмена
              </button>
            </div>
            {r.routineId && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={delAllFuture} 
                  onChange={e => setDelAllFuture(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[#cc785c]"
                />
                <span className="text-[10px]" style={{ color: '#8e8ea0' }}>Удалить всю серию (будущие задачи)</span>
              </label>
            )}
          </div>
        ) : (
          <>
            <button
              onClick={startEditing}
              className="p-1.5 rounded-lg transition-colors hover:text-[#ececec]"
              style={{ color: '#3a3a3a' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: '#3a3a3a' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
              onMouseLeave={e => (e.currentTarget.style.color = '#3a3a3a')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════
   DAY VIEW
════════════════════════════════ */
function DayView({
  dateYMD, records, onBack, actions,
}: {
  dateYMD: string;
  records: LifeRecord[];
  onBack: () => void;
  actions: RowActions;
}) {
  const label = new Date(dateYMD + 'T12:00').toLocaleDateString('ru', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="flex flex-col h-full" style={{ background: '#212121' }}>
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-lg" style={{ color: '#8e8ea0' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <p className="text-sm font-semibold capitalize" style={{ color: '#ececec' }}>{label}</p>
          <p className="text-[11px]" style={{ color: '#8e8ea0' }}>{records.length} записей</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {records.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-2">
            <span className="text-4xl">📅</span>
            <p className="text-sm" style={{ color: '#8e8ea0' }}>В этот день нет записей</p>
          </div>
        ) : (
          records.map(r => <RecordRow key={r.id} r={r} actions={actions} />)
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════
   MONTH BLOCK
════════════════════════════════ */
function MonthBlock({ year, month, dayMap, todayYMD, onSelectDay }: {
  year: number;
  month: number;
  dayMap: Record<string, LifeRecord[]>;
  todayYMD: string;
  onSelectDay: (d: string) => void;
}) {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);

  return (
    <div className="mb-1">
      <div
        className="px-3 py-2.5 sticky top-0 z-10"
        style={{ background: '#212121', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <span className="text-sm font-bold" style={{ color: '#ececec' }}>
          {MONTHS_RU[month]} {year}
        </span>
      </div>

      <div className="grid grid-cols-7 px-2 pt-1">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className="text-center text-[10px] font-medium py-1"
            style={{ color: i >= 5 ? 'rgba(204,120,92,0.5)' : '#3a3a3a' }}>
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 px-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} style={{ minHeight: 62 }} />;
          const col = i % 7;
          const d = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const recs = dayMap[d] ?? [];
          const isToday = d === todayYMD;
          const hasRecs = recs.length > 0;
          const isWeekend = col >= 5;

          return (
            <button
              key={i}
              onClick={() => onSelectDay(d)}
              className="flex flex-col items-stretch transition-all active:scale-95"
              style={{ minHeight: 62, borderTop: '1px solid rgba(255,255,255,0.04)' }}
            >
              <div className="flex justify-center pt-1.5 pb-1">
                <span
                  className="w-6 h-6 flex items-center justify-center rounded-full text-[12px] font-semibold"
                  style={{
                    background: isToday ? '#cc785c' : 'transparent',
                    color: isToday ? '#fff'
                      : hasRecs ? '#ececec'
                        : isWeekend ? 'rgba(204,120,92,0.4)'
                          : '#3d3d3d',
                  }}
                >
                  {day}
                </span>
              </div>
              <div className="px-0.5 pb-1 space-y-0.5">
                {recs.slice(0, 2).map((r, j) => (
                  <div
                    key={j}
                    className="text-[9px] font-medium px-1 py-0.5 rounded truncate leading-tight"
                    style={{
                      background: CAT_BG[r.category],
                      color: CAT_COLOR[r.category],
                      opacity: r.task?.done ? 0.45 : 1,
                      textDecoration: r.task?.done ? 'line-through' : 'none',
                    }}
                  >
                    {r.emoji} {r.summary}
                  </div>
                ))}
                {recs.length > 2 && (
                  <div className="text-[9px] px-1" style={{ color: '#555' }}>+{recs.length - 2}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════════════════════
   INFINITE CALENDAR
════════════════════════════════ */
function CalendarView({ records, actions }: { records: LifeRecord[]; actions: RowActions }) {
  const todayYMD = toYMD(new Date());
  const now = new Date();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [months, setMonths] = useState(() =>
    Array.from({ length: 9 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i - 4, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    })
  );

  const todayRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const botRef = useRef<HTMLDivElement>(null);

  const dayMap = records.reduce<Record<string, LifeRecord[]>>((acc, r) => {
    let d = toYMD(new Date(r.createdAt));
    if (r.task?.deadline) {
      const dl = r.task.deadline.match(/^\d{4}-\d{2}-\d{2}/);
      if (dl) d = dl[0];
    }
    (acc[d] ??= []).push(r);
    return acc;
  }, {});

  useEffect(() => {
    setTimeout(() => todayRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' }), 30);
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      setMonths(prev => {
        const d = new Date(prev[0].year, prev[0].month - 1, 1);
        return [{ year: d.getFullYear(), month: d.getMonth() }, ...prev];
      });
    }, { threshold: 0.1 });
    if (topRef.current) obs.observe(topRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      setMonths(prev => {
        const last = prev[prev.length - 1];
        const d = new Date(last.year, last.month + 1, 1);
        return [...prev, { year: d.getFullYear(), month: d.getMonth() }];
      });
    }, { threshold: 0.1 });
    if (botRef.current) obs.observe(botRef.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="flex-1 relative overflow-hidden">
      <div className="h-full overflow-y-auto">
        <div ref={topRef} className="h-1" />
        {months.map(({ year, month }) => {
          const isCur = year === now.getFullYear() && month === now.getMonth();
          return (
            <div key={`${year}-${month}`} ref={isCur ? todayRef : undefined}>
              <MonthBlock
                year={year} month={month} dayMap={dayMap}
                todayYMD={todayYMD} onSelectDay={setSelectedDay}
              />
            </div>
          );
        })}
        <div ref={botRef} className="h-1" />
      </div>

      {selectedDay && (
        <div className="absolute inset-0 z-20" style={{ background: '#212121' }}>
          <DayView
            dateYMD={selectedDay}
            records={dayMap[selectedDay] ?? []}
            onBack={() => setSelectedDay(null)}
            actions={actions}
          />
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════
   MAIN
════════════════════════════════ */
type ViewMode = 'list' | 'calendar';

export default function Records() {
  const [records, setRecords] = useState<LifeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('list');
  const [calendarKey, setCalendarKey] = useState(0);

  const load = useCallback(async (cat: string) => {
    const key = cat || '__all__';

    // Показать кеш мгновенно — без мерцания загрузки
    const cached = lsGet(key) ?? memCache[key] ?? null;
    if (cached) {
      memCache[key] = cached;
      setRecords(cached);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await fetchRecords(cat ? { category: cat } : undefined);
      memCache[key] = data;
      lsSet(key, data);
      setRecords(data);
      setCalendarKey(k => k + 1); // сбросить календарь к сегодня только при реальном fetch
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(category); }, [category, load]);

  /* Оптимистичные мутации */
  const handleDelete = useCallback(async (id: string, allFuture?: boolean) => {
    if (allFuture) {
      const routineId = records.find(r => r.id === id)?.routineId;
      if (routineId) {
        setRecords(prev => prev.filter(r => r.routineId !== routineId));
      } else {
        setRecords(prev => prev.filter(r => r.id !== id));
      }
    } else {
      setRecords(prev => prev.filter(r => r.id !== id));
    }
    cacheInvalidate();
    try { 
      const url = allFuture ? `${id}?allFuture=true` : id;
      await apiDelete(url); 
    }
    catch { void load(category); }
  }, [category, load, records]);

  const handleToggleDone = useCallback(async (id: string, done: boolean) => {
    setRecords(prev => prev.map(r =>
      r.id === id && r.task
        ? { ...r, task: { ...r.task, done, doneAt: done ? new Date().toISOString() : null } }
        : r
    ));
    cacheInvalidate();
    try { await updateTask(id, { done }); }
    catch { void load(category); }
  }, [category, load]);

  const handleReschedule = useCallback(async (id: string, deadline: string | null) => {
    setRecords(prev => prev.map(r =>
      r.id === id && r.task
        ? { ...r, task: { ...r.task, deadline: deadline ?? undefined } }
        : r
    ));
    cacheInvalidate();
    try { await updateTask(id, { deadline }); }
    catch { void load(category); }
  }, [category, load]);

  const handleEdit = useCallback(async (id: string, updateData: any) => {
    setRecords(prev => prev.map(r => r.id === id ? {
      ...r,
      summary: updateData.summary || r.summary,
      details: updateData.details || r.details,
      finance: r.finance && updateData.amount !== undefined ? { ...r.finance, amount: updateData.amount } : r.finance,
      mood: updateData.score !== undefined ? { ...r.mood, score: updateData.score } : r.mood
    } : r));
    cacheInvalidate();
    try { await updateRecord(id, updateData); }
    catch { void load(category); }
  }, [category, load]);

  const rowActions: RowActions = {
    onDelete: handleDelete,
    onToggleDone: handleToggleDone,
    onReschedule: handleReschedule,
    onEdit: handleEdit,
  };

  const filteredRecords = records.filter(r => {
    const textMatch = (r.summary + ' ' + r.details).toLowerCase().includes(search.toLowerCase());
    if (!textMatch) return false;

    // In List view, hide future tasks to keep it tidy (EduSchool Style)
    if (view === 'list') {
      const deadline = r.task?.deadline;
      if (deadline) {
        const dlDate = new Date(deadline + 'T23:59:59');
        if (dlDate < new Date()) return true; // Past or today (if already passed)
        
        const today = new Date();
        today.setHours(0,0,0,0);
        const dl = new Date(deadline + 'T00:00:00');
        if (dl > today) return false; // Future
      }
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full" style={{ background: '#212121' }}>
      {/* Header */}
      <header
        className="px-4 py-2.5 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold" style={{ color: '#ececec' }}>Записи</p>
          {refreshing && (
            <div
              className="w-3 h-3 border rounded-full animate-spin"
              style={{ borderColor: 'rgba(255,255,255,0.1)', borderTopColor: '#8e8ea0' }}
            />
          )}
        </div>
        <div
          className="flex rounded-lg overflow-hidden p-0.5 gap-0.5"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
            <button
              onClick={() => window.open(exportRecordsUrl(), '_blank')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#8e8ea0', marginRight: '8px' }}
              title="Экспорт в CSV"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Экспорт
            </button>
          {([
            ['list', 'Список', 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'],
            ['calendar', 'Календарь', 'M8 2v4M16 2v4M3 8h18M3 4h18a2 2 0 012 2v14a2 2 0 01-2 2H3a2 2 0 01-2-2V6a2 2 0 012-2z'],
          ] as const).map(([v, label, path]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{
                background: view === v ? '#cc785c' : 'transparent',
                color: view === v ? '#fff' : '#8e8ea0',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d={path} />
              </svg>
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* Поиск */}
      <div className="px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2 transition-all"
          style={{ background: '#2f2f2f', border: search ? '1px solid rgba(204,120,92,0.5)' : '1px solid rgba(255,255,255,0.08)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8e8ea0" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по записям..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#8e8ea0]"
            style={{ color: '#ececec' }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="p-0.5 rounded-full hover:bg-[#3a3a3a]" style={{ color: '#8e8ea0' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {view === 'calendar' ? (
        loading
          ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ background: '#8e8ea0', animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )
          : <CalendarView key={calendarKey} records={filteredRecords} actions={rowActions} />
      ) : (
        <>
          {/* Фильтры */}
          <div
            className="flex gap-1.5 px-4 py-2.5 overflow-x-auto scrollbar-hide flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setCategory(f.value)}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={category === f.value
                  ? { background: '#cc785c', color: '#fff' }
                  : { background: 'rgba(255,255,255,0.06)', color: '#8e8ea0' }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Список */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {loading ? (
              <><Skeleton /><Skeleton /><Skeleton /><Skeleton /></>
            ) : records.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-2">
                <span className="text-4xl">📭</span>
                <p className="text-sm" style={{ color: '#8e8ea0' }}>Нет записей</p>
              </div>
            ) : (
              filteredRecords.map(r => <RecordRow key={r.id} r={r} actions={rowActions} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}
