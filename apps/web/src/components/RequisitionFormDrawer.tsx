'use client';

import { useEffect } from 'react';
import {
  App,
  Button,
  Col,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { ClientSelect } from '@/components/ClientSelect';
import { DS } from '@/lib/drawer-styles';
import { DrawerHeader, PremiumFormStyles } from '@/components/DrawerChrome';
import { notify } from '@/lib/notify';

interface Props {
  open: boolean;
  onClose: () => void;
}

const money = (n?: number) => `$${(Number(n) || 0).toFixed(2)}`;

export function RequisitionFormDrawer({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [form] = Form.useForm();

  // Live running total from the line costs (in dollars on the form).
  const lines = Form.useWatch('lines', form) as Array<{ amount?: number }> | undefined;
  const runningTotal = (lines ?? []).reduce((sum, l) => sum + (Number(l?.amount) || 0), 0);
  const itemsCount = lines?.length ?? 0;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ dateReceived: dayjs(), lines: [{ formType: 'Gynecology', isUrgent: false }] });
  }, [open, form]);

  const save = useMutation({
    mutationFn: (values: any) =>
      api.post('/requisition/create', {
        clientId: values.clientId,
        dateReceived: values.dateReceived ? dayjs(values.dateReceived).toISOString() : undefined,
        lines: (values.lines ?? []).map((l: any) => ({
          formType: l.formType ?? 'Gynecology',
          isUrgent: !!l.isUrgent,
          notes: l.notes,
          // Cost entered in dollars → stored as integer cents.
          amount: Math.round((Number(l.amount) || 0) * 100),
        })),
      }),
    onSuccess: () => {
      notify.success('Requisition created');
      qc.invalidateQueries({ queryKey: ['requisitions'] });
      onClose();
    },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Save failed'),
  });

  return (
    <Drawer
      width={DS.drawerWidth}
      open={open}
      onClose={onClose}
      destroyOnClose
      closable={false}
      styles={{ header: { display: 'none' }, body: { background: DS.drawerBg, padding: DS.drawerPadding }, content: { boxShadow: '-8px 0 40px rgba(0,0,0,0.12)' } }}
    >
      <PremiumFormStyles />
      <DrawerHeader
        title="New Requisition"
        subtitle="Log a new sample batch"
        onClose={onClose}
        actions={
          <>
            <button type="button" style={{ ...DS.btnPrimary, opacity: save.isPending ? 0.6 : 1 }} disabled={save.isPending} onClick={() => form.submit()}>Save</button>
            <button type="button" style={DS.btnSecondary} onClick={onClose}>Cancel</button>
          </>
        }
      />
      <Form className="ds-form" layout="vertical" form={form} onFinish={(v) => save.mutate(v)} requiredMark={false}>
        <Row gutter={12}>
          <Col span={14}>
            <Form.Item label="Client" name="clientId" rules={[{ required: true, message: 'Choose the client' }]}>
              <ClientSelect placeholder="Who sent this batch?" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="Date Received" name="dateReceived">
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
          </Col>
          <Col span={4}>
            <Form.Item label="Items">
              <Input readOnly disabled value={itemsCount} />
            </Form.Item>
          </Col>
        </Row>

        <div style={DS.divider} />
        <div style={DS.sectionLabel}>Item lines</div>

        <Form.List name="lines">
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name, ...rest }, idx) => (
                <div key={key} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
                    <Typography.Text type="secondary">Item {idx + 1}</Typography.Text>
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(name)}
                      disabled={fields.length === 1}
                    />
                  </Row>
                  <Form.Item {...rest} name={[name, 'formType']} label="Form type" style={{ marginBottom: 8 }}>
                    <Radio.Group optionType="button" buttonStyle="solid">
                      <Radio.Button value="Gynecology">Gynecology</Radio.Button>
                      <Radio.Button value="NonGynecology">Non-Gynecology</Radio.Button>
                    </Radio.Group>
                  </Form.Item>
                  <Row gutter={12} align="bottom">
                    <Col span={12}>
                      <Form.Item {...rest} name={[name, 'notes']} label="Notes" style={{ marginBottom: 0 }}>
                        <Input placeholder="Sample notes" />
                      </Form.Item>
                    </Col>
                    <Col span={7}>
                      <Form.Item {...rest} name={[name, 'amount']} label="Cost" style={{ marginBottom: 0 }}>
                        <InputNumber min={0} precision={2} prefix="$" style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={5}>
                      <Form.Item {...rest} name={[name, 'isUrgent']} valuePropName="checked" label="Urgent?" style={{ marginBottom: 0 }}>
                        <Switch />
                      </Form.Item>
                    </Col>
                  </Row>
                </div>
              ))}
              <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ formType: 'Gynecology', isUrgent: false })}>
                New Item Line
              </Button>
            </>
          )}
        </Form.List>

        <Row justify="end" style={{ marginTop: 16 }}>
          <Space size="large" align="center">
            <Typography.Text type="secondary">{itemsCount} item(s)</Typography.Text>
            <Typography.Text strong style={{ fontSize: 16 }}>
              Amount: <Tag color="blue" style={{ fontSize: 15 }}>{money(runningTotal)}</Tag>
            </Typography.Text>
          </Space>
        </Row>
      </Form>
    </Drawer>
  );
}
