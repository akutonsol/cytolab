'use client'

import { useState } from 'react'
import SectionReveal from './SectionReveal'

export default function CTA() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  return (
    <section id="cta" className="px-[6vw] py-[120px] lg:px-8">
      <div className="mx-auto max-w-[1240px]">
        <div className="overflow-hidden rounded-[28px] px-8 py-20 text-center md:px-16" style={{ background: 'var(--ink)' }}>
          <SectionReveal>
            <span className="font-mono text-[12px] uppercase tracking-[0.24em]" style={{ color: 'var(--blue2)' }}>Get started</span>
          </SectionReveal>
          <SectionReveal delay={0.05}>
            <h2 className="mx-auto mt-5 max-w-[20ch] font-serif text-[clamp(34px,5.5vw,68px)] leading-[1.03] text-bg">
              See CYTOLAB run your lab.
            </h2>
          </SectionReveal>
          <SectionReveal delay={0.1}>
            <p className="mx-auto mt-6 max-w-[46ch] font-sans text-[17px] leading-relaxed text-bg/60">
              Book a walkthrough with our team. We&apos;ll map CYTOLAB to your workflow and show the platform on your specimens.
            </p>
          </SectionReveal>
          <SectionReveal delay={0.15}>
            {sent ? (
              <p className="mx-auto mt-10 font-sans text-[16px] text-bg">Thanks — we&apos;ll be in touch at {email}.</p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (email.trim()) setSent(true)
                }}
                className="mx-auto mt-10 flex max-w-[480px] flex-col gap-3 sm:flex-row"
              >
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Work email"
                  className="flex-1 rounded-full px-6 py-4 font-sans text-[15px] text-ink outline-none"
                  style={{ background: 'var(--bg)' }}
                />
                <button
                  type="submit"
                  className="rounded-full px-7 py-4 font-sans text-[15px] font-semibold text-bg transition-opacity hover:opacity-90"
                  style={{ background: 'var(--blue)' }}
                >
                  Request a demo
                </button>
              </form>
            )}
          </SectionReveal>
        </div>
      </div>
    </section>
  )
}
