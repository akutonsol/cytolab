import Image from 'next/image';

export interface HeroChip {
  label: string;
  value: string | number;
  delta?: string;
}

export interface HeroFeatured {
  labNumber?: string | null;
  patient: string;
  status: string;
}

/**
 * Dashboard hero (ported + adapted from the v0 template). The persistent nav /
 * top bar lives in the app layout, so this hero carries only the greeting, the
 * active-specimen widget and the KPI chips — all bound to real lab data.
 */
export function HeroBanner({
  firstName,
  featured,
  chips,
}: {
  firstName: string;
  featured: HeroFeatured | null;
  chips: HeroChip[];
}) {
  return (
    <section className="relative flex flex-col gap-8">
      <div className="shrink-0 space-y-1">
        <p className="text-lg font-medium text-[var(--muted-foreground)]">Hi, {firstName}!</p>
        <p className="text-4xl font-bold tracking-tight text-[var(--foreground)] lg:text-5xl">Welcome Back</p>
      </div>

      <div className="grid gap-4 pt-1 lg:grid-cols-[auto_1fr] lg:items-stretch">
        {/* Active specimen */}
        <div className="flex items-center gap-4 rounded-3xl border border-white/70 bg-white/85 p-4 shadow-[0_12px_40px_-12px_rgba(80,70,160,0.25)] backdrop-blur-md">
          <div className="relative h-24 w-14 shrink-0">
            <Image src="/specimen-tube.png" alt="Specimen tube" fill className="object-contain" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">Active Specimen</p>
            {featured ? (
              <>
                <p className="font-mono text-sm font-semibold text-[var(--foreground)]">{featured.labNumber ?? '—'}</p>
                <p className="truncate text-xs text-[var(--muted-foreground)]">{featured.patient}</p>
                <span className="mt-1 inline-flex items-center rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--primary)]">
                  {featured.status}
                </span>
              </>
            ) : (
              <p className="text-xs text-[var(--muted-foreground)]">No open cases today</p>
            )}
          </div>
        </div>

        {/* KPI chips */}
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {chips.map((chip) => (
            <div
              key={chip.label}
              className="rounded-3xl border border-white/70 bg-white/85 p-4 shadow-[0_12px_40px_-12px_rgba(80,70,160,0.25)] backdrop-blur-md"
            >
              <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{chip.label}</dt>
              <dd className="mt-1.5 flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-[var(--foreground)]">{chip.value}</span>
                {chip.delta ? <span className="text-xs font-semibold text-[var(--primary)]">{chip.delta}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
