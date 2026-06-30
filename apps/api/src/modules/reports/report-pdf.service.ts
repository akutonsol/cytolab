import { Injectable } from '@nestjs/common';
import type { TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';
import { buildReportDefinition, ReportDocumentData } from './report-document';

// @types/pdfmake describes the *browser* build (createPdf); the package main
// (src/printer.js) is the Node-side PdfPrinter constructor. Type it locally.
interface PdfKitDocument {
  on(event: 'data', cb: (chunk: Buffer) => void): void;
  on(event: 'end', cb: () => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  end(): void;
}
interface PdfPrinterCtor {
  new (fonts: TFontDictionary): { createPdfKitDocument(def: TDocumentDefinitions): PdfKitDocument };
}
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PdfPrinter = require('pdfmake') as PdfPrinterCtor;

// The 14 built-in PDF standard fonts — no font files to bundle, pure server-side.
const STANDARD_FONTS: TFontDictionary = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

@Injectable()
export class ReportPdfService {
  private readonly printer = new PdfPrinter(STANDARD_FONTS);

  /** Render assembled report data into a PDF buffer (in memory). */
  render(data: ReportDocumentData): Promise<Buffer> {
    const definition: TDocumentDefinitions = buildReportDefinition(data);
    return this.toBuffer(definition);
  }

  private toBuffer(definition: TDocumentDefinitions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = this.printer.createPdfKitDocument(definition);
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    });
  }
}
