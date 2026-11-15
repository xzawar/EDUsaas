import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { LaunchCurtain } from '@/screens/LaunchCurtain';

describe('opening animation', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it.each([false, true])('covers the app, then gets out of the way (reduce motion: %s)', async (reduce) => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduce);
    const onDone = jest.fn();
    await render(<LaunchCurtain onDone={onDone} />);
    expect(screen.getByTestId('launch-curtain')).toBeTruthy();
    await act(async () => {
      await Promise.resolve();
      jest.advanceTimersByTime(1500);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
