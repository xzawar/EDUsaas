import { View } from 'react-native';
import { Text } from '@/components/text';
import { colors, family } from '@/lib/theme';

/** The EDUsaas mark: a brand disc with the deep "E". */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.brand,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: family.display, fontSize: size * 0.5, lineHeight: size * 0.62, color: colors.deep }}>
        E
      </Text>
    </View>
  );
}
