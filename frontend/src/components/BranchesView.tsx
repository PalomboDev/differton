import { useState, useEffect, useCallback, useRef } from 'react';
import type { Repository, Branch, CommitInfo } from '../types';
import { getBranches, createBranch, checkoutBranch, getLog } from '../api';
import { useResizePanel } from '../hooks/useResizePanel';

interface Props {
  repo: Repository;
  panelWidth?: number;
  onPanelWidthChange?: (w: number) => void;
}

export default function BranchesView({ repo, panelWidth = 260, onPanelWidthChange }: Props) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const onResizeMouseDown = useResizePanel(panelWidth, onPanelWidthChange ?? (() => {}));

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const b = await getBranches(repo.path);
      setBranches(b || []);
    } catch {
      setBranches([]);
    }
    setLoading(false);
  }, [repo.path]);

  useEffect(() => {
    setSelectedBranch(null);
    setCommits([]);
    refresh();
  }, [repo.path, refresh]);

  useEffect(() => {
    if (showNewBranch) setTimeout(() => inputRef.current?.focus(), 50);
  }, [showNewBranch]);

  const selectBranch = useCallback(async (b: Branch) => {
    setSelectedBranch(b);
    setCommits([]);
    setCommitsLoading(true);
    try {
      // For remote branches strip "origin/" prefix when fetching log
      const ref = b.isRemote ? b.name : b.name;
      const log = await getLog(repo.path, 50);
      setCommits(log || []);
    } catch {
      setCommits([]);
    }
    setCommitsLoading(false);
  }, [repo.path]);

  const handleCreate = useCallback(async () => {
    if (!newBranchName.trim()) return;
    setCreating(true);
    setError('');
    try {
      await createBranch(repo.path, newBranchName.trim());
      setNewBranchName('');
      setShowNewBranch(false);
      await refresh();
    } catch (e: any) {
      setError(e?.toString() || 'Failed to create branch');
    }
    setCreating(false);
  }, [repo.path, newBranchName, refresh]);

  const handleCheckout = useCallback(async (branch: Branch) => {
    if (branch.isCurrent) return;
    setCheckingOut(branch.name);
    setError('');
    try {
      await checkoutBranch(repo.path, branch.name);
      await refresh();
    } catch (e: any) {
      setError(e?.toString() || 'Failed to checkout branch');
    }
    setCheckingOut(null);
  }, [repo.path, refresh]);

  const localBranches = branches.filter((b) => !b.isRemote);
  const remoteBranches = branches.filter((b) => b.isRemote);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* Left: branch list */}
      <div style={{ width: panelWidth, minWidth: panelWidth, maxWidth: panelWidth, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', overflow: 'hidden', position: 'relative' }}>

        {/* Header */}
        <div style={{ padding: '8px 10px 6px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', flex: 1 }}>
            {loading ? '…' : `${branches.length} branches`}
          </span>
          <button
            onClick={refresh}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', borderRadius: 3 }}
            title="Refresh"
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M10.5 6A4.5 4.5 0 1 1 6 1.5c1.38 0 2.6.62 3.44 1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M9.5 1.5V4H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            onClick={() => { setShowNewBranch((v) => !v); setError(''); }}
            title="New branch"
            style={{ background: showNewBranch ? 'var(--accent-glow)' : 'none', border: 'none', borderRadius: 3, padding: '2px 3px', color: showNewBranch ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'color 0.1s, background 0.1s' }}
            onMouseEnter={(e) => { if (!showNewBranch) e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={(e) => { if (!showNewBranch) e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* New branch inline form */}
        {showNewBranch && (
          <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, background: 'var(--bg-elevated)' }}>
            <input
              ref={inputRef}
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="new-branch-name"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setShowNewBranch(false); setNewBranchName(''); } }}
              style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--font-mono)', padding: '5px 8px', outline: 'none', minWidth: 0 }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
            />
            <button
              onClick={handleCreate}
              disabled={!newBranchName.trim() || creating}
              style={{ background: newBranchName.trim() ? 'var(--accent)' : 'var(--bg-overlay)', border: 'none', borderRadius: 4, padding: '5px 10px', color: newBranchName.trim() ? 'white' : 'var(--text-muted)', fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-sans)', cursor: newBranchName.trim() ? 'pointer' : 'not-allowed', flexShrink: 0 }}
            >
              {creating ? '…' : 'Create'}
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: '5px 10px', background: 'var(--del-bg)', color: 'var(--del-color)', fontSize: 11, fontFamily: 'var(--font-mono)', wordBreak: 'break-word', flexShrink: 0 }}>
            {error}
          </div>
        )}

        {/* Branch list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>loading...</div>
          ) : (
            <>
              {localBranches.length > 0 && (
                <Group label="Local">
                  {localBranches.map((b) => (
                    <BranchRow
                      key={b.name}
                      branch={b}
                      selected={selectedBranch?.name === b.name}
                      checkingOut={checkingOut}
                      onSelect={() => selectBranch(b)}
                      onCheckout={handleCheckout}
                    />
                  ))}
                </Group>
              )}
              {remoteBranches.length > 0 && (
                <Group label="Remote">
                  {remoteBranches.map((b) => (
                    <BranchRow
                      key={b.name}
                      branch={b}
                      selected={selectedBranch?.name === b.name}
                      checkingOut={checkingOut}
                      onSelect={() => selectBranch(b)}
                      onCheckout={handleCheckout}
                    />
                  ))}
                </Group>
              )}
            </>
          )}
        </div>
        {/* Resize handle */}
        <div
          onMouseDown={onResizeMouseDown}
          style={{ position: 'absolute', top: 0, right: 0, width: 5, height: '100%', cursor: 'ew-resize', zIndex: 10 }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        />
      </div>

      {/* Right: commits on selected branch */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-base)' }}>
        {selectedBranch ? (
          <>
            {/* Branch info header */}
            <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="4" cy="4" r="2.5" stroke="var(--accent)" strokeWidth="1.5"/>
                <circle cx="12" cy="12" r="2.5" stroke="var(--accent)" strokeWidth="1.5"/>
                <path d="M4 6.5V8a4 4 0 0 0 4 4h1" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>
                {selectedBranch.name}
              </span>
              {selectedBranch.isCurrent && (
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
              )}
              {!selectedBranch.isCurrent && (
                <button
                  onClick={() => handleCheckout(selectedBranch)}
                  disabled={checkingOut === selectedBranch.name}
                  style={{ marginLeft: 'auto', background: 'var(--accent)', border: 'none', borderRadius: 5, padding: '4px 12px', color: 'white', fontSize: 11, fontWeight: 500, fontFamily: 'var(--font-sans)', cursor: 'pointer', opacity: checkingOut === selectedBranch.name ? 0.5 : 1 }}
                >
                  {checkingOut === selectedBranch.name ? 'Checking out…' : 'Checkout'}
                </button>
              )}
            </div>

            {/* Commit list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {commitsLoading ? (
                <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>loading...</div>
              ) : commits.length === 0 ? (
                <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>No commits</div>
              ) : (
                commits.map((c) => (
                  <div key={c.hash} style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', background: 'var(--accent-glow)', padding: '1px 5px', borderRadius: 3 }}>
                        {c.hash.slice(0, 7)}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{c.date}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {c.message}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{c.author}</div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
              select a branch
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ padding: '6px 10px 3px', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function BranchRow({ branch: b, selected, checkingOut, onSelect, onCheckout }: {
  branch: Branch;
  selected: boolean;
  checkingOut: string | null;
  onSelect: () => void;
  onCheckout: (b: Branch) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isCheckingOut = checkingOut === b.name;

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '5px 10px',
        gap: 7,
        cursor: 'pointer',
        background: selected ? 'var(--accent-glow)' : hovered ? 'var(--bg-hover)' : 'transparent',
        borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'background 0.08s',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: b.isCurrent ? 1 : 0.5 }}>
        <circle cx="4" cy="4" r="2.5" stroke={b.isCurrent ? 'var(--accent)' : 'var(--text-secondary)'} strokeWidth="1.5"/>
        <circle cx="12" cy="12" r="2.5" stroke={b.isCurrent ? 'var(--accent)' : 'var(--text-secondary)'} strokeWidth="1.5"/>
        <path d="M4 6.5V8a4 4 0 0 0 4 4h1" stroke={b.isCurrent ? 'var(--accent)' : 'var(--text-secondary)'} strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11, color: selected ? 'var(--text-primary)' : b.isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: b.isCurrent ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {b.name}
      </span>
      {b.isCurrent && (
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
      )}
      {isCheckingOut && (
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>…</span>
      )}
    </div>
  );
}
