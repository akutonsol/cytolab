# Google Sheets Backup Setup

The API ships with a backup service that appends a daily snapshot of core lab
data (Records, Patients, Clients, Bills, Payments) to a Google Sheet, plus a
`BackupLog` tab recording each run. It is **disabled until `BACKUP_SHEET_ID` is
set** — until then `POST /system/backup` returns `{ skipped: true }` and the
nightly cron logs a warning and exits cleanly, so nothing breaks in the meantime.

The backup **appends** rows (with a timestamp column) rather than overwriting, so
the sheet keeps the full history of every run.

## When you're ready to enable backups:

### 1. Create the Google Sheet
- Go to sheets.google.com and create a new sheet.
- Create 6 tabs: `Records`, `Patients`, `Clients`, `Bills`, `Payments`, `BackupLog`.
- Copy the Sheet ID from the URL: `docs.google.com/spreadsheets/d/{SHEET_ID}/edit`.

### 2. Grant access (GCP — Application Default Credentials)
Since the API runs on Google Cloud, no service account JSON is needed. The
compute instance's service account needs one of:
- Role: **Editor** on the specific Google Sheet (share the sheet with the service
  account's email), **OR**
- The default Compute Engine service account with the Google Sheets API enabled.

For **local** development, instead set `GOOGLE_APPLICATION_CREDENTIALS` to the
path of a service account JSON file (and share the sheet with that account).

### 3. Enable the Sheets API
In Google Cloud Console:
`APIs & Services → Enable APIs → Google Sheets API → Enable`.

### 4. Set environment variable
In Cloud Run / App Engine / Compute Engine:
```
BACKUP_SHEET_ID=your-sheet-id-here
```

### 5. Verify
Hit `POST /system/backup` (superuser-only) — it should return `success: true`
with per-tab row counts. The System Health page ("Google Sheets Backup" card)
will show **Connected to Google Sheets** with a link to open the sheet, and the
manual **Run Backup Now** button surfaces the same result.

## Schedule
The cron runs daily at **02:30** server time (`@Cron('30 2 * * *')` in
`apps/api/src/modules/system/backup.service.ts`).
