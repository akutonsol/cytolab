'use client';

import { useState } from 'react';
import { Alert, Button, Card, Input, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { deriveAge } from '@/lib/age';
import { PatientFormDrawer, type PatientRecord } from '@/components/PatientFormDrawer';

export default function PatientsPage() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<PatientRecord | null>(null);

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['patients', page, pageSize, q],
    queryFn: () =>
      api
        .get<Paginated<PatientRecord>>('/patients', { params: { page, pageSize, q: q || undefined } })
        .then((r) => r.data),
  });

  const errorMessage =
    (error as any)?.code === 'ECONNABORTED'
      ? 'The request timed out. Please try again.'
      : (error as any)?.response?.data?.message ?? 'Could not load patients. Please try again.';

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (p: PatientRecord) => {
    setEditing(p);
    setDrawerOpen(true);
  };

  const columns: ColumnsType<PatientRecord> = [
    { title: 'Reg. No', dataIndex: 'registrationNo', width: 130 },
    { title: 'Name', render: (_, r) => [r.firstName, r.middleName, r.lastName].filter(Boolean).join(' ') },
    { title: 'Gender', dataIndex: 'gender', width: 90 },
    {
      title: 'Age',
      width: 70,
      render: (_, r) => {
        const a = deriveAge(r.dateOfBirth);
        return a != null ? a : '—';
      },
    },
    { title: 'Phone', dataIndex: 'phoneNumber' },
    { title: 'Email', dataIndex: 'email' },
    {
      title: 'Client',
      render: (_, r) => (r.client ? `${r.client.firstName} ${r.client.lastName}` : '—'),
    },
    ...(can('patient:change')
      ? [
          {
            title: '',
            width: 90,
            render: (_: unknown, r: PatientRecord) => (
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
      title="Patients"
      extra={
        <Space>
          <Input.Search
            allowClear
            placeholder="Search name, reg no, email, phone"
            style={{ width: 280 }}
            onSearch={(v) => {
              setQ(v);
              setPage(1);
            }}
          />
          {can('patient:create') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              New Patient
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

      <Table<PatientRecord>
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

      <PatientFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} patient={editing} />
    </Card>
  );
}
