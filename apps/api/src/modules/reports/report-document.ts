import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';

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
    referringDoctor?: string | null;
    isGyn?: boolean;
    collectionDate?: Date | null;
    registeredAt?: Date | null;
  };
  // Gynaecological clinical details — present only for GYN records.
  gyn?: {
    previousCytology: boolean;
    clinicalAppearanceOfCervix?: string | null;
    pregnancies?: number | null;
    nowPregnant: boolean;
    lmp?: Date | null;
    routineCheck: boolean;
  } | null;
  // Cytotechnologist who entered the results (distinct from the authorizer).
  cytotechnologist?: string | null;
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
    designation?: string | null; // Pathologist / Cytologist, shown under the name
    signedAt: Date;
    signatureDataUri?: string | null; // image if a data: URI, else typed-name fallback
  };
}

// ─── Design system ────────────────────────────────────────────────────────────
const INDIGO = '#4F46E5';
const INDIGO_DARK = '#3730A3';
const INDIGO_LIGHT = '#EEF2FF';
const INDIGO_ON = '#E0E7FF'; // legible-on-indigo tint for band sub-text
const SLATE = '#0F172A';
const SLATE_MID = '#374151';
const SLATE_LIGHT = '#64748B';
const SLATE_MUTED = '#94A3B8';
const BORDER = '#E2E8F0';
const WHITE = '#FFFFFF';
const GREEN = '#16A34A';
const GREEN_LIGHT = '#F0FDF4';
const RED = '#DC2626';
const RED_LIGHT = '#FEF2F2';
const GOLD = '#D97706';
const GOLD_LIGHT = '#FFFBEB';
const SUBTLE_BG = '#F8FAFC';

// Content width for A4 with 40pt side margins (595.28 - 80).
const CW = 515;

const fmtDate = (d?: Date | null): string =>
  d ? new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' }) : '—';

const fmtDateTime = (d?: Date | null): string =>
  d
    ? new Date(d).toLocaleString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

// Collection time is treated as "not stated" when the stored time is midnight.
const timeNotStated = (d?: Date | null): boolean => {
  if (!d) return false;
  const x = new Date(d);
  return x.getHours() === 0 && x.getMinutes() === 0;
};

// "Coll/Sent" value: date, plus time when known, else a "(*)" marker.
const fmtCollection = (d?: Date | null): string => {
  if (!d) return '—';
  if (timeNotStated(d)) return `${fmtDate(d)}  (*)`;
  return `${fmtDate(d)}  ${new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};

// ─── Small builders ───────────────────────────────────────────────────────────
const sectionLabel = (text: string, topMargin = 16): Content => ({
  text,
  fontSize: 9,
  bold: true,
  color: INDIGO,
  characterSpacing: 0,
  margin: [0, topMargin, 0, 6],
});

const divider = (topMargin = 0): Content => ({
  canvas: [{ type: 'line', x1: 0, y1: 0, x2: CW, y2: 0, lineWidth: 0.5, lineColor: BORDER }],
  margin: [0, topMargin, 0, 0],
});

// A two-cell "label : value" line for the info tables.
const infoRow = (label: string, value?: string | null, opts: { bold?: boolean; color?: string } = {}): TableCell[] => {
  const has = value != null && value !== '';
  return [
    { text: label, fontSize: 9, color: SLATE_LIGHT },
    {
      text: has ? (value as string) : '—',
      fontSize: 10,
      bold: !!opts.bold && has,
      color: has ? opts.color ?? SLATE : SLATE_MUTED,
    },
  ];
};

const infoTable = (rows: TableCell[][]): Content => ({
  table: { widths: [92, '*'], body: rows },
  layout: {
    hLineWidth: () => 0,
    vLineWidth: () => 0,
    paddingLeft: () => 0,
    paddingRight: () => 6,
    paddingTop: () => 2.5,
    paddingBottom: () => 2.5,
  },
});

// A filled block with an optional 3pt left accent border, auto-sizing to content.
const accentBox = (fill: string, accent: string | null, body: Content[], margin: [number, number, number, number] = [0, 4, 0, 0]): Content => ({
  table: { widths: ['*'], body: [[{ stack: body, fillColor: fill }]] },
  layout: {
    hLineWidth: () => 0,
    vLineWidth: (i: number) => (accent && i === 0 ? 3 : 0),
    vLineColor: () => accent ?? fill,
    paddingLeft: () => 12,
    paddingRight: () => 12,
    paddingTop: () => 10,
    paddingBottom: () => 10,
  },
  margin,
});

/**
 * Build the pdfmake document definition from assembled report data. Pure
 * (data in, definition out) so it can be unit-tested without rendering.
 */
export function buildReportDefinition(data: ReportDocumentData): TDocumentDefinitions {
  const { lab, record, patient, client, specimens, entries, narrative, authorizer, gyn, cytotechnologist } = data;

  const patientName = [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' ');
  const reportRef = record.labNumber || record.identifier;
  const reportDate = authorizer?.signedAt ?? null;
  const authorized = !!authorizer?.signedAt;
  // Not in the data model today, but honoured if ever supplied — never breaks.
  const urgent = (record as unknown as { urgent?: boolean }).urgent === true;
  const referring = client
    ? client.officeName || `${client.firstName} ${client.lastName}`.trim()
    : null;
  const firstSpecimenDate = specimens.find((s) => s.dateReceived)?.dateReceived ?? null;

  // ── 1. Header band ──────────────────────────────────────────────────────────
  const headerBand: Content = {
    stack: [
      { canvas: [{ type: 'rect', x: 0, y: 0, w: CW, h: 80, color: INDIGO }] },
      {
        columns: [
          // LEFT — lab name + subtitle
          {
            width: 150,
            stack: [
              { text: lab.name, color: WHITE, fontSize: 18, bold: true },
              { text: 'Cytology & Pathology Laboratory', color: '#C7D2FE', fontSize: 10, margin: [0, 3, 0, 0] },
            ],
          },
          // CENTER — report title (fixed width + noWrap so it never breaks lines)
          {
            width: 200,
            stack: [
              { text: 'CYTOLOGY REPORT', color: WHITE, fontSize: 18, bold: true, characterSpacing: 1, alignment: 'center', noWrap: true },
            ],
          },
          // RIGHT — ref, date, lab contact
          {
            width: '*',
            stack: [
              { text: `Ref  ${reportRef}`, color: INDIGO_ON, fontSize: 10, alignment: 'right' },
              { text: fmtDate(reportDate), color: '#C7D2FE', fontSize: 9, alignment: 'right', margin: [0, 2, 0, 0] },
              ...(lab.address ? [{ text: lab.address, color: WHITE, fontSize: 7, alignment: 'right', margin: [0, 3, 0, 0] } as Content] : []),
              ...(lab.phone ? [{ text: lab.phone, color: WHITE, fontSize: 7, alignment: 'right', margin: [0, 1, 0, 0] } as Content] : []),
              ...(lab.email ? [{ text: lab.email, color: WHITE, fontSize: 7, alignment: 'right', margin: [0, 1, 0, 0] } as Content] : []),
            ],
          },
        ],
        margin: [16, -64, 16, 0],
      },
    ],
  };

  // ── Urgency banner (only if flagged) ────────────────────────────────────────
  const urgencyBanner: Content[] = urgent
    ? [
        {
          stack: [
            { canvas: [{ type: 'rect', x: 0, y: 0, w: CW, h: 22, color: RED_LIGHT }] },
            { text: 'URGENT  —  PRIORITY PROCESSING REQUIRED', color: RED, bold: true, characterSpacing: 1, fontSize: 10, alignment: 'center', margin: [0, -16, 0, 0] },
          ],
          margin: [0, 6, 0, 0],
        },
      ]
    : [];

  // ── 2. Patient + specimen information ───────────────────────────────────────
  const infoColumns: Content = {
    columns: [
      {
        width: '*',
        stack: [
          sectionLabel('PATIENT INFORMATION', 14),
          infoTable([
            infoRow('Patient Name', patientName, { bold: true }),
            infoRow('Date of Birth', `${fmtDate(patient.dateOfBirth)}${patient.age != null ? `   (Age ${patient.age})` : ''}`),
            infoRow('Gender', patient.gender),
            infoRow('Med Rec #', patient.registrationNo),
            infoRow('Tel No', patient.phoneNumber),
            infoRow('Ref Dr', record.referringDoctor),
            infoRow('Clinic', referring),
          ]),
        ],
      },
      {
        width: '*',
        stack: [
          sectionLabel('SPECIMEN INFORMATION', 14),
          infoTable([
            infoRow('Lab Number', record.labNumber, { bold: true, color: INDIGO }),
            infoRow('Specimen Type', specimens[0]?.type),
            infoRow('Coll/Sent', fmtCollection(record.collectionDate)),
            infoRow("Rec'd/Reg'd", `${fmtDate(firstSpecimenDate)} / ${fmtDate(record.registeredAt)}`),
            infoRow('Report Date', fmtDate(reportDate)),
          ]),
        ],
      },
    ],
    columnGap: 28,
  };

  // Footnote shown only when a collection time was not captured.
  const collectionFootnote: Content[] =
    record.collectionDate && timeNotStated(record.collectionDate)
      ? [{ text: '(*) = Collection time not stated', fontSize: 8, italics: true, color: SLATE_MUTED, margin: [0, 5, 0, 0] }]
      : [];

  // ── Gynaecological details (GYN records only) ───────────────────────────────
  // Gate strictly on the record being GYN-typed — never render for non-GYN.
  const gynSection: Content[] = record.isGyn && gyn
    ? [
        sectionLabel('GYNAECOLOGICAL DETAILS'),
        accentBox(INDIGO_LIGHT, null, [
          {
            columns: [
              {
                width: '*',
                stack: [
                  infoTable([
                    infoRow('Previous Cytology', gyn.previousCytology ? 'Yes' : 'No'),
                    infoRow('Now Pregnant', gyn.nowPregnant ? 'Yes' : 'No'),
                    infoRow('Routine Check', gyn.routineCheck ? 'Yes' : 'No'),
                  ]),
                ],
              },
              {
                width: '*',
                stack: [
                  infoTable([
                    infoRow('No. of Pregnancies', gyn.pregnancies != null ? String(gyn.pregnancies) : null),
                    infoRow('LMP', gyn.lmp ? fmtDate(gyn.lmp) : null),
                    infoRow('Clinical Appearance', gyn.clinicalAppearanceOfCervix),
                  ]),
                ],
              },
            ],
            columnGap: 20,
          },
        ]),
      ]
    : [];

  // ── 3. Specimens received (indigo-tinted box) ───────────────────────────────
  // De-duplicate identical specimens (same type/label/blood group/received date)
  // so a record with e.g. two identical URINE rows doesn't render "URINE / URINE".
  const specKey = (s: (typeof specimens)[number]) =>
    `${s.type}|${s.label ?? ''}|${s.bloodGroup ?? ''}|${s.dateReceived ? +new Date(s.dateReceived) : ''}`;
  const uniqueSpecimens = specimens.filter((s, i, arr) => arr.findIndex((x) => specKey(x) === specKey(s)) === i);
  const specimenGrid: Content =
    uniqueSpecimens.length > 0
      ? {
          columns: chunk(uniqueSpecimens, Math.ceil(uniqueSpecimens.length / Math.min(uniqueSpecimens.length, 3))).map((group) => ({
            width: '*',
            stack: group.map((s) => ({
              margin: [0, 0, 0, 6],
              stack: [
                { text: s.type || '—', fontSize: 10, bold: true, color: SLATE },
                {
                  text: [s.label, s.bloodGroup ? `Blood ${s.bloodGroup}` : null, s.dateReceived ? fmtDate(s.dateReceived) : null]
                    .filter(Boolean)
                    .join('  ·  ') || '—',
                  fontSize: 9,
                  color: SLATE_LIGHT,
                  margin: [0, 1, 0, 0],
                },
              ],
            })),
          })),
          columnGap: 16,
        }
      : { text: 'No specimens recorded.', fontSize: 10, color: SLATE_MUTED, italics: true };

  // ── 4. Cytological findings ─────────────────────────────────────────────────
  const findingsBlocks: Content[] = entries.length
    ? entries.flatMap((entry, i): Content[] => [
        {
          columns: [
            { width: 8, canvas: [{ type: 'rect', x: 0, y: 1, w: 3, h: 12, color: INDIGO }] },
            { width: '*', text: entry.specimenLabel || `Specimen ${i + 1}`, fontSize: 11, bold: true, color: SLATE },
          ],
          margin: [0, i === 0 ? 4 : 12, 0, 5],
        },
        entry.lines.length
          ? {
              table: {
                headerRows: 1,
                widths: ['auto', '*', '*', 'auto'],
                body: [
                  [
                    findingTh('CODE'),
                    findingTh('FINDING'),
                    findingTh('RESULT'),
                    findingTh('FLAG'),
                  ],
                  ...entry.lines.map((l): TableCell[] => {
                    const abn = l.abnormalFinding;
                    return [
                      { text: l.abbreviation || '—', fontSize: 10, bold: true, color: SLATE },
                      {
                        // '•' is WinAnsi-safe (the standard Helvetica encoding);
                        // '●' is not and would render blank.
                        text: [
                          { text: '•  ', color: abn ? RED : GREEN, bold: true },
                          { text: l.findings || '—', color: SLATE },
                        ],
                        fontSize: 10,
                      },
                      { text: l.result || '—', fontSize: 10, color: SLATE_MID },
                      { text: abn ? 'Abnormal' : 'Normal', fontSize: 9, bold: true, color: abn ? RED : GREEN },
                    ];
                  }),
                ],
              },
              layout: {
                hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
                vLineWidth: () => 0,
                hLineColor: () => BORDER,
                paddingLeft: (i: number) => (i === 0 ? 0 : 8),
                paddingRight: () => 8,
                paddingTop: () => 5,
                paddingBottom: () => 5,
                fillColor: (rowIndex: number) => (rowIndex === 0 ? SUBTLE_BG : null),
              },
            }
          : { text: 'No findings recorded', italics: true, fontSize: 10, color: SLATE_MUTED, margin: [0, 0, 0, 2] },
      ])
    : [{ text: 'No findings recorded.', italics: true, fontSize: 10, color: SLATE_MUTED }];

  // ── 5. Pathologist's narrative ──────────────────────────────────────────────
  const narrativeText = [narrative?.content, narrative?.medicalEntry].filter(Boolean).join('\n\n');
  const narrativeSection: Content[] = narrativeText
    ? [
        sectionLabel("PATHOLOGIST'S NARRATIVE"),
        accentBox(SUBTLE_BG, INDIGO, [
          { text: narrativeText, fontSize: 11, color: SLATE, lineHeight: 1.6, italics: true },
        ]),
      ]
    : [];

  // ── 6. Clinical diagnosis ───────────────────────────────────────────────────
  const diagnosisSection: Content[] = record.clinicalDiagnosis
    ? [
        sectionLabel('CLINICAL DIAGNOSIS'),
        accentBox(INDIGO_LIGHT, INDIGO, [
          { text: record.clinicalDiagnosis, fontSize: 13, bold: true, color: SLATE, lineHeight: 1.35 },
        ]),
      ]
    : [];

  // ── 7. Authorization ────────────────────────────────────────────────────────
  const authLeft: any = authorized
    ? {
        width: '*',
        stack: [
          {
            // Checkmark drawn on canvas — the '✓' glyph is not in Helvetica's
            // WinAnsi encoding and would render blank.
            columns: [
              {
                width: 18,
                canvas: [
                  { type: 'line', x1: 0, y1: 8, x2: 5, y2: 14, lineWidth: 2.4, lineColor: GREEN },
                  { type: 'line', x1: 5, y1: 14, x2: 15, y2: 1, lineWidth: 2.4, lineColor: GREEN },
                ],
              },
              { width: 'auto', text: 'AUTHORIZED', color: GREEN, bold: true, fontSize: 14, characterSpacing: 1, margin: [6, 1, 0, 0] },
            ],
          },
          { text: 'This report has been reviewed and authorized for release by:', fontSize: 9, color: SLATE_LIGHT, margin: [0, 8, 0, 4] },
          { text: authorizer.name, fontSize: 12, bold: true, color: SLATE },
          ...(authorizer.designation ? [{ text: authorizer.designation, fontSize: 10, color: INDIGO_DARK } as Content] : []),
          { text: `Authorized ${fmtDateTime(authorizer.signedAt)}`, fontSize: 10, color: SLATE_LIGHT, margin: [0, 2, 0, 0] },
        ],
      }
    : {
        width: '*',
        stack: [
          { text: 'PENDING AUTHORIZATION', color: RED, bold: true, fontSize: 12, characterSpacing: 1 },
          { text: 'This report is not yet authorized for release.', fontSize: 9, color: SLATE_LIGHT, margin: [0, 4, 0, 0] },
        ],
      };

  const signatureInner: Content = authorizer.signatureDataUri
    ? { image: authorizer.signatureDataUri, fit: [180, 46], alignment: 'center', margin: [0, 4, 0, 4] }
    : {
        stack: [
          { text: '________________________', alignment: 'center', color: SLATE_MUTED, fontSize: 12, margin: [0, 16, 0, 2] },
          { text: authorizer.name, alignment: 'center', fontSize: 9, color: SLATE_MID, italics: true },
        ],
      };

  const authRight: any = {
    width: 200,
    stack: [
      { text: 'DIGITAL SIGNATURE', fontSize: 8, bold: true, color: SLATE_MUTED, characterSpacing: 1, alignment: 'center', margin: [0, 0, 0, 4] },
      {
        table: { widths: ['*'], heights: [58], body: [[{ stack: [signatureInner], border: [true, true, true, true] }]] },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => BORDER,
          vLineColor: () => BORDER,
          hLineStyle: () => ({ dash: { length: 3, space: 2 } }),
          vLineStyle: () => ({ dash: { length: 3, space: 2 } }),
          paddingLeft: () => 8,
          paddingRight: () => 8,
          paddingTop: () => 6,
          paddingBottom: () => 6,
        },
      },
    ],
  };

  // ── Cytotechnologist (result entry) — distinct from the authorizer ──────────
  const cytotechSection: Content[] = authorized
    ? [
        {
          margin: [0, 18, 0, 0],
          columns: [
            {
              width: '*',
              stack: [
                { text: 'CYTOTECHNOLOGIST', fontSize: 8, bold: true, color: SLATE_MUTED, characterSpacing: 1 },
                { text: cytotechnologist || '—', fontSize: 11, bold: true, color: SLATE, margin: [0, 3, 0, 0] },
              ],
            },
            {
              width: '*',
              stack: [
                { text: 'COMMENTS', fontSize: 8, bold: true, color: SLATE_MUTED, characterSpacing: 1 },
                { text: 'APPROVED', fontSize: 11, bold: true, color: GREEN, margin: [0, 3, 0, 0] },
              ],
            },
          ],
          columnGap: 24,
        },
      ]
    : [];

  const authorizationSection: Content = {
    margin: [0, 22, 0, 0],
    unbreakable: true,
    stack: [
      divider(),
      sectionLabel('AUTHORIZATION', 12),
      { columns: [authLeft, authRight], columnGap: 24 },
    ],
  };

  // ── End-of-report marker ────────────────────────────────────────────────────
  const endMarker: Content = {
    text: '--- End of Laboratory Report ---',
    alignment: 'center',
    fontSize: 9,
    italics: true,
    color: SLATE_MUTED,
    characterSpacing: 0.5,
    margin: [0, 20, 0, 0],
  };

  // ── Assemble ────────────────────────────────────────────────────────────────
  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 60],
    defaultStyle: { font: 'Helvetica', fontSize: 10, color: SLATE, lineHeight: 1.2 },
    // Faint draft mark on any not-yet-authorized render (pdfmake can't rotate
    // text, so it's centred rather than diagonal).
    background: (_page: number, size: { width: number; height: number }): Content | null =>
      authorized
        ? null
        : {
            text: 'DRAFT — NOT AUTHORIZED',
            color: '#EEF1F6',
            bold: true,
            fontSize: 46,
            alignment: 'center',
            margin: [0, size.height / 2 - 40, 0, 0],
          },
    footer: (current: number, total: number): Content => ({
      margin: [40, 0, 40, 0],
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CW, y2: 0, lineWidth: 0.5, lineColor: BORDER }] },
        {
          columns: [
            { width: '*', text: `${lab.name}  ·  Confidential — for medical use only`, fontSize: 8, color: SLATE_MUTED },
            { width: 'auto', text: `Page ${current} of ${total}`, fontSize: 8, color: SLATE_MUTED, alignment: 'center' },
            { width: '*', text: `Generated ${fmtDate(new Date())}`, fontSize: 8, color: SLATE_MUTED, alignment: 'right' },
          ],
          columnGap: 12,
          margin: [0, 5, 0, 0],
        },
      ],
    }),
    content: [
      headerBand,
      ...urgencyBanner,
      infoColumns,
      ...collectionFootnote,
      ...gynSection,
      divider(14),
      sectionLabel('SPECIMENS RECEIVED'),
      accentBox(INDIGO_LIGHT, null, [specimenGrid]),
      sectionLabel('CYTOLOGICAL FINDINGS'),
      ...findingsBlocks,
      ...narrativeSection,
      ...diagnosisSection,
      ...cytotechSection,
      authorizationSection,
      endMarker,
    ],
  };
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function findingTh(text: string): TableCell {
  return { text, fontSize: 9, bold: true, color: SLATE_MUTED, characterSpacing: 0.5, fillColor: SUBTLE_BG };
}

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
