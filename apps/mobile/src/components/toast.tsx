import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { colors, radius } from '@/lib/theme';

let nextId = 1;
type Toast = { id: number; tone: 'success' | 'error' | 'info'; text: string };
const useToasts = create<{
  items: Toast[];
  push: (tone: Toast['tone'], text: string) => void;
  drop: (id: number) => void;
}>((set) => ({
  items: [],
  push: (tone, text) => set((s) => ({ items: [...s.items, { id: nextId++, tone, text }] })),
  drop: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

export const toast = (tone: Toast['tone'], text: string) => useToasts.getState().push(tone, text);

export function ToastHost() {
  const { items, drop } = useToasts();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!items.length) return;
    const first = items[0]!;
    const t = setTimeout(() => drop(first.id), first.tone === 'error' ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [items, drop]);
  if (!items.length) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 80, gap: 8 }}
    >
      {items.map((t) => (
        <View
          key={t.id}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: t.tone === 'error' ? colors.redSoft : colors.ink,
            borderRadius: radius.lg,
            paddingHorizontal: 14,
            paddingVertical: 12,
          }}
        >
          <Ionicons
            name={t.tone === 'error' ? 'alert-circle' : t.tone === 'info' ? 'information-circle' : 'checkmark-circle'}
            size={20}
            color={t.tone === 'error' ? colors.red : '#34d399'}
          />
          <Text style={{ color: t.tone === 'error' ? '#7f1d1d' : '#fff', flex: 1, fontSize: 14 }}>{t.text}</Text>
        </View>
      ))}
    </View>
  );
}
