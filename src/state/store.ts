import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { storage } from '../lib/platform';
import { dealEventIndex, type Deal } from './deal';
import { dealFromHash, loadSaved, save } from './persistence';
import { corvane } from './samples';

export const VIEWS = ['screen', 'metrics', 'round', 'exit', 'fund', 'memo'] as const;
export type ViewId = (typeof VIEWS)[number];

export type Theme = 'system' | 'light' | 'dark';

interface State {
  deal: Deal;
  view: ViewId;
  /** Selected point in the cap table history on the Round view (0 = formation). */
  snapshot: number;
  theme: Theme;
  toast: { id: number; text: string } | null;
  update: (recipe: (deal: Deal) => void) => void;
  replaceDeal: (deal: Deal, message?: string) => void;
  setView: (view: ViewId) => void;
  setSnapshot: (index: number) => void;
  setTheme: (theme: Theme) => void;
  notify: (text: string) => void;
}

function initialView(): ViewId {
  const h = typeof window === 'undefined' ? '' : window.location.hash.slice(1);
  return (VIEWS as readonly string[]).includes(h) ? (h as ViewId) : 'screen';
}

function initialDeal(): Deal {
  if (typeof window !== 'undefined') {
    const shared = dealFromHash(window.location.hash);
    if (shared) return shared;
  }
  return loadSaved() ?? corvane();
}

function initialTheme(): Theme {
  const t = storage.get('proforma.theme');
  return t === 'light' || t === 'dark' ? t : 'system';
}

const startDeal = initialDeal();

export const useStore = create<State>()(
  immer((set) => ({
    deal: startDeal,
    view: initialView(),
    snapshot: dealEventIndex(startDeal) + 1,
    theme: initialTheme(),
    toast: null,
    update: (recipe) =>
      set((s) => {
        recipe(s.deal);
      }),
    replaceDeal: (deal, message) =>
      set((s) => {
        s.deal = deal;
        s.snapshot = dealEventIndex(deal) + 1;
        if (message) s.toast = { id: Date.now(), text: message };
      }),
    setView: (view) =>
      set((s) => {
        s.view = view;
      }),
    setSnapshot: (index) =>
      set((s) => {
        s.snapshot = index;
      }),
    setTheme: (theme) =>
      set((s) => {
        s.theme = theme;
      }),
    notify: (text) =>
      set((s) => {
        s.toast = { id: Date.now(), text };
      }),
  })),
);

// Autosave the deal (debounced) and remember the theme.
let timer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((state, prev) => {
  if (state.deal !== prev.deal) {
    clearTimeout(timer);
    timer = setTimeout(() => save(state.deal), 400);
  }
  if (state.theme !== prev.theme) storage.set('proforma.theme', state.theme);
});
