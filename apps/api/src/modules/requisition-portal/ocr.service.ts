import { Injectable, Logger } from '@nestjs/common';

/** Parsed fields extracted from a scanned gynaecology requisition form. */
export interface ExtractedFormData {
  patientName?: string;
  patientDob?: Date;
  doctorName?: string;
  hospRegNumber?: string;
  specimenDate?: Date;
  specimenType?: string;
  routineCheck?: boolean;
  abnormalBleeding?: boolean;
  lmp?: string;
  clinicalDiagnosis?: string;
  previousCytology?: boolean;
  nowPregnant?: boolean;
  ocrConfidence: number; // 0-1
  rawText?: string;
}

/**
 * OCR extraction for scanned paper requisition forms. tesseract.js + sharp are
 * heavy/native, so they are dynamically imported (like the GCS client) — the API
 * compiles and boots without them, and only pulls them in when a scan runs.
 */
@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  async extractFormData(imageBuffer: Buffer): Promise<ExtractedFormData> {
    let text = '';
    let confidence = 0;
    try {
      // Pre-process for better OCR: greyscale + normalise + sharpen.
      let buf = imageBuffer;
      try {
        const sharp = (await import('sharp')).default;
        buf = await sharp(imageBuffer).greyscale().normalise().sharpen().toBuffer();
      } catch (e) {
        this.logger.warn(`sharp preprocessing unavailable, using raw image: ${String(e)}`);
      }

      const Tesseract = await import('tesseract.js');
      const { data } = await Tesseract.recognize(buf, 'eng', { logger: () => {} });
      text = data.text ?? '';
      confidence = data.confidence ?? 0;
    } catch (e) {
      this.logger.error(`OCR failed: ${String(e)}`);
      return { ocrConfidence: 0 };
    }
    return this.parseFormFields(text, confidence);
  }

  private parseFormFields(text: string, confidence: number): ExtractedFormData {
    const patientNameMatch = text.match(
      /PATIENT['’]?S NAME[:\s]+([A-Z\s,]+?)(?:D\.O\.B|DOB|\n)/i,
    );
    const dobMatch = text.match(/D\.?O\.?B[:\s]+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i);
    const doctorMatch = text.match(
      /DOCTOR[:\s]+([A-Z\s.]+?)(?:ADDRESS|HEAD OF UNIT|\n)/i,
    );
    const hospRegMatch = text.match(/HOSP\.?\s*REGISTRATION\s*NO[:\s]+([A-Z0-9\-]+)/i);
    const specDateMatch = text.match(
      /DATE OF SPECIMEN[:\s]+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
    );
    const lmpMatch = text.match(/LMP[:\s]+([^\n]+)/i);
    const diagnosisMatch = text.match(/clinical diagnosis[:\s]+([^\n]+)/i);

    return {
      patientName: this.clean(patientNameMatch?.[1]),
      patientDob: this.parseDate(dobMatch?.[1]),
      doctorName: this.clean(doctorMatch?.[1]),
      hospRegNumber: this.clean(hospRegMatch?.[1]),
      specimenDate: this.parseDate(specDateMatch?.[1]),
      specimenType: this.detectSpecimenType(text),
      routineCheck: /routine check/i.test(text),
      abnormalBleeding: /abnormal vag/i.test(text),
      lmp: this.clean(lmpMatch?.[1]),
      clinicalDiagnosis: this.clean(diagnosisMatch?.[1]),
      previousCytology: this.detectCheckbox(text, 'previous cytology', 'yes'),
      nowPregnant: this.detectCheckbox(text, 'now pregnant', 'yes'),
      ocrConfidence: confidence / 100,
      rawText: text,
    };
  }

  private detectSpecimenType(text: string): string {
    if (/cerv.*scrap/i.test(text)) return 'CERV_SCRAP';
    if (/endocer/i.test(text)) return 'ENDOCERV_ASP';
    if (/vag.*pool/i.test(text)) return 'VAG_POOL';
    if (/specimen 16/i.test(text)) return 'SPECIMEN_16';
    return 'CERV_SCRAP';
  }

  private detectCheckbox(text: string, label: string, value: string): boolean {
    const regex = new RegExp(`${label}[\\s\\S]{0,50}${value}`, 'i');
    return regex.test(text);
  }

  private clean(v?: string): string | undefined {
    const t = v?.trim();
    return t ? t.replace(/\s+/g, ' ') : undefined;
  }

  private parseDate(v?: string): Date | undefined {
    if (!v) return undefined;
    const d = new Date(v.replace(/\./g, '/').replace(/-/g, '/'));
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
}
