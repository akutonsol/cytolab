import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentPortalUser, Portal, PortalPrincipal } from '../portal/common/portal-principal';
import { PortalAuthGuard } from '../portal/auth/portal-auth.guard';
import { RequisitionPortalService } from './requisition-portal.service';
import {
  ConfirmPaymentDto,
  CreateBatchDto,
  InitiatePaymentDto,
  SaveSignatureDto,
  UpdateBatchDto,
  UpdateFormDto,
} from './dto/portal.dto';

/**
 * Client-facing Digital Requisition Portal. @Portal() stands the staff guard
 * down; PortalAuthGuard authenticates with the portal JWT and the tenancy layer
 * client-scopes every batch/form to the token's clientId + labId.
 */
@ApiTags('portal-requisitions')
@ApiBearerAuth()
@Portal()
@UseGuards(PortalAuthGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
@Controller('portal/batches')
export class RequisitionPortalController {
  constructor(private service: RequisitionPortalService) {}

  // ── Batches ──
  @Post()
  createBatch(@CurrentPortalUser() user: PortalPrincipal, @Body() dto: CreateBatchDto) {
    return this.service.createBatch(user, dto);
  }

  @Get()
  listBatches() {
    return this.service.listBatches();
  }

  @Get(':id')
  getBatch(@Param('id') id: string) {
    return this.service.getBatch(id);
  }

  @Patch(':id')
  updateBatch(@Param('id') id: string, @Body() dto: UpdateBatchDto) {
    return this.service.updateBatch(id, dto);
  }

  @Post(':id/submit')
  submit(@CurrentPortalUser() user: PortalPrincipal, @Param('id') id: string) {
    return this.service.submitBatch(id, user);
  }

  @Delete(':id')
  deleteBatch(@Param('id') id: string) {
    return this.service.deleteBatch(id);
  }

  // ── Forms ──
  @Post(':batchId/forms')
  addForm(@Param('batchId') batchId: string) {
    return this.service.addManualForm(batchId);
  }

  @Get(':batchId/forms/:formId')
  getForm(@Param('batchId') batchId: string, @Param('formId') formId: string) {
    return this.service.getForm(batchId, formId);
  }

  @Patch(':batchId/forms/:formId')
  updateForm(
    @Param('batchId') batchId: string,
    @Param('formId') formId: string,
    @Body() dto: UpdateFormDto,
  ) {
    return this.service.updateForm(batchId, formId, dto);
  }

  @Delete(':batchId/forms/:formId')
  deleteForm(@Param('batchId') batchId: string, @Param('formId') formId: string) {
    return this.service.deleteForm(batchId, formId);
  }

  // ── AI Scanning ──
  @Post(':batchId/scan')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 20))
  scan(
    @CurrentPortalUser() user: PortalPrincipal,
    @Param('batchId') batchId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.service.scanUpload(batchId, user, files);
  }

  @Get(':batchId/scan/:formId/status')
  scanStatus(@Param('batchId') batchId: string, @Param('formId') formId: string) {
    return this.service.scanStatus(batchId, formId);
  }

  @Post(':batchId/forms/:formId/confirm')
  confirmForm(@Param('batchId') batchId: string, @Param('formId') formId: string) {
    return this.service.confirmForm(batchId, formId);
  }

  // ── Signature ──
  @Post(':batchId/forms/:formId/signature')
  saveSignature(
    @Param('batchId') batchId: string,
    @Param('formId') formId: string,
    @Body() dto: SaveSignatureDto,
  ) {
    return this.service.saveSignature(batchId, formId, dto);
  }

  @Delete(':batchId/forms/:formId/signature')
  clearSignature(@Param('batchId') batchId: string, @Param('formId') formId: string) {
    return this.service.clearSignature(batchId, formId);
  }

  // ── Payment ──
  @Post(':id/payment/initiate')
  initiatePayment(
    @CurrentPortalUser() user: PortalPrincipal,
    @Param('id') id: string,
    @Body() dto: InitiatePaymentDto,
  ) {
    return this.service.initiatePayment(id, dto, user);
  }

  @Post(':id/payment/confirm')
  confirmPayment(@Param('id') id: string, @Body() dto: ConfirmPaymentDto) {
    return this.service.confirmPayment(id, dto);
  }

  @Get(':id/payment/status')
  paymentStatus(@Param('id') id: string) {
    return this.service.paymentStatus(id);
  }

  // ── Manifest ──
  @Get(':id/manifest')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="batch-manifest.pdf"')
  async manifest(@Param('id') id: string): Promise<StreamableFile> {
    return new StreamableFile(await this.service.getManifest(id));
  }
}
