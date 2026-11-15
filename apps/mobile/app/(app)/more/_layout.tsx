import { Stack } from 'expo-router';
import { stackScreenOptions } from '@/components/header';

// A page opened from elsewhere (e.g. Home → a More page) still has this section's main list underneath, so Back and
// the tab button always lead to it.
export const unstable_settings = { initialRouteName: 'index' };

export default function Layout() {
  return <Stack screenOptions={stackScreenOptions} />;
}
