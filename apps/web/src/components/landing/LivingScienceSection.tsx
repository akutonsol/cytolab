'use client'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'

const EASE = [0.22, 0.8, 0.2, 1] as const
// Reveal presets — framer whileInView is tied to React lifecycle, so it always
// settles to the target (never leaves an element stuck), which matters on this
// WebGL section. "rise" for the feature cards, "fade" for the floating UI cards.
const rise = (i: number) => ({
  initial: { opacity: 0, y: 34 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.7, ease: EASE, delay: i * 0.12 },
})
const fade = (i: number) => ({
  initial: { opacity: 0 },
  whileInView: { opacity: 1 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.7, ease: EASE, delay: i * 0.14 },
})

const LivingScienceScene = dynamic(
  () => import('./LivingScienceScene'),
  { ssr: false }
)

export default function LivingScienceSection() {
  return (
    <section style={{
      background: '#0d0508',
      position: 'relative',
      overflow: 'hidden',
      minHeight: '110vh',
      marginTop: 0,
      paddingTop: 0,
      display: 'flex',
      flexDirection: 'column',
    }}>

      {/* Warm radial ambience */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse 80% 70% at 55% 40%, rgba(80,20,10,0.5) 0%, rgba(40,5,20,0.3) 40%, transparent 70%)',
      }} />

      {/* Blended TOP edge — dissolves the light AI-Screening surface above into
          the dark scene instead of a hard cut. Sits above the ambience, below
          content, and clears the vertically-centered editorial copy. */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 190, zIndex: 1, pointerEvents: 'none',
        background: 'linear-gradient(180deg, #f8f7ff 0%, rgba(248,247,255,0.45) 26%, rgba(13,5,8,0) 100%)',
      }} />


      {/* ── TOP HERO AREA ── */}
      <div style={{
        position: 'relative',
        flex: 1,
        minHeight: '680px',
        display: 'grid',
        gridTemplateColumns: '42% 1fr',
      }}>

        {/* Left: Editorial content */}
        <div style={{
          padding: '80px 0 48px 72px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 2,
        }}>
          <h2 style={{
            fontSize: '62px',
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: '-0.025em',
            color: 'white',
            margin: '0 0 24px 0',
          }}>
            Explore hidden{' '}
            <em style={{
              fontStyle: 'italic',
              color: '#E63946',
              fontFamily: 'Georgia, serif',
            }}>
              patterns
            </em>{' '}
            inside<br />living systems
          </h2>

          <p style={{
            fontSize: '16px',
            color: 'rgba(255,255,255,0.6)',
            lineHeight: 1.65,
            maxWidth: '360px',
            marginBottom: '36px',
          }}>
            Visualize cellular structures, sample behavior,
            and molecular activity through a focused
            scientific workspace.
          </p>

          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <button style={{
              background: '#E63946',
              color: 'white',
              border: 'none',
              borderRadius: '50px',
              padding: '14px 28px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              Explore Samples →
            </button>
            <button style={{
              background: 'transparent',
              color: 'rgba(255,255,255,0.75)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '50px',
              padding: '14px 24px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              View Research Map ⊞
            </button>
          </div>

          {/* Live Cellular Overview card */}
          <div style={{
            marginTop: '48px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px',
            padding: '20px 24px',
            maxWidth: '520px',
            backdropFilter: 'blur(10px)',
          }}>
            <div style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.5)',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              Live Cellular Overview
              <span style={{
                background: 'rgba(230,57,70,0.2)',
                color: '#E63946',
                borderRadius: '20px',
                padding: '2px 8px',
                fontSize: '10px',
              }}>● Live</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '20px', alignItems: 'center' }}>
              {/* Donut */}
              <div style={{ position: 'relative', width: '64px', height: '64px' }}>
                <svg width="64" height="64" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="26" fill="none"
                    stroke="rgba(255,255,255,0.1)" strokeWidth="7"/>
                  <circle cx="32" cy="32" r="26" fill="none"
                    stroke="#E63946" strokeWidth="7"
                    strokeDasharray={`${2 * Math.PI * 26 * 0.68} ${2 * Math.PI * 26}`}
                    strokeLinecap="round"
                    transform="rotate(-90 32 32)"/>
                  <text x="32" y="36" textAnchor="middle"
                    fill="white" fontSize="11" fontWeight="700">68%</text>
                </svg>
                <div style={{
                  position: 'absolute', bottom: '-16px', left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: '9px', color: 'rgba(255,255,255,0.4)',
                  whiteSpace: 'nowrap',
                }}>active</div>
              </div>

              {/* Sparkline area */}
              <svg width="100%" height="48" viewBox="0 0 180 48" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E63946" stopOpacity="0.4"/>
                    <stop offset="100%" stopColor="#E63946" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <polygon
                  points="0,38 20,30 40,34 60,22 80,26 100,18 120,24 140,14 160,20 180,12 180,48 0,48"
                  fill="url(#waveGrad)"/>
                <polyline
                  points="0,38 20,30 40,34 60,22 80,26 100,18 120,24 140,14 160,20 180,12"
                  fill="none" stroke="#E63946" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>

              {/* Stats */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '120px' }}>
                {[
                  { dot: '#E63946', label: 'Structures', val: '12,540' },
                  { dot: '#8b5cf6', label: 'Interactions', val: '8,216' },
                  { dot: '#22c55e', label: 'Signals', val: '3,782' },
                ].map(item => (
                  <div key={item.label} style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', gap: '12px',
                  }}>
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)',
                                   display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ color: item.dot, fontSize: '7px' }}>●</span>
                      {item.label}
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'white' }}>
                      {item.val}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Center/Right: Three.js scene */}
        <div style={{
          position: 'absolute',
          top: 0, right: 0, bottom: 0,
          left: '30%',
          zIndex: 1,
        }}>
          <LivingScienceScene />
        </div>

        {/* Right: Floating KPI cards */}
        <div style={{
          position: 'absolute',
          right: '40px',
          top: '80px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          zIndex: 3,
          width: '240px',
        }}>

          {/* Card 1 — Molecular Density */}
          <motion.div {...fade(0)} style={{
            background: 'rgba(15,10,20,0.85)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '16px',
            padding: '16px 20px',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: 'rgba(139,92,246,0.15)',
              border: '1px solid rgba(139,92,246,0.3)',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3" fill="#8b5cf6"/>
                <circle cx="12" cy="12" r="6" fill="none" stroke="#8b5cf6" strokeWidth="1.5" strokeDasharray="2 2"/>
                <circle cx="12" cy="12" r="9" fill="none" stroke="#8b5cf6" strokeWidth="1" strokeDasharray="1 3" strokeOpacity="0.5"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginBottom: '2px' }}>
                Molecular Density
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: 'white', lineHeight: 1 }}>
                18.6k
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>
                particles
              </div>
            </div>
            <svg width="50" height="28" viewBox="0 0 50 28">
              <polyline points="0,22 10,18 20,14 30,16 40,8 50,4"
                fill="none" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </motion.div>

          {/* Card 2 — Research Scan */}
          <motion.div {...fade(1)} style={{
            background: 'rgba(15,10,20,0.85)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '16px',
            padding: '16px 20px',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '50%',
              position: 'relative', flexShrink: 0,
            }}>
              <svg width="44" height="44" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="18" fill="none"
                  stroke="rgba(139,92,246,0.2)" strokeWidth="5"/>
                <circle cx="22" cy="22" r="18" fill="none"
                  stroke="url(#scanGrad)" strokeWidth="5"
                  strokeDasharray={`${2*Math.PI*18*0.72} ${2*Math.PI*18}`}
                  strokeLinecap="round"
                  transform="rotate(-90 22 22)"/>
                <defs>
                  <linearGradient id="scanGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#8b5cf6"/>
                    <stop offset="100%" stopColor="#E63946"/>
                  </linearGradient>
                </defs>
                <circle cx="22" cy="22" r="4" fill="#8b5cf6" opacity="0.8"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginBottom: '2px' }}>
                Research Scan
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'white' }}>
                Sample C-214
              </div>
              <div style={{ fontSize: '11px', color: '#E63946', marginTop: '2px',
                            display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '7px' }}>●</span> Analyzing
              </div>
            </div>
          </motion.div>

          {/* Card 3 — Lab Insight */}
          <motion.div {...fade(2)} style={{
            background: 'rgba(15,10,20,0.85)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '16px',
            padding: '16px 20px',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: 'rgba(34,197,94,0.15)',
              border: '1px solid rgba(34,197,94,0.3)',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexShrink: 0,
              overflow: 'hidden',
            }}>
              {/* Tiny cell cluster visual */}
              <svg width="28" height="28" viewBox="0 0 28 28">
                <circle cx="14" cy="14" r="7" fill="rgba(34,197,94,0.4)"/>
                <circle cx="14" cy="14" r="3" fill="#22c55e"/>
                <circle cx="7"  cy="9"  r="4" fill="rgba(34,197,94,0.3)"/>
                <circle cx="21" cy="9"  r="3" fill="rgba(34,197,94,0.25)"/>
                <circle cx="8"  cy="20" r="3" fill="rgba(34,197,94,0.28)"/>
                <circle cx="20" cy="20" r="4" fill="rgba(34,197,94,0.32)"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginBottom: '2px' }}>
                Lab Insight
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'white', lineHeight: 1.2 }}>
                Growth phase<br/>detected
              </div>
            </div>
          </motion.div>

        </div>
      </div>

      {/* ── BOTTOM FEATURE CARDS ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '0',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        {[
          {
            title: 'Live Sample Mapping',
            desc: 'Track cellular interactions and sample dynamics in real time with advanced imaging.',
            bg: 'radial-gradient(circle at 20% 60%, rgba(180,40,80,0.45) 0%, transparent 55%)',
            cellColors: ['#8B2252','#C1121F','#6B1A6B'],
          },
          {
            title: 'Pattern Analysis',
            desc: 'Detect structural patterns, anomalies, and behavioral trends with precision.',
            bg: 'radial-gradient(circle at 50% 60%, rgba(160,60,20,0.40) 0%, transparent 55%)',
            cellColors: ['#6B1A6B','#8b5cf6','#5B1A5B'],
          },
          {
            title: 'Microstructure Library',
            desc: 'Access a curated library of cellular structures and molecular formations.',
            bg: 'radial-gradient(circle at 80% 60%, rgba(20,120,60,0.40) 0%, transparent 55%)',
            cellColors: ['#1A6B3B','#22c55e','#2A8B4B'],
          },
        ].map((card, i) => (
          <motion.div key={card.title} {...rise(i)} style={{
            position: 'relative',
            padding: '36px 40px',
            background: 'rgba(255,255,255,0.02)',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            borderRight: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '24px',
            overflow: 'hidden',
          }}>
            {/* Background glow */}
            <div style={{
              position: 'absolute', inset: 0,
              background: card.bg,
              pointerEvents: 'none',
            }}/>

            {/* Cell cluster icon */}
            <div style={{
              width: '80px', height: '80px',
              borderRadius: '50%',
              flexShrink: 0,
              position: 'relative',
              zIndex: 1,
            }}>
              <svg width="80" height="80" viewBox="0 0 80 80">
                {/* Main cell */}
                <circle cx="40" cy="40" r="22"
                  fill={card.cellColors[0] + '66'}
                  stroke={card.cellColors[0]} strokeWidth="1"/>
                <circle cx="40" cy="40" r="10"
                  fill={card.cellColors[1] + 'AA'}/>
                <circle cx="40" cy="40" r="5"
                  fill={card.cellColors[1]}/>
                {/* Satellites */}
                <circle cx="18" cy="25" r="10"
                  fill={card.cellColors[2] + '55'}
                  stroke={card.cellColors[2]} strokeWidth="0.8"/>
                <circle cx="62" cy="22" r="8"
                  fill={card.cellColors[0] + '44'}
                  stroke={card.cellColors[0]} strokeWidth="0.8"/>
                <circle cx="20" cy="58" r="9"
                  fill={card.cellColors[2] + '44'}
                  stroke={card.cellColors[2]} strokeWidth="0.8"/>
                <circle cx="60" cy="60" r="11"
                  fill={card.cellColors[1] + '44'}
                  stroke={card.cellColors[1]} strokeWidth="0.8"/>
                {/* Tendrils */}
                <line x1="40" y1="40" x2="18" y2="25"
                  stroke={card.cellColors[0]} strokeWidth="0.5" opacity="0.3"/>
                <line x1="40" y1="40" x2="62" y2="22"
                  stroke={card.cellColors[0]} strokeWidth="0.5" opacity="0.3"/>
                <line x1="40" y1="40" x2="20" y2="58"
                  stroke={card.cellColors[0]} strokeWidth="0.5" opacity="0.3"/>
                <line x1="40" y1="40" x2="60" y2="60"
                  stroke={card.cellColors[0]} strokeWidth="0.5" opacity="0.3"/>
              </svg>
            </div>

            {/* Text */}
            <div style={{ flex: 1, position: 'relative', zIndex: 1 }}>
              <div style={{
                fontSize: '18px', fontWeight: 700,
                color: 'white', marginBottom: '10px',
              }}>
                {card.title}
              </div>
              <div style={{
                fontSize: '14px',
                color: 'rgba(255,255,255,0.5)',
                lineHeight: 1.6,
                marginBottom: '20px',
              }}>
                {card.desc}
              </div>
              <button style={{
                width: '36px', height: '36px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: 'white', fontSize: '16px',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer',
              }}>
                →
              </button>
            </div>
          </motion.div>
        ))}
      </div>

    </section>
  )
}
