'use client'
import { useEffect } from 'react'
import { initLenis } from '@/lib/animations'

export default function LenisProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initLenis()
  }, [])
  return <>{children}</>
}
