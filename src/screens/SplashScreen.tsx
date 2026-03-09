import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Animated,
  TouchableWithoutFeedback,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../models/types';
import { fontFamilies, fontSizes } from '../config/designTokens';
import { useAuth } from '../context/AuthContext';

type SplashScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Splash'>;

export const SplashScreen: React.FC = () => {
  const navigation = useNavigation<SplashScreenNavigationProp>();
  const { isLoading: authLoading, token } = useAuth();
  const navigatedRef = useRef(false);

  const logoScale = useRef(new Animated.Value(0.8)).current;
  const logoFade = useRef(new Animated.Value(0)).current;
  const textFade = useRef(new Animated.Value(0)).current;
  const dotsFade = useRef(new Animated.Value(0)).current;

  const goNext = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    const destination = token ? 'Main' : 'Login';
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: destination }],
      })
    );
  };

  useEffect(() => {
    // Staggered entrance
    Animated.sequence([
      // Logo fades in and scales up
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 6,
          tension: 50,
          useNativeDriver: true,
        }),
        Animated.timing(logoFade, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
      // Text slides in
      Animated.timing(textFade, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      // Loading dots
      Animated.timing(dotsFade, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    if (!authLoading) {
      const timer = setTimeout(goNext, 1200);
      return () => clearTimeout(timer);
    }
  }, [authLoading, token]);

  return (
    <TouchableWithoutFeedback onPress={goNext}>
      <LinearGradient
        colors={['#121614', '#1A201D', '#1E2926']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        <StatusBar barStyle="light-content" backgroundColor="#121614" translucent={false} />

        {/* Subtle ambient glow */}
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />

        <View style={styles.content}>
          {/* Logo */}
          <Animated.View
            style={[
              styles.logoContainer,
              {
                opacity: logoFade,
                transform: [{ scale: logoScale }],
              },
            ]}
          >
            <Image
              source={require('../../assets/whagons-check.png')}
              style={styles.logoImage}
            />
          </Animated.View>

          {/* Brand name */}
          <Animated.Text style={[styles.title, { opacity: textFade }]}>
            Whagons
          </Animated.Text>

          {/* Tagline */}
          <Animated.Text style={[styles.subtitle, { opacity: textFade }]}>
            Coordinating work, together.
          </Animated.Text>

          {/* Loading indicator */}
          <Animated.View style={[styles.loadingContainer, { opacity: dotsFade }]}>
            <View style={styles.loadingBar}>
              <Animated.View style={styles.loadingBarFill} />
            </View>
          </Animated.View>
        </View>
      </LinearGradient>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glowTop: {
    position: 'absolute',
    top: -100,
    left: -60,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(199, 123, 67, 0.08)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: -80,
    right: -50,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(47, 111, 109, 0.1)',
  },
  content: {
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: 20,
  },
  logoImage: {
    width: 72,
    height: 72,
    resizeMode: 'contain',
  },
  title: {
    fontSize: 32,
    fontFamily: fontFamilies.displaySemibold,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 8,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    color: 'rgba(255, 255, 255, 0.45)',
    letterSpacing: 0.3,
  },
  loadingContainer: {
    marginTop: 48,
    alignItems: 'center',
  },
  loadingBar: {
    width: 40,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  loadingBarFill: {
    width: '60%',
    height: '100%',
    borderRadius: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
});
