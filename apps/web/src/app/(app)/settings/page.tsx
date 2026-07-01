'use client';

import { useState } from 'react';
import { Card, Empty, Typography } from 'antd';
import { SettingsListPane, type PaneField } from '@/components/SettingsListPane';

type SectionId =
  | 'labcodes' | 'codesheet' | 'codefindings'
  | 'services' | 'taxes'
  | 'company' | 'notification' | 'departments';

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
      <Typography.Title level={4} style={{ marginTop: 0 }}>{label}</Typography.Title>
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`${label} settings are coming soon`} style={{ margin: '40px 0' }} />
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
      default: {
        const label = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === active)?.label ?? 'Settings';
        return <ComingSoon label={label} />;
      }
    }
  })();

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <Card size="small" title="Settings" style={{ width: 240, flexShrink: 0 }} styles={{ body: { padding: 12 } }}>
        {NAV_GROUPS.map((group) => (
          <div key={group.title} style={{ marginBottom: 16 }}>
            <Typography.Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: '#9ca3af', fontWeight: 600 }}>
              {group.title}
            </Typography.Text>
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {group.items.map((item) => {
                const isActive = item.id === active;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActive(item.id)}
                    style={{
                      textAlign: 'left', border: 'none', cursor: 'pointer', padding: '7px 10px', borderRadius: 8,
                      background: isActive ? '#eaf0fe' : 'transparent', color: isActive ? '#4f7df9' : '#1a1d21',
                      fontWeight: isActive ? 600 : 400, fontSize: 14,
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </Card>

      {/* key by section so each pane remounts — otherwise the shared
          SettingsListPane instance leaks its draft/edit state across sections. */}
      <Card style={{ flex: 1, minWidth: 0 }} key={active}>{pane}</Card>
    </div>
  );
}
