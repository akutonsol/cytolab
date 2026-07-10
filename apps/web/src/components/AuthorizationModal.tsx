'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Descriptions, Empty, Input, List, Modal, Segmented, Space, Tag, Typography } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DS } from '@/lib/drawer-styles';
import { DrawerHeader, PremiumFormStyles } from '@/components/DrawerChrome';
import { DraftRestoreBanner } from '@/components/DraftRestoreBanner';
import { useAutosaveDraft, loadDraft, clearDraft, type Draft } from '@/lib/session-drafts';
import { DrawPad } from './DrawPad';
import { ResultTemplateSelector } from './ResultTemplateSelector';
import { composeNarrative, type ResultTemplate } from '@/lib/result-templates';
import { PriorHistoryPanel } from './PriorHistoryPanel';
import { BethesdaClassificationModal } from './BethesdaClassificationModal';
import { AIScreeningCard } from './AIScreeningCard';
import { NewConsultModal } from './NewConsultModal';
import { FhirTransmitModal } from './FhirTransmitModal';
import { STATUS_META as CODING_STATUS_META, type RecordCoding } from '@/lib/coding';

function CodingStatusBadge({ recordId }: { recordId: string }) {
  const { data: codings } = useQuery<RecordCoding[]>({ queryKey: ['coding-record', recordId], queryFn: () => api.get(`/coding/record/${recordId}`).then((r) => r.data) });
  const list = codings ?? [];
  const types = new Set(list.map((c) => c.codeType));
  const status = list.length === 0 ? 'Uncoded' : (types.has('Procedure') && types.has('Diagnosis')) ? 'Coded' : 'Partial';
  const m = CODING_STATUS_META[status];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Coding</span>
      <span style={{ background: m.bg, color: m.fg, boxShadow: m.outline ? `inset 0 0 0 1px ${m.fg}` : undefined, borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>{m.label}</span>
      {list.length > 0 && <span style={{ fontSize: 12, color: '#475569' }}>{list.length} code{list.length === 1 ? '' : 's'}</span>}
    </div>
  );
}
import { DictationTextarea } from './DictationTextarea';
import type { DictationButtonHandle } from './DictationButton';
import { FeatureGate } from './FeatureGate';
import { notify } from '@/lib/notify';

interface RecordLite {
  id: string;
  labNumber?: string | null;
  formType?: string | null;
  status?: string;
  patientId?: string | null;
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
  const [templateOpen, setTemplateOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [bethesdaOpen, setBethesdaOpen] = useState(false);
  const [consultOpen, setConsultOpen] = useState(false);
  const [fhirOpen, setFhirOpen] = useState(false);
  const { data: fhirEndpoints } = useQuery<{ id: string; isActive: boolean }[]>({ queryKey: ['fhir-endpoints'], queryFn: () => api.get('/fhir/endpoints').then((r) => r.data), enabled: !!record?.id });
  const fhirEndpointCount = (fhirEndpoints ?? []).filter((e) => e.isActive).length;
  const [aiDraftId, setAiDraftId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CodeSuggestion[] | null>(null);
  const [flags, setFlags] = useState<ConsistencyFlag[] | null>(null);
  const [signatureDataUri, setSignatureDataUri] = useState<string | null>(null);
  const [saveSignature, setSaveSignature] = useState(false);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const isGyn = record?.formType === 'Gynecology';
  const narrativeDictation = useRef<DictationButtonHandle>(null);

  // Cmd+Shift+D (Mac) / Ctrl+Shift+D (Win) toggles narrative dictation.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        narrativeDictation.current?.toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Load the authorizer's saved profile signature so they can reuse it.
  useEffect(() => {
    if (!open) return;
    setSignatureDataUri(null);
    setSaveSignature(false);
    api.get('/users/me/signature')
      .then((r) => { if (r.data?.signatureUrl) setSavedSignature(r.data.signatureUrl); })
      .catch(() => {});
  }, [open]);

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

  // Auto-draft unsaved narrative + line edits so an idle timeout never loses the
  // report the authorizer is composing. Offered back on return (not for already-
  // authorized sheets, which are read-only until revoked).
  const draftKey = sheetId && !authorized ? `authorization-${sheetId}` : '';
  useAutosaveDraft(draftKey, () => ({ narrative, entries }), open && !!draftKey);
  const [draft, setDraft] = useState<Draft<{ narrative: string; entries: typeof entries }> | null>(null);
  useEffect(() => {
    setDraft(open && draftKey ? loadDraft(draftKey) : null);
  }, [open, draftKey]);

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
    onSuccess: () => { notify.success(authorized ? 'Saved — authorization revoked, re-sign to approve' : 'Saved'); if (draftKey) clearDraft(draftKey); invalidate(); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Save failed'),
  });

  const signOff = useMutation({
    mutationFn: async () => {
      await saveContent();
      await api.put(`/resultsheet/authorize/${sheetId}`, { signature: signatureDataUri ?? undefined });
      // Best-effort profile save; never block the authorization on it.
      if (saveSignature && signatureDataUri) {
        await api.put('/users/me/signature', { signatureDataUri }).catch(() => {});
      }
    },
    onSuccess: () => { notify.success('Signed off — record Approved, report releasable'); if (draftKey) clearDraft(draftKey); invalidate(); onClose(); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Sign-off failed'),
  });

  // ---- AI assist (strictly assistive; degrades to a message when unavailable) ----
  const degraded = (reason?: string) => notify.info(reason ?? 'AI is unavailable right now');

  const genNarrative = useMutation({
    mutationFn: () => api.post(`/resultsheet/${sheetId}/ai/narrative`).then((r) => r.data),
    onSuccess: (res) => {
      if (!res.available) return degraded(res.reason);
      setNarrative(res.data.output);
      setAiDraftId(res.data.id);
      notify.success('AI draft ready — review and edit before accepting');
    },
    onError: () => degraded(),
  });

  const acceptDraft = useMutation({
    mutationFn: () => api.put(`/resultsheet/${sheetId}/ai/narrative/${aiDraftId}/accept`, { finalText: narrative }),
    onSuccess: () => { notify.success('Accepted into report'); setAiDraftId(null); invalidate(); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Accept failed'),
  });

  const rejectDraft = useMutation({
    mutationFn: () => api.put(`/resultsheet/${sheetId}/ai/narrative/${aiDraftId}/reject`, {}),
    onSuccess: () => { notify.info('Draft rejected'); setAiDraftId(null); },
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
    notify.info(`Added ${s.abbreviation} — Save to persist`);
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
      notify.error(e?.response?.data?.message ?? 'Report unavailable');
    }
  };

  const aiBusy = genNarrative.isPending || suggest.isPending || consistency.isPending;

  // Apply a result template into the narrative. Never silently overwrite existing
  // content — confirm first when the narrative already has text.
  const applyTemplate = (t: ResultTemplate) => {
    const text = composeNarrative(t);
    const done = () => { setNarrative(text); notify.success(`Template “${t.name}” applied — review and adjust as needed.`); };
    if (narrative.trim()) {
      modal.confirm({
        title: 'Replace the current narrative?',
        content: `Applying “${t.name}” will overwrite the report narrative you have. This can’t be undone.`,
        okText: 'Replace', cancelText: 'Keep mine',
        onOk: done,
      });
    } else done();
  };

  // Apply a saved Bethesda classification's generated narrative into the report.
  const applyBethesda = (text: string, shortCode: string | null) => {
    const done = () => { setNarrative(text); notify.success(`Bethesda classification${shortCode ? ` (${shortCode})` : ''} applied to the report narrative.`); };
    if (narrative.trim()) {
      modal.confirm({ title: 'Replace the current narrative?', content: 'The Bethesda narrative will overwrite the report narrative you have.', okText: 'Replace', cancelText: 'Keep mine', onOk: done });
    } else done();
  };

  return (
    <>
    <Modal
      open={open}
      onCancel={onClose}
      width={760}
      closable={false}
      footer={null}
      styles={{ content: { background: DS.drawerBg, borderRadius: 20, padding: 32 }, header: { display: 'none' }, footer: { display: 'none' } }}
    >
      <PremiumFormStyles />
      <DrawerHeader
        title="Authorization"
        subtitle={`${record?.labNumber ?? ''}${record?.patient ? ` · ${record.patient.firstName} ${record.patient.lastName}` : ''}${authorized ? ' · Approved' : ''}`}
        onClose={onClose}
        actions={
          <>
            <button type="button" style={{ ...DS.btnPrimary, background: '#16A34A', opacity: !sheetId || lineCount === 0 || authorized || signOff.isPending ? 0.5 : 1 }} disabled={!sheetId || lineCount === 0 || authorized || signOff.isPending} onClick={confirmSignOff}>Sign off &amp; Approve</button>
            <button type="button" style={{ ...DS.btnSecondary, opacity: !sheetId || lineCount === 0 || save.isPending ? 0.6 : 1 }} disabled={!sheetId || lineCount === 0 || save.isPending} onClick={() => save.mutate()}>Save</button>
            <button type="button" style={{ ...DS.btnSecondary, opacity: !authorized ? 0.5 : 1 }} disabled={!authorized} onClick={openReport}>Email / Print Report</button>
            {record?.patientId && (
              <FeatureGate feature="PRIOR_HISTORY">
                <button type="button" style={DS.btnSecondary} onClick={() => setHistoryOpen(true)}>Prior History</button>
              </FeatureGate>
            )}
            {record?.id && (
              <FeatureGate feature="TELECONSULTATION">
                <button type="button" style={DS.btnSecondary} onClick={() => setConsultOpen(true)}>Consult</button>
              </FeatureGate>
            )}
            {record?.id && authorized && fhirEndpointCount > 0 && (
              <FeatureGate feature="HL7_FHIR">
                <button type="button" style={{ ...DS.btnSecondary, color: '#4F46E5' }} onClick={() => setFhirOpen(true)}>Transmit to EMR</button>
              </FeatureGate>
            )}
            <button type="button" style={DS.btnSecondary} onClick={onClose}>Close</button>
          </>
        }
      />
      <div className="ds-form">
      {!record ? null : !sheetId ? (
        <Empty description="This record has no result sheet yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <>
          {draft && !authorized && (
            <DraftRestoreBanner
              savedAt={draft.savedAt}
              label="report"
              onRestore={() => { setNarrative(draft.data.narrative ?? ''); if (draft.data.entries) setEntries(draft.data.entries); setDraft(null); }}
              onDiscard={() => { clearDraft(draftKey); setDraft(null); }}
            />
          )}
          {record.id && (
            <FeatureGate feature="AI_SCREENING">
              <div style={{ marginBottom: 16 }}><AIScreeningCard recordId={record.id} /></div>
            </FeatureGate>
          )}
          {record.id && (
            <FeatureGate feature="LOINC_SNOMED">
              <div style={{ marginBottom: 16 }}><CodingStatusBadge recordId={record.id} /></div>
            </FeatureGate>
          )}
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
              <div style={{ background: '#EEF2F8', border: '1px solid #DBE5F4', borderRadius: 16, padding: 20, marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <RobotOutlined style={{ color: '#4F46E5' }} />
                  <span style={{ fontFamily: 'Geist, sans-serif', fontWeight: 700, fontStyle: 'italic', color: '#1E3A8A', fontSize: 16 }}>AI Reasoning</span>
                </div>
                <p style={{ fontSize: 13, fontStyle: 'italic', color: '#475569', margin: '0 0 12px' }}>
                  Assistive drafting only — you review and own every word before it ships.
                </p>
                <Space wrap>
                  <button type="button" style={{ ...DS.btnOutline, padding: '7px 16px', fontSize: 13, opacity: aiBusy ? 0.6 : 1 }} disabled={aiBusy} onClick={() => genNarrative.mutate()}>Generate draft narrative</button>
                  <button type="button" style={{ ...DS.btnOutline, padding: '7px 16px', fontSize: 13, opacity: aiBusy ? 0.6 : 1 }} disabled={aiBusy} onClick={() => suggest.mutate()}>Suggest codes</button>
                  <button type="button" style={{ ...DS.btnOutline, padding: '7px 16px', fontSize: 13, opacity: aiBusy ? 0.6 : 1 }} disabled={aiBusy} onClick={() => consistency.mutate()}>Check consistency</button>
                  <button type="button" style={{ ...DS.btnOutline, padding: '7px 16px', fontSize: 13 }} onClick={() => notify.info('Similar cases view is coming soon')}>View Similar Cases</button>
                </Space>
              </div>

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
                flags.length ? (
                  <div style={{ ...DS.lockedBanner, marginTop: 10, display: 'block' }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Consistency check — review before signing</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>{flags.map((f, i) => <li key={i}>{f.message}</li>)}</ul>
                  </div>
                ) : (
                  <Alert style={{ marginTop: 10 }} type="success" showIcon message="Consistency check — no issues found" />
                )
              )}
            </>
          )}

          {/* ---- Report narrative (human-owned; AI can draft into it) ---- */}
          <div style={DS.divider} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={DS.sectionLabel}>Report narrative</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {isGyn && record?.id && (
                <FeatureGate feature="BETHESDA_SYSTEM">
                  <button type="button" style={{ ...DS.btnOutline, padding: '6px 14px', fontSize: 13 }} onClick={() => setBethesdaOpen(true)}>Bethesda</button>
                </FeatureGate>
              )}
              <FeatureGate feature="RESULT_TEMPLATES">
                <button type="button" style={{ ...DS.btnOutline, padding: '6px 14px', fontSize: 13 }} onClick={() => setTemplateOpen(true)}>Use Template</button>
              </FeatureGate>
            </div>
          </div>
          {aiDraftId && (
            <Alert type="info" showIcon style={{ marginBottom: 8 }}
              message="AI-drafted — review & edit before accepting"
              description="This text was AI-generated. You are responsible for the final wording. Accept to record it into the report, or edit freely."
              action={<Space direction="vertical"><Button size="small" type="primary" loading={acceptDraft.isPending} disabled={!narrative.trim()} onClick={() => acceptDraft.mutate()}>Accept into report</Button><Button size="small" onClick={() => rejectDraft.mutate()}>Reject</Button></Space>} />
          )}
          <FeatureGate
            feature="VOICE_TO_TEXT"
            fallback={
              <textarea
                rows={5}
                placeholder="Report narrative / diagnosis…"
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                style={{ width: '100%', borderRadius: 18, border: '1px solid #d9d9d9', padding: '12px 14px', fontSize: 16, lineHeight: 1.5, fontFamily: 'inherit', outline: 'none', resize: 'vertical', color: '#111827' }}
              />
            }
          >
            <DictationTextarea
              dictationRef={narrativeDictation}
              rows={5}
              placeholder="Report narrative / diagnosis…"
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              style={{ width: '100%', borderRadius: 18, border: '1px solid #d9d9d9', padding: '12px 14px', fontSize: 16, lineHeight: 1.5, fontFamily: 'inherit', outline: 'none', resize: 'vertical', color: '#111827' }}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: '#8a93a6' }}>
              Click 🎤 to dictate — speak clearly, punctuation is spoken (e.g. &ldquo;comma&rdquo;, &ldquo;period&rdquo;, &ldquo;new line&rdquo;). Press <strong>{typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl'}+Shift+D</strong> to toggle.
            </div>
          </FeatureGate>

          <div style={DS.divider} />
          <div style={DS.sectionLabel}>Code Sheet Results — findings &amp; assessment</div>
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

          {/* Signature section */}
          <div style={{
            background: '#F8F9FF', borderRadius: 14,
            border: '1px solid #E0E7FF', padding: '16px 18px',
            marginTop: 16,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 12,
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
                  Authorization Signature
                </div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                  Your signature will appear on the released report
                </div>
              </div>
              {/* Load saved signature button */}
              {savedSignature && !signatureDataUri && (
                <button
                  type="button"
                  onClick={() => setSignatureDataUri(savedSignature)}
                  style={{
                    fontSize: 12, fontWeight: 600, color: '#4F46E5',
                    background: '#EEF2FF', border: 'none',
                    borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
                  }}>
                  Use saved signature
                </button>
              )}
            </div>

            <DrawPad
              value={signatureDataUri}
              onChange={setSignatureDataUri}
              width={460}
              height={130}
            />

            {/* Save for future use */}
            {signatureDataUri && (
              <label style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginTop: 10, cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={saveSignature}
                  onChange={(e) => setSaveSignature(e.target.checked)}
                  style={{ accentColor: '#4F46E5', width: 15, height: 15 }}
                />
                <span style={{ fontSize: 12, color: '#475569' }}>
                  Save signature to my profile for future authorizations
                </span>
              </label>
            )}
          </div>
        </>
      )}
      </div>
    </Modal>
    <ResultTemplateSelector open={templateOpen} onClose={() => setTemplateOpen(false)} onSelect={applyTemplate} />
    <PriorHistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} patientId={record?.patientId} excludeRecordId={record?.id} />
    {record?.id && <BethesdaClassificationModal open={bethesdaOpen} onClose={() => setBethesdaOpen(false)} recordId={record.id} onApply={applyBethesda} />}
    {record?.id && consultOpen && <NewConsultModal recordId={record.id} onClose={() => setConsultOpen(false)} />}
    {record?.id && fhirOpen && <FhirTransmitModal recordId={record.id} onClose={() => setFhirOpen(false)} />}
    </>
  );
}
