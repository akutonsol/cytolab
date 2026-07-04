'use client';

import { useEffect } from 'react';
import {
  Alert,
  App,
  Avatar,
  Button,
  Col,
  Form,
  Input,
  Modal,
  Radio,
  Row,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { MinusCircleOutlined, PlusOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { RemoteSelect } from '@/components/RemoteSelect';
import { DS } from '@/lib/drawer-styles';
import { DrawerHeader, DrawerFooter, PremiumFormStyles } from '@/components/DrawerChrome';

export interface ClientRecord {
  id: string;
  firstName: string;
  lastName: string;
  officeName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  mobileNumber?: string | null;
  officeNumber?: string | null;
  active?: boolean;
  blocked?: boolean;
  labCodeId?: string | null;
  labCode?: { id: string; code: string; region?: string | null } | null;
  clientTypeId?: string | null;
  clientType?: { id: string; name: string; type: string } | null;
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
  portalUsers?: Array<{ id: string; username?: string | null; email: string; isPrimary: boolean }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  client?: ClientRecord | null;
}

export function ClientFormDrawer({ open, onClose, client }: Props) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const isEdit = !!client;
  const primaryLogin = client?.portalUsers?.find((p) => p.isPrimary) ?? client?.portalUsers?.[0];

  useEffect(() => {
    if (!open) return;
    if (client) {
      form.setFieldsValue({
        ...client,
        clientType: client.clientType?.type,
        addresses: client.addresses?.length ? client.addresses : [],
        createPortalLogin: false,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ active: true, blocked: false, clientType: 'Doctor', createPortalLogin: true, twoFactorEnabled: false, addresses: [] });
    }
  }, [open, client, form]);

  const save = useMutation({
    mutationFn: async (values: any) => {
      const payload = {
        ...values,
        addresses: (values.addresses ?? []).filter((a: any) => a && a.line1),
      };
      if (isEdit) {
        // Portal login is provisioned only at create time; don't resend on edit.
        delete payload.createPortalLogin;
        delete payload.twoFactorEnabled;
        return api.put(`/client/update/${client!.id}`, payload);
      }
      return api.post('/client', payload);
    },
    onSuccess: () => {
      message.success(isEdit ? 'Client updated' : 'Client created — a portal invite was emailed if a login was requested');
      qc.invalidateQueries({ queryKey: ['clients'] });
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Save failed'),
  });

  const labCodeInitial = client?.labCode
    ? [{ label: `${client.labCode.code}${client.labCode.region ? ` — ${client.labCode.region}` : ''}`, value: client.labCode.id }]
    : [];

  const clientInfoTab = (
    <>
      <div style={DS.sectionLabel}>Workspace</div>
      <Form.Item label="Labcode" name="labCodeId" tooltip="The client's assigned lab code / region">
        <RemoteSelect
          endpoint="/labcodes"
          queryKey="labcodes"
          placeholder="Choose Labcode"
          allowClear
          transform={(d: any) =>
            (d?.data ?? d ?? []).map((lc: any) => ({
              label: `${lc.code}${lc.region ? ` — ${lc.region}` : ''}`,
              value: lc.id,
            }))
          }
        />
      </Form.Item>

      <div style={DS.divider} />
      <div style={DS.sectionLabel}>Attributes</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <Avatar size={64} icon={<UserOutlined />} />
        <Tooltip title="Photo upload arrives with file storage (Phase 6)">
          <Button disabled>Edit photo</Button>
        </Tooltip>
      </div>
      <Form.Item label="Type" name="clientType">
        <Radio.Group optionType="button" buttonStyle="solid">
          <Radio.Button value="Doctor">Doctor</Radio.Button>
          <Radio.Button value="Laboratory">Laboratory</Radio.Button>
        </Radio.Group>
      </Form.Item>
      <Space size="large">
        <Form.Item label="Active" name="active" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item label="Blocked" name="blocked" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Space>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="Firstname" name="firstName" rules={[{ required: true, message: 'Required' }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="Lastname" name="lastName" rules={[{ required: true, message: 'Required' }]}>
            <Input />
          </Form.Item>
        </Col>
      </Row>

      <div style={DS.divider} />
      <div style={DS.sectionLabel}>Auth Information</div>
      <Form.Item label="Username">
        <Input readOnly disabled value={isEdit ? primaryLogin?.username ?? '—' : 'Generated on save'} />
      </Form.Item>
      <Form.Item label="Email" name="email" rules={[{ type: 'email', message: 'Enter a valid email' }]}>
        <Input placeholder="example@mail.com" />
      </Form.Item>
      {!isEdit && (
        <>
          <Form.Item name="createPortalLogin" valuePropName="checked" style={{ marginBottom: 8 }}>
            <Switch /> <span style={{ marginLeft: 8 }}>Create portal login</span>
          </Form.Item>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="No password is set here — a secure setup link will be emailed to the client, who sets their own password."
          />
        </>
      )}
      <Form.Item label="Two-factor authentication" name="twoFactorEnabled" valuePropName="checked" tooltip="The client enrolls 2FA later in the portal">
        <Switch />
      </Form.Item>

      <div style={DS.divider} />
      <div style={DS.sectionLabel}>Client Details</div>
      <Form.Item label="Office Name" name="officeName">
        <Input />
      </Form.Item>
      <Row gutter={12}>
        <Col span={8}>
          <Form.Item label="Phone Number" name="phoneNumber">
            <Input placeholder="888-888-8888" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="Office Number" name="officeNumber">
            <Input placeholder="888-888-8888" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="Mobile Number" name="mobileNumber">
            <Input placeholder="888-888-8888" />
          </Form.Item>
        </Col>
      </Row>

      <Form.List name="addresses">
        {(fields, { add, remove }) => (
          <>
            {fields.map(({ key, name, ...rest }) => (
              <div key={key} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <Row gutter={12}>
                  <Col span={18}>
                    <Form.Item {...rest} name={[name, 'line1']} label="Address line 1" rules={[{ required: true, message: 'Required' }]}>
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item {...rest} name={[name, 'label']} label="Label">
                      <Input placeholder="Office" />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={12} align="bottom">
                  <Col span={8}>
                    <Form.Item {...rest} name={[name, 'city']} label="City">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item {...rest} name={[name, 'region']} label="Region">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col span={4}>
                    <Form.Item {...rest} name={[name, 'postalCode']} label="Postal">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col span={4} style={{ textAlign: 'right' }}>
                    <Button danger icon={<MinusCircleOutlined />} onClick={() => remove(name)} />
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
    </>
  );

  const rolesTab = (
    <div>
      <Typography.Text type="secondary">Assigned Role</Typography.Text>
      <div style={{ margin: '8px 0 20px', padding: 12, border: '1px dashed #d9d9d9', borderRadius: 8, background: '#f0f7ff' }}>
        <Space>
          <SafetyCertificateOutlined style={{ color: '#52c41a' }} />
          <Tag color="blue">Clients</Tag>
          <Typography.Text type="secondary">portal identity (is super role: NO)</Typography.Text>
        </Space>
      </div>
      <Alert
        type="info"
        showIcon
        message="Clients are a portal identity, not a staff role."
        description="A client's access is granted automatically through their client-scoped portal login (created via the Auth Information section). Staff roles and the permission system do not apply to clients. Workspace-constraint roles are a planned RBAC feature (see DATA_MIGRATION_PLAN.md)."
      />
    </div>
  );

  const actions = (
    <>
      <button type="button" style={DS.btnFooterCancel} onClick={onClose}>✕ Cancel</button>
      <button type="button" style={{ ...DS.btnPrimary, opacity: save.isPending ? 0.6 : 1 }} disabled={save.isPending} onClick={() => form.submit()}>✓ Save</button>
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
        mask: { background: 'rgba(15,23,42,0.55)' }, // solid (no blur): avoids GPU crash blurring animated pages
        header: { display: 'none' },
      }}
    >
      <PremiumFormStyles />
      <div style={{ padding: DS.drawerPadding, paddingBottom: 24 }}>
      <DrawerHeader
        title={isEdit ? 'Edit Client' : 'New Client'}
        subtitle="Referring client registration"
        onClose={onClose}
      />
      <Form className="ds-form" layout="vertical" form={form} onFinish={(v) => save.mutate(v)} requiredMark={false}>
        <Tabs
          items={[
            { key: 'info', label: 'Client Info', forceRender: true, children: clientInfoTab },
            { key: 'roles', label: 'Roles', forceRender: true, children: rolesTab },
          ]}
        />
      </Form>
      </div>

      <DrawerFooter>{actions}</DrawerFooter>
    </Modal>
  );
}
