# Google Cloud Storage Setup

The Files module stores record attachments. Until `STORAGE_BUCKET` is set, files
are stored inline as base64 data URIs in the database (works out of the box, no
GCP needed). Setting `STORAGE_BUCKET` switches new uploads to Google Cloud
Storage; previously-stored base64 files stay readable.

## When ready to enable:

1. Create a GCS bucket in your GCP project.
2. Grant the Compute Engine service account the **Storage Object Admin** role on
   the bucket. (On GCP the client uses Application Default Credentials — no
   service-account JSON needed. For local dev, set
   `GOOGLE_APPLICATION_CREDENTIALS` to a service-account JSON with that role.)
3. Set `STORAGE_BUCKET=your-bucket-name` and restart the API.
4. Existing base64 files stay readable; new uploads go to GCS.

The Files page storage banner and `GET /files/stats` (`storageMode`) reflect
which backend is active.

## Migration of existing base64 files

Run: `POST /system/migrate-files` (to be built in Phase 6.1) — it will re-upload
each base64 attachment to the bucket and rewrite its `storageUrl`.
