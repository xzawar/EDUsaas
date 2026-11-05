'use client';

import { ErrorScreen } from '@/components/errors/ErrorScreen';

export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen error={error} reset={reset} home="/staff" />;
}
