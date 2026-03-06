import { useState, useEffect, useCallback, useRef } from 'react';
import type { Repository, FileStatus, DiffResult } from '../types';
import { getStatus, stageFile, unstageFile, stageAll, unstageAll, commit, getDiff, getUntrackedDiff } from '../api';
import DiffViewer from './DiffViewer';
import StatusBadge from './StatusBadge';
import { useResizePanel } from '../hooks/useResizePanel';

interface Props {
  repo: Repository;
  diffMode: 'unified' | 'split';
  onDiffModeChange: (m: 'unified' | 'split') => void;
  onCommit?: () => void;
  panelWidth?: number;
  onPanelWidthChange?: (w: number) => void;
}

export default function ChangesView({ repo, diffMode, onDiffModeChange, onCommit, panelWidth = 260, onPanelWidthChange }: Props) {
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileStatus | null>(null);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [commitMsg, setCommitMsg] = useState('');
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState('');
  const [search, setSearch] = useState('');

  // Silent refresh — never sets loading, so the list never blanks out
  const refresh = useCallback(async () => {
    try {
      const status = await getStatus(repo.path);
      setFiles(status || []);
      // Clear selection if the selected file no longer exists in the new status
      setSelectedFile((prev) => {
        if (!prev) return null;
        const still = (status || []).find((f) => f.path === prev.path && f.staged === prev.staged);
        if (!still) { setDiff(null); return null; }
        return prev;
      });
    } catch {
      setFiles([]);
    }
  }, [repo.path]);

  // Initial load shows a spinner, subsequent refreshes are silent
  useEffect(() => {
    setSelectedFile(null);
    setDiff(null);
    setLoading(true);
    getStatus(repo.path)
      .then((s) => setFiles(s || []))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [repo.path]);

  const loadDiff = useCallback(async (file: FileStatus) => {
    setSelectedFile(file);
    setDiffLoading(true);
    setDiff(null);
    try {
      let result: DiffResult;
      if (file.status === '?' || (file.status === 'A' && !file.staged)) {
        result = await getUntrackedDiff(repo.path, file.path);
      } else {
        result = await getDiff(repo.path, file.path, file.staged);
      }
      setDiff(result);
    } catch (e: any) {
      setDiff({ content: '', error: e?.toString() || 'Failed to load diff' });
    }
    setDiffLoading(false);
  }, [repo.path]);

  const handleStageToggle = useCallback(async (file: FileStatus) => {
    // Optimistic update — flip staged state immediately so the checkbox
    // responds instantly with no flicker
    setFiles((prev) =>
      prev.map((f) => f.path === file.path && f.staged === file.staged ? { ...f, staged: !f.staged } : f)
    );
    try {
      if (file.staged) {
        await unstageFile(repo.path, file.path);
      } else {
        await stageFile(repo.path, file.path);
      }
      // Silent reconcile with actual git state
      refresh();
      // Reload diff for the selected file with its new staged state
      if (selectedFile?.path === file.path && selectedFile?.staged === file.staged) {
        loadDiff({ ...file, staged: !file.staged });
      }
    } catch (e: any) {
      // Revert optimistic update on failure
      setFiles((prev) =>
        prev.map((f) => f.path === file.path && f.staged !== file.staged ? { ...f, staged: file.staged } : f)
      );
      console.error(e);
    }
  }, [repo.path, refresh, selectedFile, loadDiff]);

  const stagedFiles = files.filter((f) => f.staged);
  const unstagedFiles = files.filter((f) => !f.staged);
  const allStaged = files.length > 0 && unstagedFiles.length === 0;
  const someStaged = stagedFiles.length > 0 && unstagedFiles.length > 0;

  const unifiedFiles = [...files]
    .sort((a, b) => a.path.localeCompare(b.path))
    .filter((f) => !search || f.path.toLowerCase().includes(search.toLowerCase()));

  const listRef = useRef<HTMLDivElement>(null);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const onResizeMouseDown = useResizePanel(panelWidth, onPanelWidthChange ?? (() => {}));
  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someStaged;
    }
  }, [someStaged]);

  const selectedIndex = selectedFile
    ? unifiedFiles.findIndex((f) => f.path === selectedFile.path && f.staged === selectedFile.staged)
    : -1;

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't steal keys when typing in textarea
      if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      if (unifiedFiles.length === 0) return;
      let next: number;
      if (e.key === 'ArrowUp') {
        next = selectedIndex <= 0 ? unifiedFiles.length - 1 : selectedIndex - 1;
      } else {
        next = selectedIndex >= unifiedFiles.length - 1 ? 0 : selectedIndex + 1;
      }
      loadDiff(unifiedFiles[next]);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [unifiedFiles, selectedIndex, loadDiff]);

  const handleHeaderCheckbox = useCallback(async () => {
    // Stage all if not everything is staged; unstage all if everything is staged
    const shouldStage = !allStaged;
    setFiles((prev) => prev.map((f) => ({ ...f, staged: shouldStage })));
    try {
      if (shouldStage) {
        await stageAll(repo.path);
      } else {
        await unstageAll(repo.path);
      }
      refresh();
    } catch {
      refresh();
    }
  }, [repo.path, allStaged, refresh]);

  const handleCommit = useCallback(async () => {
    if (!commitMsg.trim() || stagedFiles.length === 0) return;
    setCommitting(true);
    setCommitError('');
    try {
      await commit(repo.path, commitMsg);
      setCommitMsg('');
      setSelectedFile(null);
      setDiff(null);
      await refresh();
      onCommit?.();
    } catch (e: any) {
      setCommitError(e?.toString() || 'Commit failed');
    }
    setCommitting(false);
  }, [repo.path, commitMsg, stagedFiles.length, refresh]);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left panel: file list + commit */}
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
        {/* Search */}
        <div style={{ padding: '5px 8px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, position: 'relative' }}>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter files..."
            style={{
              width: '100%',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text-primary)',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              padding: '4px 22px 4px 7px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: 13,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                lineHeight: 1,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
              title="Clear"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>

        {/* Header: select-all + count + refresh */}
        <div style={{
          padding: '6px 10px',
          borderBottom: '1px solid var(--border-subtle)',
          borderLeft: '2px solid transparent',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          flexShrink: 0,
        }}>
          <input
            type="checkbox"
            checked={allStaged}
            ref={headerCheckboxRef}
            onChange={handleHeaderCheckbox}
            title={allStaged ? 'Unstage all' : 'Stage all'}
          />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
            {files.length} changed
          </span>
          <button
            onClick={refresh}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', borderRadius: 3 }}
            title="Refresh"
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M10.5 6A4.5 4.5 0 1 1 6 1.5c1.38 0 2.6.62 3.44 1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M9.5 1.5V4H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {/* File list */}
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>loading...</div>
          ) : files.length === 0 ? (
            <div style={{ padding: '20px 12px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
              No changes
            </div>
          ) : (
            unifiedFiles.map((f) => {
              const isSelected = selectedFile?.path === f.path && selectedFile?.staged === f.staged;
              return (
                <FileRow
                  key={f.path}
                  file={f}
                  selected={isSelected}
                  onSelect={() => loadDiff(f)}
                  onToggle={() => handleStageToggle(f)}
                  scrollIntoView={isSelected}
                />
              );
            })
          )}
        </div>

        {/* Commit panel */}
        <div style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '8px 10px',
          flexShrink: 0,
          background: 'var(--bg-surface)',
        }}>
          <textarea
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            placeholder="Commit message..."
            rows={3}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleCommit();
            }}
            style={{
              width: '100%',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 5,
              color: 'var(--text-primary)',
              fontSize: 12,
              fontFamily: 'var(--font-sans)',
              padding: '7px 9px',
              resize: 'none',
              outline: 'none',
              lineHeight: 1.5,
              transition: 'border-color 0.1s',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          />
          {commitError && (
            <div style={{ color: 'var(--del-color)', fontSize: 11, marginTop: 4, fontFamily: 'var(--font-mono)', wordBreak: 'break-word' }}>
              {commitError}
            </div>
          )}
          <button
            onClick={handleCommit}
            disabled={!commitMsg.trim() || stagedFiles.length === 0 || committing}
            style={{
              width: '100%',
              marginTop: 6,
              padding: '7px',
              background: (!commitMsg.trim() || stagedFiles.length === 0 || committing) ? 'var(--bg-elevated)' : 'var(--accent)',
              border: `1px solid ${(!commitMsg.trim() || stagedFiles.length === 0 || committing) ? 'var(--border)' : 'transparent'}`,
              borderRadius: 5,
              color: (!commitMsg.trim() || stagedFiles.length === 0 || committing) ? 'var(--text-muted)' : 'white',
              fontSize: 12,
              fontWeight: 500,
              fontFamily: 'var(--font-sans)',
              cursor: (!commitMsg.trim() || stagedFiles.length === 0 || committing) ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {committing ? 'Committing...' : 'Commit'}
          </button>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textAlign: 'center' }}>
            ⌘↵ to commit
          </div>
        </div>
        {/* Resize handle */}
        <div
          onMouseDown={onResizeMouseDown}
          style={{ position: 'absolute', top: 0, right: 0, width: 5, height: '100%', cursor: 'ew-resize', zIndex: 10 }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        />
      </div>

      {/* Right panel: diff */}
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
              {selectedFile.oldPath ? `${selectedFile.oldPath} → ${selectedFile.path}` : selectedFile.path}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>
              {selectedFile.staged ? 'staged' : 'unstaged'}
            </span>
          </div>
        )}
        <DiffViewer
          content={diff?.content || ''}
          error={diff?.error || ''}
          loading={diffLoading}
          placeholder="Select a file to preview changes"
          diffMode={diffMode}
          onDiffModeChange={onDiffModeChange}
        />
      </div>
    </div>
  );
}


function FileRow({ file, selected, onSelect, onToggle, scrollIntoView }: { file: FileStatus; selected: boolean; onSelect: () => void; onToggle: () => void; scrollIntoView?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollIntoView && rowRef.current) {
      rowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [scrollIntoView]);

  return (
    <div
      ref={rowRef}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '4px 10px',
        gap: 7,
        cursor: 'pointer',
        background: selected ? 'var(--accent-glow)' : hovered ? 'var(--bg-hover)' : 'transparent',
        borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'background 0.08s',
      }}
    >
      <input
        type="checkbox"
        checked={file.staged}
        onChange={(e) => { e.stopPropagation(); onToggle(); }}
        onClick={(e) => e.stopPropagation()}
      />
      <StatusBadge status={file.status} />
      <span style={{
        flex: 1,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {file.path}
      </span>
    </div>
  );
}
