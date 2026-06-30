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

  // Already logged in → leave the login page.
  useEffect(() => {
    if (hydrated && isAuthed) router.replace('/patients');
  }, [hydrated, isAuthed, router]);

  const login = useMutation({
    mutationFn: async (values: LoginValues) => {
      const res = await api.post('/auth/login', values);
      return res.data as { accessToken: string; refreshToken: string };
    },
    onSuccess: (data) => {
      setTokens(data.accessToken, data.refreshToken);
      message.success('Welcome back');
      router.replace('/patients');
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message ?? 'Login failed');
    },
  });

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
        <Form layout="vertical" onFinish={(v) => login.mutate(v as LoginValues)} requiredMark={false}>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
          >
            <Input autoComplete="email" placeholder="you@lab.com" size="large" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Password"
            rules={[{ required: true, message: 'Enter your password' }]}
          >
            <Input.Password autoComplete="current-password" placeholder="••••••••" size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={login.isPending}>
            Sign in
          </Button>
        </Form>
      </Card>
    </div>
  );
}
