'use client';

import { useState } from 'react';
import { App, Button, Empty, Input, Popconfirm, Space, Typography } from 'antd';
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
}

/**
 * Generic settings editor: a helper line, an Add button, and a list of editable
 * cards. Each card saves individually (POST for new, PUT for existing) and can be
 * deleted. Shared by Lab Codes, Code Sheet, and Code Findings (same shape).
 */
export function SettingsListPane({ title, helper, addLabel, fields, queryKey, listUrl, createUrl, updateUrl, deleteUrl }: Props) {
  const [drafts, setDrafts] = useState<Array<Record<string, string>>>([]);

  const { data: items = [], isLoading } = useQuery<Item[]>({
    queryKey: [queryKey],
    queryFn: () => api.get(listUrl).then((r) => r.data),
  });

  const addDraft = () => setDrafts((d) => [...d, Object.fromEntries(fields.map((f) => [f.key, '']))]);
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
          <ItemCard
            key={it.id}
            fields={fields}
            initial={it}
            queryKey={queryKey}
            onSaveUrl={updateUrl(it.id)}
            onDeleteUrl={deleteUrl(it.id)}
          />
        ))}
        {drafts.map((_, i) => (
          <ItemCard
            key={`draft-${i}`}
            fields={fields}
            initial={{}}
            queryKey={queryKey}
            onSaveUrl={createUrl}
            isNew
            onDiscard={() => removeDraft(i)}
          />
        ))}
      </Space>
    </div>
  );
}

function ItemCard({
  fields,
  initial,
  queryKey,
  onSaveUrl,
  onDeleteUrl,
  isNew,
  onDiscard,
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
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, initial[f.key] ?? ''])),
  );
  const dirty = isNew || fields.some((f) => (values[f.key] ?? '') !== (initial[f.key] ?? ''));
  const requiredKey = fields[0].key;
  const valid = (values[requiredKey] ?? '').trim().length > 0;

  const save = useMutation({
    mutationFn: () => (isNew ? api.post(onSaveUrl, values) : api.put(onSaveUrl, values)),
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

  const setField = (f: PaneField, v: string) => setValues((s) => ({ ...s, [f.key]: f.uppercase ? v.toUpperCase() : v }));

  return (
    <div data-item-card data-new={isNew ? '1' : '0'} style={{ border: '1px solid #edeff2', borderRadius: 16, padding: 16, background: '#fff', boxShadow: '0 1px 3px rgba(17,24,39,0.03)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {fields.map((f) => (
          <div key={f.key} style={{ flex: f.flex ?? 1, minWidth: 140 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>{f.label}</Typography.Text>
            {f.textarea ? (
              <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} placeholder={f.placeholder} value={values[f.key]} onChange={(e) => setField(f, e.target.value)} />
            ) : (
              <Input placeholder={f.placeholder} value={values[f.key]} onChange={(e) => setField(f, e.target.value)} />
            )}
          </div>
        ))}
        <Space>
          <Button type="primary" size="small" loading={save.isPending} disabled={!dirty || !valid} onClick={() => save.mutate()}>
            Save
          </Button>
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
