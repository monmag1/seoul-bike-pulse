import { useEffect, useState } from 'react';
export type Remote<T> = { data: T | null; loading: boolean; error: string | null };
export function useRemote<T>(fetcher: (signal: AbortSignal) => Promise<T>, refreshKey: unknown = null): Remote<T> {
  const [result, setResult] = useState<Remote<T>>({ data: null, loading: true, error: null });
  useEffect(() => {
    const ctl = new AbortController();
    setResult({ data: null, loading: true, error: null });
    fetcher(ctl.signal).then(data => { if (!ctl.signal.aborted) setResult({ data, loading: false, error: null }); })
      .catch(e => { if (!ctl.signal.aborted) setResult({ data: null, loading: false, error: String(e?.message || e) }); });
    return () => ctl.abort();
  // Caller provides stable fetcher functions such as api.overview, or explicit start/end in dependency key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);
  return result;
}
