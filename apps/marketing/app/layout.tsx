import type { Metadata } from 'next'
import { DM_Serif_Display, Inter, Space_Mono } from 'next/font/google'
import LenisProvider from '@/components/LenisProvider'
import MotionLayer from '@/components/MotionLayer'
import './globals.css'

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
  title: 'CYTOLAB — AI-Powered Digital Pathology Operating System',
  description: 'The AI operating system built for modern cytology and pathology laboratories. CYTO AI screening, specimen management, EMR interoperability, and full lab operations in one platform.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSerif.variable} ${inter.variable} ${spaceMono.variable}`}>
      <body>
        <MotionLayer />
        <LenisProvider>{children}</LenisProvider>
      </body>
    </html>
  )
}
