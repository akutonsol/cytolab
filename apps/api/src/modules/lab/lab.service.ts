import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { FilesService } from '../files/files.service';
import { UpdateLabProfileDto } from './dto/lab.dto';

// Logos render into small square chips (login 64px, dashboard 36px, portal
// 34px). The web pane already downscales + squares the image client-side; this
// is the server-side backstop.
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX_SIZE = 2 * 1024 * 1024; // 2MB — a squared PNG is well under this.

const profileSelect = {
  name: true,
  tagline: true,
  logoUrl: true,
  address: true,
  phone: true,
  email: true,
  currency: true,
} as const;

@Injectable()
export class LabService {
  constructor(
    private prisma: PrismaService,
    private labContext: LabContext,
    private realtime: RealtimeGateway,
    private files: FilesService,
  ) {}

  private labId(): string {
    const id = this.labContext.getLabId();
    if (!id) throw new BadRequestException('No lab context');
    return id;
  }

  // Push the fresh branding to every connected user in the lab so their app
  // shell (logo/name/tagline) updates live — no manual refresh.
  private async broadcastBranding() {
    const branding = await this.getBranding();
    this.realtime.emitToLab(this.labId(), 'lab:branding-updated', { type: 'lab:branding-updated', data: branding });
  }

  // Minimal, non-sensitive identity for the app shell — readable by any
  // authenticated user (no settings permission required), unlike getProfile.
  async getBranding() {
    const lab = await this.prisma.lab.findUnique({
      where: { id: this.labId() },
      select: { name: true, tagline: true, logoUrl: true },
    });
    if (!lab) throw new NotFoundException('Lab not found');
    return lab;
  }

  async getProfile() {
    const lab = await this.prisma.lab.findUnique({
      where: { id: this.labId() },
      select: profileSelect,
    });
    if (!lab) throw new NotFoundException('Lab not found');
    return lab;
  }

  async updateProfile(dto: UpdateLabProfileDto) {
    // Empty string clears a nullable field; undefined leaves it untouched.
    const norm = (v?: string) => (v === undefined ? undefined : v.trim() === '' ? null : v.trim());
    await this.prisma.lab.update({
      where: { id: this.labId() },
      data: {
        // name is non-nullable — only set it when a non-empty value is provided.
        ...(dto.name && dto.name.trim() ? { name: dto.name.trim() } : {}),
        tagline: norm(dto.tagline),
        address: norm(dto.address),
        phone: norm(dto.phone),
        email: norm(dto.email),
        ...(dto.currency && dto.currency.trim() ? { currency: dto.currency.trim() } : {}),
      },
    });
    await this.broadcastBranding();
    return this.getProfile();
  }

  async uploadLogo(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    if (!LOGO_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Logo must be a PNG, JPEG, WEBP or SVG image');
    }
    if (file.size > LOGO_MAX_SIZE) {
      throw new BadRequestException('Logo exceeds 2MB limit');
    }
    const { storageUrl } = await this.files.upload(file);
    await this.prisma.lab.update({
      where: { id: this.labId() },
      data: { logoUrl: storageUrl },
    });
    await this.broadcastBranding();
    return { logoUrl: storageUrl };
  }

  async removeLogo() {
    await this.prisma.lab.update({
      where: { id: this.labId() },
      data: { logoUrl: null },
    });
    await this.broadcastBranding();
    return this.getProfile();
  }
}
