import { useState, useEffect, useCallback } from 'react';
import type { Repository, FileStatus, DiffResult } from '../types';
import { getStatus, stageFile, unstageFile, stageAll, unstageAll, commit, getDiff, getUntrackedDiff } from '../api';
import DiffViewer from './DiffViewer';
import StatusBadge from './StatusBadge';

interface Props {
  repo: Repository;
}

export default function ChangesView({ repo }: Props) {
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileStatus | null>(null);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [commitMsg, setCommitMsg] = useState('');
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState('');

  // Silent refresh — never sets loading, so the list never blanks out
  const refresh = useCallback(async () => {
    try {
      const status = await getStatus(repo.path);
      setFiles(status || []);
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
      if (file.status === '?') {
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

  const unifiedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  const handleHeaderCheckbox = useCallback(async () => {
    // If all staged → unstage all. If partial or none → unstage all (clear selection).
    // Only stage all when nothing is staged at all.
    const shouldStage = !allStaged && !someStaged;
    // Optimistic update
    setFiles((prev) => prev.map((f) => ({ ...f, staged: shouldStage })));
    try {
      if (shouldStage) {
        await stageAll(repo.path);
      } else {
        await unstageAll(repo.path);
      }
      refresh();
    } catch {
      refresh(); // revert by re-fetching
    }
  }, [repo.path, allStaged, refresh]);

  const handleCommit = useCallback(async () => {
    if (!commitMsg.trim() || stagedFiles.length === 0) return;
    setCommitting(true);
    setCommitError('');
    try {
      await commit(repo.path, commitMsg);
      setCommitMsg('');
      await refresh();
    } catch (e: any) {
      setCommitError(e?.toString() || 'Commit failed');
    }
    setCommitting(false);
  }, [repo.path, commitMsg, stagedFiles.length, refresh]);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left panel: file list + commit */}
      <div style={{
        width: 280,
        minWidth: 220,
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-surface)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '8px 10px 6px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}>
          <input
            type="checkbox"
            checked={allStaged}
            ref={(el) => { if (el) el.indeterminate = someStaged; }}
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
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>loading...</div>
          ) : files.length === 0 ? (
            <div style={{ padding: '20px 12px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
              No changes
            </div>
          ) : (
            unifiedFiles.map((f) => (
              <FileRow
                key={f.path}
                file={f}
                selected={selectedFile?.path === f.path && selectedFile?.staged === f.staged}
                onSelect={() => loadDiff(f)}
                onToggle={() => handleStageToggle(f)}
              />
            ))
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
            {committing ? 'Committing...' : stagedFiles.length === 0 ? 'No staged files' : `Commit to ${''}`}
          </button>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textAlign: 'center' }}>
            ⌘↵ to commit
          </div>
        </div>
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
        />
      </div>
    </div>
  );
}


function FileRow({ file, selected, onSelect, onToggle }: { file: FileStatus; selected: boolean; onSelect: () => void; onToggle: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
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
