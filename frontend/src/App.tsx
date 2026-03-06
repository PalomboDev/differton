import { useState, useEffect, useCallback } from 'react';
import type { Repository, ViewType } from './types';
import { loadRepositories, addRepository, removeRepository, openFolderDialog } from './api';
import Sidebar from './components/Sidebar';
import MainArea from './components/MainArea';

export default function App() {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [activeRepo, setActiveRepo] = useState<Repository | null>(null);
  const [view, setView] = useState<ViewType>('changes');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRepositories().then((r) => {
      setRepos(r);
      if (r.length > 0) setActiveRepo(r[0]);
      setLoading(false);
    });
  }, []);

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
    } catch (e: any) {
      alert(e?.toString() || 'Failed to add repository');
    }
  }, []);

  const handleRemoveRepo = useCallback(async (path: string) => {
    await removeRepository(path);
    setRepos((prev) => {
      const next = prev.filter((r) => r.path !== path);
      if (activeRepo?.path === path) {
        setActiveRepo(next[0] ?? null);
      }
      return next;
    });
  }, [activeRepo]);

  const handleSelectRepo = useCallback((repo: Repository) => {
    setActiveRepo(repo);
    setView('changes');
  }, []);

  if (loading) {
    return (
      <div style={{ background: 'var(--bg-base)', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>loading...</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-base)', overflow: 'hidden' }}>
      <Sidebar
        repos={repos}
        activeRepo={activeRepo}
        onSelect={handleSelectRepo}
        onRemove={handleRemoveRepo}
        onAdd={handleAddRepo}
      />
      <MainArea
        repo={activeRepo}
        view={view}
        onViewChange={setView}
      />
    </div>
  );
}
