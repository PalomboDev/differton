import { useState, useEffect, useCallback } from 'react';
import type { Repository, Branch } from '../types';
import { getBranches, createBranch, checkoutBranch } from '../api';

interface Props {
  repo: Repository;
}

export default function BranchesView({ repo }: Props) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [showNewBranch, setShowNewBranch] = useState(false);

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
    refresh();
  }, [refresh]);

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
      <div style={{
        width: '100%',
        maxWidth: 640,
        display: 'flex',
        flexDirection: 'column',
        padding: '0',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--bg-surface)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
            Branches
          </span>
          <button
            onClick={refresh}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', borderRadius: 3 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M10.5 6A4.5 4.5 0 1 1 6 1.5c1.38 0 2.6.62 3.44 1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M9.5 1.5V4H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            onClick={() => setShowNewBranch((v) => !v)}
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: showNewBranch ? 'var(--accent-glow)' : 'var(--bg-elevated)',
              border: `1px solid ${showNewBranch ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 5,
              padding: '3px 10px',
              color: showNewBranch ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize: 11,
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              transition: 'all 0.1s',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            New branch
          </button>
        </div>

        {/* New branch form */}
        {showNewBranch && (
          <div style={{
            padding: '10px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-elevated)',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexShrink: 0,
          }}>
            <input
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="branch-name"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowNewBranch(false); }}
              autoFocus
              style={{
                flex: 1,
                background: 'var(--bg-overlay)',
                border: '1px solid var(--border)',
                borderRadius: 5,
                color: 'var(--text-primary)',
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                padding: '6px 9px',
                outline: 'none',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
            />
            <button
              onClick={handleCreate}
              disabled={!newBranchName.trim() || creating}
              style={{
                background: !newBranchName.trim() ? 'var(--bg-overlay)' : 'var(--accent)',
                border: 'none',
                borderRadius: 5,
                padding: '6px 14px',
                color: !newBranchName.trim() ? 'var(--text-muted)' : 'white',
                fontSize: 12,
                fontWeight: 500,
                fontFamily: 'var(--font-sans)',
                cursor: !newBranchName.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 0.1s',
              }}
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        )}

        {error && (
          <div style={{ padding: '6px 16px', background: 'var(--del-bg)', color: 'var(--del-color)', fontSize: 11, fontFamily: 'var(--font-mono)', wordBreak: 'break-word' }}>
            {error}
          </div>
        )}

        {/* Branch lists */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>loading...</div>
          ) : (
            <>
              <BranchSection
                title="Local"
                branches={localBranches}
                onCheckout={handleCheckout}
                checkingOut={checkingOut}
              />
              {remoteBranches.length > 0 && (
                <BranchSection
                  title="Remote"
                  branches={remoteBranches}
                  onCheckout={handleCheckout}
                  checkingOut={checkingOut}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BranchSection({ title, branches, onCheckout, checkingOut }: {
  title: string;
  branches: Branch[];
  onCheckout: (b: Branch) => void;
  checkingOut: string | null;
}) {
  return (
    <div>
      <div style={{
        padding: '8px 16px 4px',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.08em',
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        fontFamily: 'var(--font-mono)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        {title} · {branches.length}
      </div>
      {branches.map((b) => {
        const isCheckingOut = checkingOut === b.name;
        return (
          <div
            key={b.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '8px 16px',
              gap: 10,
              borderBottom: '1px solid var(--border-subtle)',
              background: b.isCurrent ? 'var(--accent-glow)' : 'transparent',
              cursor: b.isCurrent || b.isRemote ? 'default' : 'pointer',
              transition: 'background 0.08s',
            }}
            onMouseEnter={(e) => { if (!b.isCurrent) e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { if (!b.isCurrent) e.currentTarget.style.background = b.isCurrent ? 'var(--accent-glow)' : 'transparent'; }}
          >
            {/* Branch icon */}
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="4" cy="4" r="2.5" stroke={b.isCurrent ? 'var(--accent)' : 'var(--text-muted)'} strokeWidth="1.5"/>
              <circle cx="12" cy="12" r="2.5" stroke={b.isCurrent ? 'var(--accent)' : 'var(--text-muted)'} strokeWidth="1.5"/>
              <path d="M4 6.5V8a4 4 0 0 0 4 4h1" stroke={b.isCurrent ? 'var(--accent)' : 'var(--text-muted)'} strokeWidth="1.5" strokeLinecap="round"/>
            </svg>

            {/* Name */}
            <span style={{
              flex: 1,
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: b.isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: b.isCurrent ? 500 : 400,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {b.name}
            </span>

            {/* Indicators */}
            {b.isCurrent && (
              <span style={{
                fontSize: 10,
                color: 'var(--accent)',
                background: 'var(--accent-glow)',
                padding: '1px 6px',
                borderRadius: 10,
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.05em',
              }}>
                current
              </span>
            )}

            {/* Checkout button for non-current local branches */}
            {!b.isCurrent && (
              <button
                onClick={() => onCheckout(b)}
                disabled={isCheckingOut}
                style={{
                  background: 'var(--bg-overlay)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  padding: '2px 8px',
                  color: 'var(--text-secondary)',
                  fontSize: 10,
                  fontFamily: 'var(--font-sans)',
                  cursor: isCheckingOut ? 'not-allowed' : 'pointer',
                  transition: 'all 0.1s',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
              >
                {isCheckingOut ? '...' : 'checkout'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
