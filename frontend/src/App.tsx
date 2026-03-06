import { useState, useEffect, useCallback, useRef } from 'react';
import type { Repository, ViewType, Preferences } from './types';
import { loadRepositories, addRepository, removeRepository, openFolderDialog, loadPreferences, savePreferences } from './api';
import Sidebar from './components/Sidebar';
import MainArea from './components/MainArea';
import CommandPalette from './components/CommandPalette';

export default function App() {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [activeRepo, setActiveRepo] = useState<Repository | null>(null);
  const [view, setView] = useState<ViewType>('changes');
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [diffMode, setDiffMode] = useState<'unified' | 'split'>('unified');
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [panelWidth, setPanelWidth] = useState(260);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const prefsRef = useRef<Preferences>({ activeRepoPath: '', diffMode: 'unified', lastView: 'changes', sidebarWidth: 220, panelWidth: 260 });

  useEffect(() => {
    Promise.all([loadRepositories(), loadPreferences()]).then(([r, prefs]) => {
      console.log('[App] prefs loaded:', JSON.stringify(prefs));
      console.log('[App] repos loaded:', r.map(x => x.path));
      prefsRef.current = prefs;
      setDiffMode(prefs.diffMode || 'unified');
      setView(prefs.lastView || 'changes');
      if (prefs.sidebarWidth) setSidebarWidth(prefs.sidebarWidth);
      if (prefs.panelWidth) setPanelWidth(prefs.panelWidth);
      setRepos(r);
      // Restore last active repo
      const last = r.find((x) => x.path === prefs.activeRepoPath) ?? r[0] ?? null;
      console.log('[App] restoring activeRepo:', last?.path ?? 'none');
      setActiveRepo(last);
      setLoading(false);
    });
  }, []);

  const persist = useCallback((patch: Partial<Preferences>) => {
    const next = { ...prefsRef.current, ...patch };
    prefsRef.current = next;
    savePreferences(next);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || (e.shiftKey && e.key === 'p'))) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleViewChange = useCallback((v: ViewType) => {
    setView(v);
    persist({ lastView: v });
  }, [persist]);

  const handleDiffModeChange = useCallback((mode: 'unified' | 'split') => {
    setDiffMode(mode);
    persist({ diffMode: mode });
  }, [persist]);

  const handleAddRepo = useCallback(async () => {
    const path = await openFolderDialog();
    if (!path) return;
    try {
      const repo = await addRepository(path);
      setRepos((prev) => {
        if (prev.find((r) => r.path === repo.path)) return prev;
        return [...prev, repo];
      });
      setActiveRepo(repo);
      persist({ activeRepoPath: repo.path });
      setSidebarOpen(false);
    } catch (e: any) {
      alert(e?.toString() || 'Failed to add repository');
    }
  }, [persist]);

  const handleRemoveRepo = useCallback(async (path: string) => {
    await removeRepository(path);
    setRepos((prev) => {
      const next = prev.filter((r) => r.path !== path);
      if (activeRepo?.path === path) {
        const fallback = next[0] ?? null;
        setActiveRepo(fallback);
        persist({ activeRepoPath: fallback?.path ?? '' });
      }
      return next;
    });
  }, [activeRepo, persist]);

  const handleSidebarWidthChange = useCallback((w: number) => {
    setSidebarWidth(w);
    persist({ sidebarWidth: w });
  }, [persist]);

  const handlePanelWidthChange = useCallback((w: number) => {
    setPanelWidth(w);
    persist({ panelWidth: w });
  }, [persist]);

  const handleSelectRepo = useCallback((repo: Repository) => {
    setActiveRepo(repo);
    setView('changes');
    persist({ activeRepoPath: repo.path, lastView: 'changes' });
    setSidebarOpen(false);
  }, [persist]);

  if (loading) {
    return (
      <div style={{ background: 'var(--bg-base)', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>loading...</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-base)', overflow: 'hidden', position: 'relative' }}>
      {sidebarOpen && (
        <>
          <div
            onClick={() => setSidebarOpen(false)}
            style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(0,0,0,0.3)' }}
          />
          <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 20, animation: 'slideIn 0.15s ease-out' }}>
            <Sidebar
              repos={repos}
              activeRepo={activeRepo}
              onSelect={handleSelectRepo}
              onRemove={handleRemoveRepo}
              onAdd={handleAddRepo}
              width={sidebarWidth}
              onWidthChange={handleSidebarWidthChange}
            />
          </div>
        </>
      )}
      <MainArea
        repo={activeRepo}
        view={view}
        onViewChange={handleViewChange}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        diffMode={diffMode}
        onDiffModeChange={handleDiffModeChange}
        panelWidth={panelWidth}
        onPanelWidthChange={handlePanelWidthChange}
        onBranchChange={() => {}}
        onOpenPalette={() => setPaletteOpen(true)}
        refreshToken={refreshToken}
      />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        repo={activeRepo}
        repos={repos}
        onViewChange={handleViewChange}
        onOpenSidebar={() => { setPaletteOpen(false); setSidebarOpen(true); }}
        onFetchDone={() => setRefreshToken(t => t + 1)}
      />
    </div>
  );
}
