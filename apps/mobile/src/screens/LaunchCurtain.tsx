import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet } from 'react-native';
import { colors } from '@/lib/theme';
import { BrandMark } from './BrandMark';

/**
 * The opening moment, picked up where the native splash (deep background) leaves off: the mark lifts and grows on an
 * ease-in for 1s, and at 800ms the deep curtain fades away over 200ms to reveal the app. With reduce motion on it
 * only fades. It never blocks touches once the curtain starts to lift.
 */
export function LaunchCurtain({ onDone }: { onDone: () => void }) {
  const mark = useRef(new Animated.Value(0)).current;
  const curtain = useRef(new Animated.Value(1)).current;
  const [lifting, setLifting] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (!alive) return;
        const fade = Animated.timing(curtain, {
          toValue: 0,
          duration: 200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        });
        setLifting(!!reduce);
        const run = reduce
          ? fade
          : Animated.parallel([
              Animated.timing(mark, {
                toValue: 1,
                duration: 1000,
                easing: Easing.bezier(0.8, 0, 1, 1),
                useNativeDriver: true,
              }),
              Animated.sequence([Animated.delay(800), fade]),
            ]);
        if (!reduce) setTimeout(() => alive && setLifting(true), 800);
        run.start(() => alive && onDone());
      });
    return () => {
      alive = false;
    };
  }, [mark, curtain, onDone]);

  const scale = mark.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.7] });
  const translateY = mark.interpolate({ inputRange: [0, 1], outputRange: [0, -48] });
  return (
    <Animated.View
      testID="launch-curtain"
      pointerEvents={lifting ? 'none' : 'auto'}
      style={[StyleSheet.absoluteFill, styles.curtain, { opacity: curtain }]}
    >
      <Animated.View style={{ transform: [{ translateY }, { scale }] }}>
        <BrandMark size={88} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  curtain: { backgroundColor: colors.deep, alignItems: 'center', justifyContent: 'center' },
});
