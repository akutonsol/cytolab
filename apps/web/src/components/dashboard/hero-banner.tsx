import Image from 'next/image';

export interface HeroChip {
  label: string;
  value: string | number;
  delta?: string;
}

export interface HeroFeatured {
  labNumber?: string | null;
  patient: string;
  status: string;
}

const glass: React.CSSProperties = {
  borderRadius: 24,
  border: '1px solid rgba(255,255,255,0.7)',
  background: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  boxShadow: '0 1px 2px rgba(16,24,40,0.06)',
  padding: 16,
};
const kicker: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#9ca3af',
};

/**
 * Dashboard hero. Nav lives in the app top bar, so this carries only the
 * greeting, the active-specimen widget and the KPI chips — all real lab data.
 */
export function HeroBanner({
  firstName,
  featured,
  chips,
  nav,
}: {
  firstName: string;
  featured: HeroFeatured | null;
  chips: HeroChip[];
  nav?: React.ReactNode;
}) {
  return (
    <section>
      {/* Row 1 — greeting (left) + nav pills (right) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 20, color: '#4b5563', fontWeight: 500, margin: '0 0 6px' }}>Hi, {firstName}!</p>
          <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a', lineHeight: 1.05, margin: 0 }}>
            Welcome Back
          </h1>
        </div>
        {nav}
      </div>

      {/* Row 2 — active specimen + KPI chips in one horizontal row */}
      <div style={{ display: 'flex', gap: 16, marginTop: 48, flexWrap: 'wrap' }}>
        <div style={{ ...glass, display: 'flex', gap: 12, alignItems: 'center', flex: '0 0 auto', minWidth: 250 }}>
          <Image src="/specimen-tube.png" alt="" width={48} height={96} style={{ objectFit: 'contain', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={kicker}>Active Specimen</div>
            {featured ? (
              <>
                <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 14, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>
                  {featured.labNumber ?? '—'}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{featured.patient}</div>
                <span style={{ display: 'inline-block', marginTop: 6, borderRadius: 999, background: 'rgba(99,102,241,0.1)', color: '#6366f1', fontSize: 11, fontWeight: 600, padding: '2px 8px' }}>
                  {featured.status}
                </span>
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>No open cases today</div>
            )}
          </div>
        </div>

        {chips.map((chip) => (
          <div key={chip.label} style={{ ...glass, flex: '1 1 0', minWidth: 150 }}>
            <div style={kicker}>{chip.label}</div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>{chip.value}</span>
              {chip.delta ? <span style={{ fontSize: 12, fontWeight: 600, color: '#6366f1' }}>{chip.delta}</span> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
