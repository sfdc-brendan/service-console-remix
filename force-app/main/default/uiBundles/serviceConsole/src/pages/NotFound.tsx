import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/console/primitives';

export default function NotFound() {
  return (
    <div className="animate-rise mx-auto max-w-md rounded-2xl border bg-card py-10">
      <EmptyState
        icon={Compass}
        title="This workspace tab is empty"
        detail="The page or record you opened does not exist."
      >
        <Button asChild className="mt-3">
          <Link to="/">Back to Home</Link>
        </Button>
      </EmptyState>
    </div>
  );
}
