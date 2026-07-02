import type { CSSProperties, ReactNode } from 'react';

/**
 * Dashboard card — white surface, centred title, soft indigo drop shadow
 * (matches the reference dashboard). Optional right-aligned action.
 */
export function GlassCard({
  title,
  subtitle,
  action,
  style,
  children,
}: {
  title: ReactNode;
  subtitle?: string;
  action?: ReactNode;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(255,255,255,0.58)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderRadius: 24,
        border: '1px solid rgba(255,255,255,0.85)',
        boxShadow: '0 12px 40px -12px rgba(80,70,160,0.2)',
        padding: 24,
        ...style,
      }}
    >
      <div style={{ position: 'relative', textAlign: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#374151', margin: 0 }}>{title}</h2>
        {subtitle ? <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>{subtitle}</p> : null}
        {action ? <div style={{ position: 'absolute', right: 0, top: 0 }}>{action}</div> : null}
      </div>
      <div style={{ flex: 1 }}>{children}</div>
    </section>
  );
}
