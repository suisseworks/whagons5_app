import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../models/types';

type SplashScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Splash'>;

export const SplashScreen: React.FC = () => {
  const navigation = useNavigation<SplashScreenNavigationProp>();
  const navigatedRef = useRef(false);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const goNext = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Main' }],
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

    // Auto-navigate after delay
    const timer = setTimeout(goNext, 2200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <TouchableWithoutFeedback onPress={goNext}>
      <LinearGradient
        colors={['#061E1B', '#0A3B30', '#0FB292']}
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
                <MaterialCommunityIcons name="truck-delivery" size={64} color="#FFFFFF" />
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
    backgroundColor: 'rgba(100, 255, 218, 0.15)',
  },
  bottomGlow: {
    bottom: -60,
    right: -30,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(105, 240, 174, 0.15)',
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
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.25,
    shadowRadius: 32,
    elevation: 10,
  },
  logoCircle: {
    padding: 16,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  title: {
    marginTop: 18,
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '400',
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
    fontSize: 14,
  },
});
