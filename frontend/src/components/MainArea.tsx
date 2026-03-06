import { useState, useEffect } from 'react';
import type { Repository, ViewType } from '../types';
import { getCurrentBranch, getRepoInfo, fetch, pull, push, openInExplorer, openInTerminal } from '../api';
import ChangesView from './ChangesView';
import HistoryView from './HistoryView';
import BranchesView from './BranchesView';
import WelcomeView from './WelcomeView';

interface Props {
  repo: Repository | null;
  view: ViewType;
  onViewChange: (v: ViewType) => void;
}

type RemoteStatus = 'idle' | 'loading' | 'success' | 'error';

export default function MainArea({ repo, view, onViewChange }: Props) {
  const [branch, setBranch] = useState('');
  const [ahead, setAhead] = useState('');
  const [behind, setBehind] = useState('');
  const [remoteStatus, setRemoteStatus] = useState<RemoteStatus>('idle');
  const [remoteMsg, setRemoteMsg] = useState('');

  useEffect(() => {
    if (!repo) return;
    setBranch('');
    setAhead('');
    setBehind('');
    getCurrentBranch(repo.path).then(setBranch).catch(() => {});
    getRepoInfo(repo.path).then((info) => {
      setAhead(info.ahead ?? '');
      setBehind(info.behind ?? '');
    }).catch(() => {});
  }, [repo]);

  if (!repo) return <WelcomeView />;

  const runRemoteOp = async (op: () => Promise<void>, label: string) => {
    setRemoteStatus('loading');
    setRemoteMsg(`Running ${label}...`);
    try {
      await op();
      setRemoteStatus('success');
      setRemoteMsg(`${label} completed`);
      // Refresh branch info
      getCurrentBranch(repo.path).then(setBranch).catch(() => {});
      getRepoInfo(repo.path).then((info) => {
        setAhead(info.ahead ?? '');
        setBehind(info.behind ?? '');
      }).catch(() => {});
    } catch (e: any) {
      setRemoteStatus('error');
      setRemoteMsg(e?.toString() || `${label} failed`);
    }
    setTimeout(() => setRemoteStatus('idle'), 3000);
  };

  const navItems: { id: ViewType; label: string }[] = [
    { id: 'changes', label: 'Changes' },
    { id: 'history', label: 'History' },
    { id: 'branches', label: 'Branches' },
  ];

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
                  padding: '3px 10px',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: active ? 500 : 400,
                  fontFamily: 'var(--font-sans)',
                  cursor: 'pointer',
                  transition: 'all 0.1s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = 'var(--text-primary)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'var(--text-secondary)'; }}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Branch indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {branch && (
            <div style={{
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
            }}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <circle cx="4" cy="4" r="2.5" stroke="var(--accent)" strokeWidth="1.5"/>
                <circle cx="12" cy="12" r="2.5" stroke="var(--accent)" strokeWidth="1.5"/>
                <path d="M4 6.5V8a4 4 0 0 0 4 4h1" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span style={{ color: 'var(--text-primary)' }}>{branch}</span>
              {ahead && ahead !== '0' && (
                <span style={{ color: 'var(--add-color)', fontSize: 10 }}>↑{ahead}</span>
              )}
              {behind && behind !== '0' && (
                <span style={{ color: 'var(--mod-color)', fontSize: 10 }}>↓{behind}</span>
              )}
            </div>
          )}

          {/* Remote ops */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { label: 'Fetch', fn: () => runRemoteOp(() => fetch(repo.path), 'Fetch'), title: 'Fetch all remotes' },
              { label: 'Pull', fn: () => runRemoteOp(() => pull(repo.path), 'Pull'), title: 'Pull from remote' },
              { label: 'Push', fn: () => runRemoteOp(() => push(repo.path), 'Push'), title: 'Push to remote' },
            ].map((op) => (
              <button
                key={op.label}
                onClick={op.fn}
                disabled={remoteStatus === 'loading'}
                title={op.title}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 5,
                  padding: '2px 8px',
                  color: remoteStatus === 'loading' ? 'var(--text-muted)' : 'var(--text-secondary)',
                  fontSize: 11,
                  fontFamily: 'var(--font-sans)',
                  cursor: remoteStatus === 'loading' ? 'not-allowed' : 'pointer',
                  transition: 'all 0.1s',
                }}
                onMouseEnter={(e) => { if (remoteStatus !== 'loading') { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                {op.label}
              </button>
            ))}
          </div>

          {/* Developer extras */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => openInExplorer(repo.path)}
              title="Open in Finder"
              style={iconBtnStyle}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M1.5 6h13" stroke="currentColor" strokeWidth="1.3"/>
                <circle cx="4" cy="4.5" r="0.8" fill="currentColor"/>
                <circle cx="6.5" cy="4.5" r="0.8" fill="currentColor"/>
              </svg>
            </button>
            <button
              onClick={() => openInTerminal(repo.path)}
              title="Open in Terminal"
              style={iconBtnStyle}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M4 6l3 2.5L4 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M9 11h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Remote status toast */}
      {remoteStatus !== 'idle' && (
        <div style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          background: remoteStatus === 'error' ? 'var(--del-bg)' : remoteStatus === 'success' ? 'var(--add-bg)' : 'var(--bg-overlay)',
          border: `1px solid ${remoteStatus === 'error' ? 'var(--del-color)' : remoteStatus === 'success' ? 'var(--add-color)' : 'var(--border)'}`,
          color: remoteStatus === 'error' ? 'var(--del-color)' : remoteStatus === 'success' ? 'var(--add-color)' : 'var(--text-secondary)',
          padding: '8px 14px',
          borderRadius: 6,
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          zIndex: 100,
          maxWidth: 400,
          wordBreak: 'break-word',
          animation: 'fadeIn 0.15s ease-out',
        }}>
          {remoteMsg}
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {view === 'changes' && <ChangesView repo={repo} />}
        {view === 'history' && <HistoryView repo={repo} />}
        {view === 'branches' && <BranchesView repo={repo} />}
      </div>
    </div>
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
