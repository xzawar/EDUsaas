import app from '../app.json';
import pkg from '../package.json';

const blocked = (app.expo.android as { blockedPermissions?: string[] }).blockedPermissions ?? [];
const deps = Object.keys(pkg.dependencies);

// Native modules that need a permission at start-up. Blocking it makes the app die before its first screen.
const NEEDS: Record<string, string[]> = {
  'expo-screen-capture': ['android.permission.DETECT_SCREEN_CAPTURE'],
  'expo-local-authentication': ['android.permission.USE_BIOMETRIC'],
  'expo-image-picker': ['android.permission.CAMERA'],
  'expo-notifications': ['android.permission.POST_NOTIFICATIONS'],
};

it.each(Object.entries(NEEDS).filter(([dep]) => deps.includes(dep)))('does not block what %s needs', (_dep, perms) => {
  for (const p of perms) expect(blocked).not.toContain(p);
});

it('keeps microphone and overlay blocked', () => {
  expect(blocked).toEqual(
    expect.arrayContaining(['android.permission.RECORD_AUDIO', 'android.permission.SYSTEM_ALERT_WINDOW']),
  );
});
