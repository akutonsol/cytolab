import type { Metadata } from 'next'
import { DM_Serif_Display, Inter, Newsreader, Space_Mono } from 'next/font/google'
import LenisProvider from '@/components/LenisProvider'
import MotionLayer from '@/components/MotionLayer'
import './globals.css'

// ── Osieri marketing typography fonts (loaded once, at the app root) ──────────
// --font-display : editorial serif for hero + major section headlines
//                  (Newsreader — premium, clinical, Linear/Stripe-editorial feel).
// --font-sans    : Inter — SaaS body, headings, labels, metrics, UI text.
// --font-mono    : Space Mono — technical / eyebrow / KPI-label accents.
// --font-serif   : DM Serif Display — LEGACY display serif still used by not-yet-
//                  migrated sections; being phased out for --font-display.
// See DESIGN_SYSTEM.md § "Marketing typography system" for when to use each class.
const newsreader = Newsreader({
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const dmSerif = DM_Serif_Display({
  weight: ['400'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-serif',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
})

const spaceMono = Space_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'CYTOLAB — Digital Pathology Operating System',
  description: 'The operating system for modern cytology and pathology laboratories: specimen and case management, quality and turnaround operations, structured reporting with human-reviewed AI drafting assistance, and EMR interoperability — in one platform.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${dmSerif.variable} ${inter.variable} ${spaceMono.variable}`}>
      <body>
        <MotionLayer />
        <LenisProvider>{children}</LenisProvider>
      </body>
    </html>
  )
}
