import { randomBytes } from 'node:crypto';
import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { getPortalWebOrigin } from '../../common/config/canonical-origin';
import { RequisitionPortalService } from './requisition-portal.service';

type CallbackPayload = { status: string; orderId?: string; message?: string };

/**
 * PowerTranz MerchantResponseUrl target. Public — PowerTranz posts here directly
 * (server-to-server for frictionless 3DS, or via the browser for a challenge),
 * so there is no portal JWT. The batch is identified by the `bid` query param
 * stamped onto the callback URL at Sale time.
 *
 * The response is an HTML document rendered INSIDE the portal's 3DS iframe. It
 * carries a route-scoped CSP (nonce'd inline script + frame-ancestors pinned to the
 * portal origin) so the postMessage script can run and the portal can frame it,
 * WITHOUT relaxing the global Helmet policy for any other route (R-005). The script
 * posts a minimal status to the exact portal origin, to `window.parent` only (R-004a).
 * The authenticated status poll — not this message — remains the source of payment truth.
 */
@ApiExcludeController()
@Controller('portal/payment')
export class RequisitionPaymentController {
  constructor(private service: RequisitionPortalService) {}

  @Public()
  @Post('callback')
  async callbackPost(@Query('bid') bid: string, @Body() body: Record<string, unknown>, @Res() res: Response): Promise<void> {
    const result = await this.service.handlePaymentCallback(bid, body ?? {});
    this.sendCallbackHtml(res, result, bid);
  }

  // Some ACS providers redirect back via GET with the token in the query.
  @Public()
  @Get('callback')
  async callbackGet(@Query('bid') bid: string, @Query() query: Record<string, unknown>, @Res() res: Response): Promise<void> {
    const result = await this.service.handlePaymentCallback(bid, query ?? {});
    this.sendCallbackHtml(res, result, bid);
  }

  /**
   * Emit the callback HTML with a route-scoped CSP. Overrides the global Helmet
   * headers for THIS response only: a per-response nonce authorizes the inline
   * script, and frame-ancestors is pinned to the portal origin (replacing the
   * global X-Frame-Options: DENY, which is removed).
   */
  private sendCallbackHtml(res: Response, result: CallbackPayload, bid: string): void {
    const nonce = randomBytes(16).toString('base64');
    const portalOrigin = getPortalWebOrigin();
    // Ensure every message carries the batch id so the receiver can match it to the
    // active payment context (the service omits orderId on an early 3DS decline).
    const payload: CallbackPayload = { ...result, orderId: result.orderId ?? bid };

    res.removeHeader('X-Frame-Options');
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors ${portalOrigin}`,
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(makeHtml(payload, nonce, portalOrigin));
  }
}

/**
 * Escape a value for safe embedding inside an HTML <script> element: JSON-encode,
 * then neutralize the characters that could break out of the <script> context or a
 * JS string literal (`<` `>` `&` and the JS line terminators U+2028 / U+2029).
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  );
}

/**
 * Minimal HTML that postMessages the payment status to the portal. Sends ONLY to
 * `window.parent` (the iframe embedder) at the EXACT `targetOrigin` — never `'*'`,
 * never top/opener broadcast. Payload is status-only (no tokens/PAN/gateway data).
 */
export function makeHtml(payload: CallbackPayload, nonce: string, targetOrigin: string): string {
  const msg = jsonForScript(payload);
  const target = jsonForScript(targetOrigin);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body><script nonce="${nonce}">
(function(){try{var msg=${msg};if(window.parent&&window.parent!==window){window.parent.postMessage(msg,${target});}}catch(e){}})();
</script></body></html>`;
}
