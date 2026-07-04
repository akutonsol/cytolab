'use client';

import { useState } from 'react';
import { Inbox, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface PaneField {
  key: string;
  label: string;
  placeholder?: string;
  /** Force-uppercase on input (used for Code / Abbreviation). */
  uppercase?: boolean;
  /** Flex weight of the field column (default 1). */
  flex?: number;
  textarea?: boolean;
  /**
   * Numeric display type. `money` shows/edits dollars, stores integer cents;
   * `percent` shows/edits percent, stores integer basis points. Omit for text.
   */
  kind?: 'money' | 'percent';
}

interface Item {
  id: string;
  [k: string]: any;
}

interface Props {
  title: string;
  helper: string;
  addLabel: string;
  fields: PaneField[];
  queryKey: string;
  listUrl: string;
  createUrl: string;
  updateUrl: (id: string) => string;
  deleteUrl: (id: string) => string;
  /** Extract the item array from the list response (e.g. paginated → `.data`). */
  mapList?: (raw: any) => Item[];
}

type Notify = (type: 'ok' | 'err', msg: string) => void;

// Stored (minor) unit ↔ display (major) unit. money/percent both scale by 100.
const toDisplay = (f: PaneField, initial: Record<string, any>): any => {
  const raw = initial[f.key];
  if (f.kind) return raw == null ? null : raw / 100;
  return raw ?? '';
};

const INPUT = 'h-11 w-full rounded-xl border border-outline-variant/40 bg-white px-3.5 font-body-sm text-body-sm text-on-surface outline-none transition-colors focus:border-primary';

/**
 * Generic settings editor: a helper line, an Add button, and a list of editable
 * cards. Each card saves individually (POST for new, PUT for existing) and can be
 * deleted. Shared by Lab Codes / Code Sheet / Code Findings (text) and
 * Services / Taxes (money / percent).
 */
export function SettingsListPane({
  title, helper, addLabel, fields, queryKey, listUrl, createUrl, updateUrl, deleteUrl, mapList,
}: Props) {
  const [drafts, setDrafts] = useState<Array<Record<string, any>>>([]);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const notify: Notify = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };

  const { data: items = [], isLoading } = useQuery<Item[]>({
    queryKey: [queryKey],
    queryFn: () => api.get(listUrl).then((r) => (mapList ? mapList(r.data) : r.data)),
  });

  const addDraft = () => setDrafts((d) => [...d, {}]);
  const removeDraft = (i: number) => setDrafts((d) => d.filter((_, idx) => idx !== i));

  return (
    <div>
      <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">{title}</h3>
      <p className="mt-1 max-w-[640px] font-body-sm text-body-sm text-secondary">{helper}</p>

      <button onClick={addDraft} className="btn-secondary mb-4 mt-4"><Plus size={15} /> {addLabel}</button>

      {!isLoading && items.length === 0 && drafts.length === 0 && (
        <div className="my-6 flex flex-col items-center justify-center gap-2 text-secondary">
          <Inbox size={36} className="text-outline-variant" />
          <span className="font-body-sm text-body-sm">Nothing here yet</span>
        </div>
      )}

      <div className="flex w-full max-w-[760px] flex-col gap-3">
        {items.map((it) => (
          <ItemCard key={it.id} fields={fields} initial={it} queryKey={queryKey} onSaveUrl={updateUrl(it.id)} onDeleteUrl={deleteUrl(it.id)} notify={notify} />
        ))}
        {drafts.map((_, i) => (
          <ItemCard key={`draft-${i}`} fields={fields} initial={{}} queryKey={queryKey} onSaveUrl={createUrl} isNew onDiscard={() => removeDraft(i)} notify={notify} />
        ))}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 font-label-md text-label-md text-white shadow-lg"
          style={{ background: toast.type === 'ok' ? '#16A34A' : '#DC2626' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function ItemCard({
  fields, initial, queryKey, onSaveUrl, onDeleteUrl, isNew, onDiscard, notify,
}: {
  fields: PaneField[];
  initial: Record<string, any>;
  queryKey: string;
  onSaveUrl: string;
  onDeleteUrl?: string;
  isNew?: boolean;
  onDiscard?: () => void;
  notify: Notify;
}) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [values, setValues] = useState<Record<string, any>>(
    Object.fromEntries(fields.map((f) => [f.key, toDisplay(f, initial)])),
  );

  const numericFields = fields.filter((f) => f.kind);
  const dirty = isNew || fields.some((f) => String(toDisplay(f, initial) ?? '') !== String(values[f.key] ?? ''));
  const nameValid = String(values[fields[0].key] ?? '').trim().length > 0;
  const numsValid = numericFields.every((f) => values[f.key] != null && Number(values[f.key]) >= 0);
  const valid = nameValid && numsValid;

  const buildPayload = () => {
    const payload: Record<string, any> = {};
    for (const f of fields) {
      if (f.kind) {
        if (values[f.key] != null && values[f.key] !== '') payload[f.key] = Math.round(Number(values[f.key]) * 100);
      } else {
        payload[f.key] = values[f.key] ?? '';
      }
    }
    return payload;
  };

  const save = useMutation({
    mutationFn: () => (isNew ? api.post(onSaveUrl, buildPayload()) : api.put(onSaveUrl, buildPayload())),
    onSuccess: () => {
      notify('ok', 'Saved');
      qc.invalidateQueries({ queryKey: [queryKey] });
      if (isNew) onDiscard?.();
    },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Save failed'),
  });

  const del = useMutation({
    mutationFn: () => api.delete(onDeleteUrl!),
    onSuccess: () => { notify('ok', 'Deleted'); setConfirming(false); qc.invalidateQueries({ queryKey: [queryKey] }); },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Delete failed'),
  });

  const setField = (f: PaneField, v: any) =>
    setValues((s) => ({ ...s, [f.key]: typeof v === 'string' && f.uppercase ? v.toUpperCase() : v }));
  const num = (e: React.ChangeEvent<HTMLInputElement>) => (e.target.value === '' ? null : Number(e.target.value));

  return (
    <div data-item-card data-new={isNew ? '1' : '0'} className="rounded-2xl border border-outline-variant/30 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        {fields.map((f) => (
          <div key={f.key} style={{ flex: f.flex ?? 1, minWidth: 140 }}>
            <span className="mb-1 block font-label-sm text-label-sm text-secondary">{f.label}</span>
            {f.kind === 'money' ? (
              <div className="flex h-11 items-center rounded-xl border border-outline-variant/40 bg-white px-3 transition-colors focus-within:border-primary">
                <span className="font-body-sm text-body-sm text-secondary">$</span>
                <input type="number" min={0} step={0.01} placeholder={f.placeholder} value={values[f.key] ?? ''} onChange={(e) => setField(f, num(e))}
                  className="w-full border-none bg-transparent px-1 font-body-sm text-body-sm text-on-surface outline-none" />
              </div>
            ) : f.kind === 'percent' ? (
              <div className="flex h-11 items-center rounded-xl border border-outline-variant/40 bg-white px-3 transition-colors focus-within:border-primary">
                <input type="number" min={0} max={100} step={0.1} placeholder={f.placeholder} value={values[f.key] ?? ''} onChange={(e) => setField(f, num(e))}
                  className="w-full border-none bg-transparent px-1 font-body-sm text-body-sm text-on-surface outline-none" />
                <span className="font-body-sm text-body-sm text-secondary">%</span>
              </div>
            ) : f.textarea ? (
              <textarea rows={2} placeholder={f.placeholder} value={values[f.key] ?? ''} onChange={(e) => setField(f, e.target.value)}
                className={`${INPUT} h-auto py-2`} style={{ resize: 'vertical' }} />
            ) : (
              <input placeholder={f.placeholder} value={values[f.key] ?? ''} onChange={(e) => setField(f, e.target.value)} className={INPUT} />
            )}
          </div>
        ))}
        <div className="flex items-center gap-2">
          <button className="btn-primary" disabled={!dirty || !valid || save.isPending} style={{ opacity: !dirty || !valid || save.isPending ? 0.5 : 1 }} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
          {isNew ? (
            <button className="btn-secondary" onClick={onDiscard}><Trash2 size={14} /> Remove</button>
          ) : confirming ? (
            <div className="flex items-center gap-1.5">
              <button className="btn-primary" style={{ background: '#DC2626', boxShadow: '0 4px 12px rgba(220,38,38,0.2)' }} disabled={del.isPending} onClick={() => del.mutate()}>Delete</button>
              <button className="btn-secondary" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          ) : (
            <button className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-outline-variant/40 text-secondary transition-colors hover:bg-error-container hover:text-error" onClick={() => setConfirming(true)}><Trash2 size={15} /></button>
          )}
        </div>
      </div>
    </div>
  );
}
