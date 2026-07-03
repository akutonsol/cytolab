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

/**
 * Dashboard hero. Nav lives in the app top bar, so this carries only the
 * greeting and the nav pills.
 */
export function HeroBanner({
  firstName,
  nav,
}: {
  firstName: string;
  featured?: HeroFeatured | null;
  chips?: HeroChip[];
  nav?: React.ReactNode;
}) {
  return (
    <section>
      {/* Greeting (left) + nav pills (right) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 20, color: '#4b5563', fontWeight: 500, margin: '0 0 6px' }}>Hi, {firstName}!</p>
          <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a', lineHeight: 1.05, margin: 0 }}>
            Welcome Back
          </h1>
        </div>
        {nav}
      </div>
    </section>
  );
}
