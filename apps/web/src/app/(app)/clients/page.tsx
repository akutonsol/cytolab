'use client';

import { Form, Input } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api, type Paginated } from '@/lib/api';
import { CrudTablePage } from '@/components/CrudTablePage';
import { RemoteSelect } from '@/components/RemoteSelect';

interface Client {
  id: string;
  firstName: string;
  lastName: string;
  officeName?: string;
  phoneNumber?: string;
  clientType?: { name: string };
  createdAt: string;
}

const columns: ColumnsType<Client> = [
  { title: 'Name', render: (_, r) => `${r.firstName} ${r.lastName}` },
  { title: 'Office', dataIndex: 'officeName' },
  { title: 'Phone', dataIndex: 'phoneNumber' },
  { title: 'Type', render: (_, r) => r.clientType?.name ?? '—' },
  { title: 'Created', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleDateString() },
];

export default function ClientsPage() {
  return (
    <CrudTablePage<Client>
      title="Clients"
      resourceKey="clients"
      mode="server"
      searchable
      columns={columns}
      fetchList={async ({ page, pageSize, q }) => {
        const res = await api.get<Paginated<Client>>('/clients', { params: { page, pageSize, q } });
        return { rows: res.data.data, total: res.data.total };
      }}
      create={{
        title: 'New Client',
        permission: 'client:create',
        submit: (values) => api.post('/client', values),
        fields: (
          <>
            <Form.Item name="firstName" label="First name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="lastName" label="Last name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="officeName" label="Office / clinic name">
              <Input />
            </Form.Item>
            <Form.Item name="phoneNumber" label="Phone">
              <Input />
            </Form.Item>
            <Form.Item name="mobileNumber" label="Mobile">
              <Input />
            </Form.Item>
            <Form.Item name="clientTypeId" label="Client type">
              <RemoteSelect
                allowClear
                endpoint="/client-types"
                queryKey="client-types"
                transform={(data: any[]) => data.map((t) => ({ label: t.name, value: t.id }))}
              />
            </Form.Item>
          </>
        ),
      }}
    />
  );
}
