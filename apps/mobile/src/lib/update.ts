import { useEffect, useState } from 'react';
import { api } from './api';
import { APP_VERSION } from './config';

export type Release = { version: string; apkUrl: string | null; releasedOn: string | null; notes: string | null };
type Config = { minVersion: string; latest: Release };

/** -1 / 0 / 1 for dotted versions ("1.10.0" > "1.9.3"). Non-numbers count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function updateState(current: string, cfg: Config): { required: boolean; available: Release | null } {
  return {
    required: compareVersions(current, cfg.minVersion) < 0,
    available: compareVersions(current, cfg.latest.version) < 0 && cfg.latest.apkUrl ? cfg.latest : null,
  };
}

/** Asks the server once per launch whether this build is still supported. Offline: assume it is. */
export function useUpdateCheck() {
  const [state, setState] = useState<{ required: boolean; available: Release | null }>({
    required: false,
    available: null,
  });
  useEffect(() => {
    let live = true;
    api<Config>('/mobile/config')
      .then((r) => live && r.ok && setState(updateState(APP_VERSION, r.data)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return state;
}
