'use client';

import { useEffect, useState } from 'react';
import { Alert, App, Button, Descriptions, Divider, Empty, Input, List, Modal, Segmented, Space, Tag, Typography } from 'antd';
import { CheckCircleOutlined, FilePdfOutlined, RobotOutlined } from '@ant-design/icons';
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
  narrative?: string | null;
  resultEntries: Entry[];
}
interface AiSettings { enabled: boolean; hasApiKey: boolean }
interface CodeSuggestion { abbreviation: string; rationale?: string; confidence?: string }
interface ConsistencyFlag { severity?: string; message: string }

interface Props {
  open: boolean;
  onClose: () => void;
  record: RecordLite | null;
}

/**
 * Result sheet in AUTHORIZATION mode. The authorizer reviews coded results, may
 * use AI assistance (draft narrative / suggest codes / check consistency —
 * strictly assistive), then signs off. Sign-off saves content first, then calls
 * the authorize gate. AI never authorizes; the human's edited text is what ships.
 */
export function AuthorizationModal({ open, onClose, record }: Props) {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [narrative, setNarrative] = useState('');
  const [aiDraftId, setAiDraftId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CodeSuggestion[] | null>(null);
  const [flags, setFlags] = useState<ConsistencyFlag[] | null>(null);
  const isGyn = record?.formType === 'Gynecology';

  const { data: aiSettings } = useQuery<AiSettings>({
    queryKey: ['ai-settings'],
    queryFn: () => api.get('/lab/ai-settings').then((r) => r.data),
    enabled: open,
  });
  const aiEnabled = !!aiSettings?.enabled && !!aiSettings?.hasApiKey;

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
    if (sheet) {
      setEntries(JSON.parse(JSON.stringify(sheet.resultEntries ?? [])));
      setNarrative(sheet.narrative ?? '');
      setAiDraftId(null);
      setSuggestions(null);
      setFlags(null);
    }
  }, [sheet]);

  const authorized = !!sheet?.authorized;
  const lineCount = entries.reduce((n, e) => n + e.resultLines.length, 0);

  const setLine = (ei: number, li: number, patch: Partial<Line>) =>
    setEntries((prev) => prev.map((e, i) => (i !== ei ? e : { ...e, resultLines: e.resultLines.map((l, j) => (j !== li ? l : { ...l, ...patch })) })));

  const saveContent = () =>
    api.put(`/resultsheet/update/${sheetId}`, {
      narrative,
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
    mutationFn: saveContent,
    onSuccess: () => { message.success(authorized ? 'Saved — authorization revoked, re-sign to approve' : 'Saved'); invalidate(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Save failed'),
  });

  const signOff = useMutation({
    mutationFn: async () => { await saveContent(); await api.put(`/resultsheet/authorize/${sheetId}`, {}); },
    onSuccess: () => { message.success('Signed off — record Approved, report releasable'); invalidate(); onClose(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Sign-off failed'),
  });

  // ---- AI assist (strictly assistive; degrades to a message when unavailable) ----
  const degraded = (reason?: string) => message.info(reason ?? 'AI is unavailable right now');

  const genNarrative = useMutation({
    mutationFn: () => api.post(`/resultsheet/${sheetId}/ai/narrative`).then((r) => r.data),
    onSuccess: (res) => {
      if (!res.available) return degraded(res.reason);
      setNarrative(res.data.output);
      setAiDraftId(res.data.id);
      message.success('AI draft ready — review and edit before accepting');
    },
    onError: () => degraded(),
  });

  const acceptDraft = useMutation({
    mutationFn: () => api.put(`/resultsheet/${sheetId}/ai/narrative/${aiDraftId}/accept`, { finalText: narrative }),
    onSuccess: () => { message.success('Accepted into report'); setAiDraftId(null); invalidate(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Accept failed'),
  });

  const rejectDraft = useMutation({
    mutationFn: () => api.put(`/resultsheet/${sheetId}/ai/narrative/${aiDraftId}/reject`, {}),
    onSuccess: () => { message.info('Draft rejected'); setAiDraftId(null); },
  });

  const suggest = useMutation({
    mutationFn: () => api.post(`/resultsheet/${sheetId}/ai/suggest-codes`).then((r) => r.data),
    onSuccess: (res) => { res.available ? setSuggestions(res.data.suggestions ?? []) : degraded(res.reason); },
    onError: () => degraded(),
  });

  const consistency = useMutation({
    mutationFn: () => api.post(`/resultsheet/${sheetId}/ai/consistency`).then((r) => r.data),
    onSuccess: (res) => { res.available ? setFlags(res.data.flags ?? []) : degraded(res.reason); },
    onError: () => degraded(),
  });

  const acceptSuggestion = (s: CodeSuggestion) => {
    setEntries((prev) => {
      const copy: Entry[] = JSON.parse(JSON.stringify(prev));
      if (copy.length === 0) copy.push({ resultLines: [] });
      copy[0].resultLines.push({ abbreviation: s.abbreviation, findings: '', abnormalFinding: false });
      return copy;
    });
    setSuggestions((prev) => (prev ?? []).filter((x) => x !== s));
    message.info(`Added ${s.abbreviation} — Save to persist`);
  };

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

  const aiBusy = genNarrative.isPending || suggest.isPending || consistency.isPending;

  return (
    <Modal
      title={
        <Space>
          <span>Authorize Result Sheet</span>
          {record?.labNumber && <Tag>{record.labNumber}</Tag>}
          {authorized && <Tag color="success" icon={<CheckCircleOutlined />}>Approved</Tag>}
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={760}
      footer={
        <Space>
          <Button onClick={onClose}>Close</Button>
          <Button icon={<FilePdfOutlined />} disabled={!authorized} onClick={openReport} title={authorized ? 'Open the released report' : 'Available once signed off'}>
            Email / Print Report
          </Button>
          <Button loading={save.isPending} disabled={!sheetId || lineCount === 0} onClick={() => save.mutate()}>Save</Button>
          <Button type="primary" loading={signOff.isPending} disabled={!sheetId || lineCount === 0 || authorized} onClick={confirmSignOff}>
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
            <Alert type="success" showIcon style={{ marginTop: 12 }}
              message={`Approved${sheet?.authorizedBy ? ` by ${sheet.authorizedBy.firstName} ${sheet.authorizedBy.lastName}` : ''}${sheet?.authorizedAt ? ` on ${new Date(sheet.authorizedAt).toLocaleString()}` : ''}`}
              description="Editing findings or the narrative and saving will revoke this approval — the record returns to Awaiting Approval for re-sign-off." />
          )}

          {/* ---- AI assist (only when the lab enabled it and a key is configured) ---- */}
          {aiEnabled && (
            <>
              <Divider orientation="left" plain><Space size={6}><RobotOutlined /> AI assist</Space></Divider>
              <Space wrap>
                <Button size="small" loading={genNarrative.isPending} disabled={aiBusy} onClick={() => genNarrative.mutate()}>Generate draft narrative</Button>
                <Button size="small" loading={suggest.isPending} disabled={aiBusy} onClick={() => suggest.mutate()}>Suggest codes</Button>
                <Button size="small" loading={consistency.isPending} disabled={aiBusy} onClick={() => consistency.mutate()}>Check consistency</Button>
              </Space>

              {suggestions && (
                <List
                  size="small" style={{ marginTop: 10 }} bordered
                  header={<Typography.Text type="secondary">Suggested codes — accept to add a result line</Typography.Text>}
                  locale={{ emptyText: 'No suggestions' }}
                  dataSource={suggestions}
                  renderItem={(s) => (
                    <List.Item actions={[<a key="a" onClick={() => acceptSuggestion(s)}>Accept</a>, <a key="r" onClick={() => setSuggestions((p) => (p ?? []).filter((x) => x !== s))}>Reject</a>]}>
                      <Space><Tag>{s.abbreviation}</Tag>{s.rationale && <Typography.Text type="secondary">{s.rationale}</Typography.Text>}{s.confidence && <Tag color="blue">{s.confidence}</Tag>}</Space>
                    </List.Item>
                  )}
                />
              )}

              {flags && (
                <Alert style={{ marginTop: 10 }} type={flags.length ? 'warning' : 'success'} showIcon
                  message={flags.length ? 'Consistency check — review before signing' : 'Consistency check — no issues found'}
                  description={flags.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{flags.map((f, i) => <li key={i}>{f.message}</li>)}</ul> : undefined} />
              )}
            </>
          )}

          {/* ---- Report narrative (human-owned; AI can draft into it) ---- */}
          <Divider orientation="left" plain>Report narrative</Divider>
          {aiDraftId && (
            <Alert type="info" showIcon style={{ marginBottom: 8 }}
              message="AI-drafted — review & edit before accepting"
              description="This text was AI-generated. You are responsible for the final wording. Accept to record it into the report, or edit freely."
              action={<Space direction="vertical"><Button size="small" type="primary" loading={acceptDraft.isPending} disabled={!narrative.trim()} onClick={() => acceptDraft.mutate()}>Accept into report</Button><Button size="small" onClick={() => rejectDraft.mutate()}>Reject</Button></Space>} />
          )}
          <Input.TextArea rows={5} placeholder="Report narrative / diagnosis…" value={narrative} onChange={(e) => setNarrative(e.target.value)} />

          <Divider orientation="left" plain>Code Sheet Results — findings &amp; assessment</Divider>
          {lineCount === 0 ? (
            <Empty description="No coded results on this sheet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            entries.map((entry, ei) => (
              <div key={entry.id ?? ei} style={{ marginBottom: 12 }}>
                {entry.resultLines.map((line, li) => (
                  <div key={line.id ?? li} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                    <Space style={{ justifyContent: 'space-between', width: '100%' }} align="start">
                      <Space direction="vertical" size={0}>
                        <Typography.Text strong>{line.abbreviation ?? '—'}</Typography.Text>
                        {line.result && <Typography.Text type="secondary">{line.result}</Typography.Text>}
                      </Space>
                      <Segmented
                        value={line.abnormalFinding ? 'Abnormal' : 'Normal'}
                        onChange={(v) => setLine(ei, li, { abnormalFinding: v === 'Abnormal' })}
                        options={[{ label: 'Normal', value: 'Normal' }, { label: 'Abnormal', value: 'Abnormal' }]}
                      />
                    </Space>
                    <Input.TextArea style={{ marginTop: 8 }} rows={2} placeholder="Findings for this result…" value={line.findings ?? ''} onChange={(e) => setLine(ei, li, { findings: e.target.value })} />
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
