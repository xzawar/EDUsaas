import { Linking, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/avatar';
import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { colors, font, space } from '@/lib/theme';

export type TeacherContact = { id: string; name: string; phone: string | null };

/** Pakistani mobile numbers for WhatsApp links: 03XX… → 923XX… */
const waNumber = (p: string) => {
  const d = p.replace(/\D/g, '');
  return d.startsWith('0') ? `92${d.slice(1)}` : d;
};

/** A teacher's card, from the bottom of the screen: who they are, what they teach you, and how to reach them. */
export function TeacherCard({
  teacher,
  subjects,
  classTeacher,
  onClose,
}: {
  teacher: TeacherContact;
  subjects: string[];
  classTeacher: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.scrim }} onPress={onClose} accessibilityLabel="Close" />
      <View
        style={{
          backgroundColor: colors.bg,
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          padding: space.xl,
          paddingBottom: insets.bottom + space.xl,
          gap: space.lg,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Avatar name={teacher.name} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={font.title}>{teacher.name}</Text>
            <Text style={font.small}>
              {classTeacher ? 'Your class teacher' : ''}
              {classTeacher && subjects.length ? ' · ' : ''}
              {subjects.join(', ')}
            </Text>
          </View>
        </View>
        {teacher.phone ? (
          <>
            <Text selectable style={[font.body, { color: colors.ink, fontWeight: '700' }]}>
              {teacher.phone}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button style={{ flex: 1 }} icon="call-outline" onPress={() => Linking.openURL(`tel:${teacher.phone}`)}>
                Call
              </Button>
              <Button
                style={{ flex: 1 }}
                variant="secondary"
                icon="chatbubble-outline"
                onPress={() => Linking.openURL(`https://wa.me/${waNumber(teacher.phone!)}`)}
              >
                WhatsApp
              </Button>
            </View>
          </>
        ) : (
          <Text style={font.body}>The school hasn’t added a phone number for this teacher. Ask at the office.</Text>
        )}
      </View>
    </Modal>
  );
}
