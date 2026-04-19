import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import type { ChatMessage, ParsedRecord } from '../types';
import { parseText, saveRecords } from '../api';
import { useAuth } from '../contexts/AuthContext';
import RecordCard from '../components/RecordCard';

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

const WELCOME: ChatMessage = {
  id: 'welcome',
  type: 'assistant',
  text: 'Привет! Расскажи о своём дне — я разберу всё по категориям и сохраню.\n\nНапример: "обед 150₽, отжался 20 раз, завтра сдать отчёт"',
};

/* Иконка Claude-стиль */
function ClaudeIcon() {
  return (
    <div
      className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold"
      style={{ background: '#cc785c', color: '#fff' }}
    >
      A
    </div>
  );
}

const STORAGE_KEY = 'aml_chat_history';

function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ChatMessage[];
  } catch { /* ignore */ }
  return [WELCOME];
}

export default function Chat() {
  const { user, logout } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  const startVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Голосовой ввод не поддерживается в этом браузере.');
      return;
    }
    if (recording) {
      recognitionRef.current?.stop();
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = 'ru-RU';
    rec.interimResults = false;
    rec.onstart = () => setRecording(true);
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setInput(prev => prev + (prev ? ' ' : '') + transcript);
    };
    rec.onerror = () => setRecording(false);
    rec.onend = () => setRecording(false);
    recognitionRef.current = rec;
    rec.start();
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch { /* ignore */ }
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* Автовысота textarea */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [input]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, type: 'user', text };
    const loadId = `a-${Date.now()}`;
    const loadMsg: ChatMessage = { id: loadId, type: 'assistant', text: '', loading: true };

    setMessages((p) => [...p, userMsg, loadMsg]);
    setInput('');
    setSending(true);

    try {
      const result = await parseText(text);
      setMessages((p) =>
        p.map((m) => {
          if (m.id !== loadId) return m;
          if (result.type === 'answer') {
            return { ...m, loading: false, text: result.text, answerType: 'answer' as const };
          }
          return {
            ...m,
            loading: false,
            text: `Нашёл ${result.records.length} ${plural(result.records.length, 'запись', 'записи', 'записей')}:`,
            records: result.records,
            answerType: 'records' as const,
          };
        })
      );
    } catch (err) {
      setMessages((p) =>
        p.map((m) =>
          m.id === loadId
            ? { ...m, loading: false, error: err instanceof Error ? err.message : 'Ошибка' }
            : m
        )
      );
    } finally {
      setSending(false);
    }
  };

  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [deselected, setDeselected] = useState<Record<string, Set<number>>>({}); // msgId → set of record indexes

  const toggleRecord = (msgId: string, idx: number) => {
    setDeselected(prev => {
      const set = new Set(prev[msgId] ?? []);
      set.has(idx) ? set.delete(idx) : set.add(idx);
      return { ...prev, [msgId]: set };
    });
  };

  const handleSave = async (msgId: string, records: ParsedRecord[]) => {
    if (savingIds.has(msgId)) return;
    setSavingIds((s) => new Set(s).add(msgId));
    try {
      await saveRecords(records);
      setMessages((p) => p.map((m) => (m.id === msgId ? { ...m, saved: true } : m)));
    } catch {
      alert('Не удалось сохранить. Попробуй ещё раз.');
    } finally {
      setSavingIds((s) => { const n = new Set(s); n.delete(msgId); return n; });
    }
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ background: '#212121' }}>
      {/* Header */}
      <header
        className="px-4 py-3 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{ background: '#cc785c', color: '#fff' }}
          >
            {user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? 'A'}
          </div>
          <span className="text-sm font-semibold" style={{ color: '#ececec' }}>
            {user?.name ?? user?.email}
          </span>
        </div>
        <div className="flex items-center gap-1">
        <button
          onClick={() => { setMessages([WELCOME]); localStorage.removeItem(STORAGE_KEY); }}
          className="p-1.5 rounded-lg"
          style={{ color: '#8e8ea0' }}
          title="Новый чат"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button onClick={logout} className="p-1.5 rounded-lg" style={{ color: '#8e8ea0' }} title="Выйти">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4">
        <div className="max-w-2xl mx-auto px-4 space-y-6">
          {messages.map((msg) => (
            <div key={msg.id}>
              {msg.type === 'user' ? (
                /* User bubble — справа */
                <div className="flex justify-end">
                  <div
                    className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm"
                    style={{ background: '#2f2f2f', color: '#ececec' }}
                  >
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  </div>
                </div>
              ) : (
                /* Assistant — слева с иконкой */
                <div className="flex gap-3 items-start">
                  <ClaudeIcon />
                  <div className="flex-1 min-w-0 space-y-3">
                    {msg.loading ? (
                      <div className="flex items-center gap-1.5 pt-1">
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full animate-bounce"
                            style={{ background: '#8e8ea0', animationDelay: `${i * 0.15}s` }}
                          />
                        ))}
                      </div>
                    ) : msg.error ? (
                      <p className="text-sm" style={{ color: '#f87171' }}>{msg.error}</p>
                    ) : (
                      <>
                        {msg.text && (
                          <p className="text-sm whitespace-pre-wrap" style={{ color: '#ececec' }}>
                            {msg.text}
                          </p>
                        )}
                        {msg.answerType !== 'answer' && msg.records && msg.records.length > 0 && (
                          <div className="space-y-2">
                            {msg.records.map((r, i) => {
                              const off = deselected[msg.id]?.has(i);
                              return (
                                <button
                                  key={i}
                                  onClick={() => !msg.saved && toggleRecord(msg.id, i)}
                                  className="w-full text-left transition-all"
                                  style={{ opacity: off ? 0.35 : 1 }}
                                >
                                  <div className="relative">
                                    <RecordCard record={r} />
                                    {!msg.saved && (
                                      <div
                                        className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0"
                                        style={{
                                          background: off ? 'transparent' : '#cc785c',
                                          borderColor: off ? '#555' : '#cc785c',
                                        }}
                                      >
                                        {!off && (
                                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                            <polyline points="20 6 9 17 4 12" />
                                          </svg>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                            {msg.saved ? (
                              <div className="flex items-center gap-1.5 text-xs py-1" style={{ color: '#4ade80' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                Сохранено
                              </div>
                            ) : (() => {
                              const selected = msg.records.filter((_, i) => !deselected[msg.id]?.has(i));
                              return (
                                <button
                                  onClick={() => void handleSave(msg.id, selected)}
                                  disabled={savingIds.has(msg.id) || selected.length === 0}
                                  className="w-full py-2 text-sm font-medium rounded-xl transition-all"
                                  style={{ background: '#cc785c', color: '#fff', opacity: (savingIds.has(msg.id) || selected.length === 0) ? 0.5 : 1 }}
                                >
                                  {savingIds.has(msg.id)
                                    ? 'Сохранение...'
                                    : selected.length === 0
                                    ? 'Выбери хотя бы одну запись'
                                    : `Сохранить ${selected.length} ${plural(selected.length, 'запись', 'записи', 'записей')}`}
                                </button>
                              );
                            })()}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-4 py-3">
        <div className="max-w-2xl mx-auto">
          {messages.length === 1 && (
            <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide pb-1">
              {['Дайджест за неделю', 'Какие у меня задачи?', 'Сколько я потратил в этом месяце?'].map(q => (
                <button
                  key={q}
                  onClick={() => { setInput(q); setTimeout(() => textareaRef.current?.focus(), 50); }}
                  className="whitespace-nowrap px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-white/10"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#8e8ea0' }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <div
            className="flex items-end gap-2 rounded-2xl px-4 py-3"
            style={{ background: '#2f2f2f', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Расскажи о своём дне..."
              rows={1}
              className="flex-1 bg-transparent text-sm outline-none max-h-40 leading-relaxed"
              style={{ color: '#ececec', caretColor: '#ececec' }}
            />
            <button
              onClick={startVoice}
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
              style={{
                background: recording ? 'rgba(248,113,113,0.15)' : 'transparent',
                color: recording ? '#f87171' : '#8e8ea0',
                marginRight: '4px'
              }}
              title="Голосовой ввод"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </button>
            <button
              onClick={() => void send()}
              disabled={!input.trim() || sending}
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
              style={{
                background: input.trim() && !sending ? '#cc785c' : 'rgba(255,255,255,0.1)',
                color: input.trim() && !sending ? '#fff' : '#8e8ea0',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
          <p className="text-center text-[11px] mt-2" style={{ color: '#555' }}>
            Enter — отправить · Shift+Enter — новая строка
          </p>
        </div>
      </div>
    </div>
  );
}
