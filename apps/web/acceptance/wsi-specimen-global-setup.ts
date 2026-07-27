import fs from 'node:fs';
import path from 'node:path';
import { browserLogin } from './global-setup';

// P5-7 global setup: login the specimen principal (record:view + record:change + wsi:view).
export const AUTH_DIR = path.join(__dirname, '.auth');
export const SPEC_STATE = path.join(AUTH_DIR, 'specimen.json');
export const SPEC_FIXTURES_PATH = path.join(__dirname, '.specimen-fixtures.json');

export function readSpecimenFixtures() {
  if (!fs.existsSync(SPEC_FIXTURES_PATH)) throw new Error(`specimen fixtures not found — run seed-wsi-specimen-acceptance first`);
  return JSON.parse(fs.readFileSync(SPEC_FIXTURES_PATH, 'utf8')) as {
    labAId: string; labBId: string; creds: { viewer: { email: string; password: string } };
    recordAId: string; recordA2Id: string; recordBId: string;
    specimens: { S1: string; S2: string; S3: string; SB: string };
    slides: { pubS1: string; readyS1: string; s2: string; nullSlide: string; a2: string; labB: string };
    expect: { recordASlideCount: number; s1SlideIds: string[]; s2SlideIds: string[]; nullSlideIds: string[] };
    storeRoot: string;
  };
}

export default async function globalSetup() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const { creds } = readSpecimenFixtures();
  await browserLogin(creds.viewer.email, creds.viewer.password, SPEC_STATE);
}
