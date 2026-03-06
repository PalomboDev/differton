import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Repository, ViewType } from '../types';
import { createBranch, checkoutBranch, fetch, pull, push } from '../api';

interface Props {
  open: boolean;
  onClose: () => void;
  repo: Repository | null;
  repos: Repository[];
  onViewChange: (v: ViewType) => void;
  onOpenSidebar: () => void;
  onFetchDone: () => void;
}

type ActionKind = 'goto' | 'new-branch' | 'fetch' | 'pull' | 'push' | 'switch-repo';

interface Action {
  id: string;
  kind: ActionKind;
  label: string;
  description?: string;
  data?: string;
}

export default function CommandPalette({ open, onClose, repo, repos, onViewChange, onOpenSidebar, onFetchDone }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null);
  const [newBranchMode, setNewBranchMode] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load branches when opened
  useEffect(() => {
    if (!open || !repo) return;
    setQuery('');
    setSelectedIdx(0);
    setStatus(null);
    setNewBranchMode(false);
    setNewBranchName('');
    setRunning(false);
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open, repo]);

  const allActions: Action[] = useMemo(() => [
    { id: 'goto-changes',   kind: 'goto',        label: 'Go to Changes',     description: '⌘1', data: 'changes' },
    { id: 'goto-history',   kind: 'goto',        label: 'Go to History',     description: '⌘2', data: 'history' },
    { id: 'goto-branches',  kind: 'goto',        label: 'Go to Branches',    description: '⌘3', data: 'branches' },
    { id: 'fetch',          kind: 'fetch',       label: 'Fetch',             description: 'Fetch all remotes' },
    { id: 'pull',           kind: 'pull',        label: 'Pull',              description: 'Pull from remote' },
    { id: 'push',           kind: 'push',        label: 'Push',              description: 'Push to remote' },
    { id: 'new-branch',     kind: 'new-branch',  label: 'New Branch',        description: 'Create a new branch' },
    { id: 'switch-repo',    kind: 'switch-repo', label: 'Switch Repository', description: 'Open repo sidebar' },
  ], []);

  const filtered = useMemo(() => {
    if (!query.trim()) return allActions;
    const q = query.toLowerCase();
    return allActions.filter(a =>
      a.label.toLowerCase().includes(q) ||
      (a.data?.toLowerCase().includes(q)) ||
      (a.description?.toLowerCase().includes(q))
    );
  }, [allActions, query]);

  useEffect(() => { setSelectedIdx(0); }, [filtered]);

  // Scroll selected item into view
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const rows = container.querySelectorAll<HTMLElement>('[data-action-row]');
    rows[selectedIdx]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  const runAction = useCallback(async (action: Action) => {
    if (!repo) return;
    if (action.kind === 'goto') {
      onViewChange(action.data as ViewType);
      onClose();
      return;
    }
    if (action.kind === 'switch-repo') {
      onOpenSidebar();
      onClose();
      return;
    }
    if (action.kind === 'new-branch') {
      setNewBranchMode(true);
      setNewBranchName(query.startsWith('new ') ? query.slice(4) : '');
      setTimeout(() => inputRef.current?.focus(), 30);
      return;
    }
    if (action.kind === 'fetch') {
      setRunning(true);
      setStatus({ msg: 'Fetching...', ok: true });
      try {
        await fetch(repo.path);
        setStatus({ msg: 'Fetch complete', ok: true });
        setTimeout(() => { onFetchDone(); onClose(); }, 800);
      } catch (e: any) {
        setStatus({ msg: e?.toString().replace('Error: ', '') || 'Fetch failed', ok: false });
        setRunning(false);
      }
      return;
    }
    if (action.kind === 'pull') {
      setRunning(true);
      setStatus({ msg: 'Pulling...', ok: true });
      try {
        await pull(repo.path);
        setStatus({ msg: 'Pull complete', ok: true });
        setTimeout(() => { onFetchDone(); onClose(); }, 800);
      } catch (e: any) {
        setStatus({ msg: e?.toString().replace('Error: ', '') || 'Pull failed', ok: false });
        setRunning(false);
      }
      return;
    }
    if (action.kind === 'push') {
      setRunning(true);
      setStatus({ msg: 'Pushing...', ok: true });
      try {
        await push(repo.path);
        setStatus({ msg: 'Push complete', ok: true });
        setTimeout(() => { onFetchDone(); onClose(); }, 800);
      } catch (e: any) {
        setStatus({ msg: e?.toString().replace('Error: ', '') || 'Push failed', ok: false });
        setRunning(false);
      }
      return;
    }
  }, [repo, query, onViewChange, onOpenSidebar, onClose, onFetchDone]);

  const submitNewBranch = useCallback(async () => {
    if (!repo || !newBranchName.trim()) return;
    setRunning(true);
    try {
      await createBranch(repo.path, newBranchName.trim());
      await checkoutBranch(repo.path, newBranchName.trim());
      setStatus({ msg: `Created and switched to ${newBranchName.trim()}`, ok: true });
      setTimeout(() => { onFetchDone(); onClose(); }, 800);
    } catch (e: any) {
      setStatus({ msg: e?.toString().replace('Error: ', '') || 'Failed', ok: false });
      setRunning(false);
    }
  }, [repo, newBranchName, onFetchDone, onClose]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (newBranchMode) {
      if (e.key === 'Enter') { e.preventDefault(); submitNewBranch(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); if (filtered[selectedIdx]) runAction(filtered[selectedIdx]); }
  }, [newBranchMode, filtered, selectedIdx, runAction, submitNewBranch, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
        background: 'rgba(0,0,0,0.45)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: 480,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Input */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', gap: 10 }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.4 }}>
            <circle cx="6.5" cy="6.5" r="4.5" stroke="var(--text-primary)" strokeWidth="1.5"/>
            <path d="M10 10l3.5 3.5" stroke="var(--text-primary)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          {newBranchMode ? (
            <>
              <span style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>new branch:</span>
              <input
                ref={inputRef}
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="branch-name"
                disabled={running}
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'var(--font-mono)' }}
              />
            </>
          ) : (
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type a command..."
              disabled={running}
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'var(--font-sans)' }}
            />
          )}
        </div>

        {/* Status */}
        {status && (
          <div style={{
            padding: '7px 14px',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            color: status.ok ? 'var(--add-color)' : 'var(--del-color)',
            background: status.ok ? 'var(--add-bg)' : 'var(--del-bg)',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            {status.msg}
          </div>
        )}

        {/* Results */}
        {!newBranchMode && !running && (
          <div ref={listRef} style={{ maxHeight: 320, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '16px 14px', color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                No commands match
              </div>
            ) : (
              filtered.map((action, idx) => {
                const selected = idx === selectedIdx;
                return (
                  <div
                    key={action.id}
                    data-action-row
                    onClick={() => runAction(action)}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px 14px',
                      cursor: 'pointer',
                      background: selected ? 'var(--accent-glow)' : 'transparent',
                      borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
                      gap: 10,
                    }}
                  >
                    <ActionIcon kind={action.kind} />
                    <span style={{ flex: 1, fontSize: 13, color: selected ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>
                      {action.label}
                    </span>
                    {action.description && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {action.description}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* New branch hint */}
        {newBranchMode && !running && (
          <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Press ↵ to create and switch · Esc to cancel
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '6px 14px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 14 }}>
          {[['↑↓', 'navigate'], ['↵', 'select'], ['esc', 'close']].map(([key, label]) => (
            <span key={key} style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              <span style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', marginRight: 5 }}>{key}</span>
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActionIcon({ kind }: { kind: ActionKind }) {
  const color = 'var(--text-muted)';
  if (kind === 'goto') return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke={color} strokeWidth="1.4"/>
      <path d="M5 8h6M8 5l3 3-3 3" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  if (kind === 'new-branch') return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <circle cx="4" cy="4" r="2.5" stroke={color} strokeWidth="1.4"/>
      <circle cx="12" cy="12" r="2.5" stroke={color} strokeWidth="1.4"/>
      <path d="M4 6.5V8a4 4 0 0 0 4 4h1" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
  if (kind === 'fetch') return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M13 8A5 5 0 1 1 8 3c1.5 0 2.8.67 3.7 1.7" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M11 1.5V5H7.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  if (kind === 'pull') return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M8 2v9M4.5 7.5L8 11l3.5-3.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 13h12" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
  if (kind === 'push') return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M8 11V2M4.5 5.5L8 2l3.5 3.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 13h12" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
  if (kind === 'switch-repo') return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M1.5 3.5C1.5 2.67 2.17 2 3 2h3.08l1.5 1.5H13a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V3.5z" stroke={color} strokeWidth="1.3" fill="none"/>
    </svg>
  );
  return null;
}
