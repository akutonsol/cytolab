'use client';

import { SettingsListPane, type PaneField } from '@/components/SettingsListPane';

const CODE_SHEET_FIELDS: PaneField[] = [
  { key: 'abbreviation', label: 'Abbreviation', placeholder: 'NC SS', uppercase: true, flex: 1 },
  { key: 'description', label: 'Description', placeholder: 'NO CELLS SEEN ON SLIDE', flex: 2, textarea: true },
];

export default function Page() {
  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="font-headline-md text-headline-md text-charcoal-heading">Code Sheets</h1>
        <p className="font-body-sm text-body-sm text-secondary">Manage cytology abbreviations and result codes.</p>
      </div>
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
    </div>
  );
}
