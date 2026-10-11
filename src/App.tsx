import { useEffect } from 'react';
import { Rail } from './app/Rail';
import { Toast } from './app/Toast';
import { TopBar } from './app/TopBar';
import { ExitView } from './features/exit/ExitView';
import { FundView } from './features/fund/FundView';
import { MemoView } from './features/memo/MemoView';
import { MetricsView } from './features/metrics/MetricsView';
import { RoundView } from './features/round/RoundView';
import { ScreenView } from './features/screen/ScreenView';
import { EMBED } from './lib/platform';
import { useStore, VIEWS, type ViewId } from './state/store';

const VIEW_COMPONENTS: Record<ViewId, () => React.JSX.Element> = {
  screen: ScreenView,
  metrics: MetricsView,
  round: RoundView,
  exit: ExitView,
  fund: FundView,
  memo: MemoView,
};

export function App() {
  const view = useStore((s) => s.view);
  const theme = useStore((s) => s.theme);
  const setView = useStore((s) => s.setView);

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.slice(1);
      if ((VIEWS as readonly string[]).includes(h)) setView(h as ViewId);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [setView]);

  useEffect(() => {
    if (EMBED) return; // the host page owns the theme
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    // Keep a plain #view anchor so a reload or a shared link opens the same stage.
    if (window.location.hash.slice(1) !== view) {
      try {
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${window.location.search}#${view}`,
        );
      } catch {
        /* some sandboxed frames refuse history changes; the view still works */
      }
    }
    window.scrollTo({ top: 0 });
  }, [view]);

  const View = VIEW_COMPONENTS[view];
  return (
    <div className="app">
      <TopBar />
      <Rail />
      <main className="main" id="main">
        <View />
      </main>
      <Toast />
    </div>
  );
}
