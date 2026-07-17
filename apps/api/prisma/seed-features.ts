/**
 * Seed LabFeature rows for every lab: one row per (lab, feature) for all
 * toggleable (tier 2-5) FeatureKeys. Built-and-deployed features seed enabled;
 * everything else seeds disabled. Idempotent — re-running never clobbers a
 * superuser's existing toggle (update only refreshes the tier).
 * Run: npx ts-node prisma/seed-features.ts
 */
import { PrismaClient } from '@prisma/client';
import { ALL_FEATURE_KEYS, BUILT_FEATURES, CONTAINED_FEATURES, FEATURE_TIERS } from '../src/modules/lab-features/feature-catalog';

const prisma = new PrismaClient();

async function main() {
  const labs = await prisma.lab.findMany({ select: { id: true, name: true } });
  let created = 0;
  for (const lab of labs) {
    for (const key of ALL_FEATURE_KEYS) {
      const contained = CONTAINED_FEATURES.has(key);
      const enabled = BUILT_FEATURES.has(key) && !contained;
      // Contained features (Program 1 · P1-1) are forced OFF on every lab, even if a
      // prior toggle enabled them — they are not available for clinical use. All other
      // features keep their existing toggle on update (never clobber a superuser's choice).
      const res = await prisma.labFeature.upsert({
        where: { labId_featureKey: { labId: lab.id, featureKey: key } },
        update: contained ? { tier: FEATURE_TIERS[key], isEnabled: false, enabledAt: null } : { tier: FEATURE_TIERS[key] },
        create: {
          labId: lab.id,
          featureKey: key,
          tier: FEATURE_TIERS[key],
          isEnabled: enabled,
          enabledAt: enabled ? new Date() : null,
        },
      });
      if (res.createdAt.getTime() === res.updatedAt.getTime()) created++;
    }
  }
  console.log(`Seeded lab features: ${created} new row(s) across ${labs.length} lab(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
