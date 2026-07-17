'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Inbox, Loader2, Save, Trash2 } from 'lucide-react';
import { SettingsListPane, type PaneField } from '@/components/SettingsListPane';
import { AiSettingsPane } from '@/components/AiSettingsPane';
import { CompanySettingsPane } from '@/components/settings/CompanySettingsPane';
import { NotificationSettingsPane } from '@/components/settings/NotificationSettingsPane';
import { DepartmentsSettingsPane } from '@/components/settings/DepartmentsSettingsPane';
import { DrawPad } from '@/components/DrawPad';
import { api } from '@/lib/api';
import { Card, Button } from '@/components/ui';
import { notify } from '@/lib/notify';

type SectionId =
  | 'labcodes' | 'codesheet' | 'codefindings'
  | 'services' | 'taxes'
  | 'ai' | 'signature' | 'company' | 'notification' | 'departments';

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
      { id: 'signature', label: 'My Signature' },
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
  // Mobile is single-panel: the nav list, then the selected pane (with a back button). Desktop
  // (lg+) shows both side by side, so this only gates the phone/tablet layout.
  const [mobileDetail, setMobileDetail] = useState(false);

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
      case 'signature':
        return <SignatureSettings />;
      case 'company':
        return <CompanySettingsPane />;
      case 'notification':
        return <NotificationSettingsPane />;
      case 'departments':
        return <DepartmentsSettingsPane />;
      default: {
        const label = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === active)?.label ?? 'Settings';
        return <ComingSoon label={label} />;
      }
    }
  })();

  return (
    <div className="flex items-start gap-4">
      <Card border="none" elevation="none" className={`${mobileDetail ? 'hidden lg:block' : 'block'} glass-card w-full shrink-0 p-4 lg:w-60`}>
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
                    onClick={() => { setActive(item.id); setMobileDetail(true); }}
                    className={`rounded-lg border-l-4 px-3 py-2 text-left font-body-sm text-body-sm transition-colors ${isActive ? 'border-indigo-500 bg-indigo-50 font-medium text-indigo-700' : 'border-transparent bg-white text-gray-600 hover:bg-gray-50'}`}
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
      <Card border="none" elevation="none" className={`${mobileDetail ? 'block' : 'hidden lg:block'} glass-card min-w-0 flex-1 p-6`} key={active}>
        <button onClick={() => setMobileDetail(false)} className="mb-4 -ml-1 inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-primary lg:hidden">
          <ArrowLeft size={15} /> Settings
        </button>
        {pane}
      </Card>
    </div>
  );
}

// ── My Signature: draw once, reused when authorizing result sheets and stamped
//    onto released reports (falls back to typed name when unset). ──
function SignatureSettings() {
  const [currentSignature, setCurrentSignature] = useState<string | null>(null);
  const [newSignature, setNewSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [padKey, setPadKey] = useState(0);

  useEffect(() => {
    api.get('/users/me/signature')
      .then((r) => setCurrentSignature(r.data.signatureUrl))
      .catch(() => {});
  }, []);

  const saveSignature = async () => {
    if (!newSignature) return;
    setSaving(true);
    try {
      await api.put('/users/me/signature', { signatureDataUri: newSignature });
      setCurrentSignature(newSignature);
      setNewSignature(null);
      setPadKey((k) => k + 1);
      notify.success('Signature saved');
    } finally {
      setSaving(false);
    }
  };

  const clearSignature = () => {
    setNewSignature(null);
    setPadKey((k) => k + 1);
  };

  return (
    <div>
      <h3 className="mb-1 font-headline-sm text-headline-sm text-charcoal-heading">My Signature</h3>
      <p className="mb-4 font-body-sm text-body-sm text-secondary">
        Your signature is used when authorizing result sheets and appears on released reports.
      </p>

      <DrawPad key={padKey} value={newSignature} onChange={setNewSignature} width={500} height={150} />

      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <Button onClick={saveSignature} disabled={!newSignature || saving} className="flex items-center gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save Signature
        </Button>
        {newSignature && (
          <Button variant="secondary" onClick={clearSignature} className="flex items-center gap-2">
            <Trash2 size={14} /> Clear
          </Button>
        )}
      </div>

      {currentSignature && (
        <div style={{ marginTop: 16 }}>
          <p className="mb-2 font-label-sm text-label-sm uppercase tracking-wider text-secondary">Current signature:</p>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: 12, background: 'white', display: 'inline-block' }}>
            <img src={currentSignature} alt="Signature" style={{ height: 60, display: 'block' }} />
          </div>
        </div>
      )}

      
    </div>
  );
}
