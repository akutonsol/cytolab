'use client';

import { useState } from 'react';
import { Alert, Button, Card, Modal, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ExperimentOutlined, PlusOutlined, ReloadOutlined, WomanOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { RecordFormDrawer } from '@/components/RecordFormDrawer';
import type { FormType } from '@/lib/specimen-types';

interface RecordRow {
  id: string;
  labNumber?: string | null;
  identifier: string;
  formType?: string | null;
  status: string;
  urgent: boolean;
  patient?: { firstName: string; lastName: string; registrationNo: string };
  client?: { firstName: string; lastName: string; officeName?: string | null; accountNo?: string | null };
  specimens: { id: string }[];
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  Pending: 'default', Submitted: 'cyan', Processing: 'blue', Partial: 'gold',
  Completed: 'green', Approved: 'success', Billed: 'purple', Paid: 'green',
  OnHold: 'orange', Disabled: 'default', Failed: 'red', Viewed: 'geekblue',
};

export default function RecordsPage() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [chooseOpen, setChooseOpen] = useState(false);
  const [formType, setFormType] = useState<FormType | null>(null);

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['records', page, pageSize],
    queryFn: () =>
      api.get<Paginated<RecordRow>>('/specimens', { params: { page, pageSize } }).then((r) => r.data),
  });

  const errorMessage =
    (error as any)?.code === 'ECONNABORTED'
      ? 'The request timed out. Please try again.'
      : (error as any)?.response?.data?.message ?? 'Could not load records. Please try again.';

  const chooseForm = (ft: FormType) => {
    setFormType(ft);
    setChooseOpen(false);
  };

  const columns: ColumnsType<RecordRow> = [
    { title: 'Lab No.', dataIndex: 'labNumber', width: 130, render: (v?: string) => v ?? '—' },
    { title: 'Form', dataIndex: 'formType', width: 110, render: (v?: string) => (v ? <Tag>{v === 'Gynecology' ? 'GYN' : 'NON-GYN'}</Tag> : '—') },
    { title: 'Patient', render: (_, r) => (r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : '—') },
    {
      title: 'Client',
      render: (_, r) =>
        r.client ? (r.client.officeName || `${r.client.firstName} ${r.client.lastName}`) : '—',
    },
    { title: 'Specimens', width: 100, render: (_, r) => r.specimens?.length ?? 0 },
    { title: 'Status', width: 110, dataIndex: 'status', render: (s: string) => <Tag color={STATUS_COLORS[s]}>{s}</Tag> },
    { title: 'Urgent', width: 90, dataIndex: 'urgent', render: (u: boolean) => (u ? <Tag color="red">Urgent</Tag> : '') },
    { title: 'Created', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleDateString() },
  ];

  return (
    <Card
      title="Records"
      extra={
        can('record:create') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setChooseOpen(true)}>
            New Record
          </Button>
        )
      }
    >
      {isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Failed to load"
          description={errorMessage}
          action={<Button size="small" icon={<ReloadOutlined />} onClick={() => refetch()}>Retry</Button>}
        />
      )}

      <Table<RecordRow>
        rowKey="id"
        columns={columns}
        dataSource={data?.data ?? []}
        loading={isFetching && !isError}
        size="middle"
        scroll={{ x: true }}
        pagination={{
          current: page, pageSize, total: data?.total ?? 0,
          showSizeChanger: true, showTotal: (t) => `${t} total`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
        }}
      />

      {/* Choose Form step (up front) */}
      <Modal title="Choose Form" open={chooseOpen} onCancel={() => setChooseOpen(false)} footer={null} width={460}>
        <Space size="large" style={{ width: '100%', justifyContent: 'center', padding: '16px 0' }}>
          <Button size="large" icon={<WomanOutlined />} style={{ height: 90, width: 180 }} onClick={() => chooseForm('Gynecology')}>
            Gynecology
          </Button>
          <Button size="large" icon={<ExperimentOutlined />} style={{ height: 90, width: 180 }} onClick={() => chooseForm('NonGynecology')}>
            Non-Gynecology
          </Button>
        </Space>
      </Modal>

      {formType && (
        <RecordFormDrawer open={!!formType} onClose={() => setFormType(null)} formType={formType} />
      )}
    </Card>
  );
}
