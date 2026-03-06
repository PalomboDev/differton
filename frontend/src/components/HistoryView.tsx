import { useState, useEffect, useCallback } from 'react';
import type { Repository, CommitInfo, FileStatus, DiffResult } from '../types';
import { getLog, getCommitFiles, getCommitDiff } from '../api';
import DiffViewer from './DiffViewer';
import StatusBadge from './StatusBadge';

interface Props {
  repo: Repository;
}

export default function HistoryView({ repo }: Props) {
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null>(null);
  const [commitFiles, setCommitFiles] = useState<FileStatus[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileStatus | null>(null);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

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

  const hashShort = (h: string) => h.slice(0, 7);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Commit list */}
      <div style={{
        width: 320,
        minWidth: 240,
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-surface)',
        overflow: 'hidden',
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
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: 'var(--accent)',
                    background: 'var(--accent-glow)',
                    padding: '1px 5px',
                    borderRadius: 3,
                    letterSpacing: '0.05em',
                  }}>
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
      </div>

      {/* File list for selected commit */}
      {selectedCommit && (
        <div style={{
          width: 220,
          minWidth: 160,
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
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {commitFiles.map((f) => {
              const isSelected = selectedFile?.path === f.path;
              return (
                <div
                  key={f.path}
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
        />
      </div>
    </div>
  );
}
