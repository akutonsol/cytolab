import { EditorialHero } from '@/components/marketing/EditorialHero';

export const metadata = {
  title: 'CYTOLAB — The operating system for pathology laboratories',
};

export default function PlatformPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        // Soft, cool editorial backdrop (subtle depth vs. flat white).
        background: 'linear-gradient(160deg, #FCFBFE 0%, #F1F1F6 55%, #ECECF2 100%)',
        color: '#111111',
        overflowX: 'hidden',
      }}
    >
      <EditorialHero />

      {/* Scroll room so the layered parallax reads. Quiet, editorial. */}
      <section
        style={{
          maxWidth: 1680,
          margin: '0 auto',
          padding: '64px 72px 160px',
          borderTop: '1px solid rgba(17,17,17,.06)',
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: '.25em', fontWeight: 700, textTransform: 'uppercase', color: '#9AA1AC' }}>
          Trusted across modern pathology
        </div>
        <div style={{ marginTop: 24, display: 'flex', flexWrap: 'wrap', gap: 48, opacity: 0.5 }}>
          {['Kingston Medical', 'Spanish Town Clinic', 'Montego Diagnostics', 'Cytolabs Associates'].map((n) => (
            <span key={n} style={{ fontSize: 20, fontWeight: 600, color: '#6A7280', letterSpacing: '-.01em' }}>
              {n}
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}
