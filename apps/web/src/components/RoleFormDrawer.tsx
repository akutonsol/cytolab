'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Drawer, Form, Input, Segmented, Space, Switch, Transfer, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Permission {
  id: string;
  code: string;
  label: string;
}

export interface RoleRecord {
  id: string;
  name: string;
  description?: string | null;
  isSuperRole: boolean;
  scope: 'User' | 'Workspace';
  permissions: { permission: { id: string; code: string } }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  role?: RoleRecord | null;
}

export function RoleFormDrawer({ open, onClose, role }: Props) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const isEdit = !!role;

  const [targetKeys, setTargetKeys] = useState<string[]>([]);
  const [isSuperRole, setIsSuperRole] = useState(false);

  const { data: permissions } = useQuery({
    queryKey: ['permissions-all'],
    queryFn: () => api.get<Permission[]>('/permissions').then((r) => r.data),
  });

  const transferData = useMemo(
    () => (permissions ?? []).map((p) => ({ key: p.id, title: p.code })),
    [permissions],
  );
  const allKeys = useMemo(() => transferData.map((d) => d.key), [transferData]);

  useEffect(() => {
    if (!open) return;
    if (role) {
      form.setFieldsValue({ name: role.name, description: role.description, scope: role.scope });
      setIsSuperRole(role.isSuperRole);
      setTargetKeys(role.permissions.map((p) => p.permission.id));
    } else {
      form.resetFields();
      form.setFieldsValue({ scope: 'User' });
      setIsSuperRole(false);
      setTargetKeys([]);
    }
  }, [open, role, form]);

  // The full payload is built in onFinish (current render state) and passed as
  // the mutate variable — so isSuperRole/scope/permissionIds are never read from
  // a stale mutationFn closure.
  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      isEdit ? api.put(`/roles/${role!.id}`, payload) : api.post('/roles', payload),
    onSuccess: () => {
      message.success(isEdit ? 'Role updated' : 'Role created');
      qc.invalidateQueries({ queryKey: ['roles'] });
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Save failed'),
  });

  const onFinish = (values: any) =>
    save.mutate({
      name: values.name,
      description: values.description,
      isSuperRole,
      scope: values.scope ?? 'User',
      permissionIds: targetKeys,
    });

  return (
    <Drawer
      title={isEdit ? 'Edit Role' : 'New Role'}
      width={760}
      open={open}
      onClose={onClose}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={save.isPending} onClick={() => form.submit()}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </Space>
      }
    >
      <Form layout="vertical" form={form} onFinish={onFinish} requiredMark={false}>
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
          <Input placeholder="e.g. Receptionist" />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={2} />
        </Form.Item>

        <Space size="large" align="start" style={{ marginBottom: 8 }}>
          <div>
            <Typography.Text>Superuser Role privilege?</Typography.Text>
            <div style={{ marginTop: 4 }}>
              <Switch checked={isSuperRole} onChange={setIsSuperRole} />
            </div>
          </div>
          <div>
            <Typography.Text>Scope</Typography.Text>
            <div style={{ marginTop: 4 }}>
              <Form.Item name="scope" noStyle initialValue="User">
                <Segmented
                  options={[
                    { label: 'User', value: 'User' },
                    { label: 'Workspace (coming soon)', value: 'Workspace', disabled: true },
                  ]}
                />
              </Form.Item>
            </div>
          </div>
        </Space>

        {isSuperRole && (
          <Alert
            type="warning"
            showIcon
            style={{ margin: '8px 0 16px' }}
            message="Superuser roles bypass every permission check — the selected permissions below are not consulted for holders of this role."
          />
        )}

        <Typography.Text strong>Permissions</Typography.Text>
        <Transfer
          dataSource={transferData}
          targetKeys={targetKeys}
          onChange={(next) => setTargetKeys(next as string[])}
          render={(item) => item.title}
          showSearch
          filterOption={(input, item) => item.title.toLowerCase().includes(input.toLowerCase())}
          titles={['Available', 'Chosen']}
          listStyle={{ width: 330, height: 380 }}
          style={{ marginTop: 8 }}
          locale={{ itemUnit: 'permission', itemsUnit: 'permissions' }}
          footer={(_, info) =>
            info?.direction === 'left' ? (
              <Button size="small" type="link" onClick={() => setTargetKeys(allKeys)}>
                Choose all
              </Button>
            ) : (
              <Button size="small" type="link" danger onClick={() => setTargetKeys([])}>
                Remove all
              </Button>
            )
          }
        />
      </Form>
    </Drawer>
  );
}
