'use client'

const cols = [
  { title: 'Product', links: ['Platform', 'CYTO AI', 'Integrations', 'Security'] },
  { title: 'Resources', links: ['Documentation', 'API', 'Status', 'Changelog'] },
  { title: 'Company', links: ['About', 'Support', 'Privacy', 'Terms'] },
]

export default function Footer() {
  return (
    <footer style={{ background: '#09090E', padding: '4rem 2.5rem 2.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr 1fr 1fr', gap: '3rem', paddingBottom: '3rem', borderBottom: '1px solid rgba(240,239,233,0.04)', marginBottom: '2rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.08em', color: '#fff' }}>
            <div style={{ width: 20, height: 20, background: '#4F46E5', borderRadius: '2px', display: 'grid', placeItems: 'center', fontSize: '8px', fontWeight: 900, color: '#fff' }}>C</div>
            CYTOLAB
          </div>
          <p className="body-sm" style={{ color: 'rgba(240,239,233,0.18)', marginTop: '0.75rem', maxWidth: '260px' }}>
            The AI-powered laboratory operating system for modern cytology and pathology labs. Built by Akuton Solutions, Jamaica.
          </p>
        </div>
        {cols.map(({ title, links }) => (
          <div key={title}>
            <h5 className="label" style={{ color: 'rgba(240,239,233,0.15)', marginBottom: '1rem' }}>{title}</h5>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {links.map(link => (
                <li key={link}>
                  <a href="#" style={{ color: 'rgba(240,239,233,0.28)', textDecoration: 'none', fontSize: '0.72rem', transition: 'color 0.2s' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'rgba(240,239,233,0.7)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,239,233,0.28)')}
                  >{link}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'rgba(240,239,233,0.15)', letterSpacing: '0.07em' }}>
        <span>&copy; 2026 CYTOLAB BY AKUTON SOLUTIONS</span>
        <span>HIPAA &middot; SOC 2 &middot; BUILT IN JAMAICA</span>
      </div>
    </footer>
  )
}
