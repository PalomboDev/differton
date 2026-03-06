export default function WelcomeView() {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      gap: 16,
    }}>
      {/* Logo mark */}
      <div style={{
        width: 56,
        height: 56,
        borderRadius: 14,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle cx="7" cy="7" r="4" stroke="var(--accent)" strokeWidth="1.8"/>
          <circle cx="21" cy="21" r="4" stroke="var(--accent)" strokeWidth="1.8"/>
          <path d="M7 11v5a7 7 0 0 0 7 7h3" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </div>

      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <div style={{
          fontSize: 20,
          fontWeight: 300,
          fontFamily: 'var(--font-sans)',
          color: 'var(--text-primary)',
          letterSpacing: '-0.01em',
          marginBottom: 8,
        }}>
          Welcome to Differton
        </div>
        <div style={{
          fontSize: 13,
          color: 'var(--text-muted)',
          lineHeight: 1.6,
        }}>
          Add a repository from the sidebar to get started.
        </div>
      </div>
    </div>
  );
}
