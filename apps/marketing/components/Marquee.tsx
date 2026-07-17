const items = ['HIPAA', 'Role-Based Access', 'FHIR R4', 'HL7 v2.5', 'SOC 2 Type II', 'Audit Trails', 'Epic Integration', 'Google Cloud', 'Argon2id', 'Multi-Lab Tenancy']

export default function Marquee() {
  return (
    <div style={{
      overflow: 'hidden', borderBottom: '1px solid rgba(9,9,14,0.07)',
      padding: 'var(--space-8) 0', background: '#E8E7E1', position: 'relative',
    }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 80,
        background: 'linear-gradient(to right, #E8E7E1, transparent)', zIndex: 2, pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 80,
        background: 'linear-gradient(to left, #E8E7E1, transparent)', zIndex: 2, pointerEvents: 'none',
      }} />
      <div style={{ display: 'flex', animation: 'marquee 26s linear infinite', whiteSpace: 'nowrap' }}>
        {[...items, ...items].map((item, i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 'var(--space-8)', padding: '0 var(--space-32)',
            fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(9,9,14,0.25)',
          }}>
            <span style={{ width: 3, height: 3, background: '#4F46E5', borderRadius: '50%', flexShrink: 0 }} />
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}
