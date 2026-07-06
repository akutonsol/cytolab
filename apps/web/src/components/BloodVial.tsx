// Realistic blood-collection vial, drawn as SVG so it needs no binary asset and
// stays crisp while the login page spins it on its Y axis. Red screw cap, glass
// tube with a dark-red blood fill, and a patient label with a barcode.
export function BloodVial({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 360" className={className} role="img" aria-label="Blood specimen vial">
      <defs>
        <linearGradient id="vial-cap" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#B91C1C" />
          <stop offset="45%" stopColor="#EF4444" />
          <stop offset="100%" stopColor="#991B1B" />
        </linearGradient>
        <linearGradient id="vial-blood" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7F1D1D" />
          <stop offset="50%" stopColor="#B91C1C" />
          <stop offset="100%" stopColor="#6B1414" />
        </linearGradient>
        <linearGradient id="vial-glass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="35%" stopColor="#ffffff" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#0F172A" stopOpacity="0.08" />
        </linearGradient>
        <clipPath id="vial-label-clip"><rect x="41.5" y="185" width="37" height="86" rx="2" /></clipPath>
      </defs>

      {/* Glass tube (rounded bottom) */}
      <path d="M42 60 H78 V330 a18 18 0 0 1 -18 18 h0 a18 18 0 0 1 -18 -18 Z"
        fill="url(#vial-glass)" stroke="#E5E7EB" strokeOpacity="0.5" strokeWidth="1.5" />

      {/* Blood fill (sits inside the tube, rounded bottom) */}
      <path d="M45 150 H75 V330 a15 15 0 0 1 -15 15 h0 a15 15 0 0 1 -15 -15 Z" fill="url(#vial-blood)" />
      {/* Meniscus + surface sheen */}
      <ellipse cx="60" cy="150" rx="15" ry="3.5" fill="#DC2626" />
      <rect x="47" y="200" width="4" height="120" rx="2" fill="#ffffff" opacity="0.14" />

      {/* Patient label (contents clipped to the label so text never spills onto glass) */}
      <rect x="41.5" y="185" width="37" height="86" rx="2" fill="#FBFBFB" />
      <g clipPath="url(#vial-label-clip)" fontFamily="sans-serif">
        {/* Barcode */}
        <g fill="#111827">
          {[0, 3, 5, 9, 11, 12, 16, 19, 21, 25, 28, 30].map((x, i) => (
            <rect key={i} x={45 + x} width={i % 3 === 0 ? 1.6 : 1} height="14" y="192" />
          ))}
        </g>
        <text x="45" y="216" fill="#374151" fontSize="4" fontFamily="monospace">ID: AB4578726</text>
        <line x1="44" y1="221" x2="76" y2="221" stroke="#E5E7EB" strokeWidth="0.6" />
        <text x="45" y="233" fill="#111827" fontSize="4.6" fontWeight="700">NAME: JOHN DOE</text>
        <text x="45" y="245" fill="#374151" fontSize="4.2">D.O.B: 12/05/1930</text>
        <line x1="44" y1="250" x2="76" y2="250" stroke="#E5E7EB" strokeWidth="0.6" />
        <text x="45" y="262" fill="#6B7280" fontSize="3.6">CYTOLAB DIAGNOSTICS</text>
      </g>

      {/* Red screw cap */}
      <rect x="37" y="14" width="46" height="50" rx="5" fill="url(#vial-cap)" />
      <rect x="33" y="10" width="54" height="14" rx="6" fill="url(#vial-cap)" />
      {/* Cap ridges */}
      <g stroke="#7F1212" strokeOpacity="0.5" strokeWidth="1">
        {[43, 50, 57, 64, 71, 78].map((x) => <line key={x} x1={x} y1="26" x2={x} y2="60" />)}
      </g>
      {/* Tube opening under the cap */}
      <ellipse cx="60" cy="62" rx="18" ry="4" fill="#0F172A" opacity="0.25" />
      {/* Cap top highlight */}
      <rect x="38" y="12" width="16" height="8" rx="4" fill="#ffffff" opacity="0.22" />
    </svg>
  );
}
