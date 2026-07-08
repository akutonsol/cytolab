import { NextResponse } from 'next/server';

// Lead-capture endpoint for the "Book a demo" / "Contact sales" forms.
//
// Self-contained inside the web app (NOT proxied to Nest — the rewrite only
// forwards /api/v1/*). It validates and records the lead server-side without
// touching the database schema or the API service, keeping the frozen backend
// architecture untouched. Wiring this to a CRM / email (nodemailer) is the
// natural next step; for now the lead is logged so nothing is silently dropped.
export const runtime = 'nodejs';

type Lead = {
  name?: string; email?: string; company?: string;
  role?: string; labSize?: string; message?: string; source?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  let body: Lead;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  const email = (body.email ?? '').trim();
  const company = (body.company ?? '').trim();

  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = 'Please enter your full name.';
  if (!EMAIL_RE.test(email)) errors.email = 'Please enter a valid work email.';
  if (company.length < 2) errors.company = 'Please enter your lab or organization.';
  if (Object.keys(errors).length) {
    return NextResponse.json({ ok: false, errors }, { status: 422 });
  }

  // Record the lead. Structured line so it is easy to grep / forward later.
  console.info('[lead]', JSON.stringify({
    source: body.source ?? 'book-demo',
    name, email, company,
    role: (body.role ?? '').trim() || undefined,
    labSize: (body.labSize ?? '').trim() || undefined,
    message: (body.message ?? '').trim() || undefined,
  }));

  return NextResponse.json({ ok: true });
}
