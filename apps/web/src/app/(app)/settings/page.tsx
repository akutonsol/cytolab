'use client';

import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { SettingsListPane, type PaneField } from '@/components/SettingsListPane';
import { AiSettingsPane } from '@/components/AiSettingsPane';

type SectionId =
  | 'labcodes' | 'codesheet' | 'codefindings'
  | 'services' | 'taxes'
  | 'ai' | 'company' | 'notification' | 'departments';

const NAV_GROUPS: { title: string; items: { id: SectionId; label: string }[] }[] = [
  {
    title: 'Form & Specimen',
    items: [
      { id: 'labcodes', label: 'Lab Codes' },
      { id: 'codesheet', label: 'Code Sheet' },
      { id: 'codefindings', label: 'Code Findings' },
    ],
  },
  {
    title: 'Payroll & Billing',
    items: [
      { id: 'services', label: 'Services' },
      { id: 'taxes', label: 'Taxes' },
    ],
  },
  {
    title: 'General',
    items: [
      { id: 'ai', label: 'AI Assistance' },
      { id: 'company', label: 'Company' },
      { id: 'notification', label: 'Notification' },
      { id: 'departments', label: 'Departments' },
    ],
  },
];

// The three built sections share the SettingsListPane shape.
const LAB_CODE_FIELDS: PaneField[] = [
  { key: 'code', label: 'Code', placeholder: 'CODE', uppercase: true, flex: 1 },
  { key: 'region', label: 'Region', placeholder: 'Kingston', flex: 1 },
];
const CODE_SHEET_FIELDS: PaneField[] = [
  { key: 'abbreviation', label: 'Abbreviation', placeholder: 'NC SS', uppercase: true, flex: 1 },
  { key: 'description', label: 'Description', placeholder: 'NO CELLS SEEN ON SLIDE', flex: 2, textarea: true },
];
const CODE_FINDING_FIELDS: PaneField[] = [
  { key: 'abbreviation', label: 'Abbreviated Code', placeholder: 'CANDIS-H', uppercase: true, flex: 1 },
  { key: 'description', label: 'Description', placeholder: 'Description', flex: 2, textarea: true },
];
const SERVICE_FIELDS: PaneField[] = [
  { key: 'name', label: 'Name', placeholder: 'Pap Smear', flex: 2 },
  { key: 'code', label: 'Code', placeholder: 'PAP', uppercase: true, flex: 1 },
  { key: 'price', label: 'Price', placeholder: '0.00', kind: 'money', flex: 1 },
];
const TAX_FIELDS: PaneField[] = [
  { key: 'name', label: 'Name', placeholder: 'GCT', flex: 2 },
  { key: 'rateBasisPoints', label: 'Rate', placeholder: '0', kind: 'percent', flex: 1 },
];

function ComingSoon({ label }: { label: string }) {
  return (
    <div>
      <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">{label}</h3>
      <div className="my-10 flex flex-col items-center justify-center gap-2 text-secondary">
        <Inbox size={40} className="text-outline-variant" />
        <span className="font-body-sm text-body-sm">{label} settings are coming soon</span>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [active, setActive] = useState<SectionId>('labcodes');

  const pane = (() => {
    switch (active) {
      case 'labcodes':
        return (
          <SettingsListPane
            title="Lab Codes"
            helper="Lab Codes created in this section are used when creating or modifying a Client."
            addLabel="Add Lab Code"
            fields={LAB_CODE_FIELDS}
            queryKey="labcodes"
            listUrl="/labcodes"
            createUrl="/labcodes"
            updateUrl={(id) => `/labcodes/update/${id}`}
            deleteUrl={(id) => `/labcodes/delete/${id}`}
          />
        );
      case 'codesheet':
        return (
          <SettingsListPane
            title="Code Sheet"
            helper="Code sheet abbreviations created here are used when creating or modifying a Result Sheet."
            addLabel="Add Code Sheet"
            fields={CODE_SHEET_FIELDS}
            queryKey="codesheets"
            listUrl="/codesheets"
            createUrl="/codesheets"
            updateUrl={(id) => `/codesheets/update/${id}`}
            deleteUrl={(id) => `/codesheets/delete/${id}`}
          />
        );
      case 'codefindings':
        return (
          <SettingsListPane
            title="Code Findings"
            helper="Code findings represent the outcome of a sample analysis and are used when creating or modifying a Result Sheet."
            addLabel="Add Code Finding"
            fields={CODE_FINDING_FIELDS}
            queryKey="codefindings"
            listUrl="/codefindings"
            createUrl="/codefindings"
            updateUrl={(id) => `/codefindings/update/${id}`}
            deleteUrl={(id) => `/codefindings/delete/${id}`}
          />
        );
      case 'services':
        return (
          <SettingsListPane
            title="Services"
            helper="Services created here are the billable line items available when generating a bill."
            addLabel="Add Service"
            fields={SERVICE_FIELDS}
            queryKey="services"
            listUrl="/services"
            createUrl="/services"
            updateUrl={(id) => `/services/update/${id}`}
            deleteUrl={(id) => `/services/delete/${id}`}
            mapList={(raw) => raw.data}
          />
        );
      case 'taxes':
        return (
          <SettingsListPane
            title="Taxes"
            helper="Taxes created here can be applied to bills."
            addLabel="Add Tax"
            fields={TAX_FIELDS}
            queryKey="taxes"
            listUrl="/taxes"
            createUrl="/taxes"
            updateUrl={(id) => `/taxes/update/${id}`}
            deleteUrl={(id) => `/taxes/delete/${id}`}
          />
        );
      case 'ai':
        return <AiSettingsPane />;
      default: {
        const label = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === active)?.label ?? 'Settings';
        return <ComingSoon label={label} />;
      }
    }
  })();

  return (
    <div className="flex items-start gap-4">
      <div className="glass-card w-60 shrink-0 rounded-2xl p-4">
        <div className="mb-4 font-headline-sm text-headline-sm text-charcoal-heading">Settings</div>
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-4">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">{group.title}</span>
            <div className="mt-1.5 flex flex-col gap-0.5">
              {group.items.map((item) => {
                const isActive = item.id === active;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActive(item.id)}
                    className={`rounded-lg px-2.5 py-1.5 text-left font-body-sm text-body-sm transition-colors ${isActive ? 'bg-primary-fixed font-semibold text-primary' : 'text-on-surface hover:bg-surface-container-low'}`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* key by section so each pane remounts — otherwise the shared
          SettingsListPane instance leaks its draft/edit state across sections. */}
      <div className="glass-card min-w-0 flex-1 rounded-2xl p-6" key={active}>{pane}</div>
    </div>
  );
}
