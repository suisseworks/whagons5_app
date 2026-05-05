import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { RootStackParamList } from '../models/types';
import { useAuth } from '../context/AuthContext';
import { fontFamilies, fontSizes, radius, spacing } from '../config/designTokens';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'NoTenants'>;

export const NoTenantsScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const { logout } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await logout();
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] }));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.card}>
        <Image source={require('../../assets/whagons-check.png')} style={styles.logo} />
        <View style={styles.iconCircle}>
          <MaterialIcons name="domain-disabled" size={34} color="#C77B43" />
        </View>
        <Text style={styles.title}>No workspaces found</Text>
        <Text style={styles.body}>
          Your sign-in is valid, but this account is not currently attached to any Whagons workspace. Ask an admin to invite you again, then reopen the app.
        </Text>
        <TouchableOpacity
          style={[styles.primaryButton, isSigningOut && styles.disabledButton]}
          onPress={handleSignOut}
          disabled={isSigningOut}
          activeOpacity={0.85}
        >
          {isSigningOut ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <MaterialIcons name="logout" size={18} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Sign out</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: '#EEE8E0',
  },
  logo: {
    width: 48,
    height: 48,
    resizeMode: 'contain',
    marginBottom: spacing.lg,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFF4EA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSizes.xl,
    fontFamily: fontFamilies.displaySemibold,
    color: '#1E2321',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyRegular,
    color: '#6B6F66',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    backgroundColor: '#C77B43',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  disabledButton: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
});
