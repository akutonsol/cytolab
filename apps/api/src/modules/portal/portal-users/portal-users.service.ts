import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PortalTokenType } from '@prisma/client';
import { randomBytes } from 'crypto';
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
  username: true,
  email: true,
  firstName: true,
  lastName: true,
  isActive: true,
  twoFactorEnabled: true,
  isPrimary: true,
  lastLoginAt: true,
  // Whether the invite has been accepted (password set). Never expose the hash.
  passwordHash: true,
  createdAt: true,
} as const;

export interface ProvisionPortalUserInput {
  clientId: string;
  email: string;
  firstName: string;
  lastName: string;
  twoFactorEnabled?: boolean;
}

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
      select: { id: true },
    });
    if (!client) throw new NotFoundException('Client not found');

    const user = await this.provisionForClient(dto);
    return this.shape(user);
  }

  /** Reject early if a portal email is already taken (before creating a Client). */
  async assertEmailAvailable(email: string) {
    const existing = await this.prisma.portalUser.findFirst({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    if (existing) throw new BadRequestException('A portal user with this email already exists');
  }

  /**
   * Create a portal login for a client and email the F2 setup invite. Shared by
   * the staff invite endpoint and the client-create form. Staff NEVER set the
   * password — the client sets it via the single-use emailed token. The username
   * is auto-generated; the first login for a client becomes the primary.
   */
  async provisionForClient(input: ProvisionPortalUserInput) {
    const email = input.email.toLowerCase();
    await this.assertEmailAvailable(email);

    const priorForClient = await this.prisma.portalUser.count({ where: { clientId: input.clientId } });
    const username = await this.generateUsername(input.firstName, input.lastName);

    const user = await this.prisma.portalUser.create({
      data: tenantCreate<Prisma.PortalUserUncheckedCreateInput>({
        // labId stamped by the tenancy guard; clientId validated by the caller.
        clientId: input.clientId,
        username,
        email,
        firstName: input.firstName,
        lastName: input.lastName,
        twoFactorEnabled: input.twoFactorEnabled ?? false,
        isPrimary: priorForClient === 0,
        // passwordHash stays null until the invite is accepted.
      }),
      select: portalUserSelect,
    });

    await this.issueInvite(user.id, email, user.firstName);
    return user;
  }

  /** Auto-generate a lab-unique username (legacy "Generated" field). */
  private async generateUsername(firstName: string, lastName: string): Promise<string> {
    const base = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z0-9.]/g, '') || 'client';
    for (let i = 0; i < 6; i++) {
      const candidate = i === 0 ? base : `${base}.${randomBytes(2).toString('hex')}`;
      // Lab-scoped by the tenancy guard; username is @@unique([labId, username]).
      const taken = await this.prisma.portalUser.findFirst({ where: { username: candidate }, select: { id: true } });
      if (!taken) return candidate;
    }
    return `${base}.${randomBytes(4).toString('hex')}`;
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
