'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  CarOutlined,
  CheckCircleOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  InboxOutlined,
  MoreOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  AppShell,
  ArrowUpRight,
  Avatar,
  AvatarStack,
  BarChart,
  Column,
  DataTable,
  Gauge,
  IconButton,
  LineChart,
  MiniAreaChart,
  PastelCard,
  PillSelect,
  SectionCard,
  StackedCell,
  StatCard,
  StatusBadge,
  UserCell,
} from '@/components/ui';

/* ---- Sample data mirroring the reference images ---- */
const PATIENTS = [
  { id: '1', name: 'Jonathan Sanders', reg: 'Reg. No.: 12801022', diagnosis: 'Headache', condition: 'Critical', visit: '09.08.2023', time: '1:30 pm', phase: 'Consultation' },
  { id: '2', name: 'David Murphy', reg: 'Reg. No.: 12801023', diagnosis: 'Sore throat', condition: 'Critical', visit: '09.08.2023', time: '1:30 pm', phase: 'Initial inspection' },
  { id: '3', name: 'Sophia Bennett', reg: 'Reg. No.: 12801024', diagnosis: 'Colds', condition: 'Critical', visit: '09.08.2023', time: '1:30 pm', phase: 'Consultation' },
  { id: '4', name: 'William Brooks', reg: 'Reg. No.: 12801025', diagnosis: 'Headache', condition: 'Normal', visit: '09.08.2023', time: '1:30 pm', phase: 'Initial inspection' },
  { id: '5', name: 'Matthew Lawson', reg: 'Reg. No.: 12801026', diagnosis: 'Colds', condition: 'Normal', visit: '09.08.2023', time: '1:30 pm', phase: 'Initial inspection' },
];

const EFFICIENCY = [
  { m: 'Jan', cost: 5, eff: 6 }, { m: 'Feb', cost: 6.5, eff: 7 }, { m: 'Mar', cost: 6, eff: 8 },
  { m: 'Apr', cost: 8, eff: 7.5 }, { m: 'May', cost: 9.7, eff: 4.3 }, { m: 'Jun', cost: 7, eff: 6 },
  { m: 'Jul', cost: 6.5, eff: 7 }, { m: 'Aug', cost: 5.5, eff: 8 }, { m: 'Sep', cost: 6, eff: 7 },
  { m: 'Oct', cost: 5, eff: 8.5 }, { m: 'Nov', cost: 6.5, eff: 9 }, { m: 'Dec', cost: 5.5, eff: 8 },
];
const PROCESSED = [
  { label: 'Mo', value: 126 }, { label: 'Tu', value: 120 }, { label: 'We', value: 105 },
  { label: 'Th', value: 118 }, { label: 'Fr', value: 153 }, { label: 'Sa', value: 52 }, { label: 'Su', value: 78 },
];
const SPARK_A = [4, 6, 5, 8, 7, 9, 6, 10, 8];
const SPARK_B = [8, 7, 9, 6, 7, 8, 9, 7, 8];
const SPARK_C = [3, 5, 4, 6, 5, 7, 6, 8, 7];
const TEAM = [{ name: 'Ava Turner' }, { name: 'David Murphy' }, { name: 'Emily Parker' }, { name: 'Sophia Bennett' }, { name: 'Matthew Lawson' }, { name: 'Olivia Scott' }, { name: 'William Brooks' }];

function Block({ title, children, cols }: { title: string; children: ReactNode; cols?: boolean }) {
  return (
    <section className="mb-8">
      <h3 className="mb-3 text-label font-semibold uppercase tracking-wide text-text-tertiary">{title}</h3>
      <div className={cols ? 'grid grid-cols-1 gap-4 md:grid-cols-3' : ''}>{children}</div>
    </section>
  );
}

export default function DesignSystemPage() {
  const [selected, setSelected] = useState<string[]>(['3']);
  const [range, setRange] = useState('Week');

  const columns: Column<(typeof PATIENTS)[number]>[] = [
    { key: 'name', title: 'Name', render: (r) => <UserCell name={r.name} sub={r.reg} /> },
    { key: 'diagnosis', title: 'Diagnosis' },
    {
      key: 'condition',
      title: 'Condition',
      render: (r) =>
        r.condition === 'Critical' ? (
          <StatusBadge status="Critical" icon={<ExclamationCircleOutlined />} />
        ) : (
          <StatusBadge status="Normal" />
        ),
    },
    { key: 'visit', title: 'Last visit', render: (r) => <StackedCell top={<span className="text-sm text-text">{r.visit}</span>} bottom={`at ${r.time}`} /> },
    { key: 'phase', title: 'Treatment phase', render: (r) => <span className="text-text-secondary">{r.phase}</span> },
  ];

  return (
    <AppShell
      variant="rail"
      activeKey="dashboard"
      brand="Cytolab"
      footerNote="09:12"
      user={{ name: 'Pavel Ginzburg', role: 'Therapist' }}
    >
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-8">
          <p className="text-display font-medium text-text-secondary">Premium UI</p>
          <h1 className="text-display font-extrabold text-text">Design System</h1>
          <p className="mt-2 max-w-xl text-sm text-text-secondary">
            The shared token layer + primitives every premium screen composes from. Blue (#4F7DF9) is the unified accent.
          </p>
        </header>

        {/* StatCard */}
        <Block title="StatCard — plain · iconed · active">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <StatCard label="New appointments" value="57" />
            <StatCard label="Planned surveys" value="18" />
            <StatCard label="Patient satisfaction" value="4.7" suffix="/5" />
            <StatCard label="New Orders" sublabel="Today" value="63" icon={<InboxOutlined />} />
            <StatCard
              label="Completed"
              sublabel="This Month"
              value="3 924"
              icon={<CheckCircleOutlined />}
              active
              action={<IconButton size="sm" variant="light" icon={<ArrowUpRight />} />}
            />
          </div>
        </Block>

        {/* PastelCard */}
        <Block title="PastelCard — lavender · sky · peach" cols>
          <PastelCard
            tone="lavender"
            label="Requires immediate attention"
            title="The patient missed a scheduled examination. An urgent consultation is required."
            meta="Emily Parker · Colds"
            avatars={TEAM.map((t) => ({ name: t.name }))}
          />
          <PastelCard tone="sky" label="System notifications" title="Work with patients has improved" value="16" />
          <PastelCard tone="peach" label="Completed appointments" title="Require a doctor's note" value="5" />
        </Block>

        {/* StatusBadge */}
        <Block title="StatusBadge — status → color, optional icon">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="Approved" icon={<CheckCircleOutlined />} />
            <StatusBadge status="Completed" icon={<CheckCircleOutlined />} />
            <StatusBadge status="In Progress" dot />
            <StatusBadge status="Pending" dot />
            <StatusBadge status="Critical" icon={<WarningOutlined />} />
            <StatusBadge status="Delayed" icon={<ExclamationCircleOutlined />} />
            <StatusBadge status="High" />
            <StatusBadge status="Resulted" dot />
            <StatusBadge status="New" dot />
            <StatusBadge status="In Transit" icon={<CarOutlined />} />
            <StatusBadge status="Low" />
            <StatusBadge status="Normal" />
          </div>
        </Block>

        {/* DataTable */}
        <Block title="DataTable — avatars, two-line cells, selection, active row, hover actions">
          <SectionCard title="My patients" subtitle="57 total" flush>
            <DataTable
              columns={columns}
              data={PATIENTS}
              rowKey={(r) => r.id}
              selectable
              selectedKeys={selected}
              onSelectChange={setSelected}
              activeKey="3"
              rowActions={() => (
                <>
                  <IconButton size="sm" variant="light" icon={<EditOutlined />} />
                  <IconButton size="sm" variant="light" icon={<MoreOutlined />} />
                </>
              )}
            />
          </SectionCard>
        </Block>

        {/* Gauge + Charts */}
        <Block title="Gauge & Charts">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <SectionCard title="Orders Completion Rate" subtitle="Track today's fulfillment rate">
              <div className="grid place-items-center py-2">
                <Gauge goal={150} current={104} />
              </div>
            </SectionCard>

            <SectionCard
              title="Orders Processed"
              action={<PillSelect value={range} options={['Week', 'Month', 'Year']} onChange={setRange} />}
              className="lg:col-span-2"
            >
              <BarChart data={PROCESSED} total="752" totalLabel="Total orders processed" />
            </SectionCard>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <SectionCard
              title="Efficiency Spend Overview"
              className="lg:col-span-2"
              action={<PillSelect value="Year" options={['Week', 'Year']} />}
            >
              <LineChart
                data={EFFICIENCY}
                xKey="m"
                series={[
                  { key: 'cost', label: 'Production Cost' },
                  { key: 'eff', label: 'Output Efficiency' },
                ]}
              />
            </SectionCard>

            <div className="flex flex-col gap-4">
              {[
                { label: 'Cost', value: '$12k', data: SPARK_A, color: '#dc2626' },
                { label: 'Efficiency', value: '78%', data: SPARK_B, color: '#1a1d21' },
                { label: 'Unit Cost', value: '$360', data: SPARK_C, color: '#4f7df9' },
              ].map((t) => (
                <div key={t.label} className="flex items-center gap-3 rounded-card bg-surface p-4 shadow-card">
                  <div className="flex min-w-[70px] flex-col">
                    <span className="text-[22px] font-extrabold tracking-tight text-text">{t.value}</span>
                    <span className="text-meta text-text-tertiary">{t.label}</span>
                  </div>
                  <MiniAreaChart data={t.data} color={t.color} className="flex-1" />
                </div>
              ))}
            </div>
          </div>
        </Block>

        {/* SectionCard header controls + IconButton + AvatarStack */}
        <Block title="SectionCard header · IconButton variants · AvatarStack">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <SectionCard
              title="Key Teams"
              action={
                <>
                  <PillSelect value="Week" options={['Week', 'Month']} />
                  <IconButton size="sm" variant="light" icon={<ArrowUpRight />} />
                </>
              }
            >
              <div className="flex flex-col gap-3">
                <AvatarStack avatars={TEAM.map((t) => ({ name: t.name }))} />
                <div className="flex items-center gap-2">
                  <IconButton variant="dark" icon={<ArrowUpRight />} />
                  <IconButton variant="light" icon={<ArrowUpRight />} />
                  <IconButton variant="primary" icon={<ArrowUpRight />} />
                  <IconButton variant="soft" icon={<ArrowUpRight />} />
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Avatars">
              <div className="flex items-center gap-3">
                <Avatar name="Pavel Ginzburg" size={48} />
                <Avatar name="Emily Parker" size={40} />
                <Avatar name="William Brooks" size={32} />
              </div>
            </SectionCard>
          </div>
        </Block>

        {/* AppShell top-nav variant preview */}
        <Block title="AppShell — top-nav variant (Modo)">
          <div className="h-[280px] overflow-hidden rounded-card border border-border">
            <AppShell variant="top" brand="Modo" activeKey="orders" user={{ name: 'Pavel Ginzburg', role: 'Therapist' }}>
              <div className="grid grid-cols-4 gap-4">
                <StatCard label="New Orders" sublabel="Today" value="63" icon={<InboxOutlined />} />
                <StatCard label="Completed" sublabel="This Month" value="3 924" icon={<CheckCircleOutlined />} active />
                <StatCard label="In Transit" sublabel="Being delivered" value="152" icon={<CarOutlined />} />
                <StatCard label="Delayed" sublabel="Requires attention" value="18" icon={<WarningOutlined />} />
              </div>
            </AppShell>
          </div>
        </Block>
      </div>
    </AppShell>
  );
}
