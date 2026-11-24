import axios from 'axios';
import { getAuthToken, attachBackendFallback } from './index';

const loopApi = axios.create({ baseURL: '/api/loop', timeout: 20000, withCredentials: true });
loopApi.interceptors.request.use((config) => {
  const t = getAuthToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});
attachBackendFallback(loopApi, '/api/loop');

export interface LoopCheckin {
  id: number;
  mood: string;
  stress: number | null;
  sleepHours: number | null;
  energy: number | null;
  eventText: string;
  skipped: boolean;
  createdAt: string;
}

export interface LoopPlanAction {
  id: number;
  planId: number;
  day: string;
  actionText: string;
  status: 'pending' | 'done' | 'partial' | 'skipped';
  doneAt: string | null;
}

export interface LoopPlan {
  id: number;
  weekOf: string;
  goalText: string;
  status: string;
  actions: LoopPlanAction[];
}

export interface LoopTodayState {
  date: string;
  checkin: LoopCheckin | null;
  plan: { id: number; goal: string; weekOf: string } | null;
  todayActions: { id: number; text: string; status: string }[];
  eveningReflectionDone: boolean;
  nextStep: string;
}

export interface LoopWeeklySummary {
  period: string;
  weekOf: string;
  metrics: {
    checkinDays: number;
    skippedCheckins: number;
    avgStress: number | null;
    avgEnergy: number | null;
    avgSleepHours: number | null;
    moods: string[];
    actions: { done: number; partial: number; skipped: number; pending: number };
    reflections: { evening: number; weekly: number };
  };
  text: string;
}

export interface LoopTurnResult {
  mode: 'safety' | 'support';
  riskLevel: string;
  reply: string;
  suggestions?: {
    practice: { title: string; body: string | null }[];
    activePlan: { goal: string; pendingActions: string[] } | null;
    recentSignals: number;
  };
}

export const postCheckin = (userId: string, body: Record<string, unknown>) =>
  loopApi.post('/checkin', { userId, ...body }).then((r) => r.data.checkin as LoopCheckin);

export const fetchToday = (userId: string) =>
  loopApi.get('/today', { params: { userId } }).then((r) => r.data as LoopTodayState);

export const fetchWeekSummary = (userId: string, weekOf?: string) =>
  loopApi.get('/summary', { params: { userId, weekOf } }).then((r) => r.data as LoopWeeklySummary);

export const createPlan = (userId: string, goalText: string, actions: { day?: string; actionText: string }[]) =>
  loopApi.post('/plan', { userId, goalText, actions }).then((r) => r.data.plan as LoopPlan);

export const setActionStatus = (userId: string, actionId: number, status: LoopPlanAction['status']) =>
  loopApi.post('/plan/action', { userId, actionId, status }).then((r) => r.data.action as LoopPlanAction);

export const postReflection = (userId: string, body: { scope: 'evening' | 'weekly'; lines?: string[]; helped?: string; notHelped?: string; adjustNote?: string }) =>
  loopApi.post('/reflection', { userId, ...body }).then((r) => r.data.reflection);

export const postCompanion = (userId: string, text: string) =>
  loopApi.post('/companion', { userId, text }).then((r) => r.data as LoopTurnResult);
