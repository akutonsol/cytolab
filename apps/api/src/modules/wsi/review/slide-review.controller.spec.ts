import { PERMISSIONS_KEY } from '../../../common/decorators/require-permissions.decorator';
import { AuthUser } from '../../../common/decorators/current-user.decorator';
import { SlideReviewController } from './slide-review.controller';
import { SlideReviewService } from './slide-review.service';

/**
 * P5-6.1 — controller unit test: proves each route delegates with the JWT `labId` (never the body) and
 * that the INTERIM `record:view` permission metadata is present on every handler (the PermissionsGuard,
 * tested elsewhere, enforces it). P5-6.2 will re-point this metadata to `wsi:review`.
 */
const user: AuthUser = { userId: 'u1', labId: 'lab-1', email: 'e@x.test', roles: [], permissions: ['record:view'] };

function makeService() {
  return {
    getReviewSummary: jest.fn().mockResolvedValue({ ok: 'review' }),
    getGenerationEvidence: jest.fn().mockResolvedValue({ ok: 'evidence' }),
    getPublicationHistory: jest.fn().mockResolvedValue({ ok: 'history' }),
  } as unknown as jest.Mocked<SlideReviewService>;
}

describe('SlideReviewController', () => {
  it('delegates each route to the service using the JWT labId', async () => {
    const svc = makeService();
    const ctrl = new SlideReviewController(svc);

    await ctrl.getReview(user, 'slide-1');
    expect(svc.getReviewSummary).toHaveBeenCalledWith('lab-1', 'slide-1');

    await ctrl.getEvidence(user, 'slide-1', 'gen-1');
    expect(svc.getGenerationEvidence).toHaveBeenCalledWith('lab-1', 'slide-1', 'gen-1');

    await ctrl.getPublications(user, 'slide-1', { limit: 25, cursor: 'c' });
    expect(svc.getPublicationHistory).toHaveBeenCalledWith('lab-1', 'slide-1', { limit: 25, cursor: 'c' });
  });

  it('gates every handler behind record:view (interim; P5-6.2 → wsi:review)', () => {
    const proto = SlideReviewController.prototype as any;
    for (const handler of ['getReview', 'getEvidence', 'getPublications']) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[handler])).toEqual(['record:view']);
    }
  });
});
