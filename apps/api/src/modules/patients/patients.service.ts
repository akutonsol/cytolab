import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { CreatePatientDto, PatientQueryDto, UpdatePatientDto } from './dto/patient.dto';
import { randomBytes } from 'crypto';

const patientSelect = {
  id: true,
  registrationNo: true,
  firstName: true,
  lastName: true,
  middleName: true,
  age: true,
  phoneNumber: true,
  bloodGroup: true,
  gender: true,
  height: true,
  weight: true,
  email: true,
  dateOfBirth: true,
  identityToken: true,
  motherMaidenName: true,
  clientId: true,
  client: { select: { id: true, firstName: true, lastName: true, officeName: true } },
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  async findAll(labId: string, query: PatientQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where = this.buildWhere(labId, query);
    const [data, total] = await Promise.all([
      this.prisma.patient.findMany({ where, select: patientSelect, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.patient.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findByClient(labId: string, clientId: string, query: PatientQueryDto) {
    return this.findAll(labId, { ...query, clientId });
  }

  async search(labId: string, query: PatientQueryDto) {
    return this.findAll(labId, query);
  }

  async findOne(labId: string, id: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id, labId }, select: patientSelect });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  async create(labId: string, dto: CreatePatientDto) {
    const registrationNo = this.generateRegNo();
    const existing = await this.prisma.patient.findFirst({ where: { labId, registrationNo } });
    if (existing) throw new ConflictException('Registration number collision; retry');

    return this.prisma.patient.create({
      data: { labId, registrationNo, ...dto },
      select: patientSelect,
    });
  }

  async update(labId: string, id: string, dto: UpdatePatientDto) {
    await this.findOne(labId, id);
    return this.prisma.patient.update({ where: { id }, data: dto, select: patientSelect });
  }

  async remove(labId: string, id: string) {
    await this.findOne(labId, id);
    await this.prisma.patient.delete({ where: { id } });
    return { deleted: true };
  }

  private buildWhere(labId: string, query: PatientQueryDto) {
    const where: any = { labId };
    if (query.clientId) where.clientId = query.clientId;
    if (query.q) {
      const q = query.q;
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { registrationNo: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phoneNumber: { contains: q, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  private generateRegNo() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    return `PAT-${date}-${suffix}`;
  }
}
