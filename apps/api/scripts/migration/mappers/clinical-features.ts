/**
 * Clinical-features stage — the EAV pivot applied at scale. Streams records
 * (each carries formtype + clinicalfeatures_id), fetches the record's
 * clinical_item rows in bulk per batch, pivots them into typed Gyn/NonGyn
 * feature payloads (transforms/clinical-features.ts), and upserts on the
 * record's unique key. Any clinical_item names not in the pivot lookup are
 * collected and surfaced in the reconciliation note (never silently dropped).
 */
import { EtlContext } from '../core/context';
import { writeBatch, UpsertRow } from '../core/writer';
import { mapFormType } from '../transforms/enums';
import { pivotClinicalItems, LegacyClinicalItem } from '../transforms/clinical-features';

interface LegacyRecordLite {
  id: number;
  formtype: string | null;
  clinicalfeatures_id: number | null;
  dateupdated: Date | string | null;
}

export async function clinicalFeaturesStage(ctx: EtlContext): Promise<void> {
  const { legacy, idMap, labId } = ctx;
  let gynCount = 0;
  let nonGynCount = 0;
  const unmapped = new Set<string>();

  for await (const batch of legacy.stream<LegacyRecordLite>('record', { incremental: ctx.incremental })) {
    // Bulk-fetch clinical_item rows for this batch's feature ids.
    const featureIds = batch.map((r) => r.clinicalfeatures_id).filter((v): v is number => v != null);
    const items = (await legacy.clinicalItemsFor(featureIds)) as unknown as (LegacyClinicalItem & {
      clinicalfeatures_id: number;
    })[];
    const byFeature = new Map<number, LegacyClinicalItem[]>();
    for (const it of items) {
      let arr = byFeature.get(it.clinicalfeatures_id);
      if (!arr) byFeature.set(it.clinicalfeatures_id, (arr = []));
      arr.push(it);
    }

    const gynRows: UpsertRow[] = [];
    const nonGynRows: UpsertRow[] = [];
    for (const rec of batch) {
      const recordId = await idMap.require('record', rec.id);
      const formType = (mapFormType(rec.formtype) ?? 'Gynecology') as 'Gynecology' | 'NonGynecology';
      const items = rec.clinicalfeatures_id != null ? byFeature.get(rec.clinicalfeatures_id) ?? [] : [];
      const pivot = pivotClinicalItems(items, formType);
      pivot.unmapped.forEach((n) => unmapped.add(n));

      if (pivot.gyn) {
        gynRows.push({ where: { recordId }, data: { id: await idMap.getOrCreate('gynFeatures', rec.id), labId, recordId, ...pivot.gyn } });
        gynCount++;
      } else if (pivot.nonGyn) {
        nonGynRows.push({ where: { recordId }, data: { id: await idMap.getOrCreate('nonGynFeatures', rec.id), labId, recordId, ...pivot.nonGyn } });
        nonGynCount++;
      }
    }
    await writeBatch(ctx, 'gynClinicalFeatures', gynRows);
    await writeBatch(ctx, 'nonGynClinicalFeatures', nonGynRows);
    ctx.log(`  clinicalFeatures: ${gynCount} gyn / ${nonGynCount} nongyn`);
  }

  const note = unmapped.size ? `unmapped names: ${[...unmapped].join(', ')}` : undefined;
  ctx.recon.push({
    table: 'clinical_features',
    source: await legacy.count('record', ctx.incremental),
    target: gynCount + nonGynCount,
    note,
  });
}
