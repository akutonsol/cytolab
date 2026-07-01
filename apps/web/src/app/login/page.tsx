'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { App, Button, Card, Form, Input, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth, useAuthStore } from '@/lib/auth';

interface LoginValues {
  email: string;
  password: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const { isAuthed, hydrated } = useAuth();
  const setTokens = useAuthStore((s) => s.setTokens);
  const [form] = Form.useForm<LoginValues>();

  // Already logged in → leave the login page.
  useEffect(() => {
    if (hydrated && isAuthed) router.replace('/dashboard');
  }, [hydrated, isAuthed, router]);

  const login = useMutation({
    mutationFn: async (values: LoginValues) => {
      const res = await api.post('/auth/login', values);
      return res.data as { accessToken: string; refreshToken: string };
    },
    onSuccess: (data) => {
      setTokens(data.accessToken, data.refreshToken);
      message.success('Welcome back');
      router.replace('/dashboard');
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message ?? 'Login failed');
    },
  });

  // Submit handler that is ROBUST to browser autofill / password managers.
  // Autofill sets the DOM input value WITHOUT firing React's onChange, so AntD's
  // controlled form store stays empty. Relying on onFinish fails twice over:
  // validation sees empty fields, and the validation re-render resets the
  // controlled <input> back to empty before any handler can read it. So we read
  // the live DOM value SYNCHRONOUSLY on click — before any re-render — falling
  // back to AntD's store for the normal typed case. A click always submits what
  // the user actually sees.
  const submit = () => {
    const domVal = (id: string) =>
      (typeof document !== 'undefined'
        ? (document.getElementById(id) as HTMLInputElement | null)?.value
        : '') ?? '';
    const email = (form.getFieldValue('email') || domVal('login-email') || '').trim();
    const password = form.getFieldValue('password') || domVal('login-password') || '';

    if (!email || !password) {
      form.setFields([
        ...(!email ? [{ name: 'email' as const, errors: ['Enter a valid email'] }] : []),
        ...(!password ? [{ name: 'password' as const, errors: ['Enter your password'] }] : []),
      ]);
      return;
    }
    login.mutate({ email, password });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f0f2f5',
      }}
    >
      <Card style={{ width: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Typography.Title level={3} style={{ marginBottom: 0 }}>
            Cytolab
          </Typography.Title>
          <Typography.Text type="secondary">Sign in to your lab</Typography.Text>
        </div>
        {/* The button reads DOM values synchronously on click (autofill-safe);
            Enter on either field does the same via onPressEnter. We deliberately
            do NOT use htmlType="submit"/onFinish — that path drops autofilled
            credentials (see `submit`). */}
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Enter a valid email' }]}>
            <Input
              id="login-email"
              autoComplete="email"
              placeholder="you@lab.com"
              size="large"
              onPressEnter={submit}
            />
          </Form.Item>
          <Form.Item name="password" label="Password">
            <Input.Password
              id="login-password"
              autoComplete="current-password"
              placeholder="••••••••"
              size="large"
              onPressEnter={submit}
            />
          </Form.Item>
          <Button type="primary" htmlType="button" onClick={submit} block size="large" loading={login.isPending}>
            Sign in
          </Button>
        </Form>
      </Card>
    </div>
  );
}
