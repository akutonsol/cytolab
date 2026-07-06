import { Injectable, Logger } from '@nestjs/common';

/**
 * PowerTranz SPI-3DS gateway client. Ports the Mico Foundation flow:
 *   1. Sale (/Api/spi/Sale)          — starts SPI, may require a 3DS challenge
 *   2. (browser 3DS challenge via RedirectData → MerchantResponseUrl callback)
 *   3. Payment3DSComplete (/Api/spi/payment) — settles using the SpiToken
 *
 * Amounts are sent as dollars with 2 decimals (cents / 100). Cytolab bills in
 * JMD → CurrencyCode "388" (ISO 4217).
 */
export interface SaleParams {
  transactionId: string;
  orderId: string;
  amountCents: number;
  currency?: string; // ISO 4217 numeric; default JMD 388
  card: { pan: string; cvv: string; expiration: string; cardholderName: string };
  billing?: { line1?: string; city?: string; postalCode?: string; countryCode?: string; email?: string; phone?: string };
  callbackUrl: string;
}

export interface SaleResult {
  ok: boolean;
  requiresRedirect: boolean;
  redirectData?: string;
  spiToken?: string;
  transactionId?: string;
  isoResponseCode?: string;
  error?: string;
}

export interface CompleteResult {
  approved: boolean;
  authorizationCode?: string;
  transactionId?: string;
  rrn?: string;
  cardBrand?: string;
  isoResponseCode?: string;
  message?: string;
}

@Injectable()
export class PowerTranzService {
  private readonly logger = new Logger(PowerTranzService.name);
  private readonly id = process.env.POWERTRANZ_ID;
  private readonly password = process.env.POWERTRANZ_PASSWORD;
  private readonly baseUrl = process.env.POWERTRANZ_BASE_URL || 'https://staging.ptranz.com';

  /** True when gateway credentials are configured. */
  get configured(): boolean {
    return !!(this.id && this.password);
  }

  /** Cents → gateway dollar amount, 2 decimals (250000 → 2500.00). */
  private toDollars(cents: number): number {
    return Number((cents / 100).toFixed(2));
  }

  async sale(params: SaleParams): Promise<SaleResult> {
    const [firstName, ...rest] = params.card.cardholderName.trim().split(/\s+/);
    const payload = {
      TransactionIdentifier: params.transactionId,
      TotalAmount: this.toDollars(params.amountCents),
      CurrencyCode: params.currency ?? '388',
      ThreeDSecure: true,
      Source: {
        CardPan: params.card.pan.replace(/\s/g, ''),
        CardCvv: params.card.cvv,
        CardExpiration: params.card.expiration.replace('/', ''),
        CardholderName: params.card.cardholderName,
      },
      OrderIdentifier: params.orderId,
      BillingAddress: {
        FirstName: firstName || params.card.cardholderName,
        LastName: rest.join(' ') || '',
        Line1: params.billing?.line1 || '',
        City: params.billing?.city || '',
        PostalCode: params.billing?.postalCode || '',
        CountryCode: params.billing?.countryCode || '388',
        EmailAddress: params.billing?.email || '',
        PhoneNumber: params.billing?.phone || '',
      },
      AddressMatch: false,
      ExtendedData: {
        MerchantResponseUrl: params.callbackUrl,
        ThreeDSecure: { ChallengeWindowSize: '04', ChallengeIndicator: '01' },
      },
    };

    try {
      const res = await fetch(`${this.baseUrl}/Api/spi/Sale`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PowerTranz-PowerTranzId': this.id ?? '',
          'PowerTranz-PowerTranzPassword': this.password ?? '',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      const data: any = await res.json();

      // SP4 = SPI preprocessing complete, 3DS challenge required.
      if (data.IsoResponseCode === 'SP4' && data.RedirectData && data.SpiToken) {
        return { ok: true, requiresRedirect: true, redirectData: data.RedirectData, spiToken: data.SpiToken, transactionId: data.TransactionIdentifier, isoResponseCode: data.IsoResponseCode };
      }
      // SP1 = card doesn't support 3DS, proceed frictionless.
      if (data.IsoResponseCode === 'SP1' && data.SpiToken) {
        return { ok: true, requiresRedirect: false, spiToken: data.SpiToken, transactionId: data.TransactionIdentifier, isoResponseCode: data.IsoResponseCode };
      }
      this.logger.error(`PowerTranz Sale unexpected: ${data.IsoResponseCode} ${data.ResponseMessage}`);
      return { ok: false, requiresRedirect: false, isoResponseCode: data.IsoResponseCode, error: data.ResponseMessage || `Gateway code ${data.IsoResponseCode ?? 'unknown'}` };
    } catch (e) {
      this.logger.error(`PowerTranz Sale failed: ${String(e)}`);
      return { ok: false, requiresRedirect: false, error: 'Payment gateway unreachable' };
    }
  }

  /** Payment3DSComplete — settle the transaction with the SpiToken. */
  async complete(spiToken: string): Promise<CompleteResult> {
    try {
      const res = await fetch(`${this.baseUrl}/Api/spi/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spiToken),
        signal: AbortSignal.timeout(15000),
      });
      const pt: any = await res.json();
      const approved = res.ok && pt.Approved === true && pt.IsoResponseCode === '00';
      if (!approved) {
        const msg = pt.Errors?.[0]?.Message || pt.ResponseMessage || 'Payment was declined';
        return { approved: false, isoResponseCode: pt.IsoResponseCode, message: msg };
      }
      return {
        approved: true,
        authorizationCode: pt.AuthorizationCode,
        transactionId: pt.TransactionIdentifier,
        rrn: pt.RRN,
        cardBrand: pt.CardBrand,
        isoResponseCode: pt.IsoResponseCode,
        message: pt.ResponseMessage,
      };
    } catch (e) {
      this.logger.error(`PowerTranz complete failed: ${String(e)}`);
      return { approved: false, message: 'Payment gateway unreachable' };
    }
  }
}
