'use client';

import { useState } from 'react';
import { App, Button, Card, Drawer, Form, Input, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';

export interface ListResult<T> {
  rows: T[];
  total: number;
}

interface CreateConfig {
  title: string;
  permission?: string;
  width?: number;
  /** Form.Item fields. Rendered inside a Form whose instance is provided via `form`. */
  fields: React.ReactNode;
  initialValues?: Record<string, unknown>;
  submit: (values: any) => Promise<unknown>;
}

interface Props<T> {
  title: string;
  /** React Query cache key root; invalidated after a create. */
  resourceKey: string;
  columns: ColumnsType<T>;
  /** 'server' = API paginates (page/pageSize/q passed through); 'client' = fetch all, table paginates. */
  mode: 'server' | 'client';
  fetchList: (params: { page: number; pageSize: number; q?: string }) => Promise<ListResult<T>>;
  rowKey?: string;
  searchable?: boolean;
  create?: CreateConfig;
}

export function CrudTablePage<T extends Record<string, any>>({
  title,
  resourceKey,
  columns,
  mode,
  fetchList,
  rowKey = 'id',
  searchable,
  create,
}: Props<T>) {
  const { can } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data, isFetching } = useQuery({
    queryKey: mode === 'server' ? [resourceKey, page, pageSize, q] : [resourceKey],
    queryFn: () =>
      fetchList(mode === 'server' ? { page, pageSize, q: q || undefined } : { page: 1, pageSize: 1000 }),
  });

  const rows = data?.rows ?? [];
  // Client mode filters in-memory; server mode already filtered via `q`.
  const dataSource =
    mode === 'client' && q
      ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q.toLowerCase()))
      : rows;

  const createMut = useMutation({
    mutationFn: (values: any) => create!.submit(values),
    onSuccess: () => {
      message.success(`${create!.title} created`);
      setDrawerOpen(false);
      form.resetFields();
      qc.invalidateQueries({ queryKey: [resourceKey] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Create failed'),
  });

  const showCreate = !!create && can(create.permission);

  return (
    <Card
      title={title}
      extra={
        <Space>
          {searchable && (
            <Input.Search
              allowClear
              placeholder="Search"
              style={{ width: 240 }}
              onSearch={(v) => {
                setQ(v);
                setPage(1);
              }}
            />
          )}
          {showCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setDrawerOpen(true)}>
              New
            </Button>
          )}
        </Space>
      }
    >
      <Table<T>
        rowKey={rowKey}
        columns={columns}
        dataSource={dataSource}
        loading={isFetching}
        size="middle"
        scroll={{ x: true }}
        pagination={
          mode === 'server'
            ? {
                current: page,
                pageSize,
                total: data?.total ?? 0,
                showSizeChanger: true,
                showTotal: (t) => `${t} total`,
                onChange: (p, ps) => {
                  setPage(p);
                  setPageSize(ps);
                },
              }
            : { pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} total` }
        }
      />

      {create && (
        <Drawer
          title={create.title}
          width={create.width ?? 460}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          destroyOnClose
          extra={
            <Space>
              <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
              <Button type="primary" loading={createMut.isPending} onClick={() => form.submit()}>
                Create
              </Button>
            </Space>
          }
        >
          <Form
            layout="vertical"
            form={form}
            initialValues={create.initialValues}
            onFinish={(values) => createMut.mutate(values)}
          >
            {create.fields}
          </Form>
        </Drawer>
      )}
    </Card>
  );
}
