'use client';

import { useState } from 'react';
import { Alert, Button, Card, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { RequisitionFormDrawer } from '@/components/RequisitionFormDrawer';

interface RequisitionLine {
  id: string;
  isCompleted: boolean;
}
interface Requisition {
  id: string;
  referenceNo?: string | null;
  status: string;
  amount: number; // cents
  client?: { firstName: string; lastName: string; officeName?: string | null; accountNo?: string | null } | null;
  dateReceived?: string | null;
  lines: RequisitionLine[];
  _count?: { lines: number };
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  Pending: 'default',
  Active: 'blue',
  Partial: 'orange',
  Completed: 'green',
  Disabled: 'default',
};

const money = (cents?: number) => `$${((Number(cents) || 0) / 100).toFixed(2)}`;

export default function RequisitionsPage() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['requisitions', page, pageSize],
    queryFn: () =>
      api.get<Paginated<Requisition>>('/requisitions', { params: { page, pageSize } }).then((r) => r.data),
  });

  const errorMessage =
    (error as any)?.code === 'ECONNABORTED'
      ? 'The request timed out. Please try again.'
      : (error as any)?.response?.data?.message ?? 'Could not load requisitions. Please try again.';

  const columns: ColumnsType<Requisition> = [
    { title: 'Ref#', dataIndex: 'referenceNo', width: 90, render: (v?: string) => v ?? '—' },
    {
      title: 'Client',
      render: (_, r) =>
        r.client ? (
          <Space direction="vertical" size={0}>
            <span>{r.client.officeName || `${r.client.firstName} ${r.client.lastName}`}</span>
            {r.client.accountNo && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                AC# {r.client.accountNo}
              </Typography.Text>
            )}
          </Space>
        ) : (
          '—'
        ),
    },
    {
      title: 'Ordered',
      width: 90,
      render: (_, r) => r._count?.lines ?? r.lines?.length ?? 0,
    },
    {
      title: 'Fulfilled',
      width: 90,
      render: (_, r) => (r.lines ?? []).filter((l) => l.isCompleted).length,
    },
    { title: 'Amount', width: 110, render: (_, r) => money(r.amount) },
    {
      title: 'Status',
      width: 120,
      dataIndex: 'status',
      render: (s: string) => <Tag color={STATUS_COLORS[s] ?? 'default'}>{s.toUpperCase()}</Tag>,
    },
    {
      title: 'Received',
      dataIndex: 'dateReceived',
      render: (v?: string) => (v ? new Date(v).toLocaleDateString() : '—'),
    },
  ];

  return (
    <Card
      title="Requisitions"
      extra={
        can('requisition:create') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setDrawerOpen(true)}>
            New Requisition
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
          action={
            <Button size="small" icon={<ReloadOutlined />} onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      )}

      <Table<Requisition>
        rowKey="id"
        columns={columns}
        dataSource={data?.data ?? []}
        loading={isFetching && !isError}
        size="middle"
        scroll={{ x: true }}
        pagination={{
          current: page,
          pageSize,
          total: data?.total ?? 0,
          showSizeChanger: true,
          showTotal: (t) => `${t} total`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />

      <RequisitionFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </Card>
  );
}
