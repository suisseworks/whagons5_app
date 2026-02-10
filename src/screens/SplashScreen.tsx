import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../models/types';
import { fontFamilies, fontSizes, radius, shadows } from '../config/designTokens';
import { useAuth } from '../context/AuthContext';

type SplashScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Splash'>;

export const SplashScreen: React.FC = () => {
  const navigation = useNavigation<SplashScreenNavigationProp>();
  const { isLoading: authLoading, token } = useAuth();
  const navigatedRef = useRef(false);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const goNext = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    // Route to Main if already authenticated, Login otherwise
    const destination = token ? 'Main' : 'Login';
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: destination }],
      })
    );
  };

  useEffect(() => {
    // Logo animation
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Navigate once auth state is loaded
  useEffect(() => {
    if (!authLoading) {
      const timer = setTimeout(goNext, 1200);
      return () => clearTimeout(timer);
    }
  }, [authLoading, token]);

  return (
    <TouchableWithoutFeedback onPress={goNext}>
      <LinearGradient
        colors={['#121614', '#1C2420', '#2F6F6D']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        {/* Glow circles */}
        <View style={[styles.glowCircle, styles.topGlow]} />
        <View style={[styles.glowCircle, styles.bottomGlow]} />

        <View style={styles.content}>
          <Animated.View
            style={[
              styles.logoContainer,
              {
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            <View style={styles.logoWrapper}>
              <View style={styles.logoCircle}>
                <Image source={require('../../assets/whagons-check.png')} style={styles.logoImage} />
              </View>
              <Text style={styles.title}>Whagons</Text>
              <Text style={styles.subtitle}>Coordinating work, together.</Text>
            </View>
          </Animated.View>

          <Animated.View style={[styles.loaderContainer, { opacity: fadeAnim }]}>
            <View style={styles.progressBar}>
              <ActivityIndicator size="small" color="#FFFFFF" />
            </View>
            <Text style={styles.loadingText}>Preparing your workspace...</Text>
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
  glowCircle: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
  },
  topGlow: {
    top: -80,
    left: -40,
    backgroundColor: 'rgba(199, 123, 67, 0.2)',
  },
  bottomGlow: {
    bottom: -60,
    right: -30,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(63, 143, 140, 0.2)',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logoContainer: {
    alignItems: 'center',
  },
  logoWrapper: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    ...shadows.lifted,
  },
  logoCircle: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  logoImage: {
    width: 64,
    height: 64,
    resizeMode: 'contain',
  },
  title: {
    marginTop: 18,
    fontSize: fontSizes.xl,
    fontFamily: fontFamilies.displaySemibold,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  subtitle: {
    marginTop: 8,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    color: 'rgba(255, 255, 255, 0.7)',
    letterSpacing: 0.2,
  },
  loaderContainer: {
    marginTop: 32,
    alignItems: 'center',
  },
  progressBar: {
    height: 4,
    width: 72,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    letterSpacing: 0.3,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
});
