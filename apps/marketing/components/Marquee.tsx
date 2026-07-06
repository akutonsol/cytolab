const ITEMS = [
  'CYTO AI Screening', 'Specimen Management', 'Bethesda 2014', 'EMR Interoperability',
  'Turnaround Analytics', 'Digital Slides', 'Quality Control', 'HL7 / FHIR',
  'Result Authorization', 'Client Portal',
]

export default function Marquee() {
  const row = [...ITEMS, ...ITEMS]
  return (
    <div className="marquee overflow-hidden border-y py-5" style={{ borderColor: 'rgba(9,9,14,0.07)', background: 'var(--bg2)' }}>
      <div className="marquee-track">
        {row.map((t, i) => (
          <span key={i} className="mx-6 inline-flex items-center gap-6 font-mono text-[13px] uppercase tracking-[0.14em] text-ink/60">
            {t}
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--blue)' }} />
          </span>
        ))}
      </div>
    </div>
  )
}
