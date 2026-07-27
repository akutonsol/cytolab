import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InitiateSlideUploadDto } from './slide-ingestion.dto';

// P5B-B2 public boundary: the DTO TYPE was widened so an in-process automated caller can set WATCH_FOLDER,
// but the runtime @IsIn whitelist (the PUBLIC boundary) still accepts UPLOAD only. A browser request that
// declares WATCH_FOLDER (or any non-UPLOAD kind) must be rejected by validation.
async function errorsFor(sourceKind: string) {
  const dto = plainToInstance(InitiateSlideUploadDto, { filename: 'x.svs', sourceKind });
  return validate(dto);
}

describe('P5B-B2 InitiateSlideUploadDto — public sourceKind whitelist unchanged', () => {
  it('accepts UPLOAD (the only public kind)', async () => {
    expect(await errorsFor('UPLOAD')).toHaveLength(0);
  });

  it('rejects WATCH_FOLDER from a public request (cannot be spoofed by a browser)', async () => {
    const errs = await errorsFor('WATCH_FOLDER');
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0].property).toBe('sourceKind');
  });

  it('rejects SCANNER / DICOM too', async () => {
    expect((await errorsFor('SCANNER')).length).toBeGreaterThan(0);
    expect((await errorsFor('DICOM')).length).toBeGreaterThan(0);
  });
});
