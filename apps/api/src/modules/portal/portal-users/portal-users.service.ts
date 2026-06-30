import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PortalTokenType } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { paginate } from '../../../common/dto/pagination.dto';
import { tenantCreate } from '../../../common/tenancy/tenancy.extension';
import { LabContext } from '../../../common/tenancy/lab-context';
import { MailService } from '../mail/mail.service';
import {
  expiryFromNow,
  generateRawToken,
  hashToken,
  INVITE_TTL_HOURS,
} from '../common/portal-token.util';
import { CreatePortalUserDto, PortalUserQueryDto } from './dto/portal-user.dto';

const portalUserSelect = {
  id: true,
  clientId: true,
  client: { select: { id: true, firstName: true, lastName: true, officeName: true } },
  email: true,
  firstName: true,
  lastName: true,
  isActive: true,
  lastLoginAt: true,
  // Whether the invite has been accepted (password set). Never expose the hash.
  passwordHash: true,
  createdAt: true,
} as const;

type PortalUserRow = Prisma.PortalUserGetPayload<{ select: typeof portalUserSelect }>;

/**
 * Staff-facing provisioning of portal accounts. v1 is STAFF-INVITE ONLY — there
 * is no public self-registration. All queries run in the staff lab scope, so a
 * lab can only ever manage its own portal users (tenancy guard).
 */
@Injectable()
export class PortalUsersService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private labContext: LabContext,
  ) {}

  /** Strip the password hash; surface only whether onboarding is complete. */
  private shape(u: PortalUserRow) {
    const { passwordHash, ...rest } = u;
    return { ...rest, onboarded: passwordHash != null };
  }

  /** Invite a portal user for a client in this lab and email a single-use token. */
  async create(dto: CreatePortalUserDto) {
    // The client must belong to the staff's lab (auto lab-scoped).
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId },
      select: { id: true, firstName: true },
    });
    if (!client) throw new NotFoundException('Client not found');

    const email = dto.email.toLowerCase();
    const existing = await this.prisma.portalUser.findFirst({ where: { email }, select: { id: true } });
    if (existing) throw new BadRequestException('A portal user with this email already exists');

    const user = await this.prisma.portalUser.create({
      data: tenantCreate<Prisma.PortalUserUncheckedCreateInput>({
        // labId stamped by the tenancy guard; clientId is staff-chosen (validated above).
        clientId: dto.clientId,
        email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        // passwordHash stays null until the invite is accepted.
      }),
      select: portalUserSelect,
    });

    await this.issueInvite(user.id, email, user.firstName);
    return this.shape(user);
  }

  /** (Re)issue an invite token for a not-yet-onboarded user and email it. */
  async resendInvite(id: string) {
    const user = await this.prisma.portalUser.findFirst({
      where: { id },
      select: { id: true, email: true, firstName: true, passwordHash: true },
    });
    if (!user) throw new NotFoundException('Portal user not found');
    if (user.passwordHash) throw new BadRequestException('Portal user has already onboarded');
    await this.issueInvite(user.id, user.email, user.firstName);
    return { ok: true };
  }

  private async issueInvite(portalUserId: string, email: string, firstName: string) {
    const raw = generateRawToken();
    await this.prisma.portalAccessToken.create({
      data: tenantCreate<Prisma.PortalAccessTokenUncheckedCreateInput>({
        portalUserId,
        type: PortalTokenType.Invite,
        tokenHash: hashToken(raw),
        expiresAt: expiryFromNow(INVITE_TTL_HOURS),
      }),
    });
    // Lab name for the email body (lab is not lab-scoped — read by the request's labId).
    const labId = this.labContext.getLabId();
    const lab = labId
      ? await this.labContext.runSystem(() =>
          this.prisma.lab.findUnique({ where: { id: labId }, select: { name: true } }),
        )
      : null;
    await this.mail.sendInvite(email, firstName, lab?.name ?? 'the lab', raw);
  }

  async findAll(query: PortalUserQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where: Prisma.PortalUserWhereInput = {};
    if (query.clientId) where.clientId = query.clientId;

    const [data, total] = await Promise.all([
      this.prisma.portalUser.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' }, select: portalUserSelect }),
      this.prisma.portalUser.count({ where }),
    ]);
    return paginate(data.map((u) => this.shape(u)), total, page, pageSize);
  }

  async setActive(id: string, isActive: boolean) {
    const user = await this.prisma.portalUser.findFirst({ where: { id }, select: { id: true } });
    if (!user) throw new NotFoundException('Portal user not found');
    const updated = await this.prisma.portalUser.update({ where: { id }, data: { isActive }, select: portalUserSelect });
    return this.shape(updated);
  }
}
