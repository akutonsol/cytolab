import Nav from '@/components/Nav'
import Hero from '@/components/Hero'
import Marquee from '@/components/Marquee'
import ProblemSection from '@/components/ProblemSection'
import Outcomes from '@/components/Outcomes'
import Dashboard from '@/components/Dashboard'
import AISection from '@/components/AISection'
import Modules from '@/components/Modules'
import Security from '@/components/Security'
import Pricing from '@/components/Pricing'
import CTA from '@/components/CTA'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <ProblemSection />
        <Outcomes />
        <Dashboard />
        <AISection />
        <Modules />
        <Security />
        <Pricing />
        <CTA />
      </main>
      <Footer />
    </>
  )
}
