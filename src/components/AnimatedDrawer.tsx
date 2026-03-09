import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useState,
} from 'react';
import { Dimensions, StyleSheet, BackHandler } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { AppDrawer } from './AppDrawer';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.8, 320);
const SWIPE_THRESHOLD = DRAWER_WIDTH * 0.3;

const ANIM_CONFIG = {
  duration: 280,
  easing: Easing.out(Easing.cubic),
};

export interface AnimatedDrawerRef {
  open: () => void;
  close: () => void;
}

export const AnimatedDrawer = forwardRef<AnimatedDrawerRef>((_props, ref) => {
  // Controls whether the drawer tree is mounted at all.
  // We only mount when open, so AppDrawer doesn't subscribe to contexts while hidden.
  const [mounted, setMounted] = useState(false);

  // 0 = fully closed (off-screen), 1 = fully open
  const progress = useSharedValue(0);

  // ── Open / Close ──────────────────────────────────────────────────────
  const open = useCallback(() => {
    setMounted(true);
    // Small delay so the component tree mounts before we animate
    requestAnimationFrame(() => {
      progress.value = withTiming(1, ANIM_CONFIG);
    });
  }, [progress]);

  const close = useCallback(() => {
    progress.value = withTiming(0, ANIM_CONFIG, (finished) => {
      if (finished) {
        runOnJS(setMounted)(false);
      }
    });
  }, [progress]);

  useImperativeHandle(ref, () => ({ open, close }), [open, close]);

  // ── Android back button ───────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      if (!mounted) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        close();
        return true;
      });
      return () => sub.remove();
    }, [mounted, close]),
  );

  // ── Gesture: swipe left to close ──────────────────────────────────────
  const pan = Gesture.Pan()
    .activeOffsetX(-10)
    .failOffsetY([-20, 20])
    .onUpdate((e) => {
      // Only allow swiping to the left (negative translationX)
      const clamped = Math.min(0, e.translationX);
      // Map the drag distance to progress (0-1)
      progress.value = 1 + clamped / DRAWER_WIDTH;
    })
    .onEnd((e) => {
      if (
        e.translationX < -SWIPE_THRESHOLD ||
        e.velocityX < -500
      ) {
        progress.value = withTiming(0, ANIM_CONFIG, (finished) => {
          if (finished) runOnJS(setMounted)(false);
        });
      } else {
        progress.value = withTiming(1, ANIM_CONFIG);
      }
    });

  // ── Animated styles ───────────────────────────────────────────────────
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0, 1],
      [0, 1],
      Extrapolation.CLAMP,
    ),
    pointerEvents: progress.value > 0 ? 'auto' : 'none',
  }));

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          progress.value,
          [0, 1],
          [-DRAWER_WIDTH, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  if (!mounted) return null;

  return (
    <>
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, backdropStyle]}
        onTouchEnd={close}
      />

      {/* Drawer panel */}
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.drawer, drawerStyle]}>
          <AppDrawer onClose={close} />
        </Animated.View>
      </GestureDetector>
    </>
  );
});

AnimatedDrawer.displayName = 'AnimatedDrawer';

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    zIndex: 1001,
  },
});
