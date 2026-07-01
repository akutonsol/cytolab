'use client';

import { useEffect, useState } from 'react';
import { Alert, App, Button, Descriptions, Divider, Empty, Input, Modal, Segmented, Space, Tag, Typography } from 'antd';
import { CheckCircleOutlined, FilePdfOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface RecordLite {
  id: string;
  labNumber?: string | null;
  formType?: string | null;
  status?: string;
  patient?: { firstName: string; lastName: string; registrationNo?: string | null } | null;
  client?: { firstName: string; lastName: string; officeName?: string | null; accountNo?: string | null } | null;
  specimens?: Array<{ id: string; type: string }>;
}

interface Line {
  id?: string;
  abbreviation?: string | null;
  result?: string | null;
  findings?: string | null;
  abnormalFinding: boolean;
}
interface Entry {
  id?: string;
  specimenId?: string | null;
  resultLines: Line[];
}
interface Sheet {
  id: string;
  authorized: boolean;
  authorizedAt?: string | null;
  authorizedBy?: { firstName: string; lastName: string } | null;
  resultEntries: Entry[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  record: RecordLite | null;
}

/**
 * Result sheet in AUTHORIZATION mode: the authorizer reviews each coded result,
 * edits findings + the Normal/Abnormal flag, then signs off (Approve). Sign-off
 * saves the findings first, then calls the authorize gate — never the reverse,
 * since editing an authorized sheet would de-authorize it.
 */
export function AuthorizationModal({ open, onClose, record }: Props) {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [entries, setEntries] = useState<Entry[]>([]);
  const isGyn = record?.formType === 'Gynecology';

  // Locate the record's latest result sheet, then load its full detail.
  const { data: list } = useQuery({
    queryKey: ['resultsheets', record?.id],
    queryFn: () => api.get('/resultsheets', { params: { recordId: record!.id } }).then((r) => r.data),
    enabled: open && !!record,
  });
  const sheetId: string | undefined = list?.data?.[0]?.id;
  const { data: sheet } = useQuery<Sheet>({
    queryKey: ['resultsheet', sheetId],
    queryFn: () => api.get(`/resultsheet/${sheetId}`).then((r) => r.data),
    enabled: open && !!sheetId,
  });

  useEffect(() => {
    if (sheet) setEntries(JSON.parse(JSON.stringify(sheet.resultEntries ?? [])));
  }, [sheet]);

  const authorized = !!sheet?.authorized;
  const lineCount = entries.reduce((n, e) => n + e.resultLines.length, 0);

  const setLine = (ei: number, li: number, patch: Partial<Line>) =>
    setEntries((prev) =>
      prev.map((e, i) =>
        i !== ei ? e : { ...e, resultLines: e.resultLines.map((l, j) => (j !== li ? l : { ...l, ...patch })) },
      ),
    );

  const saveFindings = () =>
    api.put(`/resultsheet/update/${sheetId}`, {
      entries: entries.map((e) => ({
        specimenId: e.specimenId ?? undefined,
        lines: e.resultLines.map((l) => ({
          abbreviation: l.abbreviation ?? undefined,
          result: l.result ?? undefined,
          findings: l.findings ?? undefined,
          abnormalFinding: l.abnormalFinding,
        })),
      })),
    });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['records'] });
    qc.invalidateQueries({ queryKey: ['resultsheet', sheetId] });
    qc.invalidateQueries({ queryKey: ['resultsheets', record?.id] });
  };

  const save = useMutation({
    mutationFn: saveFindings,
    onSuccess: () => {
      message.success(authorized ? 'Findings saved — authorization revoked, re-sign to approve' : 'Findings saved');
      invalidate();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Save failed'),
  });

  const signOff = useMutation({
    mutationFn: async () => {
      await saveFindings(); // persist edits before the gate — order matters
      await api.put(`/resultsheet/authorize/${sheetId}`, {});
    },
    onSuccess: () => {
      message.success('Signed off — record Approved, report releasable');
      invalidate();
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Sign-off failed'),
  });

  const confirmSignOff = () =>
    modal.confirm({
      title: 'Sign off and approve this report?',
      content: 'Your name and designation will be stamped on the released report and the record moves to Approved.',
      okText: 'Sign off',
      onOk: () => signOff.mutateAsync(),
    });

  const openReport = async () => {
    try {
      const res = await api.get(`/report/pdf/${record!.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Report unavailable');
    }
  };

  return (
    <Modal
      title={
        <Space>
          <span>Authorize Result Sheet</span>
          {record?.labNumber && <Tag>{record.labNumber}</Tag>}
          {authorized && (
            <Tag color="success" icon={<CheckCircleOutlined />}>
              Approved
            </Tag>
          )}
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={720}
      footer={
        <Space>
          <Button onClick={onClose}>Close</Button>
          <Button
            icon={<FilePdfOutlined />}
            disabled={!authorized}
            onClick={openReport}
            title={authorized ? 'Open the released report' : 'Available once signed off'}
          >
            Email / Print Report
          </Button>
          <Button loading={save.isPending} disabled={!sheetId || lineCount === 0} onClick={() => save.mutate()}>
            Save Findings
          </Button>
          <Button
            type="primary"
            loading={signOff.isPending}
            disabled={!sheetId || lineCount === 0 || authorized}
            onClick={confirmSignOff}
          >
            Sign off &amp; Approve
          </Button>
        </Space>
      }
    >
      {!record ? null : !sheetId ? (
        <Empty description="This record has no result sheet yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <>
          <Descriptions size="small" column={2} bordered>
            <Descriptions.Item label="Lab No.">{record.labNumber ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Form">{isGyn ? 'Gynecology' : 'Non-Gynecology'}</Descriptions.Item>
            <Descriptions.Item label="Patient">
              {record.patient ? `${record.patient.firstName} ${record.patient.lastName}` : '—'}
              {record.patient?.registrationNo && ` (${record.patient.registrationNo})`}
            </Descriptions.Item>
            <Descriptions.Item label="Client">
              {record.client ? record.client.officeName || `${record.client.firstName} ${record.client.lastName}` : '—'}
              {record.client?.accountNo && ` · AC# ${record.client.accountNo}`}
            </Descriptions.Item>
          </Descriptions>

          {authorized && (
            <Alert
              type="success"
              showIcon
              style={{ marginTop: 12 }}
              message={`Approved${sheet?.authorizedBy ? ` by ${sheet.authorizedBy.firstName} ${sheet.authorizedBy.lastName}` : ''}${
                sheet?.authorizedAt ? ` on ${new Date(sheet.authorizedAt).toLocaleString()}` : ''
              }`}
              description="Editing a finding below and saving will revoke this approval — the record returns to Awaiting Approval for re-sign-off."
            />
          )}

          <Divider orientation="left" plain>
            Code Sheet Results — findings &amp; assessment
          </Divider>

          {lineCount === 0 ? (
            <Empty description="No coded results on this sheet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            entries.map((entry, ei) => (
              <div key={entry.id ?? ei} style={{ marginBottom: 12 }}>
                {entry.resultLines.map((line, li) => (
                  <div
                    key={line.id ?? li}
                    style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, marginBottom: 8 }}
                  >
                    <Space style={{ justifyContent: 'space-between', width: '100%' }} align="start">
                      <Space direction="vertical" size={0}>
                        <Typography.Text strong>{line.abbreviation ?? '—'}</Typography.Text>
                        {line.result && <Typography.Text type="secondary">{line.result}</Typography.Text>}
                      </Space>
                      <Segmented
                        value={line.abnormalFinding ? 'Abnormal' : 'Normal'}
                        onChange={(v) => setLine(ei, li, { abnormalFinding: v === 'Abnormal' })}
                        options={[
                          { label: 'Normal', value: 'Normal' },
                          { label: 'Abnormal', value: 'Abnormal' },
                        ]}
                      />
                    </Space>
                    <Input.TextArea
                      style={{ marginTop: 8 }}
                      rows={2}
                      placeholder="Findings for this result…"
                      value={line.findings ?? ''}
                      onChange={(e) => setLine(ei, li, { findings: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            ))
          )}
        </>
      )}
    </Modal>
  );
}
