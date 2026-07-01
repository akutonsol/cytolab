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
import { PlusOutlined, UserAddOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { deriveAge } from '@/lib/age';
import { ClientSelect } from '@/components/ClientSelect';
import { PatientSelect, patientLabel } from '@/components/PatientSelect';
import { PatientFormDrawer, type PatientRecord } from '@/components/PatientFormDrawer';
import { SPECIMEN_LABELS, specimenTypesForForm, type FormType } from '@/lib/specimen-types';

interface Props {
  open: boolean;
  onClose: () => void;
  formType: FormType;
}

export function RecordFormDrawer({ open, onClose, formType }: Props) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const isGyn = formType === 'Gynecology';
  const [patientDrawer, setPatientDrawer] = useState(false);

  const clientId = Form.useWatch('clientId', form);
  const patientId = Form.useWatch('patientId', form);

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

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ specimenDate: dayjs(), urgent: false, specimenTypes: [] });
  }, [open, form]);

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
      base.therapy = {
        hormone: !!values.therapyHormone,
        radiation: !!values.therapyRadiation,
        surgical: !!values.therapySurgical,
        other: values.therapyOther,
      };
    } else {
      base.nonGynFeatures = {
        sampleDescription: values.sampleDescription,
        natureAndSource: values.natureAndSource,
      };
    }
    return base;
  };

  const save = useMutation({
    mutationFn: async (opts: { values: any; submit: boolean }) => {
      const res = await api.post('/specimen/create', buildPayload(opts.values));
      const record = res.data;
      if (opts.submit) {
        await api.put(`/specimen/submit/${record.id}`, { urgent: !!opts.values.urgent });
      }
      return record;
    },
    onSuccess: (_r, opts) => {
      message.success(opts.submit ? 'Record submitted to Cytolab' : 'Record saved');
      qc.invalidateQueries({ queryKey: ['records'] });
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Save failed'),
  });

  const submitForm = (submit: boolean) =>
    form.validateFields().then((values) => save.mutate({ values, submit }));

  return (
    <Drawer
      title={
        <Space>
          <span>New {isGyn ? 'Gynecology' : 'Non-Gynecology'} Record</span>
          <Tag>Pending</Tag>
        </Space>
      }
      width={860}
      open={open}
      onClose={onClose}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => submitForm(false)}>
            Save
          </Button>
          <Tooltip title="Submit has Urgent? adds express cost — set the toggle below">
            <Button type="primary" loading={save.isPending} onClick={() => submitForm(true)}>
              Submit to Cytolab
            </Button>
          </Tooltip>
        </Space>
      }
    >
      <Form layout="vertical" form={form} requiredMark={false}>
        {/* ---- Common header ---- */}
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item label="Lab No.">
              <Input readOnly disabled value="Generated on save" />
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
              <PatientSelect placeholder="Search patient by name or reg no" />
            </Form.Item>
            <Tooltip title="Create a new patient">
              <Button icon={<UserAddOutlined />} onClick={() => setPatientDrawer(true)} />
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
              <Tooltip title="Specimen image upload arrives with file storage (Phase 6)">
                <Button block disabled icon={<PlusOutlined />}>
                  Attach {isGyn ? 'slides' : 'vials'}
                </Button>
              </Tooltip>
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>
          {isGyn ? 'Gynecology clinical features' : 'Non-Gynecology clinical features'}
        </Divider>

        {isGyn ? (
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
            <Divider orientation="left" plain>Therapy</Divider>
            <Space size="large" wrap>
              <Form.Item label="Hormone" name="therapyHormone" valuePropName="checked"><Switch /></Form.Item>
              <Form.Item label="Radiation" name="therapyRadiation" valuePropName="checked"><Switch /></Form.Item>
              <Form.Item label="Surgical" name="therapySurgical" valuePropName="checked"><Switch /></Form.Item>
            </Space>
            <Form.Item label="Other therapy" name="therapyOther"><Input /></Form.Item>
          </>
        ) : (
          <>
            <Form.Item label="Sample Description" name="sampleDescription"><Input.TextArea rows={2} /></Form.Item>
            <Form.Item label="Nature & Source of Specimen" name="natureAndSource"><Input /></Form.Item>
          </>
        )}

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
