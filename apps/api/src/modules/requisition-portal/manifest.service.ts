import { Injectable } from '@nestjs/common';
import type {
  TDocumentDefinitions,
  TFontDictionary,
} from 'pdfmake/interfaces';

// Server-side pdfmake via the Node PdfPrinter (not the browser build), matching
// ReportPdfService. Fonts are the 14 built-in standard fonts (no font files).
interface PdfPrinterCtor {
  new (fonts: TFontDictionary): {
    createPdfKitDocument(def: TDocumentDefinitions): NodeJS.ReadableStream & {
      end(): void;
    };
  };
}
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PdfPrinter = require('pdfmake') as PdfPrinterCtor;

const STANDARD_FONTS: TFontDictionary = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

// Zero-orange: brand indigo + slate only.
const INDIGO = '#4F46E5';
const SLATE = '#334155';

export interface ManifestForm {
  patientName?: string | null;
  patientDob?: Date | null;
  specimenType?: string | null;
  accessionNumber?: string | null;
  doctorName?: string | null;
}

export interface ManifestBatch {
  batchNumber: string;
  submittedAt?: Date | null;
  totalForms: number;
  paymentMethod?: string | null;
  paymentStatus: string;
  forms: ManifestForm[];
}

@Injectable()
export class ManifestService {
  private readonly printer = new PdfPrinter(STANDARD_FONTS);

  render(batch: ManifestBatch): Promise<Buffer> {
    const fmtDate = (d?: Date | null) => (d ? new Date(d).toLocaleDateString('en-GB') : '—');

    const def: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [40, 44, 40, 44],
      defaultStyle: { font: 'Helvetica', fontSize: 9.5, color: SLATE, lineHeight: 1.25 },
      content: [
        { text: 'CYTOLAB REQUISITION BATCH MANIFEST', style: 'header' },
        { text: `Batch: ${batch.batchNumber}`, margin: [0, 2, 0, 0] },
        { text: `Submitted: ${fmtDate(batch.submittedAt)}` },
        { text: `Total Forms: ${batch.totalForms}` },
        {
          text: `Payment: ${batch.paymentMethod ?? '—'} — ${batch.paymentStatus}`,
        },
        { text: 'FORMS IN THIS BATCH', style: 'subheader' },
        {
          table: {
            headerRows: 1,
            widths: [18, '*', 60, 70, 70, '*'],
            body: [
              [
                { text: '#', style: 'th' },
                { text: 'Patient', style: 'th' },
                { text: 'DOB', style: 'th' },
                { text: 'Specimen', style: 'th' },
                { text: 'Accession', style: 'th' },
                { text: 'Doctor', style: 'th' },
              ],
              ...batch.forms.map((f, i) => [
                String(i + 1),
                f.patientName ?? '—',
                fmtDate(f.patientDob),
                f.specimenType ?? '—',
                f.accessionNumber ?? '—',
                f.doctorName ?? '—',
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
        },
      ],
      styles: {
        header: { fontSize: 16, bold: true, color: INDIGO, margin: [0, 0, 0, 10] },
        subheader: { fontSize: 13, bold: true, color: INDIGO, margin: [0, 14, 0, 6] },
        th: { bold: true, color: INDIGO, fontSize: 9 },
      },
    };

    return this.toBuffer(def);
  }

  private toBuffer(def: TDocumentDefinitions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = this.printer.createPdfKitDocument(def);
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    });
  }
}
