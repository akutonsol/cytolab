'use client';

import { useState } from 'react';
import { App, Button, Card, Descriptions, Dropdown, Modal, Segmented, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { AuditOutlined, MoreOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { AuthorizationModal } from '@/components/AuthorizationModal';

interface Rec {
  id: string;
  labNumber?: string | null;
  formType?: string | null;
  status: string;
  urgent: boolean;
  specimenDate?: string | null;
  createdAt: string;
  patient?: { firstName: string; lastName: string; registrationNo?: string | null } | null;
  client?: { firstName: string; lastName: string; officeName?: string | null; accountNo?: string | null } | null;
  specimens?: Array<{ id: string; type: string }>;
}

type Tab = 'awaiting' | 'approved';

// Awaiting Approval = Resulted (a sheet exists, not yet authorized); Approved =
// signed off. Both are read straight from the record status filter.
const TAB_STATUS: Record<Tab, string> = { awaiting: 'Resulted', approved: 'Approved' };

export default function AuthorizerPage() {
  const [tab, setTab] = useState<Tab>('awaiting');
  const [authorizeRec, setAuthorizeRec] = useState<Rec | null>(null);
  const [viewRec, setViewRec] = useState<Rec | null>(null);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['records', 'authorizer', tab],
    queryFn: () =>
      api
        .get<Paginated<Rec>>('/specimens', { params: { pageSize: 100, status: TAB_STATUS[tab] } })
        .then((r) => r.data),
  });
  const rows: Rec[] = data?.data ?? [];

  const patientName = (r: Rec) => (r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : '—');
  const clientName = (r: Rec) =>
    r.client ? r.client.officeName || `${r.client.firstName} ${r.client.lastName}` : '—';

  const columns: ColumnsType<Rec> = [
    {
      title: 'Lab No.',
      dataIndex: 'labNumber',
      width: 140,
      render: (v, r) => (
        <Space>
          <Typography.Text strong>{v ?? '—'}</Typography.Text>
          {r.urgent && <Tag color="red">Urgent</Tag>}
        </Space>
      ),
    },
    { title: 'Patient', render: (_, r) => patientName(r) },
    { title: 'Client', render: (_, r) => clientName(r) },
    {
      title: 'Form',
      width: 90,
      render: (_, r) => (r.formType ? <Tag>{r.formType === 'Gynecology' ? 'GYN' : 'NON-GYN'}</Tag> : '—'),
    },
    {
      title: 'Status',
      width: 110,
      render: (_, r) => <Tag color={tab === 'approved' ? 'success' : 'geekblue'}>{r.status}</Tag>,
    },
    {
      title: '',
      width: 190,
      align: 'right',
      render: (_, r) => (
        <Space>
          <Button type="primary" size="small" icon={<AuditOutlined />} onClick={() => setAuthorizeRec(r)}>
            {tab === 'approved' ? 'Review' : 'Authorize'}
          </Button>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'view', label: 'View Details', onClick: () => setViewRec(r) },
                { key: 'sheet', label: 'Result Sheet', onClick: () => setAuthorizeRec(r) },
              ],
            }}
          >
            <Button size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="Authorizer Workspace"
      extra={
        <Space>
          <Segmented
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            options={[
              { label: 'Awaiting Approval', value: 'awaiting' },
              { label: 'Approved', value: 'approved' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
        </Space>
      }
    >
      <Table
        rowKey="id"
        size="small"
        loading={isFetching}
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
      />

      <AuthorizationModal open={!!authorizeRec} onClose={() => setAuthorizeRec(null)} record={authorizeRec} />

      <Modal title="Record details" open={!!viewRec} footer={null} onCancel={() => setViewRec(null)} width={560}>
        {viewRec && (
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="Lab No.">{viewRec.labNumber ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Status">{viewRec.status}</Descriptions.Item>
            <Descriptions.Item label="Form">{viewRec.formType ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Patient">{patientName(viewRec)}</Descriptions.Item>
            <Descriptions.Item label="Client">{clientName(viewRec)}</Descriptions.Item>
            <Descriptions.Item label="Specimens">
              <Space size={[4, 4]} wrap>
                {(viewRec.specimens ?? []).map((s) => (
                  <Tag key={s.id}>{s.type}</Tag>
                ))}
                {(viewRec.specimens ?? []).length === 0 && '—'}
              </Space>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </Card>
  );
}
