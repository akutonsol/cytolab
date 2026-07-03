'use client';

import { useEffect, useState } from 'react';
import { App, Button, Descriptions, Empty, List, Modal, Select, Space, Tag, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DS } from '@/lib/drawer-styles';
import { DrawerHeader, PremiumFormStyles } from '@/components/DrawerChrome';

interface CodeSheet {
  id: string;
  abbreviation: string;
  description?: string | null;
}

interface RecordLite {
  id: string;
  labNumber?: string | null;
  formType?: string | null;
  patient?: { firstName: string; lastName: string; registrationNo?: string | null } | null;
  client?: { firstName: string; lastName: string; officeName?: string | null; accountNo?: string | null } | null;
  specimens?: Array<{ id: string; type: string }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  record: RecordLite | null;
}

export function ResultSheetModal({ open, onClose, record }: Props) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [chosen, setChosen] = useState<CodeSheet[]>([]);
  const isGyn = record?.formType === 'Gynecology';

  const { data: codeSheets } = useQuery({
    queryKey: ['codesheets'],
    queryFn: () => api.get<CodeSheet[]>('/codesheets').then((r) => r.data),
    enabled: open,
  });

  useEffect(() => {
    if (open) setChosen([]);
  }, [open, record?.id]);

  const addCode = (id: string) => {
    const code = (codeSheets ?? []).find((c) => c.id === id);
    if (code && !chosen.some((c) => c.id === code.id)) setChosen((prev) => [...prev, code]);
  };

  const save = useMutation({
    mutationFn: () =>
      api.post('/resultsheet/create', {
        recordId: record!.id,
        entries: [
          {
            specimenId: record!.specimens?.[0]?.id,
            // Each chosen code becomes a ResultLine (abbreviation + description
            // snapshotted — immutable even if the code catalog changes later).
            lines: chosen.map((c) => ({ abbreviation: c.abbreviation, findings: c.description ?? undefined })),
          },
        ],
      }),
    onSuccess: () => {
      message.success('Result sheet created — record moved to Resulted');
      qc.invalidateQueries({ queryKey: ['records'] });
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Failed to create result sheet'),
  });

  const codeLabel = (c: CodeSheet) => `${c.abbreviation}${c.description ? ` : ${c.description}` : ''}`;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={640}
      closable={false}
      footer={null}
      styles={{ content: { background: DS.drawerBg, borderRadius: 20, padding: 32 }, header: { display: 'none' }, footer: { display: 'none' } }}
    >
      <PremiumFormStyles />
      <DrawerHeader
        title="Result Sheet"
        subtitle={record?.labNumber ?? ''}
        onClose={onClose}
        actions={
          <>
            <button type="button" style={{ ...DS.btnPrimary, opacity: chosen.length === 0 || save.isPending ? 0.5 : 1 }} disabled={chosen.length === 0 || save.isPending} onClick={() => save.mutate()}>Save</button>
            <button type="button" style={DS.btnSecondary} onClick={onClose}>Cancel</button>
          </>
        }
      />
      <div className="ds-form">
      {record && (
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
            <Descriptions.Item label="Specimen(s)" span={2}>
              <Space size={[4, 4]} wrap>
                {(record.specimens ?? []).map((s) => <Tag key={s.id}>{s.type}</Tag>)}
                {(record.specimens ?? []).length === 0 && '—'}
                <Tag color="default">{isGyn ? 'Slide image (Phase 6)' : 'Vial image (Phase 6)'}</Tag>
              </Space>
            </Descriptions.Item>
          </Descriptions>

          <div style={DS.divider} />
          <div style={DS.sectionLabel}>Code Sheet Results</div>
          <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
            <Select
              showSearch
              style={{ width: '100%' }}
              placeholder="Add Code Sheet Result — search code : description"
              optionFilterProp="label"
              value={null}
              onChange={addCode}
              options={(codeSheets ?? []).map((c) => ({ value: c.id, label: codeLabel(c) }))}
              suffixIcon={<PlusOutlined />}
            />
          </Space.Compact>

          {chosen.length === 0 ? (
            <Empty description="No code sheet results yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <List
              size="small"
              bordered
              dataSource={chosen}
              renderItem={(c) => (
                <List.Item
                  actions={[
                    <Button
                      key="del"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => setChosen((prev) => prev.filter((x) => x.id !== c.id))}
                    />,
                  ]}
                >
                  <Typography.Text strong>{c.abbreviation}</Typography.Text>
                  {c.description && <Typography.Text type="secondary"> : {c.description}</Typography.Text>}
                </List.Item>
              )}
            />
          )}
        </>
      )}
      </div>
    </Modal>
  );
}
