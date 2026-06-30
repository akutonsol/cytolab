'use client';

import { Button, Form, Input, Select, Space, Switch, Tag } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { api, type Paginated } from '@/lib/api';
import { CrudTablePage } from '@/components/CrudTablePage';
import { RemoteSelect } from '@/components/RemoteSelect';

interface RecordRow {
  id: string;
  identifier: string;
  status: string;
  urgent: boolean;
  patient?: { firstName: string; lastName: string; registrationNo: string };
  client?: { firstName: string; lastName: string; officeName?: string };
  specimens: { id: string }[];
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  Pending: 'default',
  Submitted: 'cyan',
  Processing: 'blue',
  Partial: 'gold',
  Completed: 'green',
  Approved: 'success',
  Billed: 'purple',
  Paid: 'green',
  OnHold: 'orange',
  Disabled: 'default',
  Failed: 'red',
};

const SPECIMEN_TYPES = ['URINE', 'CSF', 'PLEURAL_FLD', 'BREAST_ASP', 'JOINT_ASP', 'SYNOVIAL_FLD', 'OTHER'];

const columns: ColumnsType<RecordRow> = [
  { title: 'Identifier', dataIndex: 'identifier' },
  { title: 'Status', dataIndex: 'status', render: (s: string) => <Tag color={STATUS_COLORS[s]}>{s}</Tag> },
  {
    title: 'Patient',
    render: (_, r) => (r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : '—'),
  },
  {
    title: 'Client',
    render: (_, r) => (r.client ? r.client.officeName || `${r.client.firstName} ${r.client.lastName}` : '—'),
  },
  { title: 'Specimens', render: (_, r) => r.specimens?.length ?? 0 },
  { title: 'Urgent', dataIndex: 'urgent', render: (u: boolean) => (u ? <Tag color="red">Urgent</Tag> : '') },
  { title: 'Created', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleDateString() },
];

export default function RecordsPage() {
  return (
    <CrudTablePage<RecordRow>
      title="Records"
      resourceKey="records"
      mode="server"
      columns={columns}
      fetchList={async ({ page, pageSize }) => {
        const res = await api.get<Paginated<RecordRow>>('/specimens', { params: { page, pageSize } });
        return { rows: res.data.data, total: res.data.total };
      }}
      create={{
        title: 'New Record',
        permission: 'record:create',
        width: 560,
        submit: (values) => api.post('/specimen/create', values),
        fields: (
          <>
            <Form.Item name="patientId" label="Patient" rules={[{ required: true }]}>
              <RemoteSelect
                endpoint="/patients?pageSize=200"
                queryKey="patients-options"
                transform={(data: any) =>
                  data.data.map((p: any) => ({
                    label: `${p.firstName} ${p.lastName} (${p.registrationNo})`,
                    value: p.id,
                  }))
                }
              />
            </Form.Item>
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
            <Form.Item name="clinicalDiagnosis" label="Clinical diagnosis">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Space size="large">
              <Form.Item name="labNumber" label="Lab number">
                <Input />
              </Form.Item>
              <Form.Item name="urgent" label="Urgent" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Space>

            <Form.Item label="Specimens">
              <Form.List name="specimens">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                        <Form.Item
                          name={[field.name, 'type']}
                          rules={[{ required: true, message: 'Type' }]}
                          noStyle
                        >
                          <Select
                            placeholder="Type"
                            style={{ width: 160 }}
                            options={SPECIMEN_TYPES.map((t) => ({ label: t, value: t }))}
                          />
                        </Form.Item>
                        <Form.Item name={[field.name, 'label']} noStyle>
                          <Input placeholder="Label" style={{ width: 180 }} />
                        </Form.Item>
                        <MinusCircleOutlined onClick={() => remove(field.name)} />
                      </Space>
                    ))}
                    <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add()}>
                      Add specimen
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
