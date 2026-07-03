'use client';

import { useEffect } from 'react';
import {
  App,
  Avatar,
  Button,
  Col,
  DatePicker,
  Form,
  Input,
  Modal,
  Radio,
  Row,
  Tooltip,
  Typography,
} from 'antd';
import { MinusCircleOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { deriveAge } from '@/lib/age';
import { ClientSelect, clientLabel } from '@/components/ClientSelect';
import { DS } from '@/lib/drawer-styles';
import { DrawerHeader, DrawerFooter, PremiumFormStyles } from '@/components/DrawerChrome';

export interface PatientRecord {
  id: string;
  registrationNo: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  gender?: string | null;
  motherMaidenName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  bloodGroup?: string | null;
  dateOfBirth?: string | null;
  clientId?: string | null;
  client?: { id: string; firstName: string; lastName: string; officeName?: string | null; email?: string | null } | null;
  addresses?: Array<{
    id?: string;
    label?: string | null;
    line1: string;
    line2?: string | null;
    city?: string | null;
    region?: string | null;
    postalCode?: string | null;
    country?: string | null;
  }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** When set, the drawer edits this patient; otherwise it creates a new one. */
  patient?: PatientRecord | null;
  /** Called with the created patient (for inline use, e.g. the record form). */
  onCreated?: (patient: PatientRecord) => void;
}

export function PatientFormDrawer({ open, onClose, patient, onCreated }: Props) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const isEdit = !!patient;

  // Live-derived age, read-only — recomputed as the DOB changes.
  const dob = Form.useWatch('dateOfBirth', form);
  const age = deriveAge(dob);

  // Prefill (edit) or reset (create) whenever the drawer opens.
  useEffect(() => {
    if (!open) return;
    if (patient) {
      form.setFieldsValue({
        ...patient,
        dateOfBirth: patient.dateOfBirth ? dayjs(patient.dateOfBirth) : undefined,
        addresses: patient.addresses?.length ? patient.addresses : [],
      });
    } else {
      form.resetFields();
    }
  }, [open, patient, form]);

  const save = useMutation({
    mutationFn: async (values: any) => {
      const payload = {
        ...values,
        dateOfBirth: values.dateOfBirth ? dayjs(values.dateOfBirth).toISOString() : undefined,
        addresses: (values.addresses ?? []).filter((a: any) => a && a.line1),
      };
      // registrationNo is server-generated/derived; never sent.
      delete payload.registrationNo;
      const res = isEdit
        ? await api.put(`/patient/update/${patient!.id}`, payload)
        : await api.post('/patient', payload);
      return res.data as PatientRecord;
    },
    onSuccess: (saved) => {
      message.success(isEdit ? 'Patient updated' : 'Patient created');
      qc.invalidateQueries({ queryKey: ['patients'] });
      if (!isEdit && onCreated) onCreated(saved);
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Save failed'),
  });

  const initialClientOption = patient?.client
    ? { value: patient.client.id, label: clientLabel(patient.client) }
    : undefined;

  const actions = (
    <>
      <button type="button" style={DS.btnFooterCancel} onClick={onClose}>✕ Cancel</button>
      <button type="button" style={{ ...DS.btnPrimary, opacity: save.isPending ? 0.6 : 1 }} disabled={save.isPending} onClick={() => form.submit()}>✓ Save Patient</button>
    </>
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={700}
      centered
      destroyOnHidden
      footer={null}
      closable={false}
      styles={{
        content: { background: DS.drawerBg, borderRadius: 20, padding: 0, maxHeight: '90vh', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.18)' },
        body: { padding: 0, maxHeight: '90vh', overflowY: 'auto', scrollbarWidth: 'thin' },
        mask: { backdropFilter: 'blur(8px)', background: 'rgba(15,23,42,0.4)' },
        header: { display: 'none' },
      }}
    >
      <PremiumFormStyles />
      <div style={{ padding: DS.drawerPadding, paddingBottom: 24 }}>
      <DrawerHeader
        title={isEdit ? 'Edit Patient' : 'New Patient'}
        subtitle="Register a new patient record"
        onClose={onClose}
      />
      <Form className="ds-form" layout="vertical" form={form} onFinish={(v) => save.mutate(v)} requiredMark={false}>
        {/* Avatar — upload deferred to Phase 6 file storage (stub). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <Avatar size={64} icon={<UserOutlined />} />
          <Tooltip title="Photo upload arrives with file storage (Phase 6)">
            <Button disabled>Upload photo</Button>
          </Tooltip>
        </div>

        <Row gutter={12}>
          <Col span={14}>
            <Form.Item label="Choose Client" name="clientId" tooltip="Referring doctor/lab who sends samples">
              <ClientSelect initialOption={initialClientOption} />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item label="Registration Number">
              <Input
                readOnly
                disabled
                value={isEdit ? patient!.registrationNo : 'Generated on save'}
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label="Gender" name="gender">
          <Radio.Group optionType="button" buttonStyle="solid">
            <Radio.Button value="Male">Male</Radio.Button>
            <Radio.Button value="Female">Female</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Row gutter={12}>
          <Col span={8}>
            <Form.Item label="First Name" name="firstName" rules={[{ required: true, message: 'Required' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="Last Name" name="lastName" rules={[{ required: true, message: 'Required' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="Middle Name" name="middleName">
              <Input />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label="Mother's Name" name="motherMaidenName" tooltip="Maiden name — used for identity verification">
          <Input />
        </Form.Item>

        <Row gutter={12}>
          <Col span={12}>
            <Form.Item label="Email" name="email" rules={[{ type: 'email', message: 'Enter a valid email' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Phone Number" name="phoneNumber">
              <Input />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={12}>
          <Col span={12}>
            <Form.Item label="Date of Birth" name="dateOfBirth">
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" disabledDate={(d) => d.isAfter(dayjs())} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Age" tooltip="Calculated from date of birth">
              <Input readOnly disabled value={age != null ? `${age}` : '—'} />
            </Form.Item>
          </Col>
        </Row>

        <div style={DS.divider} />
        <div style={DS.sectionLabel}>Address</div>
        <Form.List name="addresses">
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name, ...rest }) => (
                <div key={key} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <Row gutter={12}>
                    <Col span={18}>
                      <Form.Item
                        {...rest}
                        name={[name, 'line1']}
                        label="Address line 1"
                        rules={[{ required: true, message: 'Address line 1 is required' }]}
                      >
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item {...rest} name={[name, 'label']} label="Label">
                        <Input placeholder="Home / Work" />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item {...rest} name={[name, 'line2']} label="Address line 2">
                    <Input />
                  </Form.Item>
                  <Row gutter={12}>
                    <Col span={8}>
                      <Form.Item {...rest} name={[name, 'city']} label="City">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item {...rest} name={[name, 'region']} label="Region/Parish">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item {...rest} name={[name, 'postalCode']} label="Postal code">
                        <Input />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={12} align="bottom">
                    <Col span={20}>
                      <Form.Item {...rest} name={[name, 'country']} label="Country">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={4} style={{ textAlign: 'right' }}>
                      <Button danger icon={<MinusCircleOutlined />} onClick={() => remove(name)}>
                        Remove
                      </Button>
                    </Col>
                  </Row>
                </div>
              ))}
              <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add()}>
                Add Address
              </Button>
            </>
          )}
        </Form.List>

        {!isEdit && (
          <Typography.Paragraph type="secondary" style={{ marginTop: 16, fontSize: 12 }}>
            The registration number is generated automatically and is permanent.
          </Typography.Paragraph>
        )}
      </Form>
      </div>

      <DrawerFooter>{actions}</DrawerFooter>
    </Modal>
  );
}
