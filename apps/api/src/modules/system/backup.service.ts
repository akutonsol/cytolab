import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { google } from 'googleapis';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  // ── Google Sheets config ─────────────────────────────────────────
  // These will be populated via environment variables when GCP is
  // configured. The service gracefully skips if not configured.
  private readonly SHEET_ID = process.env.BACKUP_SHEET_ID;
  private readonly enabled = !!process.env.BACKUP_SHEET_ID;

  constructor(
    private prisma: PrismaService,
    private labContext: LabContext,
  ) {}

  // ── Auth helper ──────────────────────────────────────────────────
  private async getSheets() {
    // When running on GCP: uses Application Default Credentials
    // automatically — no service account JSON file needed.
    // Locally: set GOOGLE_APPLICATION_CREDENTIALS env var to
    // point to a service account JSON file.
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return google.sheets({ version: 'v4', auth });
  }

  // ── Main backup method ───────────────────────────────────────────
  async runBackup(triggeredBy: 'cron' | 'manual' = 'cron') {
    if (!this.enabled) {
      this.logger.warn(
        'Backup skipped — BACKUP_SHEET_ID not configured. ' +
          'Set this env var to enable Google Sheets backup.',
      );
      return { skipped: true, reason: 'BACKUP_SHEET_ID not set' };
    }

    const startedAt = new Date();
    this.logger.log(`Starting backup (${triggeredBy})...`);

    try {
      const sheets = await this.getSheets();
      const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

      // The scheduled run has no request context, so the tenancy guard would
      // refuse every query. Run the exports in a system scope (all labs).
      const [records, patients, clients, bills, payments] = await this.labContext.runSystem(() =>
        Promise.all([
          this.fetchRecords(),
          this.fetchPatients(),
          this.fetchClients(),
          this.fetchBills(),
          this.fetchPayments(),
        ]),
      );

      // Append to each tab
      await Promise.all([
        this.appendToTab(sheets, 'Records', records, timestamp),
        this.appendToTab(sheets, 'Patients', patients, timestamp),
        this.appendToTab(sheets, 'Clients', clients, timestamp),
        this.appendToTab(sheets, 'Bills', bills, timestamp),
        this.appendToTab(sheets, 'Payments', payments, timestamp),
        this.appendToTab(
          sheets,
          'BackupLog',
          [
            [
              timestamp,
              triggeredBy,
              records.length,
              patients.length,
              clients.length,
              bills.length,
              payments.length,
            ],
          ],
          timestamp,
          false,
        ), // no header for log tab
      ]);

      const duration = Date.now() - startedAt.getTime();
      this.logger.log(`Backup complete in ${duration}ms`);

      return {
        success: true,
        timestamp,
        counts: {
          records: records.length,
          patients: patients.length,
          clients: clients.length,
          bills: bills.length,
          payments: payments.length,
        },
        durationMs: duration,
      };
    } catch (err: any) {
      this.logger.error('Backup failed:', err.message);
      throw err;
    }
  }

  // ── Cron: runs daily at 2:30am ───────────────────────────────────
  @Cron('30 2 * * *')
  async scheduledBackup() {
    await this.runBackup('cron');
  }

  // ── Append rows to a named tab ───────────────────────────────────
  private async appendToTab(
    sheets: any,
    tabName: string,
    rows: any[][],
    timestamp: string,
    addTimestampCol = true,
  ) {
    if (!rows.length) return;

    // Add timestamp as first column if requested
    const data = addTimestampCol ? rows.map((r) => [timestamp, ...r]) : rows;

    await sheets.spreadsheets.values.append({
      spreadsheetId: this.SHEET_ID,
      range: `${tabName}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: data },
    });
  }

  // ── Data fetchers ────────────────────────────────────────────────

  private async fetchRecords(): Promise<any[][]> {
    const records = await this.prisma.record.findMany({
      select: {
        labNumber: true,
        identifier: true,
        formType: true,
        status: true,
        urgent: true,
        specimenDate: true,
        createdAt: true,
        patient: { select: { firstName: true, lastName: true, registrationNo: true } },
        client: { select: { officeName: true, accountNo: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return [
      // Header row
      ['Lab#', 'Identifier', 'Form', 'Status', 'Urgent', 'Patient', 'Reg#', 'Client', 'Account#', 'Specimen Date', 'Created'],
      // Data rows
      ...records.map((r) => [
        r.labNumber ?? '',
        r.identifier,
        r.formType ?? '',
        r.status,
        r.urgent ? 'YES' : 'NO',
        `${r.patient?.firstName ?? ''} ${r.patient?.lastName ?? ''}`.trim(),
        r.patient?.registrationNo ?? '',
        r.client?.officeName ?? '',
        r.client?.accountNo ?? '',
        r.specimenDate?.toISOString().slice(0, 10) ?? '',
        r.createdAt.toISOString().slice(0, 10),
      ]),
    ];
  }

  private async fetchPatients(): Promise<any[][]> {
    const patients = await this.prisma.patient.findMany({
      select: {
        firstName: true,
        lastName: true,
        registrationNo: true,
        dateOfBirth: true,
        gender: true,
        bloodGroup: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return [
      ['First Name', 'Last Name', 'Reg#', 'DOB', 'Gender', 'Blood Group', 'Created'],
      ...patients.map((p) => [
        p.firstName,
        p.lastName,
        p.registrationNo ?? '',
        p.dateOfBirth?.toISOString().slice(0, 10) ?? '',
        p.gender ?? '',
        p.bloodGroup ?? '',
        p.createdAt.toISOString().slice(0, 10),
      ]),
    ];
  }

  private async fetchClients(): Promise<any[][]> {
    const clients = await this.prisma.client.findMany({
      select: {
        firstName: true,
        lastName: true,
        officeName: true,
        accountNo: true,
        email: true,
        phoneNumber: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return [
      ['Office Name', 'First Name', 'Last Name', 'Account#', 'Email', 'Phone', 'Created'],
      ...clients.map((c) => [
        c.officeName ?? '',
        c.firstName,
        c.lastName,
        c.accountNo ?? '',
        c.email ?? '',
        c.phoneNumber ?? '',
        c.createdAt.toISOString().slice(0, 10),
      ]),
    ];
  }

  private async fetchBills(): Promise<any[][]> {
    const bills = await this.prisma.bill.findMany({
      select: {
        referenceNo: true,
        status: true,
        subtotal: true,
        taxTotal: true,
        total: true,
        amountPaid: true,
        dueDate: true,
        createdAt: true,
        client: { select: { officeName: true, accountNo: true } },
        record: { select: { labNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const fmt = (cents: number) => (cents / 100).toFixed(2);

    return [
      ['Bill#', 'Status', 'Client', 'Account#', 'Lab#', 'Subtotal', 'Tax', 'Total', 'Paid', 'Due Date', 'Created'],
      ...bills.map((b) => [
        b.referenceNo,
        b.status,
        b.client?.officeName ?? '',
        b.client?.accountNo ?? '',
        b.record?.labNumber ?? '',
        fmt(b.subtotal),
        fmt(b.taxTotal ?? 0),
        fmt(b.total),
        fmt(b.amountPaid),
        b.dueDate?.toISOString().slice(0, 10) ?? '',
        b.createdAt.toISOString().slice(0, 10),
      ]),
    ];
  }

  private async fetchPayments(): Promise<any[][]> {
    const payments = await this.prisma.payment.findMany({
      select: {
        amount: true,
        type: true,
        referenceNo: true,
        verified: true,
        datePaid: true,
        createdAt: true,
        bill: { select: { referenceNo: true, client: { select: { officeName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const fmt = (cents: number) => (cents / 100).toFixed(2);

    return [
      ['Bill#', 'Client', 'Amount', 'Type', 'Reference', 'Verified', 'Date Paid'],
      ...payments.map((p) => [
        p.bill?.referenceNo ?? '',
        p.bill?.client?.officeName ?? '',
        fmt(p.amount),
        p.type,
        p.referenceNo ?? '',
        p.verified ? 'YES' : 'NO',
        p.datePaid.toISOString().slice(0, 10),
      ]),
    ];
  }
}
