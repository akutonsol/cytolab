import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { CreateEmployeeDto, EmployeeQueryDto, UpdateEmployeeDto } from './dto/employee.dto';

const listSelect = {
  id: true,
  employeeNo: true,
  jobTitle: true,
  employmentType: true,
  startDate: true,
  endDate: true,
  salary: true,
  isActive: true,
  isFixedSalary: true,
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
  department: { select: { id: true, name: true } },
  createdAt: true,
} as const;

const detailSelect = {
  ...listSelect,
  departmentId: true,
  bankName: true,
  bankAccount: true,
  bankBranch: true,
  trn: true,
  nis: true,
  nht: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  address: true,
} as const;

/** Employees (HR records). Lab-scoped by the tenancy extension. */
@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: EmployeeQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 100;
    const skip = (page - 1) * pageSize;
    const where: Prisma.EmployeeWhereInput = {
      ...(query.departmentId && { departmentId: query.departmentId }),
      ...(query.search && {
        OR: [
          { employeeNo: { contains: query.search, mode: 'insensitive' } },
          { jobTitle: { contains: query.search, mode: 'insensitive' } },
          { user: { firstName: { contains: query.search, mode: 'insensitive' } } },
          { user: { lastName: { contains: query.search, mode: 'insensitive' } } },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.employee.findMany({ where, skip, take: pageSize, orderBy: { employeeNo: 'asc' }, select: listSelect }),
      this.prisma.employee.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findOne(id: string) {
    const emp = await this.prisma.employee.findFirst({ where: { id }, select: detailSelect });
    if (!emp) throw new NotFoundException('Employee not found');
    return emp;
  }

  /** Staff users not yet linked to an employee record — for the create picker. */
  async availableUsers() {
    return this.prisma.user.findMany({
      where: { employeeProfile: null },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  async create(dto: CreateEmployeeDto) {
    const user = await this.prisma.user.findFirst({ where: { id: dto.userId }, select: { id: true } });
    if (!user) throw new BadRequestException('Linked user not found in this lab');

    try {
      return await this.prisma.employee.create({
        data: tenantCreate<Prisma.EmployeeUncheckedCreateInput>({
          userId: dto.userId,
          departmentId: dto.departmentId || null,
          employeeNo: dto.employeeNo.trim(),
          jobTitle: dto.jobTitle.trim(),
          employmentType: dto.employmentType,
          startDate: new Date(dto.startDate),
          endDate: dto.endDate ? new Date(dto.endDate) : null,
          salary: dto.salary ?? 0,
          bankName: dto.bankName?.trim() || null,
          bankAccount: dto.bankAccount?.trim() || null,
          bankBranch: dto.bankBranch?.trim() || null,
          trn: dto.trn?.trim() || null,
          nis: dto.nis?.trim() || null,
          nht: dto.nht?.trim() || null,
          emergencyContactName: dto.emergencyContactName?.trim() || null,
          emergencyContactPhone: dto.emergencyContactPhone?.trim() || null,
          address: dto.address?.trim() || null,
          isActive: dto.isActive ?? true,
          isFixedSalary: dto.isFixedSalary ?? true,
        }),
        select: detailSelect,
      });
    } catch (e) {
      throw this.friendly(e);
    }
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    await this.findOne(id); // lab-scoped existence check
    try {
      return await this.prisma.employee.update({
        where: { id },
        data: {
          ...(dto.departmentId !== undefined && { departmentId: dto.departmentId || null }),
          ...(dto.employeeNo !== undefined && { employeeNo: dto.employeeNo.trim() }),
          ...(dto.jobTitle !== undefined && { jobTitle: dto.jobTitle.trim() }),
          ...(dto.employmentType !== undefined && { employmentType: dto.employmentType }),
          ...(dto.startDate !== undefined && { startDate: new Date(dto.startDate) }),
          ...(dto.endDate !== undefined && { endDate: dto.endDate ? new Date(dto.endDate) : null }),
          ...(dto.salary !== undefined && { salary: dto.salary }),
          ...(dto.bankName !== undefined && { bankName: dto.bankName?.trim() || null }),
          ...(dto.bankAccount !== undefined && { bankAccount: dto.bankAccount?.trim() || null }),
          ...(dto.bankBranch !== undefined && { bankBranch: dto.bankBranch?.trim() || null }),
          ...(dto.trn !== undefined && { trn: dto.trn?.trim() || null }),
          ...(dto.nis !== undefined && { nis: dto.nis?.trim() || null }),
          ...(dto.nht !== undefined && { nht: dto.nht?.trim() || null }),
          ...(dto.emergencyContactName !== undefined && { emergencyContactName: dto.emergencyContactName?.trim() || null }),
          ...(dto.emergencyContactPhone !== undefined && { emergencyContactPhone: dto.emergencyContactPhone?.trim() || null }),
          ...(dto.address !== undefined && { address: dto.address?.trim() || null }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          ...(dto.isFixedSalary !== undefined && { isFixedSalary: dto.isFixedSalary }),
        },
        select: detailSelect,
      });
    } catch (e) {
      throw this.friendly(e);
    }
  }

  async remove(id: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { id },
      select: { id: true, _count: { select: { payAdvices: true } } },
    });
    if (!emp) throw new NotFoundException('Employee not found');
    if (emp._count.payAdvices > 0) {
      throw new BadRequestException('Employee has pay history — deactivate instead of deleting.');
    }
    await this.prisma.employee.delete({ where: { id } });
    return { deleted: true };
  }

  private friendly(e: unknown): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const target = String((e.meta as any)?.target ?? '');
      if (target.includes('userId')) return new BadRequestException('That user is already an employee');
      if (target.includes('employeeNo')) return new BadRequestException('Employee number already in use');
      return new BadRequestException('Duplicate value');
    }
    return e as Error;
  }
}
