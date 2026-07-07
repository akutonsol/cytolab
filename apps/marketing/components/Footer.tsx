const COLS: [string, string[]][] = [
  ['Product', ['Platform', 'CYTO AI', 'Modules', 'Security', 'Pricing']],
  ['Resources', ['Documentation', 'API reference', 'Integrations', 'Status']],
  ['Company', ['About', 'Contact', 'Privacy', 'Terms']],
]

export default function Footer() {
  return (
    <footer style={{ background: '#09090E', color: '#F0EFE9', padding: '4.5rem 2.5rem 3rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr', gap: '3rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px',
            fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.85rem',
            letterSpacing: '0.08em', color: '#F0EFE9', marginBottom: '1.25rem' }}>
            <span style={{ width: 20, height: 20, background: '#4F46E5', borderRadius: '2px',
              display: 'grid', placeItems: 'center', fontSize: '8px', fontWeight: 900, color: '#fff' }}>C</span>
            CYTOLAB
          </div>
          <p style={{ fontSize: '0.85rem', lineHeight: 1.7, color: 'rgba(240,239,233,0.4)',
            maxWidth: '280px', fontWeight: 300 }}>
            The AI-powered digital pathology operating system. Specimen tracking, CYTO AI
            screening, and full EMR interoperability for the modern laboratory.
          </p>
        </div>
        {COLS.map(([title, links]) => (
          <div key={title}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 700,
              letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(240,239,233,0.3)',
              marginBottom: '1.25rem' }}>{title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
              {links.map((l) => (
                <a key={l} href="#" style={{ fontSize: '0.85rem', color: 'rgba(240,239,233,0.6)',
                  textDecoration: 'none' }}>{l}</a>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '3.5rem', paddingTop: '1.75rem',
        borderTop: '1px solid rgba(240,239,233,0.08)', display: 'flex', flexWrap: 'wrap',
        justifyContent: 'space-between', gap: '1rem' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
          color: 'rgba(240,239,233,0.3)' }}>© 2026 CYTOLAB · All rights reserved.</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
          letterSpacing: '0.06em', color: 'rgba(240,239,233,0.3)' }}>HIPAA · SOC 2 · CAP · HL7/FHIR</span>
      </div>
    </footer>
  )
}
