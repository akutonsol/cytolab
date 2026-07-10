import Link from 'next/link';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/ui';

/** Route-segment 404 inside the authenticated shell, so the user keeps their navigation. */
export default function NotFound() {
  return (
    <div className="min-h-full pt-4">
      <EmptyState
        className="mt-16"
        icon={<Compass size={28} />}
        title="Page not found"
        description="That screen doesn’t exist, or you don’t have access to it."
        action={
          <Link href="/dashboard" className="btn-secondary">
            Back to dashboard
          </Link>
        }
      />
    </div>
  );
}
