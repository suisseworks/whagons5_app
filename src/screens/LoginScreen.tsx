import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  StatusBar,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
  Image,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../models/types';
import { useAuth } from '../context/AuthContext';
import Svg, { Path, Rect, G, Defs, ClipPath } from 'react-native-svg';
import { fontFamilies, fontSizes, radius, spacing } from '../config/designTokens';
import { useLanguage } from '../context/LanguageContext';

type LoginScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Login'>;

// Google "G" logo rendered with react-native-svg
const GoogleLogo = () => (
  <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
    <G clipPath="url(#g)">
      <Path d="M19.999 10.222c.012-.688-.06-1.374-.216-2.045H10.203v3.712h5.624a4.86 4.86 0 0 1-2.087 3.244l3.03 2.3c1.927-1.745 3.038-4.312 3.038-7.356" fill="#4285F4" />
      <Path d="M10.206 20c2.755 0 5.068-.889 6.757-2.422l-3.22-2.445a6.1 6.1 0 0 1-3.537 1.001 6.12 6.12 0 0 1-5.805-4.159l-3.27 2.398A10.18 10.18 0 0 0 10.206 20" fill="#34A853" />
      <Path d="M4.4 11.978a6.06 6.06 0 0 1 0-3.955L1.13 5.624A10.2 10.2 0 0 0 0 10c0 1.559.373 3.096 1.088 4.489L4.4 11.978Z" fill="#FBBC05" />
      <Path d="M10.206 3.867A5.75 5.75 0 0 1 14.357 5.5l2.88-2.756A9.99 9.99 0 0 0 10.206 0 10.18 10.18 0 0 0 1.09 5.511l3.3 2.511a6.12 6.12 0 0 1 5.816-4.155Z" fill="#EB4335" />
    </G>
    <Defs>
      <ClipPath id="g">
        <Rect width={20} height={20} fill="#fff" />
      </ClipPath>
    </Defs>
  </Svg>
);

export const LoginScreen: React.FC = () => {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const { width } = useWindowDimensions();
  const { signInWithGoogle, signInWithEmail, token, pendingTenants } = useAuth();
  const { t } = useLanguage();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isObscured, setIsObscured] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Animations
  const logoFade = useRef(new Animated.Value(0)).current;
  const formSlide = useRef(new Animated.Value(30)).current;
  const formFade = useRef(new Animated.Value(0)).current;
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(logoFade, {
        toValue: 1,
        duration: 600,
        useNativeDriver: false,
      }),
      Animated.parallel([
        Animated.timing(formFade, {
          toValue: 1,
          duration: 500,
          useNativeDriver: false,
        }),
        Animated.timing(formSlide, {
          toValue: 0,
          duration: 500,
          useNativeDriver: false,
        }),
      ]),
    ]).start();
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const isLargeScreen = width > 800;
  const anyLoading = isLoading || isGoogleLoading;

  // Watch for auth state changes and navigate accordingly
  const hasNavigated = useRef(false);
  useEffect(() => {
    if (hasNavigated.current) return;
    if (token) {
      hasNavigated.current = true;
      navigation.dispatch(
        CommonActions.reset({ index: 0, routes: [{ name: 'Main' }] }),
      );
    } else if (pendingTenants && pendingTenants.length > 1) {
      hasNavigated.current = true;
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'TenantSelect', params: { tenants: pendingTenants, firebaseIdToken: '' } }],
        }),
      );
    }
  }, [token, pendingTenants]);

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      await signInWithGoogle();
      // Navigation handled by effect above when auth resolves
    } catch (err: any) {
      const msg = err?.message || t('login.googleSignInFailed');
      if (msg.includes('CANCELED') || msg.includes('cancelled')) {
        // User cancelled
      } else {
        Alert.alert(t('login.signInFailedTitle'), msg);
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleEmailSignIn = async () => {
    if (!email.trim()) {
      Alert.alert(t('common.error'), t('login.emailRequired'));
      return;
    }
    if (!password) {
      Alert.alert(t('common.error'), t('login.passwordRequired'));
      return;
    }

    setIsLoading(true);
    try {
      await signInWithEmail({ email: email.trim(), password });
      // Navigation handled by effect above when auth resolves
    } catch (err: any) {
      let msg = err?.message || t('login.unableToLogin');
      if (msg.includes('wrong-password') || msg.includes('invalid-credential')) {
        msg = t('login.incorrectCredentials');
      } else if (msg.includes('user-not-found')) {
        msg = t('login.noAccountFound');
      } else if (msg.includes('too-many-requests')) {
        msg = t('login.tooManyAttempts');
      } else if (msg.includes('not associated with any company')) {
        msg = t('login.notAssociatedWithCompany');
      }
      Alert.alert(t('login.loginFailedTitle'), msg);
    } finally {
      setIsLoading(false);
    }
  };

  const loginForm = (
    <Animated.View
      style={[
        styles.formContainer,
        isLargeScreen && styles.formContainerLarge,
        { opacity: formFade, transform: [{ translateY: formSlide }] },
      ]}
    >
      {/* Email */}
      <Pressable
        style={styles.inputContainer}
        onPress={() => emailInputRef.current?.focus()}
      >
        <MaterialIcons name="email" size={20} color="#A8A8A0" style={styles.inputIcon} />
        <TextInput
          ref={emailInputRef}
          style={styles.input}
          placeholder={t('login.emailPlaceholder')}
          placeholderTextColor="#B0B0A8"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          editable={!anyLoading}
          returnKeyType="next"
          onSubmitEditing={() => passwordInputRef.current?.focus()}
        />
      </Pressable>

      {/* Password */}
      <Pressable
        style={styles.inputContainer}
        onPress={() => passwordInputRef.current?.focus()}
      >
        <MaterialIcons name="lock" size={20} color="#A8A8A0" style={styles.inputIcon} />
        <TextInput
          ref={passwordInputRef}
          style={[styles.input, { flex: 1 }]}
          placeholder={t('login.passwordPlaceholder')}
          placeholderTextColor="#B0B0A8"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={isObscured}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          editable={!anyLoading}
          returnKeyType="go"
          onSubmitEditing={handleEmailSignIn}
        />
        <TouchableOpacity onPress={() => setIsObscured(!isObscured)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons
            name={isObscured ? 'visibility' : 'visibility-off'}
            size={20}
            color="#A8A8A0"
          />
        </TouchableOpacity>
      </Pressable>

      {/* Sign In Button */}
      <TouchableOpacity
        style={[styles.loginButton, anyLoading && styles.loginButtonDisabled]}
        onPress={handleEmailSignIn}
        disabled={anyLoading}
        activeOpacity={0.85}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.loginButtonText}>{t('login.signInButton')}</Text>
        )}
      </TouchableOpacity>

      {/* Divider */}
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{t('login.dividerOr')}</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* Google */}
      <TouchableOpacity
        style={[styles.googleButton, anyLoading && styles.loginButtonDisabled]}
        onPress={handleGoogleSignIn}
        disabled={anyLoading}
        activeOpacity={0.85}
      >
        {isGoogleLoading ? (
          <ActivityIndicator color="#212121" />
        ) : (
          <View style={styles.googleButtonContent}>
            <GoogleLogo />
            <Text style={styles.googleButtonText}>{t('login.continueWithGoogle')}</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );

  // ---- Large screen (tablet) layout ----
  if (isLargeScreen) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.largeScreenContainer}>
          <View style={styles.formSection}>
            <View style={styles.logoArea}>
              <Image source={require('../../assets/whagons-check.png')} style={styles.logoMark} />
              <Text style={styles.brandName}>{t('login.brandName')}</Text>
              <Text style={styles.tagline}>{t('login.tagline')}</Text>
            </View>
            {loginForm}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ---- Phone layout ----
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent={true} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[
            styles.phoneScrollContent,
            keyboardVisible && styles.phoneScrollContentKeyboardVisible,
          ]}
          bounces={false}
          overScrollMode="never"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {keyboardVisible ? (
            <View style={styles.keyboardHeader}>
              <Image source={require('../../assets/whagons-check.png')} style={styles.logoMarkSmall} />
              <Text style={styles.brandNameSmall}>{t('login.brandName')}</Text>
            </View>
          ) : (
            <Animated.View style={[styles.logoSection, { opacity: logoFade }]}>
              <Image source={require('../../assets/whagons-check.png')} style={styles.logoMark} />
              <Text style={styles.brandName}>{t('login.brandName')}</Text>
              <Text style={styles.tagline}>{t('login.tagline')}</Text>
            </Animated.View>
          )}

          {loginForm}

          {!keyboardVisible && (
            <View style={styles.footer}>
              <Text style={styles.footerText}>{t('login.tagline')}</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  phoneScrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingBottom: 24,
  },
  phoneScrollContentKeyboardVisible: {
    justifyContent: 'flex-start',
  },

  // ---- Logo section (phone) ----
  logoSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 20,
  },
  logoMark: {
    width: 56,
    height: 56,
    resizeMode: 'contain',
  },
  brandName: {
    marginTop: 14,
    fontSize: 30,
    fontFamily: fontFamilies.displaySemibold,
    color: '#1E2321',
    letterSpacing: -0.5,
  },
  tagline: {
    marginTop: 6,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    color: '#8B8E84',
  },

  // Keyboard-visible compact header
  keyboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    paddingBottom: 8,
  },
  logoMarkSmall: {
    width: 28,
    height: 28,
    resizeMode: 'contain',
  },
  brandNameSmall: {
    marginLeft: 10,
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
    color: '#1E2321',
    letterSpacing: -0.3,
  },

  // Logo area (large screen)
  logoArea: {
    alignItems: 'center',
    marginBottom: 40,
  },

  // ---- Form ----
  formContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 8,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  formContainerLarge: {
    padding: spacing.xl,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: radius.md,
    paddingHorizontal: 14,
    marginBottom: 12,
    height: 52,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: fontSizes.md,
    color: '#1E2321',
    fontFamily: fontFamilies.bodyMedium,
  },
  loginButton: {
    backgroundColor: '#1E2321',
    height: 52,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  dividerText: {
    marginHorizontal: 14,
    fontSize: fontSizes.xs,
    color: '#B0ADA6',
    fontFamily: fontFamilies.bodyMedium,
  },
  googleButton: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  googleButtonText: {
    marginLeft: 10,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyMedium,
    color: '#1E2321',
  },

  // ---- Footer ----
  footer: {
    paddingBottom: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyRegular,
    color: '#B0ADA6',
    letterSpacing: 0.3,
  },

  // ---- Large screen ----
  largeScreenContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formSection: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
  },
});
