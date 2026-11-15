import { Stack } from 'expo-router';
import { stackScreenOptions } from '@/components/header';

export default function Layout() {
  return <Stack screenOptions={stackScreenOptions} />;
}
