'use client';

import { useState } from 'react';
import { Alert, Button, Card, Input, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ClientFormDrawer, type ClientRecord } from '@/components/ClientFormDrawer';

export default function ClientsPage() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRecord | null>(null);

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['clients', page, pageSize, q],
    queryFn: () =>
      api
        .get<Paginated<ClientRecord>>('/clients', { params: { page, pageSize, q: q || undefined } })
        .then((r) => r.data),
  });

  const errorMessage =
    (error as any)?.code === 'ECONNABORTED'
      ? 'The request timed out. Please try again.'
      : (error as any)?.response?.data?.message ?? 'Could not load clients. Please try again.';

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (c: ClientRecord) => {
    setEditing(c);
    setDrawerOpen(true);
  };

  const columns: ColumnsType<ClientRecord> = [
    { title: 'Name', render: (_, r) => `${r.firstName} ${r.lastName}` },
    { title: 'Office', dataIndex: 'officeName' },
    { title: 'Type', render: (_, r) => (r.clientType ? r.clientType.type : '—') },
    { title: 'Phone', dataIndex: 'phoneNumber' },
    { title: 'Email', dataIndex: 'email' },
    {
      title: 'Status',
      width: 140,
      render: (_, r) => (
        <Space size={4}>
          {r.blocked ? <Tag color="red">Blocked</Tag> : r.active ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag>}
          {r.portalUsers && r.portalUsers.length > 0 && <Tag color="blue">Portal</Tag>}
        </Space>
      ),
    },
    ...(can('client:change')
      ? [
          {
            title: '',
            width: 90,
            render: (_: unknown, r: ClientRecord) => (
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>
                Edit
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <Card
      title="Clients"
      extra={
        <Space>
          <Input.Search
            allowClear
            placeholder="Search name, office, email, phone"
            style={{ width: 280 }}
            onSearch={(v) => {
              setQ(v);
              setPage(1);
            }}
          />
          {can('client:create') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              New Client
            </Button>
          )}
        </Space>
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

      <Table<ClientRecord>
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

      <ClientFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} client={editing} />
    </Card>
  );
}
