import { Injectable } from '@nestjs/common';

/**
 * Pure FHIR R4 resource generation. No I/O — takes a hydrated record and emits
 * spec-compliant JSON that can be POSTed to any FHIR-compliant endpoint.
 */

// A minimal shape of the data the builder needs (selected by the service).
export interface FhirRecordData {
  id: string;
  specimenDate: Date | null;
  formType: string | null;
  patient: { id: string; registrationNo: string; firstName: string; lastName: string; gender: string | null; dateOfBirth: Date | null } | null;
  sheet: { narrative: string | null; authorized: boolean; authorizedAt: Date | null; authorizedBy: { id: string; firstName: string; lastName: string } | null } | null;
  codings: { codeType: string; code: { system: string; code: string; display: string } }[];
}

const LOINC_SYSTEM = 'http://loinc.org';
const SNOMED_SYSTEM = 'http://snomed.info/sct';
const ICD10_SYSTEM = 'http://hl7.org/fhir/sid/icd-10';
// Cervical/gyn cytology LOINC; non-gyn falls back to the generic pathology study.
const SPECIMEN_LOINC: Record<string, { code: string; display: string }> = {
  Gynecology: { code: '10524-7', display: 'Microscopic observation in Cervical smear' },
  NonGynecology: { code: 'LP7786-0', display: 'Pathology study' },
};

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const codingSystemUri = (system: string) => (system === 'LOINC' ? LOINC_SYSTEM : system === 'SNOMED_CT' ? SNOMED_SYSTEM : system === 'ICD10' ? ICD10_SYSTEM : 'urn:oid:unknown');

@Injectable()
export class FhirBuilderService {
  buildPatient(p: NonNullable<FhirRecordData['patient']>) {
    return {
      resourceType: 'Patient',
      id: p.id,
      identifier: [{ system: 'urn:cytolab:registration', value: p.registrationNo }],
      name: [{ family: p.lastName, given: [p.firstName] }],
      ...(p.gender ? { gender: p.gender.toLowerCase() } : {}),
      ...(p.dateOfBirth ? { birthDate: p.dateOfBirth.toISOString().slice(0, 10) } : {}),
    };
  }

  buildDiagnosticReport(rec: FhirRecordData) {
    const narrative = rec.sheet?.narrative ?? '';
    const loinc = SPECIMEN_LOINC[rec.formType ?? ''] ?? SPECIMEN_LOINC.NonGynecology;
    const conclusionCodes = rec.codings
      .filter((c) => c.code.system !== 'LOINC') // diagnosis codes (SNOMED/ICD-10) go on conclusionCode
      .map((c) => ({ coding: [{ system: codingSystemUri(c.code.system), code: c.code.code, display: c.code.display }] }));

    return {
      resourceType: 'DiagnosticReport',
      id: rec.id,
      status: rec.sheet?.authorized ? 'final' : 'preliminary',
      category: [{
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'PAT', display: 'Pathology' }],
      }],
      code: {
        coding: [{ system: LOINC_SYSTEM, code: loinc.code, display: loinc.display }],
      },
      ...(rec.patient ? {
        subject: { reference: `Patient/${rec.patient.id}`, display: `${rec.patient.firstName} ${rec.patient.lastName}`.trim() },
      } : {}),
      ...(rec.specimenDate ? { effectiveDateTime: rec.specimenDate.toISOString() } : {}),
      ...(rec.sheet?.authorizedAt ? { issued: rec.sheet.authorizedAt.toISOString() } : {}),
      ...(rec.sheet?.authorizedBy ? {
        performer: [{ reference: `Practitioner/${rec.sheet.authorizedBy.id}`, display: `${rec.sheet.authorizedBy.firstName} ${rec.sheet.authorizedBy.lastName}`.trim() }],
      } : {}),
      ...(narrative ? { conclusion: narrative } : {}),
      ...(conclusionCodes.length ? { conclusionCode: conclusionCodes } : {}),
      ...(narrative ? { presentedForm: [{ contentType: 'text/plain', data: b64(narrative) }] } : {}),
    };
  }

  /** A transaction Bundle carrying the Patient + DiagnosticReport, ready to POST. */
  buildBundle(rec: FhirRecordData) {
    const entries: any[] = [];
    if (rec.patient) entries.push({ resource: this.buildPatient(rec.patient), request: { method: 'PUT', url: `Patient/${rec.patient.id}` } });
    entries.push({ resource: this.buildDiagnosticReport(rec), request: { method: 'PUT', url: `DiagnosticReport/${rec.id}` } });
    return { resourceType: 'Bundle', type: 'transaction', entry: entries };
  }
}
