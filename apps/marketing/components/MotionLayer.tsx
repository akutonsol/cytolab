'use client'
import { useEffect } from 'react'

/**
 * Global motion layer — additive only, touches no structure/color/layout.
 * - Cursor glow that trails the pointer (#cursor-glow, styled in globals.css)
 * - Magnetic pull on any `.mag-btn` within range
 *
 * Scroll-driven reveals (word-rise, underline-draw, num-slam, stagger) are
 * each owned by their own component so the per-section stagger timing is
 * preserved — MotionLayer deliberately does not observe them here.
 */
export default function MotionLayer() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // ── Cursor glow ──────────────────────────────
    let glow: HTMLDivElement | null = null
    let onMove: ((e: PointerEvent) => void) | null = null
    if (!reduce && window.matchMedia('(pointer: fine)').matches) {
      glow = document.createElement('div')
      glow.id = 'cursor-glow'
      glow.style.left = '-500px'
      glow.style.top = '-500px'
      document.body.appendChild(glow)

      const MAG_RADIUS = 90
      onMove = (e: PointerEvent) => {
        if (glow) {
          glow.style.left = `${e.clientX}px`
          glow.style.top = `${e.clientY}px`
        }
        // Magnetic buttons — pull toward cursor when close
        document.querySelectorAll<HTMLElement>('.mag-btn').forEach((btn) => {
          const r = btn.getBoundingClientRect()
          const cx = r.left + r.width / 2
          const cy = r.top + r.height / 2
          const dx = e.clientX - cx
          const dy = e.clientY - cy
          if (Math.hypot(dx, dy) < MAG_RADIUS + Math.max(r.width, r.height) / 2) {
            btn.style.transform = `translate(${dx * 0.28}px, ${dy * 0.4}px)`
          } else if (btn.style.transform) {
            btn.style.transform = 'translate(0, 0)'
          }
        })
      }
      window.addEventListener('pointermove', onMove, { passive: true })
    }

    return () => {
      if (onMove) window.removeEventListener('pointermove', onMove)
      if (glow) glow.remove()
    }
  }, [])

  return null
}
