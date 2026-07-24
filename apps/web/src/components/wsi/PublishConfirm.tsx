'use client';

import { Button, Modal } from '@/components/ui';

/** Deliberate, confirm-gated publication. Names the generation being published and — when one exists — the
 *  currently-live generation that will be superseded. No optimistic UI: the button shows in-flight state and
 *  the caller refetches authoritative state on the server's response. */
export function PublishConfirm({
  open,
  generationId,
  currentLiveGenerationId,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  generationId: string | null;
  currentLiveGenerationId: string | null;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={(o) => { if (!o && !loading) onCancel(); }}
      title="Publish this generation?"
      description="It becomes the authoritative diagnostic image for this slide."
      closeOnBackdrop={!loading}
      closeOnEscape={!loading}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} loading={loading} loadingLabel="Publishing…">
            Publish
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-[13px] text-text-secondary">
        <p>
          Publishing generation <span className="font-mono text-text">{generationId ?? ''}</span>.
        </p>
        {currentLiveGenerationId ? (
          <p>
            The current live generation{' '}
            <span className="font-mono text-text">{currentLiveGenerationId}</span> will become{' '}
            <span className="font-semibold text-text">superseded</span>.
          </p>
        ) : (
          <p>This slide has no currently published generation; this will be the first.</p>
        )}
      </div>
    </Modal>
  );
}
