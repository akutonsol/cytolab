import { EditorialHero } from '@/components/marketing/EditorialHero';
import { EnterpriseCTA } from '@/components/marketing/EnterpriseCTA';

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

      {/* Final closing scene — full-bleed living biological environment. */}
      <EnterpriseCTA />

      {/* Clean, minimal footer the red environment fades into. */}
      <footer style={{ background: '#ffffff', color: '#111111' }}>
        <div
          style={{
            maxWidth: 1680,
            margin: '0 auto',
            padding: '56px 72px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 24,
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em', color: '#111827' }}>CYTOLAB</span>
          <span style={{ fontSize: 13, color: '#9AA1AC' }}>© 2026 Cytolabs Associates Ltd. — Enterprise pathology, unified.</span>
        </div>
      </footer>
    </main>
  );
}
