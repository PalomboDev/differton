import { useMemo } from 'react';

interface Props {
  content: string;
  error?: string;
  loading?: boolean;
  placeholder?: string;
  diffMode?: 'unified' | 'split';
  onDiffModeChange?: (m: 'unified' | 'split') => void;
}

interface DiffLine {
  type: 'add' | 'del' | 'context' | 'hunk';
  content: string;
  oldNum?: number;
  newNum?: number;
}

interface SplitRow {
  left: { content: string; type: 'add' | 'del' | 'context' | 'empty'; num?: number };
  right: { content: string; type: 'add' | 'del' | 'context' | 'empty'; num?: number };
}

function parseDiff(raw: string): DiffLine[] {
  if (!raw) return [];
  const result: DiffLine[] = [];
  let oldNum = 0;
  let newNum = 0;

  for (const line of raw.split('\n')) {
    // Skip git metadata lines
    if (
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('new file mode') ||
      line.startsWith('deleted file mode') ||
      line.startsWith('old mode') ||
      line.startsWith('new mode') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ') ||
      line.startsWith('\\ No newline')
    ) continue;

    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldNum = parseInt(match[1]) - 1;
        newNum = parseInt(match[2]) - 1;
      }
      // Show the hunk header content after the @@ ... @@ part
      const extra = line.replace(/^@@ .+? @@/, '').trim();
      result.push({ type: 'hunk', content: extra || line });
    } else if (line.startsWith('+')) {
      newNum++;
      result.push({ type: 'add', content: line.slice(1), newNum });
    } else if (line.startsWith('-')) {
      oldNum++;
      result.push({ type: 'del', content: line.slice(1), oldNum });
    } else if (line.length > 0) {
      oldNum++;
      newNum++;
      result.push({ type: 'context', content: line.startsWith(' ') ? line.slice(1) : line, oldNum, newNum });
    }
  }

  return result;
}

function toSplitRows(lines: DiffLine[]): (SplitRow | { hunk: string })[] {
  const rows: (SplitRow | { hunk: string })[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.type === 'hunk') {
      rows.push({ hunk: line.content });
      i++;
      continue;
    }
    if (line.type === 'context') {
      rows.push({
        left:  { content: line.content, type: 'context', num: line.oldNum },
        right: { content: line.content, type: 'context', num: line.newNum },
      });
      i++;
      continue;
    }
    // Pair up consecutive dels with adds
    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (i < lines.length && lines[i].type === 'del') { dels.push(lines[i]); i++; }
    while (i < lines.length && lines[i].type === 'add') { adds.push(lines[i]); i++; }
    const len = Math.max(dels.length, adds.length);
    for (let j = 0; j < len; j++) {
      const d = dels[j];
      const a = adds[j];
      rows.push({
        left:  d ? { content: d.content, type: 'del', num: d.oldNum } : { content: '', type: 'empty' },
        right: a ? { content: a.content, type: 'add', num: a.newNum } : { content: '', type: 'empty' },
      });
    }
  }
  return rows;
}

const BG: Record<string, string> = {
  add:     'var(--add-bg)',
  del:     'var(--del-bg)',
  context: 'transparent',
  empty:   'var(--bg-elevated)',
};
const FG: Record<string, string> = {
  add:     'var(--add-color)',
  del:     'var(--del-color)',
  context: 'var(--text-secondary)',
  empty:   'transparent',
};

export default function DiffViewer({ content, error, loading, placeholder, diffMode = 'unified', onDiffModeChange }: Props) {
  const setSplit = (s: boolean) => onDiffModeChange?.(s ? 'split' : 'unified');
  const lines = useMemo(() => parseDiff(content || ''), [content]);
  // If all non-hunk lines are adds or all are dels, split view is pointless — force unified
  const contentLines = useMemo(() => lines.filter(l => l.type !== 'hunk'), [lines]);
  const isPureAdd = contentLines.length > 0 && contentLines.every(l => l.type === 'add');
  const isPureDel = contentLines.length > 0 && contentLines.every(l => l.type === 'del');
  const split = diffMode === 'split' && !isPureAdd && !isPureDel;
  const splitRows = useMemo(() => split ? toSplitRows(lines) : [], [split, lines]);

  if (loading) {
    return <Empty><span style={{ color: 'var(--text-muted)' }}>loading diff...</span></Empty>;
  }
  if (error) {
    return <Empty><span style={{ color: 'var(--del-color)', maxWidth: 400, textAlign: 'center', wordBreak: 'break-word' }}>{error}</span></Empty>;
  }
  if (!content || lines.length === 0) {
    return <Empty><span style={{ color: 'var(--text-muted)' }}>{placeholder || 'Select a file to view the diff'}</span></Empty>;
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-base)' }}>
      {/* Toolbar */}
      {!isPureAdd && !isPureDel && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '3px 8px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, background: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden' }}>
            {(['unified', 'split'] as const).map((mode) => {
              const active = (mode === 'split') === split;
              return (
                <button
                  key={mode}
                  onClick={() => setSplit(mode === 'split')}
                  style={{
                    background: active ? 'var(--bg-overlay)' : 'transparent',
                    border: 'none',
                    padding: '2px 10px',
                    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: 11,
                    fontFamily: 'var(--font-sans)',
                    cursor: 'pointer',
                    transition: 'all 0.1s',
                  }}
                >
                  {mode}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Diff content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {split ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.55 }}>
            <tbody>
              {splitRows.map((row, i) => {
                if ('hunk' in row) {
                  return (
                    <tr key={i} style={{ background: 'var(--bg-elevated)' }}>
                      <td colSpan={4} style={{ padding: '1px 10px', color: 'var(--accent)', opacity: 0.6, fontSize: 11, borderBottom: '1px solid var(--border-subtle)' }}>
                        {row.hunk || ' '}
                      </td>
                    </tr>
                  );
                }
                const { left, right } = row as SplitRow;
                return (
                  <tr key={i}>
                    {/* Left line num */}
                    <td style={{ ...numStyle, background: left.type === 'empty' ? 'var(--bg-elevated)' : BG[left.type] }}>
                      {left.num ?? ''}
                    </td>
                    {/* Left content */}
                    <td style={{ ...cellStyle, background: BG[left.type], color: FG[left.type], borderRight: '1px solid var(--border-subtle)' }}>
                      {left.type === 'del' && <Prefix>-</Prefix>}
                      {left.type !== 'del' && <Prefix> </Prefix>}
                      {left.content || ' '}
                    </td>
                    {/* Right line num */}
                    <td style={{ ...numStyle, background: right.type === 'empty' ? 'var(--bg-elevated)' : BG[right.type] }}>
                      {right.num ?? ''}
                    </td>
                    {/* Right content */}
                    <td style={{ ...cellStyle, background: BG[right.type], color: FG[right.type] }}>
                      {right.type === 'add' && <Prefix>+</Prefix>}
                      {right.type !== 'add' && <Prefix> </Prefix>}
                      {right.content || ' '}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.55 }}>
            <tbody>
              {lines.map((line, i) => {
                if (line.type === 'hunk') {
                  return (
                    <tr key={i} style={{ background: 'var(--bg-elevated)' }}>
                      <td colSpan={3} style={{ padding: '1px 10px', color: 'var(--accent)', opacity: 0.6, fontSize: 11, borderBottom: '1px solid var(--border-subtle)' }}>
                        {line.content || ' '}
                      </td>
                    </tr>
                  );
                }
                const bg = BG[line.type];
                const fg = FG[line.type];
                const prefix = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
                const num = line.type === 'del' ? line.oldNum : line.newNum;
                return (
                  <tr key={i} style={{ background: bg }}>
                    <td style={numStyle}>{num ?? ''}</td>
                    <td style={{ ...prefixStyle, color: fg }}>{prefix}</td>
                    <td style={{ ...cellStyle, color: fg }}>{line.content || ' '}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', height: '100%', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      {children}
    </div>
  );
}

function Prefix({ children }: { children: string }) {
  return <span style={{ userSelect: 'none', opacity: 0.5, marginRight: 4 }}>{children}</span>;
}

const numStyle: React.CSSProperties = {
  width: 44,
  textAlign: 'right',
  padding: '0 6px 0 4px',
  color: 'var(--text-muted)',
  fontSize: 10,
  userSelect: 'none',
  opacity: 0.5,
  borderRight: '1px solid var(--border-subtle)',
  verticalAlign: 'top',
  paddingTop: 1,
  whiteSpace: 'nowrap',
};

const prefixStyle: React.CSSProperties = {
  width: 14,
  textAlign: 'center',
  fontSize: 11,
  userSelect: 'none',
  verticalAlign: 'top',
  paddingTop: 1,
};

const cellStyle: React.CSSProperties = {
  padding: '0 12px 0 2px',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  verticalAlign: 'top',
};
