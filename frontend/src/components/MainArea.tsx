import { useState, useEffect, useRef, useCallback } from 'react';
import type { Repository, ViewType } from '../types';
import { getCurrentBranch, getRepoInfo, fetch, pull, pullWithStrategy, push, pushToRemote, getRemotes, setRemote, openInExplorer, openInTerminal } from '../api';
import ChangesView from './ChangesView';
import HistoryView from './HistoryView';
import BranchesView from './BranchesView';
import WelcomeView from './WelcomeView';

interface Props {
  repo: Repository | null;
  view: ViewType;
  onViewChange: (v: ViewType) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  diffMode: 'unified' | 'split';
  onDiffModeChange: (m: 'unified' | 'split') => void;
  panelWidth: number;
  onPanelWidthChange: (w: number) => void;
  onBranchChange?: (b: string) => void;
  onOpenPalette?: () => void;
  refreshToken?: number;
}

type RemoteStatus = 'idle' | 'loading' | 'success' | 'error';

interface Toast {
  id: number;
  status: 'loading' | 'success' | 'error';
  msg: string;
}

interface RemoteModal {
  op: 'push' | 'pull';
  remoteName: string;
  remoteURL: string;
  branch: string;
  existingRemotes: string[];
  saving: boolean;
  error: string;
}

const navItems: { id: ViewType; label: string; shortcut: string; key: string }[] = [
  { id: 'changes',  label: 'Changes',  shortcut: '⌘1', key: '1' },
  { id: 'history',  label: 'History',  shortcut: '⌘2', key: '2' },
  { id: 'branches', label: 'Branches', shortcut: '⌘3', key: '3' },
];

let toastId = 0;

export default function MainArea({ repo, view, onViewChange, sidebarOpen, onToggleSidebar, diffMode, onDiffModeChange, panelWidth, onPanelWidthChange, onBranchChange, onOpenPalette, refreshToken }: Props) {
  const [branch, setBranch] = useState('');
  const [ahead, setAhead] = useState('');
  const [behind, setBehind] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pullCount, setPullCount] = useState('');
  const [pushCount, setPushCount] = useState('');
  const [remoteModal, setRemoteModal] = useState<RemoteModal | null>(null);
  const [divergeModal, setDivergeModal] = useState(false);
  const loadingToastId = useRef<number | null>(null);
  const prevBranchRef = useRef('');

  const silentFetch = useCallback((repoPath: string) => {
    fetch(repoPath).then(() => {
      getRepoInfo(repoPath).then((info) => {
        const a = info.ahead ?? '';
        const b = info.behind ?? '';
        setAhead(a); setBehind(b);
        setPushCount(a && a !== '0' ? a : '');
        setPullCount(b && b !== '0' ? b : '');
      }).catch(() => {});
    }).catch(() => {}); // silent — never show errors
  }, []);

  useEffect(() => {
    if (!repo) return;
    setBranch('');
    setAhead('');
    setBehind('');
    setPullCount('');
    setPushCount('');
    getCurrentBranch(repo.path).then((b) => { setBranch(b); prevBranchRef.current = b; onBranchChange?.(b); }).catch(() => {});
    getRepoInfo(repo.path).then((info) => {
      const a = info.ahead ?? '';
      const b = info.behind ?? '';
      setAhead(a);
      setBehind(b);
      setPushCount(a && a !== '0' ? a : '');
      setPullCount(b && b !== '0' ? b : '');
    }).catch(() => {});
    // Auto-fetch on repo load
    silentFetch(repo.path);
  }, [repo, silentFetch]);  // eslint-disable-line

  // Auto-fetch every 3 minutes
  useEffect(() => {
    if (!repo) return;
    const interval = setInterval(() => silentFetch(repo.path), 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [repo, silentFetch]);

  // Poll for branch changes every 5s — re-fetch if branch switched externally
  useEffect(() => {
    if (!repo) return;
    const interval = setInterval(() => {
      getCurrentBranch(repo.path).then((b) => {
        if (b && b !== prevBranchRef.current) {
          prevBranchRef.current = b;
          setBranch(b);
          onBranchChange?.(b);
          silentFetch(repo.path);
        }
      }).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [repo, silentFetch, onBranchChange]);

  // Global keyboard shortcuts ⌘1/2/3
  useEffect(() => {
    if (!repo) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (document.activeElement?.tagName === 'TEXTAREA') return;
      const item = navItems.find((n) => n.key === e.key);
      if (item) {
        e.preventDefault();
        onViewChange(item.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [repo, onViewChange]);

  // Refresh counts when palette does a remote op
  useEffect(() => {
    if (!repo || !refreshToken) return;
    getCurrentBranch(repo.path).then((b) => { setBranch(b); onBranchChange?.(b); }).catch(() => {});
    getRepoInfo(repo.path).then((info) => {
      const a = info.ahead ?? '';
      const b = info.behind ?? '';
      setAhead(a); setBehind(b);
      setPushCount(a && a !== '0' ? a : '');
      setPullCount(b && b !== '0' ? b : '');
    }).catch(() => {});
  }, [refreshToken, repo]);

  if (!repo) return <WelcomeView />;

  const addToast = (status: Toast['status'], msg: string): number => {
    const id = ++toastId;
    // Only one toast at a time — replace any existing
    setToasts([{ id, status, msg }]);
    return id;
  };

  const updateToast = (id: number, status: Toast['status'], msg: string) => {
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, status, msg } : t));
    if (status === 'success') {
      setTimeout(() => dismissToast(id), 3000);
    }
  };

  const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const refreshCounts = () => {
    getCurrentBranch(repo.path).then((b) => { setBranch(b); onBranchChange?.(b); }).catch(() => {});
    getRepoInfo(repo.path).then((info) => {
      const a = info.ahead ?? '';
      const b = info.behind ?? '';
      setAhead(a);
      setBehind(b);
      setPushCount(a && a !== '0' ? a : '');
      setPullCount(b && b !== '0' ? b : '');
    }).catch(() => {});
  };

  const runRemoteOp = async (op: () => Promise<void>, label: string) => {
    const id = addToast('loading', `Running ${label}...`);
    loadingToastId.current = id;
    try {
      await op();
      updateToast(id, 'success', `${label} completed`);
      refreshCounts();
      if (label !== 'Fetch') {
        setPullCount('');
        setPushCount('');
      }
    } catch (e: any) {
      const msg = e?.toString() || '';
      if (msg.includes('no-remote')) {
        dismissToast(id);
        const remotes = await getRemotes(repo.path);
        setRemoteModal({
          op: label.toLowerCase() as 'push' | 'pull',
          remoteName: remotes[0] || 'origin',
          remoteURL: '',
          branch: branch,
          existingRemotes: remotes,
          saving: false,
          error: '',
        });
      } else if (msg.includes('divergent-branches')) {
        dismissToast(id);
        setDivergeModal(true);
      } else {
        updateToast(id, 'error', msg.replace(/^Error: /, ''));
      }
    }
  };

  const handleModalSave = async () => {
    if (!remoteModal || !repo) return;
    setRemoteModal((m) => m ? { ...m, saving: true, error: '' } : m);
    try {
      await setRemote(repo.path, remoteModal.remoteName, remoteModal.remoteURL);
      const op = remoteModal.op;
      const remote = remoteModal.remoteName;
      const br = remoteModal.branch;
      setRemoteModal(null);
      if (op === 'push') {
        await runRemoteOp(() => pushToRemote(repo.path, remote, br), 'Push');
      } else {
        await runRemoteOp(() => pull(repo.path, remote, br), 'Pull');
      }
    } catch (e: any) {
      setRemoteModal((m) => m ? { ...m, saving: false, error: e?.toString() || 'Failed to set remote' } : m);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
      {/* Toolbar */}
      <div
        style={{
          height: 40,
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: 0,
          flexShrink: 0,
        }}
      >
        {/* Sidebar toggle */}
        <button
          onClick={onToggleSidebar}
          title={sidebarOpen ? 'Hide repositories' : 'Show repositories'}
          style={{
            background: sidebarOpen ? 'var(--accent-glow)' : 'none',
            border: 'none',
            borderRadius: 5,
            padding: '4px 6px',
            color: sidebarOpen ? 'var(--accent)' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.1s, background 0.1s',
            marginRight: 6,
          }}
          onMouseEnter={(e) => { if (!sidebarOpen) e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={(e) => { if (!sidebarOpen) e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <rect x="1" y="2" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M5 2v11" stroke="currentColor" strokeWidth="1.3"/>
          </svg>
        </button>

        {/* Command palette trigger */}
        <button
          onClick={onOpenPalette}
          title="Command palette (⌘K)"
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 5,
            padding: '2px 8px',
            color: 'var(--text-muted)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            marginRight: 8,
            transition: 'color 0.1s, border-color 0.1s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <span>⌘K</span>
        </button>

        {/* Nav tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {navItems.map((item) => {
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                style={{
                  background: active ? 'var(--bg-elevated)' : 'transparent',
                  border: active ? '1px solid var(--border)' : '1px solid transparent',
                  borderRadius: 5,
                  padding: '3px 8px',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: active ? 500 : 400,
                  fontFamily: 'var(--font-sans)',
                  cursor: 'pointer',
                  transition: 'all 0.1s',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = 'var(--text-primary)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'var(--text-secondary)'; }}
              >
                {item.label}
                <span style={{
                  fontSize: 9,
                  fontFamily: 'var(--font-mono)',
                  color: active ? 'var(--text-muted)' : 'var(--border)',
                  letterSpacing: '0.02em',
                  transition: 'color 0.1s',
                }}>
                  {item.shortcut}
                </span>
              </button>
            );
          })}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Repo name */}
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--text-muted)',
          marginRight: 12,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 200,
        }}>
          {repo.name}
        </span>

        {/* Branch pill — clickable to go to Branches tab */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {branch && (
            <button
              onClick={() => onViewChange('branches')}
              title="View branches"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 5,
                padding: '2px 8px',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'border-color 0.1s, color 0.1s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <circle cx="4" cy="4" r="2.5" stroke="var(--accent)" strokeWidth="1.5"/>
                <circle cx="12" cy="12" r="2.5" stroke="var(--accent)" strokeWidth="1.5"/>
                <path d="M4 6.5V8a4 4 0 0 0 4 4h1" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span style={{ color: 'var(--text-primary)' }}>{branch}</span>
            </button>
          )}

          {/* Remote ops */}
          <div style={{ display: 'flex', gap: 4 }}>
            <RemoteButton label="Fetch" onClick={() => runRemoteOp(() => fetch(repo.path), 'Fetch')} title="Fetch all remotes" />
            <RemoteButton label="Pull"  onClick={() => runRemoteOp(() => pull(repo.path), 'Pull')}   title="Pull from remote" count={pullCount} countDir="down" />
            <RemoteButton label="Push"  onClick={() => runRemoteOp(() => push(repo.path), 'Push')}   title="Push to remote"  count={pushCount} countDir="up" disabled={!pushCount || pushCount === '0'} />
          </div>

          {/* Developer extras */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => openInExplorer(repo.path)} title="Open in Finder" style={iconBtnStyle}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M1.5 6h13" stroke="currentColor" strokeWidth="1.3"/>
                <circle cx="4" cy="4.5" r="0.8" fill="currentColor"/>
                <circle cx="6.5" cy="4.5" r="0.8" fill="currentColor"/>
              </svg>
            </button>
            <button onClick={() => openInTerminal(repo.path)} title="Open in Terminal" style={iconBtnStyle}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M4 6l3 2.5L4 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M9 11h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Toast stack */}
      {toasts.length > 0 && (
        <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 100 }}>
          {toasts.map((t) => (
            <div
              key={t.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                background: t.status === 'error' ? 'var(--del-bg)' : t.status === 'success' ? 'var(--add-bg)' : 'var(--bg-overlay)',
                border: `1px solid ${t.status === 'error' ? 'var(--del-color)' : t.status === 'success' ? 'var(--add-color)' : 'var(--border)'}`,
                color: t.status === 'error' ? 'var(--del-color)' : t.status === 'success' ? 'var(--add-color)' : 'var(--text-secondary)',
                padding: '8px 10px 8px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                maxWidth: 400,
                wordBreak: 'break-word',
                animation: 'fadeIn 0.15s ease-out',
              }}
            >
              <span style={{ flex: 1 }}>{t.msg}</span>
              {t.status === 'error' && (
                <button
                  onClick={() => navigator.clipboard.writeText(t.msg)}
                  title="Copy"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.6, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <rect x="5" y="1" width="9" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M3 4H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
              {t.status !== 'loading' && (
                <button
                  onClick={() => dismissToast(t.id)}
                  title="Dismiss"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.6, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Divergent branches modal */}
      {divergeModal && (
        <div
          style={{ position: 'absolute', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget) setDivergeModal(false); }}
        >
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: 24,
            width: 420,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                Divergent branches
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Your local branch and the remote have diverged — each has commits the other doesn't. Choose how to reconcile them:
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {([
                { strategy: 'merge' as const,   label: 'Merge',        desc: 'Create a merge commit combining both histories. Safe, preserves all context.' },
                { strategy: 'rebase' as const,  label: 'Rebase',       desc: 'Replay your commits on top of the remote. Cleaner history, rewrites local commits.' },
                { strategy: 'ff-only' as const, label: 'Fast-forward only', desc: 'Only pull if no local commits diverge. Will fail if you have unpushed commits.' },
              ] as const).map(({ strategy, label, desc }) => (
                <button
                  key={strategy}
                  onClick={async () => {
                    setDivergeModal(false);
                    await runRemoteOp(() => pullWithStrategy(repo.path, strategy), 'Pull');
                  }}
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 7,
                    padding: '10px 14px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'border-color 0.1s, background 0.1s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-glow)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3, fontFamily: 'var(--font-mono)' }}>{label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</div>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDivergeModal(false)}
                style={{ ...modalBtnStyle, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remote config modal */}
      {remoteModal && (
        <div
          style={{ position: 'absolute', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget) setRemoteModal(null); }}
        >
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: 24,
            width: 400,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                Configure remote
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                No remote configured for <strong style={{ color: 'var(--text-secondary)' }}>{remoteModal.branch}</strong>. Set one to {remoteModal.op}.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={labelStyle}>
                Remote name
                <input
                  type="text"
                  value={remoteModal.remoteName}
                  onChange={(e) => setRemoteModal((m) => m ? { ...m, remoteName: e.target.value } : m)}
                  style={inputStyle}
                  placeholder="origin"
                />
              </label>
              <label style={labelStyle}>
                Remote URL
                <input
                  type="text"
                  value={remoteModal.remoteURL}
                  onChange={(e) => setRemoteModal((m) => m ? { ...m, remoteURL: e.target.value } : m)}
                  style={inputStyle}
                  placeholder="https://github.com/user/repo.git"
                  autoFocus
                />
              </label>
              <label style={labelStyle}>
                Branch
                <input
                  type="text"
                  value={remoteModal.branch}
                  onChange={(e) => setRemoteModal((m) => m ? { ...m, branch: e.target.value } : m)}
                  style={inputStyle}
                  placeholder="main"
                />
              </label>
            </div>

            {remoteModal.error && (
              <div style={{ fontSize: 11, color: 'var(--del-color)', fontFamily: 'var(--font-mono)', wordBreak: 'break-word' }}>
                {remoteModal.error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setRemoteModal(null)}
                style={{ ...modalBtnStyle, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleModalSave}
                disabled={!remoteModal.remoteURL.trim() || !remoteModal.remoteName.trim() || remoteModal.saving}
                style={{
                  ...modalBtnStyle,
                  background: (!remoteModal.remoteURL.trim() || remoteModal.saving) ? 'var(--bg-elevated)' : 'var(--accent)',
                  color: (!remoteModal.remoteURL.trim() || remoteModal.saving) ? 'var(--text-muted)' : 'white',
                  border: '1px solid transparent',
                  cursor: (!remoteModal.remoteURL.trim() || remoteModal.saving) ? 'not-allowed' : 'pointer',
                }}
              >
                {remoteModal.saving ? 'Saving...' : `Save & ${remoteModal.op === 'push' ? 'Push' : 'Pull'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {view === 'changes' && <ChangesView repo={repo} diffMode={diffMode} onDiffModeChange={onDiffModeChange} onCommit={refreshCounts} panelWidth={panelWidth} onPanelWidthChange={onPanelWidthChange} />}
        {view === 'history' && <HistoryView repo={repo} diffMode={diffMode} onDiffModeChange={onDiffModeChange} panelWidth={panelWidth} onPanelWidthChange={onPanelWidthChange} />}
        {view === 'branches' && <BranchesView repo={repo} panelWidth={panelWidth} onPanelWidthChange={onPanelWidthChange} />}
      </div>
    </div>
  );
}

function RemoteButton({ label, onClick, title, count, countDir, disabled }: {
  label: string;
  onClick: () => void;
  title: string;
  count?: string;
  countDir?: 'up' | 'down';
  disabled?: boolean;
}) {
  const hasCount = count && count !== '0';
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 5,
        padding: '2px 8px',
        color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
        fontSize: 11,
        fontFamily: 'var(--font-sans)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.1s',
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}}
      onMouseLeave={(e) => { e.currentTarget.style.color = disabled ? 'var(--text-muted)' : 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
    >
      {label}
      {hasCount && (
        <span style={{
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          color: countDir === 'down' ? 'var(--mod-color)' : 'var(--add-color)',
          fontWeight: 600,
        }}>
          {countDir === 'down' ? '↓' : '↑'}{count}
        </span>
      )}
    </button>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  borderRadius: 4,
  padding: '3px 4px',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'color 0.1s',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  fontSize: 11,
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-mono)',
};

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 5,
  color: 'var(--text-primary)',
  fontSize: 12,
  fontFamily: 'var(--font-mono)',
  padding: '6px 9px',
  outline: 'none',
};

const modalBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 5,
  fontSize: 12,
  fontFamily: 'var(--font-sans)',
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.1s',
};
