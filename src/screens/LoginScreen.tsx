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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../models/types';

type LoginScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Login'>;

export const LoginScreen: React.FC = () => {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const { width, height } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isObscured, setIsObscured] = useState(true);

  const isLargeScreen = width > 800;

  const handleSubmit = () => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      })
    );
  };

  const LoginForm = () => (
    <View style={[styles.formContainer, isLargeScreen && styles.formContainerLarge]}>
      <Text style={styles.welcomeText}>Welcome back</Text>
      <Text style={styles.subtitleText}>Sign in to continue to Whagons</Text>

      <View style={styles.inputContainer}>
        <MaterialIcons name="email" size={24} color="#757575" style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#9E9E9E"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      <View style={styles.inputContainer}>
        <MaterialIcons name="lock" size={24} color="#757575" style={styles.inputIcon} />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Password"
          placeholderTextColor="#9E9E9E"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={isObscured}
        />
        <TouchableOpacity onPress={() => setIsObscured(!isObscured)}>
          <MaterialIcons
            name={isObscured ? 'visibility' : 'visibility-off'}
            size={24}
            color="#757575"
          />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.loginButton} onPress={handleSubmit}>
        <Text style={styles.loginButtonText}>Log in</Text>
      </TouchableOpacity>
    </View>
  );

  const AppPreview = () => (
    <View style={[styles.previewContainer, isLargeScreen && styles.previewContainerLarge]}>
      <View style={styles.previewPlaceholder}>
        <MaterialIcons name="phone-android" size={60} color="#BDBDBD" />
        <Text style={styles.previewText}>App Preview</Text>
      </View>
    </View>
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
          <View style={[styles.previewContainer, { height: height * 0.4 }]}>
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
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#F6F2E8',
  },
  formSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewContainer: {
    backgroundColor: '#F6F2E8',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  previewContainerLarge: {
    flex: 1,
    height: '100%',
  },
  previewPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  previewText: {
    marginTop: 12,
    fontSize: 16,
    color: '#757575',
  },
  formContainer: {
    padding: 24,
    width: '100%',
    maxWidth: 420,
  },
  formContainerLarge: {
    padding: 32,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: '600',
    color: '#212121',
    textAlign: 'center',
  },
  subtitleText: {
    marginTop: 8,
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 32,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#212121',
  },
  loginButton: {
    backgroundColor: '#14B7A3',
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
