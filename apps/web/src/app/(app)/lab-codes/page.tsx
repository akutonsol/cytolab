'use client';

import { SettingsListPane, type PaneField } from '@/components/SettingsListPane';

const LAB_CODE_FIELDS: PaneField[] = [
  { key: 'code', label: 'Code', placeholder: 'CODE', uppercase: true, flex: 1 },
  { key: 'region', label: 'Region', placeholder: 'Kingston', flex: 1 },
];

export default function Page() {
  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="font-headline-md text-headline-md text-charcoal-heading">Lab Codes</h1>
        <p className="font-body-sm text-body-sm text-secondary">Manage lab region codes used across records.</p>
      </div>
      <SettingsListPane
        title="Lab Code"
        helper="Lab Codes created in this section are used when creating or modifying a Client."
        addLabel="Add Lab Code"
        fields={LAB_CODE_FIELDS}
        queryKey="labcodes"
        listUrl="/labcodes"
        createUrl="/labcodes"
        updateUrl={(id) => `/labcodes/update/${id}`}
        deleteUrl={(id) => `/labcodes/delete/${id}`}
      />
    </div>
  );
}
