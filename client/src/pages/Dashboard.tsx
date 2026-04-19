import { useEffect, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { fetchStats, fetchBudget, saveBudget, fetchInsight } from '../api';
import type { Stats, BudgetResponse } from '../types';

function InsightBlock() {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const handleClick = async () => {
    setLoading(true);
    try {
      const text = await fetchInsight();
      setInsight(text);
    } catch {
      setInsight('Не удалось сгенерировать инсайт. Проверьте сеть.');
    }
    setLoading(false);
  };

  if (insight) {
    return <p className="text-sm mt-1 leading-relaxed" style={{ color: '#ececec' }}>{insight}</p>;
  }

  return (
    <button onClick={handleClick} disabled={loading} className="w-full py-2.5 rounded-xl text-sm font-medium transition-all" style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}>
      {loading ? 'Анализирую данные...' : '🔮 Сгенерировать вывод от ИИ'}
    </button>
  );
}

const CAT: Record<string, { label: string; color: string; icon: string }> = {
  finance: { label: 'Финансы',  color: '#cc785c', icon: '💰' },
  sport:   { label: 'Спорт',    color: '#4ade80', icon: '💪' },
  task:    { label: 'Задачи',   color: '#fbbf24', icon: '✅' },
  note:    { label: 'Заметки',  color: '#60a5fa', icon: '📝' },
  other:   { label: 'Другое',   color: '#8e8ea0', icon: '📌' },
};

const TIP = {
  contentStyle: { background: '#2f2f2f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12, color: '#ececec' },
  labelStyle: { color: '#8e8ea0' },
  cursor: { fill: 'rgba(255,255,255,0.04)' },
};

const fmt = (d: string) => d.slice(5).replace('-', '.');

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: '#2f2f2f', border: '1px solid rgba(255,255,255,0.08)' }}>
      <h2 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: '#8e8ea0' }}>{title}</h2>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-center py-8" style={{ color: '#8e8ea0' }}>{text}</p>;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [budgetData, setBudgetData] = useState<BudgetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [budgetInput, setBudgetInput] = useState('');
  const [editingBudget, setEditingBudget] = useState(false);

  const enablePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('PWA не поддерживается вашим браузером');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      const reg = await navigator.serviceWorker.ready;
      const pubKey = await import('../api').then(m => m.getVapidPublicKey());
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: pubKey,
      });
      await import('../api').then(m => m.subscribeToPush(sub));
      alert('Уведомления успешно включены! 🚀');
    } else {
      alert('Нет разрешения на уведомления');
    }
  };

  useEffect(() => {
    Promise.all([fetchStats(), fetchBudget()])
      .then(([s, b]) => { setStats(s); setBudgetData(b); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex gap-1.5">
          {[0,1,2].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
              style={{ background: '#8e8ea0', animationDelay: `${i*0.15}s` }} />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const pieData = Object.entries(stats.categoryStats).map(([k, v]) => ({
    name: CAT[k]?.label ?? k, value: v, color: CAT[k]?.color ?? '#8e8ea0',
  }));

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: '#212121' }}>
      <header className="px-4 py-3 flex-shrink-0 flex justify-between items-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm font-semibold" style={{ color: '#ececec' }}>Аналитика</p>
            <p className="text-xs mt-0.5" style={{ color: '#8e8ea0' }}>Всего записей: {stats.total}</p>
          </div>
          {stats.streak > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border cursor-help" title="Огненная серия продуктивных дней!" style={{ borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)' }}>
              <span className="text-sm">🔥</span>
              <span className="text-xs font-bold" style={{ color: '#ef4444' }}>{stats.streak}</span>
            </div>
          )}
        </div>
        <button onClick={enablePush} title="Включить push-уведомления" className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-white/10">
          🔔
        </button>
      </header>

      <div className="p-4 space-y-3 pb-6">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(stats.categoryStats).map(([k, v]) => (
            <div key={k} className="rounded-xl p-3 flex items-center gap-2.5"
              style={{ background: '#2f2f2f', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="text-xl">{CAT[k]?.icon ?? '📌'}</span>
              <div>
                <div className="text-xs" style={{ color: '#8e8ea0' }}>{CAT[k]?.label ?? k}</div>
                <div className="text-lg font-bold" style={{ color: '#ececec' }}>{v}</div>
              </div>
            </div>
          ))}
          <div className="rounded-xl p-3 flex items-center gap-2.5" style={{ background: '#2f2f2f', border: '1px solid rgba(255,255,255,0.08)' }}>
            <span className="text-xl">⏳</span>
            <div>
              <div className="text-xs" style={{ color: '#8e8ea0' }}>Ждут выполнения</div>
              <div className="text-lg font-bold" style={{ color: '#ececec' }}>{stats.pendingTasks}</div>
            </div>
          </div>
        </div>

        {/* Budget */}
        <Section title="Мой бюджет (на месяц)">
          {budgetData && budgetData.budgets[0] && !editingBudget ? (() => {
            const b = budgetData.budgets[0];
            const spend = budgetData.monthlySpend || 0;
            const pct = Math.min(100, Math.round((spend / b.amount) * 100));
            const color = pct >= 100 ? '#f87171' : pct > 80 ? '#fbbf24' : '#4ade80';
            return (
              <div onClick={() => { setBudgetInput(String(b.amount)); setEditingBudget(true); }} className="cursor-pointer group">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm font-medium" style={{ color: '#ececec' }}>Потрачено {spend.toLocaleString('ru')} ₽</span>
                  <span className="text-xs" style={{ color: '#8e8ea0' }}>из {b.amount.toLocaleString('ru')} ₽</span>
                </div>
                <div className="h-2 rounded-full w-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                </div>
                <p className="text-[10px] mt-2 text-right opacity-50 group-hover:opacity-100 transition-opacity" style={{ color: '#8e8ea0' }}>
                  Нажми, чтобы изменить лимит
                </p>
              </div>
            );
          })() : (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={budgetInput}
                onChange={e => setBudgetInput(e.target.value)}
                placeholder={budgetData?.budgets[0] ? "Новый лимит..." : "Установить лимит (₽)..."}
                className="flex-1 bg-transparent text-sm outline-none px-3 py-2 rounded-xl transition-colors focus:border-[#cc785c]"
                style={{ color: '#ececec', border: '1px solid rgba(255,255,255,0.15)' }}
              />
              <button
                onClick={async () => {
                   const amt = parseFloat(budgetInput);
                   if (!amt || isNaN(amt)) { setEditingBudget(false); return; }
                   try {
                     await saveBudget('finance', amt);
                     setBudgetData(await fetchBudget());
                     setEditingBudget(false);
                   } catch {}
                }}
                className="px-3 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-[#b0634a]"
                style={{ background: '#cc785c', color: '#fff' }}
              >
                Сохранить
              </button>
            </div>
          )}
        </Section>

        {/* Pie */}
        {pieData.length > 0 && (
          <Section title="По категориям">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                  {pieData.map((e, i) => <Cell key={i} fill={e.color} stroke="transparent" />)}
                </Pie>
                <Tooltip {...TIP} formatter={(v) => [v, '']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 justify-center mt-1">
              {pieData.map(d => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                  <span className="text-xs" style={{ color: '#8e8ea0' }}>{d.name} ({d.value})</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Finance */}
        <Section title="Траты по дням">
          {stats.financeByDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={stats.financeByDay.map(d => ({ ...d, date: fmt(d.date) }))}>
                <XAxis dataKey="date" stroke="transparent" tick={{ fill: '#8e8ea0', fontSize: 11 }} />
                <YAxis stroke="transparent" tick={{ fill: '#8e8ea0', fontSize: 11 }} width={36} />
                <Tooltip {...TIP} formatter={(v) => [`${v} ₽`, 'Траты']} />
                <Line type="monotone" dataKey="amount" stroke="#cc785c" strokeWidth={2} dot={{ fill: '#cc785c', r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <Empty text="Нет финансовых записей" />}
        </Section>

        {/* Sport */}
        <Section title="Спорт по дням">
          {stats.sportByDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={stats.sportByDay.map(d => ({ ...d, date: fmt(d.date) }))}>
                <XAxis dataKey="date" stroke="transparent" tick={{ fill: '#8e8ea0', fontSize: 11 }} />
                <YAxis stroke="transparent" tick={{ fill: '#8e8ea0', fontSize: 11 }} width={28} allowDecimals={false} />
                <Tooltip {...TIP} formatter={(v) => [v, 'Активностей']} />
                <Bar dataKey="count" fill="#4ade80" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty text="Нет спортивных записей" />}
        </Section>

        {/* Mood */}
        <Section title="Настроение">
          {stats.moodByDay && stats.moodByDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={stats.moodByDay.map(d => ({ ...d, date: fmt(d.date) }))}>
                <XAxis dataKey="date" stroke="transparent" tick={{ fill: '#8e8ea0', fontSize: 11 }} />
                <YAxis domain={[1, 10]} stroke="transparent" tick={{ fill: '#8e8ea0', fontSize: 11 }} width={28} />
                <Tooltip {...TIP} formatter={(v) => [`${v}/10`, 'Оценка']} />
                <Line type="monotone" dataKey="averageScore" stroke="#a78bfa" strokeWidth={2} dot={{ fill: '#a78bfa', r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <Empty text="Нет записей о настроении" />}
        </Section>

        {/* AI Insight */}
        <Section title="AI Инсайты 🧠">
          <InsightBlock />
        </Section>
      </div>
    </div>
  );
}
