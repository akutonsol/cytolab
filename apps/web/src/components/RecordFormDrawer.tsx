'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Col,
  DatePicker,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { DeleteOutlined, PlusOutlined, UserAddOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { deriveAge } from '@/lib/age';
import { ClientSelect } from '@/components/ClientSelect';
import { PatientSelect, patientLabel } from '@/components/PatientSelect';
import { PatientFormDrawer, type PatientRecord } from '@/components/PatientFormDrawer';
import { SPECIMEN_LABELS, specimenTypesForForm, type FormType } from '@/lib/specimen-types';

// Data edits are rejected server-side once a record reaches Completed. Mirror
// that set so the edit UI goes read-only rather than letting a save fail.
const LOCKED_STATUSES = ['Completed', 'Resulted', 'Approved', 'Billed', 'Paid', 'Viewed'];

interface Props {
  open: boolean;
  onClose: () => void;
  formType: FormType;
  /** When set, the drawer edits this record instead of creating a new one. */
  recordId?: string;
}

export function RecordFormDrawer({ open, onClose, formType, recordId }: Props) {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const isGyn = formType === 'Gynecology';
  const isEdit = !!recordId;
  const [patientDrawer, setPatientDrawer] = useState(false);

  const clientId = Form.useWatch('clientId', form);
  const patientId = Form.useWatch('patientId', form);

  // In edit mode, load the full record (header + clinical features + specimens).
  const { data: record } = useQuery({
    queryKey: ['record', recordId],
    queryFn: () => api.get(`/specimens/${recordId}`).then((r) => r.data),
    enabled: open && isEdit,
  });
  const locked = isEdit && !!record && LOCKED_STATUSES.includes(record.status);

  // Rich header display for the selected client / patient.
  const { data: client } = useQuery({
    queryKey: ['client', clientId],
    queryFn: () => api.get(`/client/${clientId}`).then((r) => r.data),
    enabled: !!clientId,
  });
  const { data: patient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => api.get(`/patient/${patientId}`).then((r) => r.data),
    enabled: !!patientId,
  });

  // Enabled clinical-feature fields for this form type (Form Setup config).
  // The endpoint returns { formType, fields }. We cache that object as-is (the
  // record detail page shares this exact query key) and read the fields array.
  const { data: formSchemaResp } = useQuery({
    queryKey: ['form-schema', formType],
    queryFn: () => api.get(`/form-config/${formType}/schema`).then((r) => r.data),
    enabled: open,
    staleTime: 5 * 60 * 1000, // schema rarely changes
  });
  const formSchema: any[] = formSchemaResp?.fields ?? [];

  useEffect(() => {
    if (!open) return;
    if (isEdit) return; // edit prefill is handled once the record loads
    form.resetFields();
    form.setFieldsValue({ specimenDate: dayjs(), urgent: false, specimenTypes: [] });
  }, [open, isEdit, form]);

  // Prefill from the loaded record (edit mode).
  useEffect(() => {
    if (!open || !isEdit || !record) return;
    const g = record.gynFeatures ?? {};
    const t = record.therapy ?? {};
    const n = record.nonGynFeatures ?? {};
    form.setFieldsValue({
      clientId: record.clientId,
      patientId: record.patientId,
      doctor: record.doctor,
      specimenDate: record.specimenDate ? dayjs(record.specimenDate) : undefined,
      urgent: !!record.urgent,
      specimenTypes: (record.specimens ?? []).map((s: any) => s.type),
      clinicalDiagnosis: record.clinicalDiagnosis,
      // Gyn features
      routineCheck: !!g.routineCheck,
      previousCytology: !!g.previousCytology,
      lmp: g.lmp ? dayjs(g.lmp) : undefined,
      clinicalAppearanceOfCervix: g.clinicalAppearanceOfCervix,
      nowPregnant: !!g.nowPregnant,
      pregnancies: g.pregnancies,
      leucorrhea: g.leucorrhea,
      menopause: !!g.menopause,
      dateOfMenopause: g.dateOfMenopause ? dayjs(g.dateOfMenopause) : undefined,
      lengthOfCycle: g.lengthOfCycle,
      pelvicAbnormalities: g.pelvicAbnormalities,
      // Therapy
      therapyHormone: !!t.hormone,
      therapyRadiation: !!t.radiation,
      therapySurgical: !!t.surgical,
      therapyOther: t.other,
      // Non-gyn features
      sampleDescription: n.sampleDescription,
      natureAndSource: n.natureAndSource,
    });
  }, [open, isEdit, record, form]);

  const buildPayload = (values: any) => {
    const base: any = {
      patientId: values.patientId,
      clientId: values.clientId,
      formType,
      doctor: values.doctor,
      clinicalDiagnosis: values.clinicalDiagnosis,
      specimenDate: values.specimenDate ? dayjs(values.specimenDate).toISOString() : undefined,
      specimens: (values.specimenTypes ?? []).map((t: string) => ({ type: t })),
    };
    if (isGyn) {
      if (formSchema.length === 0) {
        // Fallback (schema unavailable): original hardcoded mapping.
        base.gynFeatures = {
          routineCheck: !!values.routineCheck,
          previousCytology: !!values.previousCytology,
          lmp: values.lmp ? dayjs(values.lmp).toISOString() : undefined,
          clinicalAppearanceOfCervix: values.clinicalAppearanceOfCervix,
          nowPregnant: !!values.nowPregnant,
          pregnancies: values.pregnancies,
          leucorrhea: values.leucorrhea,
          menopause: !!values.menopause,
          dateOfMenopause: values.dateOfMenopause ? dayjs(values.dateOfMenopause).toISOString() : undefined,
          lengthOfCycle: values.lengthOfCycle,
          pelvicAbnormalities: values.pelvicAbnormalities,
        };
      } else {
        // Schema-driven: build gynFeatures from configured field keys.
        // clinicalDiagnosis lives on the Record (already in base); registrationNo is display-only.
        const gynKeys = formSchema
          .filter((f: any) => f.fieldKey !== 'clinicalDiagnosis' && f.fieldKey !== 'registrationNo')
          .map((f: any) => f.fieldKey);
        base.gynFeatures = gynKeys.reduce((acc: any, key: string) => {
          const val = values[key];
          if (val !== undefined) acc[key] = dayjs.isDayjs(val) ? val.toISOString() : val;
          return acc;
        }, {});
      }
      // Therapy is not part of the form schema — always sent for Gyn.
      base.therapy = {
        hormone: !!values.therapyHormone,
        radiation: !!values.therapyRadiation,
        surgical: !!values.therapySurgical,
        other: values.therapyOther,
      };
    } else {
      if (formSchema.length === 0) {
        base.nonGynFeatures = {
          sampleDescription: values.sampleDescription,
          natureAndSource: values.natureAndSource,
        };
      } else {
        const nonGynKeys = formSchema
          .filter((f: any) => f.fieldKey !== 'registrationNo')
          .map((f: any) => f.fieldKey);
        base.nonGynFeatures = nonGynKeys.reduce((acc: any, key: string) => {
          const val = values[key];
          if (val !== undefined) acc[key] = dayjs.isDayjs(val) ? val.toISOString() : val;
          return acc;
        }, {});
      }
    }
    return base;
  };

  const save = useMutation({
    mutationFn: async (opts: { values: any; submit: boolean }) => {
      if (isEdit) {
        // patientId is not part of UpdateRecordDto (forbidNonWhitelisted) — strip it.
        const { patientId: _p, ...payload } = buildPayload(opts.values);
        const res = await api.put(`/specimen/update/${recordId}`, payload);
        return res.data;
      }
      const res = await api.post('/specimen/create', buildPayload(opts.values));
      const created = res.data;
      if (opts.submit) {
        await api.put(`/specimen/submit/${created.id}`, { urgent: !!opts.values.urgent });
      }
      return created;
    },
    onSuccess: (_r, opts) => {
      message.success(isEdit ? 'Record updated' : opts.submit ? 'Record submitted to Cytolab' : 'Record saved');
      qc.invalidateQueries({ queryKey: ['records'] });
      if (isEdit) qc.invalidateQueries({ queryKey: ['record', recordId] });
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Save failed'),
  });

  const del = useMutation({
    mutationFn: () => api.delete(`/specimen/delete/${recordId}`),
    onSuccess: () => {
      message.success('Record deleted');
      qc.invalidateQueries({ queryKey: ['records'] });
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Delete failed'),
  });

  const submitForm = (submit: boolean) =>
    modal.confirm({
      title: isEdit ? 'Save changes to this record?' : submit ? 'Submit this record to Cytolab?' : 'Save this record?',
      okText: isEdit ? 'Save' : submit ? 'Submit' : 'Save',
      onOk: () => form.validateFields().then((values) => save.mutateAsync({ values, submit })),
    });

  const confirmDelete = () =>
    modal.confirm({
      title: 'Delete this record?',
      content: 'This permanently removes the record and its specimens.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: () => del.mutateAsync(),
    });

  const statusTag = isEdit ? record?.status ?? '…' : 'Pending';

  return (
    <Drawer
      title={
        <Space>
          <span>
            {isEdit ? 'Edit' : 'New'} {isGyn ? 'Gynecology' : 'Non-Gynecology'} Record
            {isEdit && record?.labNumber ? ` · ${record.labNumber}` : ''}
          </span>
          <Tag color={locked ? 'default' : 'processing'}>{statusTag}</Tag>
        </Space>
      }
      width={860}
      open={open}
      onClose={onClose}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          {isEdit ? (
            <>
              <Button danger icon={<DeleteOutlined />} loading={del.isPending} disabled={locked} onClick={confirmDelete}>
                Delete
              </Button>
              <Button type="primary" loading={save.isPending} disabled={locked} onClick={() => submitForm(false)}>
                Save
              </Button>
            </>
          ) : (
            <>
              <Button loading={save.isPending} onClick={() => submitForm(false)}>
                Save
              </Button>
              <Tooltip title="Submit has Urgent? adds express cost — set the toggle below">
                <Button type="primary" loading={save.isPending} onClick={() => submitForm(true)}>
                  Submit to Cytolab
                </Button>
              </Tooltip>
            </>
          )}
        </Space>
      }
    >
      {locked && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="This record is locked"
          description={`A record cannot be edited or deleted once it reaches ${record?.status}. View only.`}
        />
      )}
      <Form layout="vertical" form={form} requiredMark={false} disabled={locked}>
        {/* ---- Common header ---- */}
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item label="Lab No.">
              <Input readOnly disabled value={isEdit ? record?.labNumber ?? '…' : 'Generated on save'} />
            </Form.Item>
          </Col>
          <Col span={16}>
            <Form.Item label="Client" name="clientId" rules={[{ required: true, message: 'Choose the client' }]}>
              <ClientSelect placeholder="Referring client" />
            </Form.Item>
            {client && (
              <Space size={[4, 4]} wrap style={{ marginTop: -8, marginBottom: 8 }}>
                {client.accountNo && <Tag color="geekblue">Acc# {client.accountNo}</Tag>}
                {client.portalUsers?.[0]?.username && <Tag>User: {client.portalUsers[0].username}</Tag>}
                {client.clientType?.type && <Tag color="cyan">{client.clientType.type}</Tag>}
              </Space>
            )}
          </Col>
        </Row>

        <Form.Item label="Patient" required>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="patientId" noStyle rules={[{ required: true, message: 'Choose or create a patient' }]}>
              {/* Patient is fixed once a record exists. */}
              <PatientSelect
                placeholder="Search patient by name or reg no"
                disabled={isEdit}
                initialOption={
                  isEdit && patient
                    ? { value: patient.id, label: patientLabel(patient) }
                    : undefined
                }
              />
            </Form.Item>
            <Tooltip title="Create a new patient">
              <Button icon={<UserAddOutlined />} disabled={isEdit} onClick={() => setPatientDrawer(true)} />
            </Tooltip>
          </Space.Compact>
        </Form.Item>
        {patient && (
          <Space size={[4, 4]} wrap style={{ marginTop: -8, marginBottom: 8 }}>
            {patient.gender && <Tag>{patient.gender}</Tag>}
            {deriveAge(patient.dateOfBirth) != null && <Tag>Age {deriveAge(patient.dateOfBirth)}</Tag>}
            {patient.registrationNo && <Tag color="geekblue">Reg# {patient.registrationNo}</Tag>}
          </Space>
        )}

        <Row gutter={12}>
          <Col span={12}>
            <Form.Item label="Doctor" name="doctor">
              <Input placeholder="Referring doctor" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Date of specimen" name="specimenDate">
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={12}>
          <Col span={16}>
            <Form.Item label="Specimen type(s)" name="specimenTypes">
              <Select
                mode="multiple"
                placeholder="Select specimen types"
                options={specimenTypesForForm(formType).map((t) => ({ value: t, label: SPECIMEN_LABELS[t] }))}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={isGyn ? 'Slide Samples' : 'Vial Samples'}>
              <div style={{
                border: '1px solid #E5E7EB',
                borderRadius: 12,
                overflow: 'hidden',
                background: '#F8FAFC',
                position: 'relative',
              }}>
                {/* Default specimen image */}
                <div style={{
                  position: 'relative',
                  width: '100%',
                  height: 160,
                  overflow: 'hidden',
                }}>
                  <img
                    src={isGyn ? '/cytology-sample.png' : '/cytology-nongyn.png'}
                    alt={isGyn ? 'Cytology specimen' : 'Non-gynecology specimen'}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      objectPosition: 'center',
                      opacity: 0.85,
                    }}
                  />
                  {/* Overlay gradient */}
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(to bottom, transparent 50%, rgba(15,23,42,0.4) 100%)',
                  }} />
                  {/* Bottom label */}
                  <div style={{
                    position: 'absolute',
                    bottom: 8,
                    left: 10,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    <img
                      src="/specimen-tube.png"
                      alt="Specimen tube"
                      style={{ width: 20, height: 40, objectFit: 'contain' }}
                    />
                    <span style={{
                      color: 'white',
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      textShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    }}>
                      {isGyn ? 'GYN · CYTOLOGY SLIDE' : 'NON-GYN · SPECIMEN VIAL'}
                    </span>
                  </div>
                  {/* Phase 6 upload badge */}
                  <div style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    background: 'rgba(255,255,255,0.85)',
                    backdropFilter: 'blur(4px)',
                    borderRadius: 6,
                    padding: '3px 8px',
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#4F46E5',
                    letterSpacing: '0.03em',
                  }}>
                    DEFAULT PREVIEW
                  </div>
                </div>

                {/* Footer action row */}
                <div style={{
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTop: '1px solid #F1F5F9',
                }}>
                  <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500 }}>
                    Actual slide upload available in Phase 6
                  </span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#4F46E5',
                    background: '#EEF3FF',
                    padding: '3px 10px',
                    borderRadius: 6,
                  }}>
                    {isGyn ? 'Pap Smear' : 'FNA / Biopsy'}
                  </span>
                </div>
              </div>
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>
          {isGyn ? 'Gynecology clinical features' : 'Non-Gynecology clinical features'}
        </Divider>

        {formSchema.length === 0 ? (
          // Fallback while loading or if the schema fetch fails — original hardcoded fields.
          isGyn ? (
            <>
              <Space size="large" wrap>
                <Form.Item label="Routine Check" name="routineCheck" valuePropName="checked"><Switch /></Form.Item>
                <Form.Item label="Previous Cytology" name="previousCytology" valuePropName="checked"><Switch /></Form.Item>
                <Form.Item label="Now Pregnant" name="nowPregnant" valuePropName="checked"><Switch /></Form.Item>
                <Form.Item label="Menopause" name="menopause" valuePropName="checked"><Switch /></Form.Item>
              </Space>
              <Row gutter={12}>
                <Col span={8}><Form.Item label="LMP" name="lmp"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
                <Col span={8}><Form.Item label="Date of Menopause" name="dateOfMenopause"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
                <Col span={8}><Form.Item label="No. of Pregnancies" name="pregnancies"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
              </Row>
              <Row gutter={12}>
                <Col span={12}><Form.Item label="Clinical Diagnosis" name="clinicalDiagnosis"><Input /></Form.Item></Col>
                <Col span={12}><Form.Item label="Clinical Appearance of Cervix" name="clinicalAppearanceOfCervix"><Input /></Form.Item></Col>
              </Row>
              <Row gutter={12}>
                <Col span={8}><Form.Item label="Leucorrhea" name="leucorrhea"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item label="Length of Cycle" name="lengthOfCycle"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item label="Pelvic Abnormalities" name="pelvicAbnormalities"><Input /></Form.Item></Col>
              </Row>
            </>
          ) : (
            <>
              <Form.Item label="Sample Description" name="sampleDescription"><Input.TextArea rows={2} /></Form.Item>
              <Form.Item label="Nature & Source of Specimen" name="natureAndSource"><Input /></Form.Item>
            </>
          )
        ) : (
          // Schema-driven fields (Form Setup config) in configured order.
          <>
            {formSchema.filter((f: any) => f.fieldType === 'CHECKBOX').length > 0 && (
              <Space size="large" wrap>
                {formSchema
                  .filter((f: any) => f.fieldType === 'CHECKBOX')
                  .map((f: any) => (
                    <Form.Item key={f.fieldKey} label={f.label} name={f.fieldKey} valuePropName="checked">
                      <Switch />
                    </Form.Item>
                  ))}
              </Space>
            )}

            <Row gutter={12} style={{ marginTop: 12 }}>
              {formSchema
                .filter((f: any) => f.fieldType === 'TEXT')
                .map((f: any) => {
                  const isDate =
                    f.fieldKey === 'lmp' ||
                    f.fieldKey === 'dateOfMenopause' ||
                    f.fieldKey.toLowerCase().includes('date');
                  const isNumber = f.fieldKey === 'pregnancies';
                  return (
                    <Col span={12} key={f.fieldKey}>
                      <Form.Item label={f.label} name={f.fieldKey}>
                        {isDate ? (
                          <DatePicker style={{ width: '100%' }} />
                        ) : isNumber ? (
                          <InputNumber min={0} style={{ width: '100%' }} />
                        ) : f.fieldKey === 'sampleDescription' ? (
                          <Input.TextArea rows={2} />
                        ) : (
                          <Input />
                        )}
                      </Form.Item>
                    </Col>
                  );
                })}
            </Row>
          </>
        )}

        {isGyn && (
          <>
            <Divider orientation="left" plain>Therapy</Divider>
            <Space size="large" wrap>
              <Form.Item label="Hormone" name="therapyHormone" valuePropName="checked"><Switch /></Form.Item>
              <Form.Item label="Radiation" name="therapyRadiation" valuePropName="checked"><Switch /></Form.Item>
              <Form.Item label="Surgical" name="therapySurgical" valuePropName="checked"><Switch /></Form.Item>
            </Space>
            <Form.Item label="Other therapy" name="therapyOther"><Input /></Form.Item>
          </>
        )}

        {!isEdit && (
          <>
            <Divider plain />
            <Space align="center">
              <Form.Item name="urgent" valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
              <span>
                Submit has Urgent?{' '}
                <Typography.Text type="secondary">(additional cost for express results)</Typography.Text>
              </span>
            </Space>
          </>
        )}
      </Form>

      {/* Inline patient create — auto-selects the new patient on success. */}
      <PatientFormDrawer
        open={patientDrawer}
        onClose={() => setPatientDrawer(false)}
        onCreated={(p: PatientRecord) => {
          form.setFieldsValue({ patientId: p.id });
          qc.setQueryData(['patient', p.id], p);
        }}
      />
    </Drawer>
  );
}
