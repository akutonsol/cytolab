import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Logger } from '@nestjs/common';
import type { MaterializedSource, SourceMaterializer } from '../processing/source-materializer';
import { decodeDicomWsiToPng } from './dicom-wsi-decoder';

/**
 * Program 5C · C2 — DICOM-aware SourceMaterializer DECORATOR.
 *
 * Wraps the accepted LocalSourceMaterializer: it ALWAYS delegates to it first (verifying the native source
 * bytes against the checksum, producing the private read-only working file). For sourceKind !== 'DICOM' it
 * returns that result UNCHANGED — the Program 5A path is byte-identical. Only for sourceKind === 'DICOM' does
 * it add a decode step: reconstruct the native DICOM into a transient libvips-readable PNG inside the SAME
 * private workspace, and hand THAT path to the tiling engine. The native DICOM remains the authoritative
 * source (its checksum is returned unchanged); the transient PNG is removed by the delegate's dispose().
 */
export class DicomAwareSourceMaterializer implements SourceMaterializer {
  private readonly logger = new Logger(DicomAwareSourceMaterializer.name);

  constructor(private readonly base: SourceMaterializer) {}

  async materializeVerifiedSource(input: {
    sourceObjectKey: string;
    expectedChecksum: string;
    sourceKind?: string;
  }): Promise<MaterializedSource> {
    const materialized = await this.base.materializeVerifiedSource(input);
    if (input.sourceKind !== 'DICOM') return materialized;

    try {
      const nativeBytes = await fs.readFile(materialized.path);
      const png = decodeDicomWsiToPng(nativeBytes);
      // Write the reconstructed working image beside the native file (same private workspace → same dispose()).
      const pngPath = path.join(path.dirname(materialized.path), 'dicom-working.png');
      await fs.writeFile(pngPath, png, { mode: 0o600 });
      await fs.chmod(pngPath, 0o400);
      // The tiling engine consumes the PNG; the returned checksum stays the NATIVE source checksum (provenance).
      return { path: pngPath, checksum: materialized.checksum, dispose: materialized.dispose };
    } catch (err) {
      // Never leak the workspace on a decode failure (the native + any partial PNG must be removed).
      await materialized.dispose().catch((e) => this.logger.warn(`dicom materialization cleanup failed (primary error preserved): ${(e as Error)?.message ?? e}`));
      throw err;
    }
  }
}
