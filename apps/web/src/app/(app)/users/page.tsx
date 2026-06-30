'use client';

import { Form, Input, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api } from '@/lib/api';
import { CrudTablePage } from '@/components/CrudTablePage';
import { RemoteSelect } from '@/components/RemoteSelect';

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  roles: { id: string; name: string }[];
  createdAt: string;
}

const columns: ColumnsType<UserRow> = [
  { title: 'Email', dataIndex: 'email' },
  { title: 'Name', render: (_, r) => `${r.firstName} ${r.lastName}` },
  {
    title: 'Roles',
    render: (_, r) => (r.roles?.length ? r.roles.map((role) => <Tag key={role.id}>{role.name}</Tag>) : '—'),
  },
  {
    title: 'Active',
    dataIndex: 'isActive',
    render: (a: boolean) => <Tag color={a ? 'green' : 'red'}>{a ? 'Active' : 'Disabled'}</Tag>,
  },
  { title: 'Created', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleDateString() },
];

export default function UsersPage() {
  return (
    <CrudTablePage<UserRow>
      title="Users"
      resourceKey="users"
      mode="client"
      searchable
      columns={columns}
      fetchList={async () => {
        const res = await api.get<UserRow[]>('/users');
        return { rows: res.data, total: res.data.length };
      }}
      create={{
        title: 'New User',
        permission: 'user:create',
        submit: (values) => api.post('/users', values),
        fields: (
          <>
            <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="password" label="Password" rules={[{ required: true, min: 8 }]}>
              <Input.Password />
            </Form.Item>
            <Form.Item name="firstName" label="First name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="lastName" label="Last name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="roleIds" label="Roles">
              <RemoteSelect
                mode="multiple"
                endpoint="/roles"
                queryKey="roles-options"
                transform={(data: any[]) => data.map((r) => ({ label: r.name, value: r.id }))}
              />
            </Form.Item>
          </>
        ),
      }}
    />
  );
}
