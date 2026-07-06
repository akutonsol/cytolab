import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

/** Create a new DRAFT batch. clientId/labId come from the portal token, not the body. */
export class CreateBatchDto {
  @IsString() @IsOptional() notes?: string;
}

/** Update batch-level fields (notes, chosen payment method). */
export class UpdateBatchDto {
  @IsString() @IsOptional() notes?: string;
  @IsEnum(PaymentMethod) @IsOptional() paymentMethod?: PaymentMethod;
}

/**
 * All editable digital-form fields. Every field optional — the form is filled
 * progressively (manual entry or OCR pre-fill, then corrections). Dates arrive
 * as ISO strings from the browser and are coerced in the service.
 */
export class UpdateFormDto {
  // Patient
  @IsString() @IsOptional() patientName?: string;
  @IsString() @IsOptional() patientDob?: string;
  @IsString() @IsOptional() hospRegNumber?: string;

  // Doctor / lab
  @IsString() @IsOptional() doctorName?: string;
  @IsString() @IsOptional() doctorAddress?: string;

  // Specimen
  @IsString() @IsOptional() specimenDate?: string;
  @IsString() @IsOptional() specimenType?: string;

  // Clinical features
  @IsBoolean() @IsOptional() routineCheck?: boolean;
  @IsString() @IsOptional() lmp?: string;
  @IsString() @IsOptional() lengthOfCycle?: string;
  @IsBoolean() @IsOptional() abnormalBleeding?: boolean;
  @IsBoolean() @IsOptional() leucorrhoea?: boolean;
  @IsString() @IsOptional() specialType?: string;
  @IsString() @IsOptional() noPregnancies?: string;
  @IsBoolean() @IsOptional() nowPregnant?: boolean;
  @IsString() @IsOptional() menopauseDate?: string;
  @IsString() @IsOptional() clinicalAppearance?: string;
  @IsString() @IsOptional() pelvicAbnormalities?: string;
  @IsString() @IsOptional() otherClinicalData?: string;
  @IsString() @IsOptional() clinicalDiagnosis?: string;
  @IsBoolean() @IsOptional() previousCytology?: boolean;

  // Therapy
  @IsString() @IsOptional() hormone?: string;
  @IsString() @IsOptional() radiation?: string;
  @IsString() @IsOptional() surgical?: string;
  @IsString() @IsOptional() otherTherapy?: string;
}

/** Save a canvas signature (base64 PNG data URL) against a form. */
export class SaveSignatureDto {
  @IsString() signatureDataUrl!: string;
  @IsString() @IsOptional() signedByName?: string;
}

/** Choose a payment method and begin payment. Card fields are required only
 *  when paymentMethod === CARD (PowerTranz SPI-3DS Sale). */
export class InitiatePaymentDto {
  @IsEnum(PaymentMethod) paymentMethod!: PaymentMethod;
  @IsString() @IsOptional() cardPan?: string;
  @IsString() @IsOptional() cardCvv?: string;
  @IsString() @IsOptional() cardExpiration?: string; // MMYY or MM/YY
  @IsString() @IsOptional() cardholderName?: string;
  @IsString() @IsOptional() billingLine1?: string;
  @IsString() @IsOptional() billingCity?: string;
  @IsString() @IsOptional() billingPostalCode?: string;
}

/** Confirm a payment (manual/staff or gateway webhook). */
export class ConfirmPaymentDto {
  @IsString() @IsOptional() paymentRef?: string;
}

/** Internal staff: reject a batch with a reason. */
export class RejectBatchDto {
  @IsString() reason!: string;
}

/** Internal staff: list/filter batches across labs. */
export class InternalBatchQueryDto {
  @IsInt() @Min(1) @IsOptional() @Type(() => Number) page?: number;
  @IsInt() @Min(1) @IsOptional() @Type(() => Number) pageSize?: number;
  @IsString() @IsOptional() status?: string;
}
