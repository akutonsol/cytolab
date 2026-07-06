import { Body, Controller, Get, Header, Post, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RequisitionPortalService } from './requisition-portal.service';

/**
 * PowerTranz MerchantResponseUrl target. Public — PowerTranz posts here directly
 * (server-to-server for frictionless 3DS, or via the browser for a challenge),
 * so there is no portal JWT. The batch is identified by the `bid` query param
 * stamped onto the callback URL at Sale time. Always returns HTML that
 * postMessages the parent frame (the 3DS iframe), matching the SPI-3DS pattern.
 */
@ApiExcludeController()
@Controller('portal/payment')
export class RequisitionPaymentController {
  constructor(private service: RequisitionPortalService) {}

  @Public()
  @Post('callback')
  @Header('Content-Type', 'text/html')
  async callbackPost(@Query('bid') bid: string, @Body() body: Record<string, unknown>): Promise<string> {
    const result = await this.service.handlePaymentCallback(bid, body ?? {});
    return makeHtml(result);
  }

  // Some ACS providers redirect back via GET with the token in the query.
  @Public()
  @Get('callback')
  @Header('Content-Type', 'text/html')
  async callbackGet(@Query('bid') bid: string, @Query() query: Record<string, unknown>): Promise<string> {
    const result = await this.service.handlePaymentCallback(bid, query ?? {});
    return makeHtml(result);
  }
}

/** Minimal HTML that postMessages the parent frame (the 3DS challenge iframe). */
function makeHtml(payload: { status: string; orderId?: string; message?: string }): string {
  const msg = JSON.stringify(payload);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body><script>
(function(){var msg=${msg};var sent=false;
try{if(window.parent&&window.parent!==window){window.parent.postMessage(msg,'*');sent=true;}}catch(e){}
if(!sent){try{window.top.postMessage(msg,'*');sent=true;}catch(e){}}
if(!sent){try{if(window.opener&&!window.opener.closed){window.opener.postMessage(msg,'*');}}catch(e){}}
})();
</script></body></html>`;
}
