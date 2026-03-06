import { useState, useRef, useCallback } from 'react';
import type { Repository } from '../types';

const MIN_WIDTH = 160;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 220;

interface Props {
  repos: Repository[];
  activeRepo: Repository | null;
  onSelect: (repo: Repository) => void;
  onRemove: (path: string) => void;
  onAdd: () => void;
  width?: number;
  onWidthChange?: (w: number) => void;
}

export default function Sidebar({ repos, activeRepo, onSelect, onRemove, onAdd, width = DEFAULT_WIDTH, onWidthChange }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(width);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startX.current = e.clientX;
    startWidth.current = width;
    setDragging(true);

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX.current;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
      onWidthChange?.(next);
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [width, onWidthChange]);

  return (
    <div style={{
      width,
      minWidth: width,
      maxWidth: width,
      background: 'var(--bg-surface)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      userSelect: 'none',
      position: 'relative',
    }}>
      {/* Repos list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        <div style={{
          padding: '6px 12px 4px',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.1em',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          fontFamily: 'var(--font-mono)',
        }}>
          Repositories
        </div>

        {repos.length === 0 ? (
          <div style={{ padding: '16px 12px', color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6 }}>
            No repositories yet.{' '}
            <span
              onClick={onAdd}
              style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
            >
              Add one
            </span>
          </div>
        ) : (
          repos.map((repo) => {
            const isActive = activeRepo?.path === repo.path;
            const isHovered = hovered === repo.path;
            return (
              <div
                key={repo.path}
                onClick={() => onSelect(repo)}
                onMouseEnter={() => setHovered(repo.path)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '6px 10px 6px 14px',
                  cursor: 'pointer',
                  background: isActive
                    ? 'linear-gradient(90deg, var(--accent-glow) 0%, transparent 100%)'
                    : isHovered
                    ? 'var(--bg-hover)'
                    : 'transparent',
                  borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  transition: 'background 0.1s, border-color 0.1s',
                  gap: 8,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M1.5 3.5C1.5 2.67 2.17 2 3 2h3.08l1.5 1.5H13a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V3.5z"
                    fill={isActive ? 'var(--accent)' : 'var(--text-muted)'} />
                </svg>
                <span style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: 13,
                  fontWeight: isActive ? 500 : 400,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontFamily: 'var(--font-sans)',
                }}>
                  {repo.name}
                </span>
                {isHovered && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove(repo.path); }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      padding: '0 2px',
                      display: 'flex',
                      alignItems: 'center',
                      lineHeight: 1,
                      borderRadius: 3,
                      transition: 'color 0.1s',
                    }}
                    title="Remove repository"
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--del-color)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add repo button */}
      <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border-subtle)' }}>
        <button
          onClick={onAdd}
          style={{
            width: '100%',
            padding: '7px 10px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text-secondary)',
            fontSize: 12,
            fontFamily: 'var(--font-sans)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'background 0.1s, color 0.1s, border-color 0.1s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-overlay)';
            e.currentTarget.style.color = 'var(--text-primary)';
            e.currentTarget.style.borderColor = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-elevated)';
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Add repository
        </button>
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onMouseDown}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 5,
          height: '100%',
          cursor: 'ew-resize',
          background: dragging ? 'var(--accent)' : 'transparent',
          transition: 'background 0.1s',
          zIndex: 30,
        }}
        onMouseEnter={(e) => { if (!dragging) e.currentTarget.style.background = 'var(--border)'; }}
        onMouseLeave={(e) => { if (!dragging) e.currentTarget.style.background = 'transparent'; }}
      />
    </div>
  );
}
