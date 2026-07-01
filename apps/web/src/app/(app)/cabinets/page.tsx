'use client';

import { useState } from 'react';
import {
  App,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { FolderFilled, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { ClientSelect } from '@/components/ClientSelect';

// The six folder swatches (keys mirror the backend CABINET_COLORS).
const COLOR_HEX: Record<string, string> = {
  blue: '#4f7df9',
  green: '#16a34a',
  orange: '#f97316',
  purple: '#9333ea',
  red: '#dc2626',
  yellow: '#eab308',
};
const COLORS = Object.keys(COLOR_HEX);

const STATUS_COLORS: Record<string, string> = {
  Pending: 'default', Submitted: 'cyan', Processing: 'blue', Partial: 'gold', Completed: 'green',
  Resulted: 'geekblue', Approved: 'success', Billed: 'purple', Paid: 'green', OnHold: 'orange',
  Disabled: 'default', Failed: 'red', Viewed: 'lime',
};
const ALL_STATUSES = Object.keys(STATUS_COLORS);
const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

interface ClientLite {
  id: string;
  firstName: string;
  lastName: string;
  officeName?: string | null;
  accountNo?: string | null;
}
interface Cabinet {
  id: string;
  label: string;
  color?: string | null;
  identifier?: string | null;
  client?: ClientLite | null;
}
interface Rec {
  id: string;
  labNumber?: string | null;
  formType?: string | null;
  status: string;
  urgent: boolean;
  specimenDate?: string | null;
  createdAt: string;
  patient?: { firstName: string; lastName: string; registrationNo?: string | null } | null;
  client?: ClientLite | null;
  specimens?: Array<{ id: string; type: string }>;
}

export default function CabinetsPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>();
  const [surname, setSurname] = useState<string>();
  const [formType, setFormType] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: cabinets = [] } = useQuery<Cabinet[]>({
    queryKey: ['cabinets'],
    queryFn: () => api.get('/cabinets').then((r) => r.data),
  });
  const selected = cabinets.find((c) => c.id === selectedId) ?? cabinets[0];

  const { data: records, isFetching } = useQuery({
    queryKey: ['cabinet-records', selected?.id, surname, formType, status],
    enabled: !!selected,
    queryFn: () => {
      const params: any = { pageSize: 100 };
      if (surname) params.surname = surname;
      if (formType) params.formType = formType;
      if (status) params.status = status;
      return api.get<Paginated<Rec>>(`/cabinet/records/${selected!.id}`, { params }).then((r) => r.data);
    },
  });
  const rows: Rec[] = records?.data ?? [];

  const columns: ColumnsType<Rec> = [
    {
      title: 'LAB# / SP',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span>{r.labNumber ?? '—'}</span>
          <Space size={2} wrap>{(r.specimens ?? []).map((s) => <Tag key={s.id} style={{ marginInlineEnd: 2 }}>{s.type}</Tag>)}</Space>
        </Space>
      ),
    },
    {
      title: 'Patient',
      render: (_, r) => r.patient ? (
        <Space direction="vertical" size={0}>
          <span>{r.patient.firstName} {r.patient.lastName}</span>
          {r.patient.registrationNo && <Typography.Text type="secondary" style={{ fontSize: 12 }}>Reg {r.patient.registrationNo}</Typography.Text>}
        </Space>
      ) : '—',
    },
    {
      title: 'Client',
      render: (_, r) => r.client ? (
        <Space direction="vertical" size={0}>
          <span>{r.client.officeName || `${r.client.firstName} ${r.client.lastName}`}</span>
          {r.client.accountNo && <Typography.Text type="secondary" style={{ fontSize: 12 }}>AC# {r.client.accountNo}</Typography.Text>}
        </Space>
      ) : '—',
    },
    { title: 'Form', width: 90, render: (_, r) => (r.formType ? <Tag>{r.formType === 'Gynecology' ? 'GYN' : 'NON-GYN'}</Tag> : '—') },
    { title: 'Status', width: 110, render: (_, r) => <Tag color={STATUS_COLORS[r.status]}>{r.status}</Tag> },
    { title: 'Urgent', width: 80, render: (_, r) => (r.urgent ? <Tag color="red">Urgent</Tag> : '') },
    { title: 'Date', width: 110, render: (_, r) => new Date(r.specimenDate ?? r.createdAt).toLocaleDateString() },
  ];

  const folderName = (c: Cabinet) => c.label || c.client?.officeName || 'Untitled folder';

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {/* ---- Folder sidebar ---- */}
      <Card
        size="small"
        title="Folders"
        style={{ width: 260, flexShrink: 0 }}
        styles={{ body: { padding: 8 } }}
        extra={
          <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Add Folder
          </Button>
        }
      >
        {cabinets.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No folders yet" style={{ margin: '16px 0' }} />
        ) : (
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            {cabinets.map((c) => {
              const active = c.id === selected?.id;
              return (
                <button
                  key={c.id}
                  onClick={() => { setSelectedId(c.id); setSurname(undefined); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 'none',
                    padding: '8px 10px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                    background: active ? '#eaf0fe' : 'transparent',
                  }}
                >
                  <FolderFilled style={{ color: COLOR_HEX[c.color ?? 'blue'] ?? '#4f7df9', fontSize: 18 }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: active ? 600 : 400 }}>
                    {folderName(c)}
                  </span>
                </button>
              );
            })}
          </Space>
        )}
      </Card>

      {/* ---- Cabinet contents ---- */}
      <Card style={{ flex: 1, minWidth: 0 }}>
        {!selected ? (
          <Empty description="Select a folder, or add one to start filing" />
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <Space align="center">
                  <FolderFilled style={{ color: COLOR_HEX[selected.color ?? 'blue'], fontSize: 22 }} />
                  <Typography.Title level={4} style={{ margin: 0 }}>{folderName(selected)}</Typography.Title>
                </Space>
                <div style={{ marginTop: 4 }}>
                  <Space size={8} wrap>
                    {selected.identifier
                      ? <Tag color="geekblue" style={{ fontFamily: 'monospace' }}>{selected.identifier}</Tag>
                      : <Typography.Text type="secondary">Link a client to file their records here</Typography.Text>}
                    {selected.client?.accountNo && <Typography.Text type="secondary">AC# {selected.client.accountNo}</Typography.Text>}
                  </Space>
                </div>
              </div>
              <Space>
                <Select allowClear placeholder="Form Type" style={{ width: 150 }} value={formType} onChange={setFormType}
                  options={[{ value: 'Gynecology', label: 'Gynecology' }, { value: 'NonGynecology', label: 'Non-Gynecology' }]} />
                <Select allowClear placeholder="Status" style={{ width: 140 }} value={status} onChange={setStatus}
                  options={ALL_STATUSES.map((s) => ({ value: s, label: s }))} />
              </Space>
            </div>

            {/* A–Z surname index */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '16px 0' }}>
              <LetterButton label="..." active={!surname} onClick={() => setSurname(undefined)} />
              {AZ.map((l) => (
                <LetterButton key={l} label={l} active={surname === l} onClick={() => setSurname(l)} />
              ))}
            </div>

            <Table
              rowKey="id"
              size="middle"
              loading={isFetching}
              columns={columns}
              dataSource={rows}
              pagination={{ pageSize: 20, hideOnSinglePage: true }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={surname ? `No patients with surname “${surname}”` : 'No records filed here yet'} /> }}
            />
          </>
        )}
      </Card>

      <CabinetFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(c) => { qc.invalidateQueries({ queryKey: ['cabinets'] }); setSelectedId(c.id); message.success('Folder created'); }}
      />
    </div>
  );
}

function LetterButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        minWidth: 28, height: 28, padding: '0 6px', borderRadius: 8, cursor: 'pointer',
        border: '1px solid ' + (active ? '#4f7df9' : '#edeff2'),
        background: active ? '#4f7df9' : '#fff', color: active ? '#fff' : '#6b7280',
        fontWeight: active ? 600 : 500, fontSize: 12,
      }}
    >
      {label}
    </button>
  );
}

function CabinetFormModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (c: Cabinet) => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [color, setColor] = useState('blue');

  const save = useMutation({
    mutationFn: (values: any) => api.post('/cabinet/create', { label: values.label, color, clientId: values.clientId }).then((r) => r.data),
    onSuccess: (c: Cabinet) => { onCreated(c); form.resetFields(); setColor('blue'); onClose(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Could not create folder'),
  });

  return (
    <Modal
      title="Create Cabinet"
      open={open}
      onCancel={onClose}
      okText="Save"
      confirmLoading={save.isPending}
      onOk={() => form.validateFields().then((v) => save.mutate(v))}
      afterOpenChange={(o) => { if (o) { form.resetFields(); setColor('blue'); } }}
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item label="Label" name="label" rules={[{ required: true, message: 'Give the folder a name' }]}>
          <Input placeholder="e.g. Microlabs" />
        </Form.Item>

        <Form.Item label="Color">
          <Space size={10}>
            {COLORS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setColor(k)}
                aria-label={k}
                style={{
                  width: 26, height: 26, borderRadius: '50%', cursor: 'pointer', background: COLOR_HEX[k],
                  border: color === k ? '2px solid #1a1d21' : '2px solid transparent',
                  outline: color === k ? '2px solid #fff' : 'none', outlineOffset: -4,
                }}
              />
            ))}
          </Space>
        </Form.Item>

        <Form.Item label="Link Client" name="clientId">
          <ClientSelect placeholder="Search a client to link" />
        </Form.Item>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Linking a client to a cabinet organizes all the client&apos;s specimen records in one place.
        </Typography.Text>
      </Form>
    </Modal>
  );
}
