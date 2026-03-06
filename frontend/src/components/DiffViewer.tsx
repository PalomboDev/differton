import { useMemo } from 'react';

interface Props {
  content: string;
  error?: string;
  loading?: boolean;
  placeholder?: string;
}

interface DiffLine {
  type: 'add' | 'del' | 'context' | 'meta' | 'header';
  content: string;
  lineNum?: number;
}

function parseDiff(raw: string): DiffLine[] {
  if (!raw) return [];
  const lines = raw.split('\n');
  const result: DiffLine[] = [];
  let addNum = 0;
  let delNum = 0;

  for (const line of lines) {
    if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file')) {
      result.push({ type: 'meta', content: line });
    } else if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      result.push({ type: 'header', content: line });
    } else if (line.startsWith('@@')) {
      // Parse line numbers from @@ -a,b +c,d @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        delNum = parseInt(match[1]) - 1;
        addNum = parseInt(match[2]) - 1;
      }
      result.push({ type: 'meta', content: line });
    } else if (line.startsWith('+')) {
      addNum++;
      result.push({ type: 'add', content: line.slice(1), lineNum: addNum });
    } else if (line.startsWith('-')) {
      delNum++;
      result.push({ type: 'del', content: line.slice(1), lineNum: delNum });
    } else if (line.startsWith('\\')) {
      result.push({ type: 'meta', content: line });
    } else {
      if (line.length > 0 || result.length > 0) {
        addNum++;
        delNum++;
        result.push({ type: 'context', content: line.startsWith(' ') ? line.slice(1) : line, lineNum: addNum });
      }
    }
  }

  return result;
}

export default function DiffViewer({ content, error, loading, placeholder }: Props) {
  const lines = useMemo(() => parseDiff(content || ''), [content]);

  if (loading) {
    return (
      <div style={emptyStyle}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>loading diff...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={emptyStyle}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--del-color)', maxWidth: 400, textAlign: 'center', wordBreak: 'break-word' }}>{error}</span>
      </div>
    );
  }

  if (!content || lines.length === 0) {
    return (
      <div style={emptyStyle}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
          {placeholder || 'Select a file to view the diff'}
        </span>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1,
      overflow: 'auto',
      background: 'var(--bg-base)',
    }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        lineHeight: 1.55,
      }}>
        <tbody>
          {lines.map((line, i) => {
            if (line.type === 'meta' || line.type === 'header') {
              return (
                <tr key={i}>
                  <td colSpan={3} style={{
                    padding: '1px 12px',
                    color: line.type === 'meta' ? 'var(--accent)' : 'var(--text-muted)',
                    opacity: line.type === 'meta' ? 0.6 : 0.5,
                    fontStyle: line.type === 'header' ? 'italic' : 'normal',
                    fontSize: line.type === 'meta' && line.content.startsWith('@@') ? 11 : 12,
                    borderBottom: line.content.startsWith('@@') ? '1px solid var(--border-subtle)' : 'none',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}>
                    {line.content}
                  </td>
                </tr>
              );
            }

            const bgColor = line.type === 'add' ? 'var(--add-bg)' : line.type === 'del' ? 'var(--del-bg)' : 'transparent';
            const textColor = line.type === 'add' ? 'var(--add-color)' : line.type === 'del' ? 'var(--del-color)' : 'var(--text-secondary)';
            const prefix = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';

            return (
              <tr key={i} style={{ background: bgColor }}>
                {/* Line number */}
                <td style={{
                  width: 44,
                  textAlign: 'right',
                  padding: '0 8px 0 4px',
                  color: 'var(--text-muted)',
                  fontSize: 10,
                  userSelect: 'none',
                  opacity: 0.5,
                  borderRight: '1px solid var(--border-subtle)',
                  verticalAlign: 'top',
                  paddingTop: 1,
                }}>
                  {line.lineNum ?? ''}
                </td>
                {/* Prefix */}
                <td style={{
                  width: 16,
                  textAlign: 'center',
                  color: textColor,
                  fontSize: 11,
                  userSelect: 'none',
                  verticalAlign: 'top',
                  paddingTop: 1,
                }}>
                  {prefix}
                </td>
                {/* Content */}
                <td style={{
                  padding: '0 12px 0 2px',
                  color: textColor,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  verticalAlign: 'top',
                }}>
                  {line.content || ' '}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const emptyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--bg-base)',
  height: '100%',
};
