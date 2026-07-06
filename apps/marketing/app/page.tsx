// Placeholder home page — establishes the design tokens/fonts so the scaffold
// renders. Real sections (Step 8 components) drop in here once provided.
export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 6vw',
      }}
    >
      <span
        className="font-mono"
        style={{ fontSize: 12, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--blue)' }}
      >
        CYTOLAB
      </span>
      <h1
        className="font-serif"
        style={{ fontSize: 'clamp(48px, 9vw, 140px)', lineHeight: 0.95, marginTop: 24, maxWidth: '15ch' }}
      >
        The AI operating system for the modern lab.
      </h1>
      <p
        className="font-sans"
        style={{ fontSize: 20, maxWidth: '54ch', marginTop: 28, color: 'rgba(9,9,14,0.7)' }}
      >
        CYTO AI screening, specimen management, EMR interoperability, and full lab
        operations — in one platform.
      </p>
      <div style={{ marginTop: 40 }}>
        <a
          href="#"
          style={{
            display: 'inline-block',
            background: 'var(--ink)',
            color: 'var(--bg)',
            padding: '16px 28px',
            borderRadius: 999,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Request a demo
        </a>
      </div>
    </main>
  )
}
