import { compareVersions, updateState } from '@/lib/update';

const rel = (version: string, apkUrl: string | null = 'https://x/app.apk') => ({
  version,
  apkUrl,
  releasedOn: null,
  notes: null,
});

it('compares versions numerically', () => {
  expect(compareVersions('1.10.0', '1.9.3')).toBe(1);
  expect(compareVersions('1.0', '1.0.0')).toBe(0);
  expect(compareVersions('0.9.9', '1.0.0')).toBe(-1);
});
it('blocks a build older than the minimum', () => {
  expect(updateState('1.0.0', { minVersion: '1.1.0', latest: rel('1.2.0') })).toEqual({
    required: true,
    available: rel('1.2.0'),
  });
});
it('offers a newer build without blocking', () => {
  expect(updateState('1.1.0', { minVersion: '1.0.0', latest: rel('1.2.0') })).toEqual({
    required: false,
    available: rel('1.2.0'),
  });
});
it('says nothing when current, or when no APK is published yet', () => {
  expect(updateState('1.2.0', { minVersion: '1.0.0', latest: rel('1.2.0') })).toEqual({
    required: false,
    available: null,
  });
  expect(updateState('1.0.0', { minVersion: '1.0.0', latest: rel('1.1.0', null) })).toEqual({
    required: false,
    available: null,
  });
});
