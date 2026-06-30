'use client';

import { Col, Form, Input, InputNumber, Row, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api, type Paginated } from '@/lib/api';
import { CrudTablePage } from '@/components/CrudTablePage';

interface Patient {
  id: string;
  registrationNo: string;
  firstName: string;
  lastName: string;
  gender?: string;
  age?: number;
  phoneNumber?: string;
  email?: string;
  createdAt: string;
}

const columns: ColumnsType<Patient> = [
  { title: 'Reg. No', dataIndex: 'registrationNo' },
  { title: 'Name', render: (_, r) => `${r.firstName} ${r.lastName}` },
  { title: 'Gender', dataIndex: 'gender' },
  { title: 'Age', dataIndex: 'age' },
  { title: 'Phone', dataIndex: 'phoneNumber' },
  { title: 'Email', dataIndex: 'email' },
  { title: 'Created', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleDateString() },
];

export default function PatientsPage() {
  return (
    <CrudTablePage<Patient>
      title="Patients"
      resourceKey="patients"
      mode="server"
      searchable
      columns={columns}
      fetchList={async ({ page, pageSize, q }) => {
        const res = await api.get<Paginated<Patient>>('/patients', { params: { page, pageSize, q } });
        return { rows: res.data.data, total: res.data.total };
      }}
      create={{
        title: 'New Patient',
        permission: 'patient:create',
        submit: (values) => api.post('/patient', values),
        fields: (
          <>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="firstName" label="First name" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="lastName" label="Last name" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="middleName" label="Middle name">
              <Input />
            </Form.Item>
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item name="age" label="Age">
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="gender" label="Gender">
                  <Select
                    allowClear
                    options={[
                      { label: 'Male', value: 'Male' },
                      { label: 'Female', value: 'Female' },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="bloodGroup" label="Blood group">
                  <Input />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="phoneNumber" label="Phone">
              <Input />
            </Form.Item>
            <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}>
              <Input />
            </Form.Item>
          </>
        ),
      }}
    />
  );
}
