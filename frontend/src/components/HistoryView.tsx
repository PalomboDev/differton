import { useState, useEffect, useCallback, useRef } from 'react';
import type { Repository, CommitInfo, FileStatus, DiffResult } from '../types';
import { getLog, getCommitFiles, getCommitDiff } from '../api';
import DiffViewer from './DiffViewer';
import StatusBadge from './StatusBadge';
import { useResizePanel } from '../hooks/useResizePanel';

interface Props {
  repo: Repository;
  diffMode: 'unified' | 'split';
  onDiffModeChange: (m: 'unified' | 'split') => void;
  panelWidth?: number;
  onPanelWidthChange?: (w: number) => void;
}

export default function HistoryView({ repo, diffMode, onDiffModeChange, panelWidth = 260, onPanelWidthChange }: Props) {
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null>(null);
  const [commitFiles, setCommitFiles] = useState<FileStatus[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileStatus | null>(null);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const fileListRef = useRef<HTMLDivElement>(null);
  const onResizeMouseDown = useResizePanel(panelWidth, onPanelWidthChange ?? (() => {}));

  useEffect(() => {
    setSelectedCommit(null);
    setCommitFiles([]);
    setSelectedFile(null);
    setDiff(null);
    setLoading(true);
    getLog(repo.path, 200).then((c) => {
      setCommits(c || []);
      setLoading(false);
    }).catch(() => {
      setCommits([]);
      setLoading(false);
    });
  }, [repo.path]);

  const selectCommit = useCallback(async (commit: CommitInfo) => {
    setSelectedCommit(commit);
    setSelectedFile(null);
    setDiff(null);
    try {
      const files = await getCommitFiles(repo.path, commit.hash);
      setCommitFiles(files || []);
    } catch {
      setCommitFiles([]);
    }
  }, [repo.path]);

  const selectFile = useCallback(async (file: FileStatus) => {
    if (!selectedCommit) return;
    setSelectedFile(file);
    setDiffLoading(true);
    setDiff(null);
    try {
      const result = await getCommitDiff(repo.path, selectedCommit.hash, file.path);
      setDiff(result);
    } catch (e: any) {
      setDiff({ content: '', error: e?.toString() || 'Failed to load diff' });
    }
    setDiffLoading(false);
  }, [repo.path, selectedCommit]);

  const selectedFileIndex = selectedFile
    ? commitFiles.findIndex((f) => f.path === selectedFile.path)
    : -1;

  useEffect(() => {
    if (!selectedCommit) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      if (commitFiles.length === 0) return;
      let next: number;
      if (e.key === 'ArrowUp') {
        next = selectedFileIndex <= 0 ? commitFiles.length - 1 : selectedFileIndex - 1;
      } else {
        next = selectedFileIndex >= commitFiles.length - 1 ? 0 : selectedFileIndex + 1;
      }
      selectFile(commitFiles[next]);
      // Scroll into view
      const container = fileListRef.current;
      if (container) {
        const rows = container.querySelectorAll<HTMLElement>('[data-file-row]');
        rows[next]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedCommit, commitFiles, selectedFileIndex, selectFile]);

  const hashShort = (h: string) => h.slice(0, 7);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Commit list */}
      <div style={{
        width: panelWidth,
        minWidth: panelWidth,
        maxWidth: panelWidth,
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-surface)',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{
          padding: '7px 12px 5px',
          borderBottom: '1px solid var(--border-subtle)',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.08em',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          fontFamily: 'var(--font-mono)',
          flexShrink: 0,
        }}>
          {loading ? 'loading...' : `${commits.length} commits`}
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {commits.map((c) => {
            const isSelected = selectedCommit?.hash === c.hash;
            return (
              <div
                key={c.hash}
                onClick={() => selectCommit(c)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: isSelected ? 'var(--accent-glow)' : 'transparent',
                  borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                  transition: 'background 0.08s',
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span
                    title="Click to copy full hash"
                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(c.hash); }}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'var(--accent)',
                      background: 'var(--accent-glow)',
                      padding: '1px 5px',
                      borderRadius: 3,
                      letterSpacing: '0.05em',
                      cursor: 'copy',
                    }}
                  >
                    {hashShort(c.hash)}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {c.date}
                  </span>
                </div>
                <div style={{
                  fontSize: 12,
                  color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                  lineHeight: 1.4,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}>
                  {c.message}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                  {c.author}
                </div>
              </div>
            );
          })}
        </div>
        {/* Resize handle */}
        <div
          onMouseDown={onResizeMouseDown}
          style={{ position: 'absolute', top: 0, right: 0, width: 5, height: '100%', cursor: 'ew-resize', zIndex: 10 }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        />
      </div>

      {/* File list for selected commit */}
      {selectedCommit && (
        <div style={{
          width: 200,
          minWidth: 200,
          maxWidth: 200,
          borderRight: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-surface)',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '7px 10px 5px',
            borderBottom: '1px solid var(--border-subtle)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-mono)',
            flexShrink: 0,
          }}>
            {commitFiles.length} files
          </div>
          <div ref={fileListRef} style={{ flex: 1, overflowY: 'auto' }}>
            {commitFiles.map((f) => {
              const isSelected = selectedFile?.path === f.path;
              return (
                <div
                  key={f.path}
                  data-file-row
                  onClick={() => selectFile(f)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '5px 10px',
                    gap: 6,
                    cursor: 'pointer',
                    background: isSelected ? 'var(--accent-glow)' : 'transparent',
                    borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                    transition: 'background 0.08s',
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  <StatusBadge status={f.status} />
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}>
                    {f.path}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Diff panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-base)' }}>
        {selectedFile && (
          <div style={{
            padding: '6px 12px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
          }}>
            <StatusBadge status={selectedFile.status} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>
              {selectedFile.path}
            </span>
          </div>
        )}
        <DiffViewer
          content={diff?.content || ''}
          error={diff?.error || ''}
          loading={diffLoading}
          placeholder={selectedCommit ? 'Select a file to preview diff' : 'Select a commit to view changes'}
          diffMode={diffMode}
          onDiffModeChange={onDiffModeChange}
        />
      </div>
    </div>
  );
}
