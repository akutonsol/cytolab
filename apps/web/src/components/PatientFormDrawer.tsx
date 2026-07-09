'use client';

import { useEffect, useRef, useState } from 'react';
import {
  App,
  Avatar,
  Button,
  Col,
  DatePicker,
  Drawer,
  Form,
  Input,
  Radio,
  Row,
  Select,
  Typography,
} from 'antd';
import { MinusCircleOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { deriveAge } from '@/lib/age';

// Progressive US-style phone formatter — used as an antd Form.Item `normalize` so
// the field reformats to (xxx-xxx-xxxx shape) as the user types. Strips non-digits,
// caps at 10, and inserts dashes only as far as the digits entered.
const formatPhone = (v?: string): string => {
  const d = (v ?? '').replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
};
import { ClientSelect, clientLabel } from '@/components/ClientSelect';
import { DS } from '@/lib/drawer-styles';
import { DrawerHeader, DrawerFooter, PremiumFormStyles } from '@/components/DrawerChrome';
import { DraftRestoreBanner } from '@/components/DraftRestoreBanner';
import { useAutosaveDraft, loadDraft, clearDraft, type Draft } from '@/lib/session-drafts';
import { encodeForm, decodeForm } from '@/lib/form-draft';

export interface PatientRecord {
  id: string;
  registrationNo: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  gender?: string | null;
  motherMaidenName?: string | null;
  avatarUrl?: string | null;
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

  // Patient photo. Kept in local state (not a Form field) so the (possibly large,
  // base64-in-dev) data URI never bloats the auto-draft in localStorage.
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith('image/')) { message.error('Please choose an image file'); return; }
    if (file.size > 10 * 1024 * 1024) { message.error('Image must be under 10MB'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setAvatarUrl((res.data as { storageUrl: string }).storageUrl);
    } catch (err: any) {
      message.error(err?.response?.data?.message ?? 'Photo upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Prefill (edit) or reset (create) whenever the drawer opens.
  useEffect(() => {
    if (!open) return;
    if (patient) {
      form.setFieldsValue({
        ...patient,
        dateOfBirth: patient.dateOfBirth ? dayjs(patient.dateOfBirth) : undefined,
        addresses: patient.addresses?.length ? patient.addresses : [],
      });
      setAvatarUrl(patient.avatarUrl ?? null);
    } else {
      form.resetFields();
      setAvatarUrl(null);
    }
  }, [open, patient, form]);

  // Auto-draft (create mode): flushed to a local draft right before an idle
  // timeout so a half-entered new patient is never lost. Offer restore on return.
  const draftKey = isEdit ? '' : 'patient-new';
  useAutosaveDraft(draftKey, () => encodeForm(form.getFieldsValue(true)), open && !isEdit);
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => {
    setDraft(open && !isEdit ? loadDraft(draftKey) : null);
  }, [open, isEdit, draftKey]);

  const save = useMutation({
    mutationFn: async (values: any) => {
      const payload = {
        ...values,
        avatarUrl: avatarUrl ?? undefined,
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
      if (draftKey) clearDraft(draftKey); // saved for real — drop the local draft
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
    <Drawer
      open={open}
      onClose={onClose}
      width={DS.drawerWidth}
      destroyOnClose
      closable={false}
      styles={{
        header: { display: 'none' },
        body: { background: DS.drawerBg, padding: 0, scrollbarWidth: 'thin' },
        content: { boxShadow: '-8px 0 40px rgba(0,0,0,0.12)' },
        mask: { background: 'rgba(15,23,42,0.55)' }, // solid (no blur): avoids GPU crash blurring animated pages
      }}
    >
      <PremiumFormStyles />
      <div style={{ padding: DS.drawerPadding, paddingBottom: 24 }}>
      <DrawerHeader
        title={isEdit ? 'Edit Patient' : 'New Patient'}
        subtitle="Register a new patient record"
        onClose={onClose}
      />
      {draft && !isEdit && (
        <DraftRestoreBanner
          savedAt={draft.savedAt}
          label="New Patient"
          onRestore={() => { form.setFieldsValue(decodeForm(draft.data)); setDraft(null); }}
          onDiscard={() => { clearDraft(draftKey); setDraft(null); }}
        />
      )}
      <Form className="ds-form" layout="vertical" form={form} onFinish={(v) => save.mutate(v)} requiredMark={false}>
        {/* Patient photo — uploaded to /files (GCS in prod, base64 data-URI in dev). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <Avatar size={64} src={avatarUrl || undefined} icon={<UserOutlined />} />
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPickPhoto} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button loading={uploading} onClick={() => fileRef.current?.click()}>{avatarUrl ? 'Change photo' : 'Upload photo'}</Button>
            {avatarUrl && !uploading && <Button type="text" danger onClick={() => setAvatarUrl(null)}>Remove</Button>}
          </div>
        </div>

        <Row gutter={12}>
          <Col span={14}>
            <Form.Item label="Choose Client" name="clientId" tooltip="Referring doctor/lab who sends samples" rules={[{ required: true, message: 'Select a client' }]}>
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

        <Form.Item label="Gender" name="gender" rules={[{ required: true, message: 'Required' }]}>
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
            <Form.Item label="Phone Number" name="phoneNumber" normalize={formatPhone}
              rules={[{ validator: (_, v) => !v || /^\d{3}-\d{3}-\d{4}$/.test(v) ? Promise.resolve() : Promise.reject(new Error('Format: xxx-xxx-xxxx')) }]}>
              <Input inputMode="tel" placeholder="xxx-xxx-xxxx" maxLength={12} />
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
                        <Select placeholder="Select" options={[{ value: 'Home', label: 'Home' }, { value: 'Work', label: 'Work' }]} />
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
    </Drawer>
  );
}
