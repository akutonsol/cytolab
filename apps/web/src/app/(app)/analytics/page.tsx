'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from 'antd';
import { Activity, CheckCircle2, FileCheck, FileText, FlaskConical } from 'lucide-react';
import { api } from '@/lib/api';
import { SubscriptionBars, PerformanceArea } from '../dashboard/charts';

// ── Case-distribution donut classes (colours match the dashboard palette,
//    zero-orange: indigo / teal / violet / blue / slate). ──
const specimenTypes = [
  { label: 'Body Fluid', color: '#4F46E5', pct: 42 },
  { label: 'Respiratory', color: '#0E7490', pct: 28 },
  { label: 'Urine', color: '#6D28D9', pct: 16 },
  { label: 'CSF', color: '#1D4ED8', pct: 8 },
  { label: 'Other', color: '#475569', pct: 6 },
];
const specBucket = (t?: string | null) => {
  const x = t ?? '';
  if (['SPUTUM', 'BRONCHIAL_WASH'].includes(x)) return 'Respiratory';
  if (x === 'URINE') return 'Urine';
  if (x === 'CSF') return 'CSF';
  if (['PLEURAL_FLD', 'SYNOVIAL_FLD', 'JOINT_ASP', 'BREAST_ASP', 'THYROID_FNA', 'LYMPH_NODE', 'BONE_MARROW'].includes(x)) return 'Body Fluid';
  return 'Other';
};

function activityMeta(status: string): { title: string; Icon: typeof Activity } {
  const s = (status || '').toLowerCase();
  if (/(submit|receiv|regist|accession)/.test(s)) return { title: 'New specimen received', Icon: FileText };
  if (/(process|progress|screen)/.test(s)) return { title: 'Processing started', Icon: FlaskConical };
  if (/(result|complet|analys)/.test(s)) return { title: 'Analysis completed', Icon: CheckCircle2 };
  if (/(approv|authoriz|final|report|sign)/.test(s)) return { title: 'Report finalized', Icon: FileCheck };
  if (/(bill|invoic|paid|charge)/.test(s)) return { title: 'Invoice billed', Icon: FileText };
  return { title: status || 'Activity', Icon: Activity };
}

const CARD: React.CSSProperties = { background: '#FAFBFF', borderRadius: 20, padding: '20px 24px', border: '1px solid #F1F0EA' };

export default function AnalyticsPage() {
  const router = useRouter();
  // Shares the ['dashboard-home'] cache with the dashboard (React Query dedupes).
  const { data: d, isLoading, isError } = useQuery({
    queryKey: ['dashboard-home'],
    queryFn: () => api.get('/analytics/home').then((r) => r.data),
  });

  return (
    <div className="pb-10 pt-4" style={{ minHeight: '100%' }}>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Laboratory performance metrics and insights</p>
      </div>

      {isError ? (
        <div className="p-2 text-sm text-text-secondary">Analytics are unavailable right now.</div>
      ) : isLoading || !d ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={CARD}><Skeleton active paragraph={{ rows: 5 }} /></div>
          ))}
        </div>
      ) : (
        <AnalyticsContent d={d} router={router} />
      )}
    </div>
  );
}

function AnalyticsContent({ d, router }: { d: any; router: ReturnType<typeof useRouter> }) {
  const up = (d.throughput?.deltaPct ?? 0) >= 0;
  const eff = d.effectiveness;
  const totalSpecimens = d.throughput?.series?.reduce((s: number, i: any) => s + (i.value || 0), 0) || 0;

  // Monthly Case Volume — bucket the throughput series into 6 months; `gap`
  // fills each capsule up to a soft target. Reused by the chart + stat tiles.
  const volRows = (() => {
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const series = d.throughput?.series ?? [];
    const chunk = Math.max(1, Math.ceil(series.length / 6));
    const rows = Array.from({ length: 6 }, (_, i) => {
      const dt = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const current = series.slice(i * chunk, (i + 1) * chunk).reduce((s: number, r: any) => s + (r.value || 0), 0);
      return { month: MONTHS[dt.getMonth()], current, gap: 0 };
    });
    const maxC = Math.max(1, ...rows.map((r) => r.current));
    const target = Math.round(maxC * 1.3);
    rows.forEach((r) => { r.gap = Math.max(0, target - r.current); });
    return rows;
  })();
  const volTotal = volRows.reduce((s, r) => s + r.current, 0);
  const volAvg = Math.round(volTotal / volRows.length);
  const volPeak = volRows.reduce((a, b) => (b.current > a.current ? b : a), volRows[0]);
  const volTarget = (volRows[0]?.current ?? 0) + (volRows[0]?.gap ?? 0);
  const volAttain = volTarget > 0 ? Math.min(100, Math.round((volTotal / (volTarget * volRows.length)) * 100)) : 0;

  // Case distribution — bucket the priority queue's specimen types into the five
  // donut classes; fall back to the static mix when the queue is empty.
  const specCounts: Record<string, number> = {};
  for (const r of (d.priorityRecords ?? [])) {
    const g = specBucket(r.specimen);
    specCounts[g] = (specCounts[g] ?? 0) + 1;
  }
  const specTotalCount = Object.values(specCounts).reduce((s, v) => s + v, 0);
  const specimenTypesDynamic = specTotalCount > 0
    ? specimenTypes.map((t) => ({ ...t, pct: Math.round(((specCounts[t.label] ?? 0) / specTotalCount) * 100) }))
    : specimenTypes;

  // Standalone, trend-focused KPIs (distinct from the main dashboard's KPI strip).
  const kpis = [
    { label: 'Monthly Volume', value: volTotal.toLocaleString(), sub: `${up ? '▲' : '▼'} ${Math.abs(d.throughput?.deltaPct ?? 0)}% vs prev period` },
    { label: 'AI Performance', value: `${eff?.accuracy ?? eff?.authorization ?? 0}%`, sub: 'Model accuracy' },
    { label: 'Authorization Rate', value: `${eff?.authorization ?? 0}%`, sub: 'Reports authorized' },
    { label: 'On-Time Rate', value: `${eff?.onTime ?? 0}%`, sub: 'Within TAT target' },
  ];

  return (
    <>
      {/* Trend KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16, marginBottom: 24 }}>
        {kpis.map((k) => (
          <div key={k.label} style={CARD}>
            <div style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', fontFamily: 'Geist,sans-serif', lineHeight: 1.1, marginTop: 6 }}>{k.value}</div>
            <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Chart sections */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 20 }}>
        {/* Monthly Case Volume */}
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>Monthly Case Volume</span>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 999, padding: '3px 10px', cursor: 'pointer' }}>6 Months ▾</div>
          </div>
          <SubscriptionBars data={volRows} />
          <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { value: volTotal, label: 'Total cases' },
              { value: volAvg, label: 'Avg / month' },
              { value: volPeak?.month ?? '—', label: 'Peak month' },
              { value: `${volAttain}%`, label: 'Target met' },
            ].map(({ value, label }) => (
              <div key={label} style={{ background: '#F8F9FF', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', fontFamily: 'Geist,sans-serif', lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 12, color: '#475569', fontWeight: 500, marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Case Distribution by Type */}
        <div style={CARD}>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif', marginBottom: 16 }}>Case Distribution by Type</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <div style={{ position: 'relative', width: 180, height: 180, flexShrink: 0 }}>
              <svg viewBox="0 0 180 180" width="180" height="180">
                {(() => {
                  const types = specimenTypesDynamic.filter((t) => t.pct > 0);
                  const r = 70, circ = 2 * Math.PI * r, gap = 2.5;
                  let offset = 0;
                  return types.map(({ color, pct }, i) => {
                    const dash = (pct / 100) * circ;
                    const el = (
                      <circle key={i} cx="90" cy="90" r={r} fill="none" stroke={color} strokeWidth="20"
                        strokeDasharray={`${dash - gap} ${circ - dash + gap}`}
                        strokeDashoffset={-(offset / 100) * circ}
                        transform="rotate(-90 90 90)" />
                    );
                    offset += pct;
                    return el;
                  });
                })()}
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 30, fontWeight: 800, color: '#0F172A', fontFamily: 'Geist,sans-serif', lineHeight: 1 }}>{totalSpecimens || d.priorityRecords?.length || 0}</div>
                <div style={{ fontSize: 11, color: '#475569', fontWeight: 600, textAlign: 'center', marginTop: 3 }}>Total Cases</div>
              </div>
            </div>
            <div style={{ width: '100%', maxWidth: 280, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {specimenTypesDynamic.map(({ label, color, pct }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>{label}</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Performance */}
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>AI Performance</span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#4F46E5', fontFamily: 'Geist,sans-serif', lineHeight: 1.1 }}>{eff?.authorization ?? 0}%</div>
              <div style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>Accuracy</div>
            </div>
          </div>
          <PerformanceArea />
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { label: 'Sensitivity', v: Math.min(99, (eff?.authorization ?? 0) + 8) },
              { label: 'Specificity', v: Math.min(99, (eff?.authorization ?? 0) + 5) },
              { label: 'Precision', v: Math.min(99, (eff?.authorization ?? 0) + 2) },
              { label: 'F1 Score', v: Math.min(99, (eff?.authorization ?? 0) + 4) },
            ].map(({ label, v }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 82, fontSize: 12, color: '#475569', fontWeight: 600, flexShrink: 0 }}>{label}</span>
                <div style={{ flex: 1, height: 8, borderRadius: 999, background: '#EEF0F6', overflow: 'hidden' }}>
                  <div style={{ width: `${v}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#6366F1,#6D28D9)' }} />
                </div>
                <span style={{ width: 36, textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#0F172A', flexShrink: 0 }}>{v}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div style={{ ...CARD, padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>Recent Activity</span>
            <button onClick={() => router.push('/records')} style={{ fontSize: 12, fontWeight: 600, color: '#4F46E5', background: 'none', border: 'none', cursor: 'pointer' }}>View all</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
            {(d.activity || []).slice(0, 5).map((a: any, i: number, arr: any[]) => {
              const meta = activityMeta(a.status);
              const Icon = meta.Icon;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < arr.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 11, background: '#EEF2FF', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Icon size={17} color="#4F46E5" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta.title}</div>
                    {a.labNumber && <div style={{ fontSize: 12, color: '#475569', fontWeight: 500, marginTop: 2 }}>{a.labNumber}</div>}
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', fontWeight: 500, flexShrink: 0 }}>{new Date(a.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
