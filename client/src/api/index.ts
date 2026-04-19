/// <reference types="vite/client" />
/// <reference types="vite/client" />
import type { LifeRecord, ParsedRecord, Stats, BudgetResponse, Budget } from '../types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

function getToken() {
  return localStorage.getItem('aml_token');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Ошибка сети' }));
    throw new Error((err as { error?: string }).error ?? 'Ошибка');
  }
  return res.json() as Promise<T>;
}

/* ── Auth ── */
export async function register(email: string, password: string, name?: string) {
  return request<{ token: string; user: { id: string; email: string; name?: string } }>(
    '/api/auth/register',
    { method: 'POST', body: JSON.stringify({ email, password, name }) }
  );
}

export async function login(email: string, password: string) {
  return request<{ token: string; user: { id: string; email: string; name?: string } }>(
    '/api/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) }
  );
}

/* ── Parse / Chat ── */
export type ParseResponse =
  | { type: 'records'; records: ParsedRecord[] }
  | { type: 'answer'; text: string };

export async function parseText(text: string): Promise<ParseResponse> {
  return request<ParseResponse>('/api/parse', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export async function fetchWeeklyDigest(): Promise<string> {
  const data = await request<{ type: string; text: string }>('/api/digest', { method: 'POST' });
  return data.text;
}

export async function fetchInsight(): Promise<string> {
  const data = await request<{ insight: string }>('/api/digest/insight', { method: 'POST' });
  return data.insight;
}

/* ── Records ── */
export async function saveRecords(records: ParsedRecord[]): Promise<number> {
  const data = await request<{ count: number }>('/api/records', {
    method: 'POST',
    body: JSON.stringify({ records }),
  });
  return data.count;
}

export async function fetchRecords(params?: {
  category?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<LifeRecord[]> {
  const url = new URL('/api/records', window.location.origin);
  if (params?.category) url.searchParams.set('category', params.category);
  if (params?.from) url.searchParams.set('from', params.from);
  if (params?.to) url.searchParams.set('to', params.to);
  if (params?.limit) url.searchParams.set('limit', String(params.limit));
  if (params?.offset) url.searchParams.set('offset', String(params.offset));
  return request<LifeRecord[]>(url.pathname + url.search);
}

export async function deleteRecord(id: string): Promise<void> {
  await request(`/api/records/${id}`, { method: 'DELETE' });
}

export async function updateRecord(id: string, patch: { summary?: string; details?: string; amount?: number; score?: number }): Promise<void> {
  await request(`/api/records/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export async function updateTask(
  recordId: string,
  patch: { done?: boolean; deadline?: string | null }
): Promise<void> {
  await request(`/api/records/tasks/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function exportRecordsUrl(): string {
  const token = getToken();
  return `${API_URL}/api/records/export${token ? `?token=${token}` : ''}`;
}

/* ── Push ── */
export async function getVapidPublicKey(): Promise<string> {
  const res = await fetch(`${API_URL}/api/push/vapid-public-key`);
  return res.text();
}

export async function subscribeToPush(subscription: any): Promise<void> {
  await request('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(subscription),
  });
}

/* ── Stats ── */
export async function fetchStats(): Promise<Stats> {
  return request<Stats>('/api/stats');
}

/* ── Budget ── */
export async function fetchBudget(): Promise<BudgetResponse> {
  return request<BudgetResponse>('/api/budget');
}

export async function saveBudget(category: string, amount: number): Promise<Budget> {
  return request<Budget>('/api/budget', {
    method: 'POST',
    body: JSON.stringify({ category, amount }),
  });
}

export async function deleteBudget(id: string): Promise<void> {
  await request(`/api/budget/${id}`, { method: 'DELETE' });
}

/** @deprecated use updateTask */
export async function markTaskDone(recordId: string): Promise<void> {
  return updateTask(recordId, { done: true });
}
