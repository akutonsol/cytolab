'use client';

import { Button, Checkbox, DatePicker, Form, Input, InputNumber, Space, Tag } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { api, type Paginated } from '@/lib/api';
import { CrudTablePage } from '@/components/CrudTablePage';
import { RemoteSelect } from '@/components/RemoteSelect';

interface Requisition {
  id: string;
  status: string;
  amount: number;
  client?: { firstName: string; lastName: string; officeName?: string };
  dateReceived?: string;
  lines: { id: string }[];
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  Pending: 'gold',
  Active: 'blue',
  Completed: 'green',
  Disabled: 'default',
};

const columns: ColumnsType<Requisition> = [
  { title: 'Ref', dataIndex: 'id', render: (v: string) => v.slice(0, 8) },
  { title: 'Status', dataIndex: 'status', render: (s: string) => <Tag color={STATUS_COLORS[s]}>{s}</Tag> },
  {
    title: 'Client',
    render: (_, r) => (r.client ? r.client.officeName || `${r.client.firstName} ${r.client.lastName}` : '—'),
  },
  { title: 'Lines', render: (_, r) => r.lines?.length ?? 0 },
  { title: 'Amount', dataIndex: 'amount' },
  {
    title: 'Received',
    dataIndex: 'dateReceived',
    render: (v?: string) => (v ? new Date(v).toLocaleDateString() : '—'),
  },
  { title: 'Created', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleDateString() },
];

export default function RequisitionsPage() {
  return (
    <CrudTablePage<Requisition>
      title="Requisitions"
      resourceKey="requisitions"
      mode="server"
      columns={columns}
      fetchList={async ({ page, pageSize }) => {
        const res = await api.get<Paginated<Requisition>>('/requisitions', { params: { page, pageSize } });
        return { rows: res.data.data, total: res.data.total };
      }}
      create={{
        title: 'New Requisition',
        permission: 'requisition:create',
        width: 560,
        submit: (values) =>
          api.post('/requisition/create', {
            ...values,
            dateReceived: values.dateReceived ? values.dateReceived.toISOString() : undefined,
          }),
        fields: (
          <>
            <Form.Item name="clientId" label="Client">
              <RemoteSelect
                allowClear
                endpoint="/clients?pageSize=200"
                queryKey="clients-options"
                transform={(data: any) =>
                  data.data.map((c: any) => ({
                    label: c.officeName || `${c.firstName} ${c.lastName}`,
                    value: c.id,
                  }))
                }
              />
            </Form.Item>
            <Space size="large">
              <Form.Item name="amount" label="Amount">
                <InputNumber min={0} />
              </Form.Item>
              <Form.Item name="dateReceived" label="Date received">
                <DatePicker />
              </Form.Item>
            </Space>

            <Form.Item label="Lines">
              <Form.List name="lines">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                        <Form.Item
                          name={[field.name, 'description']}
                          rules={[{ required: true, message: 'Description' }]}
                          noStyle
                        >
                          <Input placeholder="Description" style={{ width: 220 }} />
                        </Form.Item>
                        <Form.Item name={[field.name, 'amount']} noStyle>
                          <InputNumber placeholder="Amount" min={0} />
                        </Form.Item>
                        <Form.Item name={[field.name, 'isUrgent']} valuePropName="checked" noStyle>
                          <Checkbox>Urgent</Checkbox>
                        </Form.Item>
                        <MinusCircleOutlined onClick={() => remove(field.name)} />
                      </Space>
                    ))}
                    <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add()}>
                      Add line
                    </Button>
                  </>
                )}
              </Form.List>
            </Form.Item>
          </>
        ),
      }}
    />
  );
}
