'use client';

import { useState } from 'react';
import { App, Button, Empty, Input, InputNumber, Popconfirm, Space, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
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

// Stored (minor) unit ↔ display (major) unit. money/percent both scale by 100.
const toDisplay = (f: PaneField, initial: Record<string, any>): any => {
  const raw = initial[f.key];
  if (f.kind) return raw == null ? null : raw / 100;
  return raw ?? '';
};

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

  const { data: items = [], isLoading } = useQuery<Item[]>({
    queryKey: [queryKey],
    queryFn: () => api.get(listUrl).then((r) => (mapList ? mapList(r.data) : r.data)),
  });

  const addDraft = () => setDrafts((d) => [...d, {}]);
  const removeDraft = (i: number) => setDrafts((d) => d.filter((_, idx) => idx !== i));

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>{title}</Typography.Title>
      <Typography.Paragraph type="secondary" style={{ maxWidth: 640 }}>{helper}</Typography.Paragraph>

      <Button icon={<PlusOutlined />} onClick={addDraft} style={{ marginBottom: 16 }}>{addLabel}</Button>

      {!isLoading && items.length === 0 && drafts.length === 0 && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing here yet" style={{ margin: '24px 0' }} />
      )}

      <Space direction="vertical" size={12} style={{ width: '100%', maxWidth: 760 }}>
        {items.map((it) => (
          <ItemCard key={it.id} fields={fields} initial={it} queryKey={queryKey} onSaveUrl={updateUrl(it.id)} onDeleteUrl={deleteUrl(it.id)} />
        ))}
        {drafts.map((_, i) => (
          <ItemCard key={`draft-${i}`} fields={fields} initial={{}} queryKey={queryKey} onSaveUrl={createUrl} isNew onDiscard={() => removeDraft(i)} />
        ))}
      </Space>
    </div>
  );
}

function ItemCard({
  fields, initial, queryKey, onSaveUrl, onDeleteUrl, isNew, onDiscard,
}: {
  fields: PaneField[];
  initial: Record<string, any>;
  queryKey: string;
  onSaveUrl: string;
  onDeleteUrl?: string;
  isNew?: boolean;
  onDiscard?: () => void;
}) {
  const { message } = App.useApp();
  const qc = useQueryClient();
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
      message.success('Saved');
      qc.invalidateQueries({ queryKey: [queryKey] });
      if (isNew) onDiscard?.();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Save failed'),
  });

  const del = useMutation({
    mutationFn: () => api.delete(onDeleteUrl!),
    onSuccess: () => { message.success('Deleted'); qc.invalidateQueries({ queryKey: [queryKey] }); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Delete failed'),
  });

  const setField = (f: PaneField, v: any) =>
    setValues((s) => ({ ...s, [f.key]: typeof v === 'string' && f.uppercase ? v.toUpperCase() : v }));

  return (
    <div data-item-card data-new={isNew ? '1' : '0'} style={{ border: '1px solid #edeff2', borderRadius: 16, padding: 16, background: '#fff', boxShadow: '0 1px 3px rgba(17,24,39,0.03)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {fields.map((f) => (
          <div key={f.key} style={{ flex: f.flex ?? 1, minWidth: 140 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>{f.label}</Typography.Text>
            {f.kind === 'money' ? (
              <InputNumber
                style={{ width: '100%' }} min={0} step={0.01} precision={2} prefix="$"
                placeholder={f.placeholder} value={values[f.key]} onChange={(v) => setField(f, v)}
              />
            ) : f.kind === 'percent' ? (
              <InputNumber
                style={{ width: '100%' }} min={0} max={100} step={0.1} suffix="%"
                placeholder={f.placeholder} value={values[f.key]} onChange={(v) => setField(f, v)}
              />
            ) : f.textarea ? (
              <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} placeholder={f.placeholder} value={values[f.key]} onChange={(e) => setField(f, e.target.value)} />
            ) : (
              <Input placeholder={f.placeholder} value={values[f.key]} onChange={(e) => setField(f, e.target.value)} />
            )}
          </div>
        ))}
        <Space>
          <Button type="primary" size="small" loading={save.isPending} disabled={!dirty || !valid} onClick={() => save.mutate()}>Save</Button>
          {isNew ? (
            <Button size="small" icon={<DeleteOutlined />} onClick={onDiscard}>Remove</Button>
          ) : (
            <Popconfirm title="Delete this item?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => del.mutate()}>
              <Button size="small" danger icon={<DeleteOutlined />} loading={del.isPending}>Delete</Button>
            </Popconfirm>
          )}
        </Space>
      </div>
    </div>
  );
}
