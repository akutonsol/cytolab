import path from 'node:path';

export const BASE = 'http://localhost:3000';

// Demo superuser (from the cytolab-demo lab). All seeded demo users are
// Superusers, so we provision a dedicated non-super staff user for access tests.
export const SUPER = { email: 'william.brooks@cytolab.demo', password: 'Verify123!' };
export const STAFF = {
  email: 'e2e.staff@cytolab.demo',
  password: 'E2eStaff#2026aB', // meets policy: ≥12, upper/lower/number/special
  firstName: 'E2E',
  lastName: 'Staff',
};

export const AUTH_DIR = path.join(__dirname, '.auth');
export const SUPER_STATE = path.join(AUTH_DIR, 'superuser.json');
export const STAFF_STATE = path.join(AUTH_DIR, 'staff.json');
export const NO_AUTH: { cookies: never[]; origins: never[] } = { cookies: [], origins: [] };
