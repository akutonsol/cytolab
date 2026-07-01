'use client';

import { useState } from 'react';
import { Alert, App, Button, Card, Input, Popconfirm, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { RoleFormDrawer, type RoleRecord } from '@/components/RoleFormDrawer';

export default function RolesPage() {
  const { can } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<RoleRecord | null>(null);

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<RoleRecord[]>('/roles').then((r) => r.data),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/roles/${id}`),
    onSuccess: () => {
      message.success('Role deleted');
      qc.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Delete failed'),
  });

  const rows = (data ?? []).filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()));
  const errorMessage =
    (error as any)?.code === 'ECONNABORTED'
      ? 'The request timed out. Please try again.'
      : (error as any)?.response?.data?.message ?? 'Could not load roles. Please try again.';

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (r: RoleRecord) => {
    setEditing(r);
    setDrawerOpen(true);
  };

  const columns: ColumnsType<RoleRecord> = [
    { title: 'Name', dataIndex: 'name' },
    { title: 'Description', dataIndex: 'description', render: (v?: string) => v ?? '—' },
    { title: 'Scope', dataIndex: 'scope', width: 110, render: (v: string) => <Tag>{v}</Tag> },
    {
      title: 'Super role',
      width: 110,
      render: (_, r) => (r.isSuperRole ? <Tag color="gold">Yes</Tag> : <Tag>No</Tag>),
    },
    { title: 'Permissions', width: 110, render: (_, r) => (r.isSuperRole ? 'All (bypass)' : r.permissions?.length ?? 0) },
    ...(can('permission:change') || can('permission:delete')
      ? [
          {
            title: '',
            width: 130,
            render: (_: unknown, r: RoleRecord) => (
              <Space>
                {can('permission:change') && (
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>
                    Edit
                  </Button>
                )}
                {can('permission:delete') && (
                  <Popconfirm title="Delete this role?" onConfirm={() => del.mutate(r.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <Card
      title="Roles &amp; Permissions"
      extra={
        <Space>
          <Input.Search allowClear placeholder="Search roles" style={{ width: 220 }} onSearch={setQ} />
          {can('permission:create') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              New Role
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

      <Table<RoleRecord>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={isFetching && !isError}
        size="middle"
        pagination={{ pageSize: 10, showTotal: (t) => `${t} total` }}
      />

      <RoleFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} role={editing} />
    </Card>
  );
}
