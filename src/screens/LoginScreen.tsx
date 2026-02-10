import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../models/types';
import { useAuth } from '../context/AuthContext';
import Svg, { Path, Rect, G, Defs, ClipPath } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';

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
  const { width, height } = useWindowDimensions();
  const { signInWithGoogle, signInWithEmail } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isObscured, setIsObscured] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const isLargeScreen = width > 800;
  const anyLoading = isLoading || isGoogleLoading;

  const navigateToMain = () => {
    navigation.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: 'Main' }] }),
    );
  };

  // ---- Google Sign-In ------------------------------------------------
  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      await signInWithGoogle();
      navigateToMain();
    } catch (err: any) {
      const msg = err?.message || 'Google sign-in failed. Please try again.';
      if (msg.includes('CANCELED') || msg.includes('cancelled')) {
        // User cancelled – don't show an error
      } else {
        Alert.alert('Sign-In Failed', msg);
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // ---- Email / Password Sign-In --------------------------------------
  const handleEmailSignIn = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }
    if (!password) {
      Alert.alert('Error', 'Please enter your password');
      return;
    }

    setIsLoading(true);
    try {
      await signInWithEmail({ email: email.trim(), password });
      navigateToMain();
    } catch (err: any) {
      let msg = err?.message || 'Unable to log in. Please try again.';
      // Friendlier Firebase error messages
      if (msg.includes('wrong-password') || msg.includes('invalid-credential')) {
        msg = 'Incorrect email or password.';
      } else if (msg.includes('user-not-found')) {
        msg = 'No account found with this email.';
      } else if (msg.includes('too-many-requests')) {
        msg = 'Too many attempts. Please try again later.';
      } else if (msg.includes('not associated with any company')) {
        msg = 'Your account is not associated with any company. Please contact your administrator.';
      }
      Alert.alert('Login Failed', msg);
    } finally {
      setIsLoading(false);
    }
  };

  // ---- Form -----------------------------------------------------------
  const LoginForm = () => (
    <View style={[styles.formContainer, isLargeScreen && styles.formContainerLarge]}>
      <Text style={styles.welcomeText}>Welcome back</Text>
      <Text style={styles.subtitleText}>Sign in to continue to Whagons</Text>

      {/* Email */}
      <View style={styles.inputContainer}>
        <MaterialIcons name="email" size={22} color="#8B8E84" style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#9E9E9E"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!anyLoading}
        />
      </View>

      {/* Password */}
      <View style={styles.inputContainer}>
        <MaterialIcons name="lock" size={22} color="#8B8E84" style={styles.inputIcon} />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Password"
          placeholderTextColor="#9E9E9E"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={isObscured}
          editable={!anyLoading}
          returnKeyType="go"
          onSubmitEditing={handleEmailSignIn}
        />
        <TouchableOpacity onPress={() => setIsObscured(!isObscured)}>
          <MaterialIcons
            name={isObscured ? 'visibility' : 'visibility-off'}
            size={22}
            color="#8B8E84"
          />
        </TouchableOpacity>
      </View>

      {/* Email Sign-In Button */}
      <TouchableOpacity
        style={[styles.loginButton, anyLoading && styles.loginButtonDisabled]}
        onPress={handleEmailSignIn}
        disabled={anyLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.loginButtonText}>Sign In</Text>
        )}
      </TouchableOpacity>

      {/* Divider */}
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>Or continue with</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* Google Sign-In Button */}
      <TouchableOpacity
        style={[styles.googleButton, anyLoading && styles.loginButtonDisabled]}
        onPress={handleGoogleSignIn}
        disabled={anyLoading}
      >
        {isGoogleLoading ? (
          <ActivityIndicator color="#212121" />
        ) : (
          <View style={styles.googleButtonContent}>
            <GoogleLogo />
            <Text style={styles.googleButtonText}>Sign in with Google</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );

  const AppPreview = () => (
    <LinearGradient
      colors={['#161B19', '#233029', '#2F6F6D']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.previewContainer, isLargeScreen && styles.previewContainerLarge]}
    >
      <View style={styles.previewBadge}>
        <Image source={require('../../assets/whagons-check.png')} style={styles.previewLogo} />
      </View>
      <Text style={styles.previewTitle}>Work flows. Clean lines.</Text>
      <Text style={styles.previewText}>Track tasks, crews, and approvals in one place.</Text>
      <View style={styles.previewCard}>
        <View style={styles.previewRow}>
          <View style={styles.previewDot} />
          <Text style={styles.previewRowText}>HVAC filters · Building A</Text>
        </View>
        <View style={styles.previewRow}>
          <View style={[styles.previewDot, { backgroundColor: '#D28A54' }]} />
          <Text style={styles.previewRowText}>Emergency lights · Basement</Text>
        </View>
      </View>
    </LinearGradient>
  );

  if (isLargeScreen) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.largeScreenContainer}>
          <View style={styles.previewSection}>
            <AppPreview />
          </View>
          <View style={styles.formSection}>
            <LoginForm />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={[styles.previewContainer, { height: height * 0.42 }]}>
            <AppPreview />
          </View>
          <LoginForm />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F1EA',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  largeScreenContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  previewSection: {
    flex: 1,
    backgroundColor: '#F4F1EA',
  },
  formSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewContainer: {
    backgroundColor: '#F4F1EA',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  previewContainerLarge: {
    flex: 1,
    height: '100%',
  },
  previewBadge: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  previewLogo: {
    width: 36,
    height: 36,
    resizeMode: 'contain',
  },
  previewTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
    color: '#F4F1EA',
    textAlign: 'center',
  },
  previewText: {
    marginTop: 8,
    fontSize: fontSizes.sm,
    color: 'rgba(244, 241, 234, 0.8)',
    textAlign: 'center',
    fontFamily: fontFamilies.bodyRegular,
  },
  previewCard: {
    marginTop: 18,
    width: '100%',
    backgroundColor: 'rgba(15, 23, 20, 0.45)',
    borderRadius: radius.md,
    padding: 14,
    ...shadows.subtle,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  previewDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C7D6CF',
    marginRight: 10,
  },
  previewRowText: {
    fontSize: fontSizes.sm,
    color: 'rgba(244, 241, 234, 0.9)',
    fontFamily: fontFamilies.bodyMedium,
  },
  formContainer: {
    padding: spacing.lg,
    width: '100%',
    maxWidth: 420,
  },
  formContainerLarge: {
    padding: spacing.xl,
  },
  welcomeText: {
    fontSize: fontSizes.display,
    fontFamily: fontFamilies.displaySemibold,
    color: '#1E2321',
    textAlign: 'center',
  },
  subtitleText: {
    marginTop: 8,
    fontSize: fontSizes.md,
    color: '#6C746F',
    textAlign: 'center',
    marginBottom: 32,
    fontFamily: fontFamilies.bodyRegular,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6E1D7',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    marginBottom: 16,
    height: 56,
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
    backgroundColor: '#C77B43',
    height: 52,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    ...shadows.subtle,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E6E1D7',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: fontSizes.xs,
    color: '#8B8E84',
    textTransform: 'uppercase',
    fontFamily: fontFamilies.bodySemibold,
    letterSpacing: 0.8,
  },
  googleButton: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E6E1D7',
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
});
