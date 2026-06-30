'use client';

import { Form, Input } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api } from '@/lib/api';
import { CrudTablePage } from '@/components/CrudTablePage';
import { RemoteSelect } from '@/components/RemoteSelect';

interface RoleRow {
  id: string;
  name: string;
  description?: string;
  permissions: { permission: { code: string } }[];
}

const columns: ColumnsType<RoleRow> = [
  { title: 'Name', dataIndex: 'name' },
  { title: 'Description', dataIndex: 'description', render: (v?: string) => v ?? '—' },
  { title: 'Permissions', render: (_, r) => r.permissions?.length ?? 0 },
];

export default function RolesPage() {
  return (
    <CrudTablePage<RoleRow>
      title="Roles"
      resourceKey="roles"
      mode="client"
      searchable
      columns={columns}
      fetchList={async () => {
        const res = await api.get<RoleRow[]>('/roles');
        return { rows: res.data, total: res.data.length };
      }}
      create={{
        title: 'New Role',
        permission: 'permission:create',
        submit: (values) => api.post('/roles', values),
        fields: (
          <>
            <Form.Item name="name" label="Name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="description" label="Description">
              <Input />
            </Form.Item>
            <Form.Item name="permissionIds" label="Permissions">
              <RemoteSelect
                mode="multiple"
                endpoint="/permissions"
                queryKey="permissions-options"
                transform={(data: any[]) => data.map((p) => ({ label: p.code, value: p.id }))}
              />
            </Form.Item>
          </>
        ),
      }}
    />
  );
}
