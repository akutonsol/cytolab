import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces';

/**
 * Structured input for a rendered report. Assembled from live data
 * (lab + record + patient + client + authorized result sheet + report) so the
 * PDF always reflects the current authorization state — see ReportsService.
 */
export interface ReportDocumentData {
  lab: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    logoDataUri?: string | null; // only embedded when a data: URI (see ReportsService)
  };
  record: {
    identifier: string;
    labNumber?: string | null;
    clinicalDiagnosis?: string | null;
  };
  patient: {
    firstName: string;
    lastName: string;
    middleName?: string | null;
    registrationNo: string;
    age?: number | null;
    gender?: string | null;
    bloodGroup?: string | null;
    phoneNumber?: string | null;
    dateOfBirth?: Date | null;
  };
  client?: {
    firstName: string;
    lastName: string;
    officeName?: string | null;
  } | null;
  specimens: Array<{
    type: string;
    label?: string | null;
    bloodGroup?: string | null;
    dateReceived?: Date | null;
  }>;
  entries: Array<{
    specimenLabel?: string | null;
    lines: Array<{
      abbreviation?: string | null;
      result?: string | null;
      findings?: string | null;
      abnormalFinding: boolean;
    }>;
  }>;
  narrative?: {
    content?: string | null;
    medicalEntry?: string | null;
  } | null;
  authorizer: {
    name: string;
    signedAt: Date;
    signatureDataUri?: string | null; // image if a data: URI, else typed-name fallback
  };
}

const fmtDate = (d?: Date | null): string =>
  d ? new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' }) : '—';

const fmtDateTime = (d: Date): string =>
  new Date(d).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const labelValue = (label: string, value: string): Content => ({
  columns: [
    { text: label, width: 110, style: 'fieldLabel' },
    { text: value || '—', width: '*', style: 'fieldValue' },
  ],
  margin: [0, 1, 0, 1],
});

/**
 * Build the pdfmake document definition from assembled report data. Pure
 * (data in, definition out) so it can be unit-tested without rendering.
 */
export function buildReportDefinition(data: ReportDocumentData): TDocumentDefinitions {
  const { lab, record, patient, client, specimens, entries, narrative, authorizer } = data;

  const patientName = [patient.firstName, patient.middleName, patient.lastName]
    .filter(Boolean)
    .join(' ');

  // ---- Lab header (logo only when a safe data: URI is supplied) ----
  const headerText: Content = {
    stack: [
      { text: lab.name, style: 'labName' },
      ...(lab.address ? [{ text: lab.address, style: 'labMeta' } as Content] : []),
      {
        text: [lab.phone, lab.email].filter(Boolean).join('  •  '),
        style: 'labMeta',
      },
    ],
  };
  const header: Content = lab.logoDataUri
    ? { columns: [{ image: lab.logoDataUri, width: 90, fit: [90, 60] }, headerText] }
    : headerText;

  // ---- Specimen table ----
  const specimenTable: Content =
    specimens.length > 0
      ? {
          table: {
            headerRows: 1,
            widths: ['*', '*', '*', '*'],
            body: [
              [
                { text: 'Specimen', style: 'th' },
                { text: 'Label', style: 'th' },
                { text: 'Blood Group', style: 'th' },
                { text: 'Received', style: 'th' },
              ],
              ...specimens.map((s) => [
                s.type ?? '—',
                s.label ?? '—',
                s.bloodGroup ?? '—',
                fmtDate(s.dateReceived),
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
          margin: [0, 4, 0, 0],
        }
      : { text: 'No specimens recorded.', style: 'fieldValue', margin: [0, 4, 0, 0] };

  // ---- Results: one table of lines per entry ----
  const resultsContent: Content[] = entries.length
    ? entries.flatMap((entry, i): Content[] => [
        ...(entry.specimenLabel
          ? [{ text: entry.specimenLabel, style: 'entryHeading', margin: [0, i === 0 ? 4 : 8, 0, 2] } as Content]
          : []),
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', '*', 'auto'],
            body: [
              [
                { text: 'Code', style: 'th' },
                { text: 'Result', style: 'th' },
                { text: 'Findings', style: 'th' },
                { text: 'Flag', style: 'th' },
              ],
              ...(entry.lines.length
                ? entry.lines.map((l) => [
                    l.abbreviation ?? '—',
                    l.result ?? '—',
                    l.findings ?? '—',
                    {
                      text: l.abnormalFinding ? 'ABNORMAL' : 'Normal',
                      style: l.abnormalFinding ? 'abnormal' : 'normal',
                    },
                  ])
                : [[{ text: 'No results entered.', colSpan: 4, style: 'fieldValue' }, {}, {}, {}]]),
            ],
          },
          layout: 'lightHorizontalLines',
        },
      ])
    : [{ text: 'No results recorded.', style: 'fieldValue', margin: [0, 4, 0, 0] }];

  // ---- Diagnosis / narrative ----
  const narrativeBlocks: Content[] = [];
  if (record.clinicalDiagnosis) {
    narrativeBlocks.push(labelValue('Clinical Dx:', record.clinicalDiagnosis));
  }
  if (narrative?.content) {
    narrativeBlocks.push({ text: narrative.content, style: 'narrative', margin: [0, 2, 0, 0] });
  }
  if (narrative?.medicalEntry) {
    narrativeBlocks.push({ text: narrative.medicalEntry, style: 'narrative', margin: [0, 2, 0, 0] });
  }
  if (narrativeBlocks.length === 0) {
    narrativeBlocks.push({ text: 'No diagnosis narrative.', style: 'fieldValue' });
  }

  // ---- Signature block: image when a data: URI, else typed-name fallback ----
  const signatureMark: Content = authorizer.signatureDataUri
    ? { image: authorizer.signatureDataUri, fit: [160, 50] }
    : { text: authorizer.name, style: 'signatureTyped', margin: [0, 12, 0, 0] };

  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    defaultStyle: { font: 'Helvetica', fontSize: 9, lineHeight: 1.15 },
    footer: (current, total): Content => ({
      columns: [
        { text: `Record ${record.identifier}`, style: 'footer' },
        { text: `Page ${current} of ${total}`, alignment: 'right', style: 'footer' },
      ],
      margin: [40, 10, 40, 0],
    }),
    content: [
      header,
      { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1 }] },
      { text: 'LABORATORY REPORT', style: 'docTitle', margin: [0, 8, 0, 8] },

      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'Patient', style: 'sectionHeading' },
              labelValue('Name:', patientName),
              labelValue('Reg. No:', patient.registrationNo),
              labelValue('Age / DOB:', `${patient.age ?? '—'}  /  ${fmtDate(patient.dateOfBirth)}`),
              labelValue('Gender:', patient.gender ?? '—'),
              labelValue('Blood Group:', patient.bloodGroup ?? '—'),
              labelValue('Phone:', patient.phoneNumber ?? '—'),
            ],
          },
          {
            width: '*',
            stack: [
              { text: 'Record / Referral', style: 'sectionHeading' },
              labelValue('Record:', record.identifier),
              labelValue('Lab No:', record.labNumber ?? '—'),
              labelValue(
                'Referring:',
                client ? `${client.firstName} ${client.lastName}${client.officeName ? ` (${client.officeName})` : ''}` : '—',
              ),
            ],
          },
        ],
        columnGap: 20,
        margin: [0, 0, 0, 6],
      },

      { text: 'Specimens', style: 'sectionHeading' },
      specimenTable,

      { text: 'Results', style: 'sectionHeading', margin: [0, 10, 0, 0] },
      ...resultsContent,

      { text: 'Diagnosis', style: 'sectionHeading', margin: [0, 10, 0, 2] },
      ...narrativeBlocks,

      {
        margin: [0, 28, 0, 0],
        unbreakable: true,
        stack: [
          signatureMark,
          { canvas: [{ type: 'line', x1: 0, y1: 2, x2: 200, y2: 2, lineWidth: 0.5 }] },
          { text: authorizer.name, style: 'signatureName', margin: [0, 2, 0, 0] },
          { text: 'Authorized Signatory', style: 'fieldLabel' },
          { text: `Signed off: ${fmtDateTime(authorizer.signedAt)}`, style: 'fieldLabel' },
        ],
      },
    ],
    styles: {
      labName: { fontSize: 16, bold: true },
      labMeta: { fontSize: 8, color: '#555555' },
      docTitle: { fontSize: 13, bold: true, alignment: 'center', characterSpacing: 1 },
      sectionHeading: { fontSize: 10, bold: true, color: '#1f3a5f', margin: [0, 6, 0, 2] },
      entryHeading: { fontSize: 9, bold: true, color: '#333333' },
      fieldLabel: { fontSize: 8, color: '#666666' },
      fieldValue: { fontSize: 9 },
      th: { fontSize: 8, bold: true, fillColor: '#f0f3f7', color: '#1f3a5f' },
      abnormal: { fontSize: 8, bold: true, color: '#b00020' },
      normal: { fontSize: 8, color: '#2e7d32' },
      narrative: { fontSize: 9 },
      signatureTyped: { fontSize: 14, italics: true },
      signatureName: { fontSize: 9, bold: true },
      footer: { fontSize: 7, color: '#999999' },
    },
  };
}
