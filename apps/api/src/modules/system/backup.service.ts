import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
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

  // Encrypted snapshots are written under this object-name prefix in the GCS
  // bucket (STORAGE_BUCKET). Timestamped, so lexical sort == chronological.
  private readonly BACKUP_PREFIX = 'backups/cytolab-backup-';

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
    const gcsConfigured = !!process.env.STORAGE_BUCKET;
    if (!this.enabled && !gcsConfigured) {
      this.logger.warn(
        'Backup skipped — neither BACKUP_SHEET_ID nor STORAGE_BUCKET configured.',
      );
      return { skipped: true, reason: 'Neither BACKUP_SHEET_ID nor STORAGE_BUCKET configured' };
    }

    const startedAt = new Date();
    this.logger.log(`Starting backup (${triggeredBy})...`);

    try {
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

      // Google Sheets append (only when a sheet is configured).
      if (this.enabled) {
        const sheets = await this.getSheets();
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
      }

      // Encrypted snapshot to GCS (only when a bucket is configured). Every
      // object written here is AES-256-CBC encrypted before upload.
      let encryptedBackup: { object: string; size: number } | undefined;
      if (gcsConfigured) {
        encryptedBackup = await this.writeEncryptedSnapshot(
          { Records: records, Patients: patients, Clients: clients, Bills: bills, Payments: payments },
          timestamp,
        );
      }

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
        encryptedBackup,
      };
    } catch (err: any) {
      this.logger.error('Backup failed:', err.message);
      throw err;
    }
  }

  // ── Backup encryption (AES-256-CBC, IV-prefixed) ──────────────────
  /** Resolve and validate the 32-byte encryption key shared with PHI encryption. */
  private backupKey(): Buffer {
    const key = Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'hex');
    if (key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be a 32-byte value (64 hex chars) to encrypt backups');
    }
    return key;
  }

  private encryptBackup(data: Buffer): Buffer {
    const key = this.backupKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    // Prepend IV so we can decrypt later: [16 bytes IV][encrypted data]
    return Buffer.concat([iv, encrypted]);
  }

  private decryptBackup(data: Buffer): Buffer {
    const key = this.backupKey();
    const iv = data.subarray(0, 16);
    const encrypted = data.subarray(16);
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  /** Serialize a snapshot, encrypt it, and upload it to GCS with a .encrypted suffix. */
  private async writeEncryptedSnapshot(
    tables: Record<string, unknown[][]>,
    timestamp: string,
  ): Promise<{ object: string; size: number }> {
    const bucketName = process.env.STORAGE_BUCKET!;
    const snapshot = Buffer.from(
      JSON.stringify({ generatedAt: new Date().toISOString(), timestamp, tables }),
      'utf8',
    );
    const encrypted = this.encryptBackup(snapshot);
    const safeTs = timestamp.replace(/[: ]/g, '-');
    const object = `${this.BACKUP_PREFIX}${safeTs}.json.encrypted`;

    const { Storage } = await import('@google-cloud/storage');
    const storage = new Storage();
    await storage.bucket(bucketName).file(object).save(encrypted, {
      contentType: 'application/octet-stream',
      resumable: false,
    });

    this.logger.log(`Encrypted backup written to gcs://${bucketName}/${object} (${encrypted.length} bytes)`);
    return { object, size: encrypted.length };
  }

  /**
   * Download the most recent encrypted backup from GCS, decrypt it, and confirm
   * it is non-empty and structurally valid. Proves the restore path end-to-end.
   */
  async verifyLatestBackup(): Promise<{ verified: boolean; object?: string; size?: number; decryptedAt?: string; reason?: string }> {
    const bucketName = process.env.STORAGE_BUCKET;
    if (!bucketName) return { verified: false, reason: 'STORAGE_BUCKET not configured' };

    const { Storage } = await import('@google-cloud/storage');
    const storage = new Storage();
    const [files] = await storage.bucket(bucketName).getFiles({ prefix: this.BACKUP_PREFIX });
    const encrypted = files.filter((f) => f.name.endsWith('.json.encrypted'));
    if (!encrypted.length) throw new NotFoundException('No encrypted backups found in GCS');

    // Names are ISO-timestamped, so a descending lexical sort yields the latest.
    encrypted.sort((a, b) => (a.name < b.name ? 1 : -1));
    const latest = encrypted[0];

    const [buf] = await latest.download();
    const decrypted = this.decryptBackup(buf);
    if (decrypted.length === 0) throw new Error('Decrypted backup is empty');
    // Structural check — must be JSON carrying the snapshot's `tables` object.
    const parsed = JSON.parse(decrypted.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.tables !== 'object') {
      throw new Error('Decrypted backup did not contain a valid snapshot structure');
    }

    return {
      verified: true,
      object: latest.name,
      size: decrypted.length,
      decryptedAt: new Date().toISOString(),
    };
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
