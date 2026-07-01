'use client';

import { useMemo, useState } from 'react';
import {
  Alert, App, Button, Card, Collapse, Descriptions, Dropdown, Modal, Segmented, Select, Space, Switch, Table, Tag, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, MoreOutlined, ReloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { ResultSheetModal } from '@/components/ResultSheetModal';

interface Rec {
  id: string;
  labNumber?: string | null;
  formType?: string | null;
  status: string;
  urgent: boolean;
  specimenDate?: string | null;
  createdAt: string;
  patient?: { firstName: string; lastName: string; registrationNo?: string | null } | null;
  client?: { id?: string; firstName: string; lastName: string; officeName?: string | null; accountNo?: string | null } | null;
  specimens?: Array<{ id: string; type: string }>;
  resultSheets?: Array<{ id: string; authorized: boolean }>;
}

const STATUS_COLORS: Record<string, string> = {
  Pending: 'default', Submitted: 'cyan', Processing: 'blue', Partial: 'gold', Completed: 'green',
  Resulted: 'geekblue', Approved: 'success', Billed: 'purple', Paid: 'green', OnHold: 'orange',
  Disabled: 'default', Failed: 'red', Viewed: 'lime',
};
const LOCKED = ['Completed', 'Resulted', 'Approved', 'Billed', 'Paid', 'Viewed'];
const ALL_STATUSES = Object.keys(STATUS_COLORS);
// Frontend mirror of the pre-Completed transitions (Change Status is disabled once locked).
const NEXT_STATUS: Record<string, string[]> = {
  Pending: ['Submitted', 'OnHold', 'Disabled'],
  Submitted: ['Processing', 'OnHold', 'Disabled'],
  Processing: ['Partial', 'Completed', 'OnHold', 'Disabled', 'Failed'],
  Partial: ['Completed', 'OnHold', 'Disabled', 'Failed'],
  OnHold: ['Submitted', 'Processing', 'Disabled'],
};

type Tab = 'overview' | 'requisition' | 'recent' | 'authorized';

export default function SpecimenOverviewPage() {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [formType, setFormType] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [groupByClient, setGroupByClient] = useState(false);
  const [sheetFor, setSheetFor] = useState<Rec | null>(null);
  const [viewRec, setViewRec] = useState<Rec | null>(null);
  const [statusRec, setStatusRec] = useState<Rec | null>(null);
  const [nextStatus, setNextStatus] = useState<string>();

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['records', tab, formType, status],
    queryFn: () => {
      if (tab === 'recent') return api.get('/specimens/recent').then((r) => r.data);
      const params: any = { pageSize: 100 };
      if (formType) params.formType = formType;
      if (status) params.status = status;
      if (tab === 'authorized') params.authorized = true;
      return api.get<Paginated<Rec>>('/specimens', { params }).then((r) => r.data);
    },
  });
  const rows: Rec[] = data?.data ?? [];

  const changeStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) => api.patch(`/specimen/status/${v.id}`, { status: v.status }),
    onSuccess: () => { message.success('Status updated'); qc.invalidateQueries({ queryKey: ['records'] }); setStatusRec(null); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Failed'),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/specimen/delete/${id}`),
    onSuccess: () => { message.success('Record deleted'); qc.invalidateQueries({ queryKey: ['records'] }); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Delete failed'),
  });

  const isLocked = (r: Rec) => LOCKED.includes(r.status);

  const confirmEdit = (r: Rec) =>
    modal.confirm({
      title: 'Edit this record?',
      content: `Editing ${r.labNumber ?? 'this record'} changes clinical form data.`,
      okText: 'Edit',
      onOk: () => message.info('Record editor opens here (uses the record form).'),
    });
  const confirmDelete = (r: Rec) =>
    modal.confirm({
      title: 'Delete this record?',
      content: `${r.labNumber ?? 'This record'} will be permanently deleted.`,
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: () => del.mutate(r.id),
    });

  const rowMenu = (r: Rec) => ({
    items: [
      { key: 'view', label: 'View Details', onClick: () => setViewRec(r) },
      { key: 'status', label: 'Change Status', disabled: isLocked(r), onClick: () => { setStatusRec(r); setNextStatus(undefined); } },
      { key: 'sheet', label: 'Add Result Sheet', onClick: () => setSheetFor(r) },
      { key: 'file', label: 'Attach File', onClick: () => message.info('File upload arrives with Phase 6 file storage.') },
      { type: 'divider' as const },
      { key: 'delete', label: 'Delete', danger: true, disabled: isLocked(r), onClick: () => confirmDelete(r) },
    ],
  });

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
    {
      title: '', width: 90,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} disabled={isLocked(r)} onClick={() => confirmEdit(r)} />
          <Dropdown menu={rowMenu(r)} trigger={['click']}><Button size="small" icon={<MoreOutlined />} /></Dropdown>
        </Space>
      ),
    },
  ];

  const urgentCount = rows.filter((r) => r.urgent).length;
  const clientGroups = useMemo(() => {
    const map = new Map<string, Rec[]>();
    for (const r of rows) {
      const key = r.client ? (r.client.officeName || `${r.client.firstName} ${r.client.lastName}`) : 'Unassigned';
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return Array.from(map.entries());
  }, [rows]);

  return (
    <Card
      title="Specimen Overview"
      extra={
        <Space>
          {urgentCount > 0 && <Tag color="red">{urgentCount} urgent</Tag>}
          <span>Client folders</span>
          <Switch checked={groupByClient} onChange={setGroupByClient} />
        </Space>
      }
    >
      <Space style={{ marginBottom: 12 }} wrap>
        <Segmented
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            { label: 'Overview', value: 'overview' },
            { label: 'Requisition', value: 'requisition' },
            { label: 'Recent', value: 'recent' },
            { label: 'Authorized', value: 'authorized' },
          ]}
        />
        <Select allowClear placeholder="Form Type" style={{ width: 160 }} value={formType} onChange={setFormType}
          options={[{ label: 'Gynecology', value: 'Gynecology' }, { label: 'Non-Gynecology', value: 'NonGynecology' }]} />
        <Select allowClear showSearch placeholder="Status" style={{ width: 160 }} value={status} onChange={setStatus}
          options={ALL_STATUSES.map((s) => ({ label: s, value: s }))} />
      </Space>

      {isError && (
        <Alert type="error" showIcon style={{ marginBottom: 16 }} message="Failed to load"
          description={(error as any)?.response?.data?.message ?? 'Could not load specimens.'}
          action={<Button size="small" icon={<ReloadOutlined />} onClick={() => refetch()}>Retry</Button>} />
      )}

      {groupByClient ? (
        <Collapse
          items={clientGroups.map(([name, recs]) => ({
            key: name,
            label: <Space><b>{name}</b><Tag>{recs.length}</Tag></Space>,
            children: <Table<Rec> rowKey="id" columns={columns} dataSource={recs} size="small" pagination={false} />,
          }))}
        />
      ) : (
        <Table<Rec> rowKey="id" columns={columns} dataSource={rows} loading={isFetching && !isError} size="middle" scroll={{ x: true }}
          pagination={{ pageSize: 20, showTotal: (t) => `${t} total` }} />
      )}

      <ResultSheetModal open={!!sheetFor} onClose={() => setSheetFor(null)} record={sheetFor} />

      <Modal title="Record details" open={!!viewRec} footer={null} onCancel={() => setViewRec(null)} width={620}>
        {viewRec && (
          <Descriptions size="small" column={2} bordered>
            <Descriptions.Item label="Lab No.">{viewRec.labNumber ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Status"><Tag color={STATUS_COLORS[viewRec.status]}>{viewRec.status}</Tag></Descriptions.Item>
            <Descriptions.Item label="Form">{viewRec.formType ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Urgent">{viewRec.urgent ? 'Yes' : 'No'}</Descriptions.Item>
            <Descriptions.Item label="Patient" span={2}>{viewRec.patient ? `${viewRec.patient.firstName} ${viewRec.patient.lastName}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Client" span={2}>{viewRec.client ? (viewRec.client.officeName || `${viewRec.client.firstName} ${viewRec.client.lastName}`) : '—'}</Descriptions.Item>
            <Descriptions.Item label="Specimens" span={2}><Space wrap>{(viewRec.specimens ?? []).map((s) => <Tag key={s.id}>{s.type}</Tag>)}</Space></Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      <Modal
        title={`Change Status — ${statusRec?.labNumber ?? ''}`}
        open={!!statusRec}
        onCancel={() => setStatusRec(null)}
        okText="Update"
        okButtonProps={{ disabled: !nextStatus, loading: changeStatus.isPending }}
        onOk={() => statusRec && nextStatus && changeStatus.mutate({ id: statusRec.id, status: nextStatus })}
      >
        {statusRec && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <span>Current: <Tag color={STATUS_COLORS[statusRec.status]}>{statusRec.status}</Tag></span>
            <Select
              style={{ width: '100%' }}
              placeholder="Next status"
              value={nextStatus}
              onChange={setNextStatus}
              options={(NEXT_STATUS[statusRec.status] ?? []).map((s) => ({ label: s, value: s }))}
            />
          </Space>
        )}
      </Modal>
    </Card>
  );
}
