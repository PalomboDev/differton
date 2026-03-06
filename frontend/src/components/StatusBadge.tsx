interface Props {
  status: string;
  size?: 'sm' | 'md';
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  M: { label: 'M', color: '#e8a838', bg: 'rgba(232,168,56,0.12)' },
  A: { label: 'A', color: '#3dcc6a', bg: 'rgba(61,204,106,0.12)' },
  D: { label: 'D', color: '#e05a5a', bg: 'rgba(224,90,90,0.12)' },
  R: { label: 'R', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  '?': { label: 'A', color: '#3dcc6a', bg: 'rgba(61,204,106,0.12)' },
  C: { label: 'C', color: '#3dcc6a', bg: 'rgba(61,204,106,0.12)' },
};

export default function StatusBadge({ status, size = 'sm' }: Props) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG['?'];
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: size === 'md' ? 18 : 15,
      height: size === 'md' ? 18 : 15,
      borderRadius: 3,
      background: config.bg,
      color: config.color,
      fontSize: size === 'md' ? 11 : 9,
      fontWeight: 700,
      fontFamily: 'var(--font-mono)',
      letterSpacing: '0.02em',
      flexShrink: 0,
    }}>
      {config.label}
    </span>
  );
}
