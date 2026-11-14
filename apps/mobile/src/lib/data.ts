import { useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { get } from './api';

/** Cached GET. Renders cached data instantly; refetches on focus/reconnect. */
export function useGet<T>(path: string | null, opts: Partial<UseQueryOptions<T>> = {}) {
  return useQuery<T>({
    queryKey: ['get', path],
    queryFn: () => get<T>(path!),
    enabled: !!path,
    ...opts,
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (prefix?: string) =>
    qc.invalidateQueries({ predicate: (q) => !prefix || String(q.queryKey[1] ?? '').startsWith(prefix) });
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
