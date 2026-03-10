import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../models/types';
import { useAuth } from '../context/AuthContext';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'TenantSelect'>;
type RoutePropType = RouteProp<RootStackParamList, 'TenantSelect'>;

export const TenantSelectScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { selectTenant } = useAuth();

  const { tenants, firebaseIdToken } = route.params;
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (tenant: string) => {
    setSelecting(tenant);
    setError(null);
    try {
      await selectTenant(tenant, firebaseIdToken);
      navigation.dispatch(
        CommonActions.reset({ index: 0, routes: [{ name: 'Main' }] }),
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to connect to workspace');
      setSelecting(null);
    }
  };

  const formatTenantName = (tenant: string): string => {
    // Remove domain suffix if present (e.g. "acme.whagons.com" -> "acme")
    const name = tenant.includes('.') ? tenant.split('.')[0] : tenant;
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  const getInitials = (tenant: string): string => {
    const name = tenant.includes('.') ? tenant.split('.')[0] : tenant;
    return name.substring(0, 2).toUpperCase();
  };

  // Color palette for tenant cards
  const TENANT_COLORS = ['#1E2321', '#2D6A4F', '#6C584C', '#3A5A8C', '#7B4B94', '#C56C39'];

  const renderTenant = ({ item, index }: { item: string; index: number }) => {
    const isSelecting = selecting === item;
    const bgColor = TENANT_COLORS[index % TENANT_COLORS.length];

    return (
      <TouchableOpacity
        style={[styles.tenantCard, isSelecting && styles.tenantCardActive]}
        onPress={() => handleSelect(item)}
        disabled={selecting !== null}
        activeOpacity={0.85}
      >
        <View style={[styles.tenantAvatar, { backgroundColor: bgColor }]}>
          {isSelecting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.tenantInitials}>{getInitials(item)}</Text>
          )}
        </View>
        <View style={styles.tenantInfo}>
          <Text style={styles.tenantName}>{formatTenantName(item)}</Text>
          <Text style={styles.tenantDomain}>{item}</Text>
        </View>
        <MaterialIcons
          name="chevron-right"
          size={22}
          color={isSelecting ? '#1E2321' : '#B0ADA6'}
        />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Image
          source={require('../../assets/whagons-check.png')}
          style={styles.logo}
        />
        <Text style={styles.title}>Choose Workspace</Text>
        <Text style={styles.subtitle}>
          You belong to {tenants.length} workspace{tenants.length > 1 ? 's' : ''}.{'\n'}
          Select one to continue.
        </Text>
      </View>

      {/* Error banner */}
      {error && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="error-outline" size={18} color="#B71C1C" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Tenant list */}
      <FlatList
        data={tenants}
        keyExtractor={(item) => item}
        renderItem={renderTenant}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() =>
            navigation.dispatch(
              CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] }),
            )
          }
        >
          <MaterialIcons name="arrow-back" size={18} color="#8B8E84" />
          <Text style={styles.backText}>Back to sign in</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F1EA',
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  logo: {
    width: 48,
    height: 48,
    resizeMode: 'contain',
    marginBottom: 16,
  },
  title: {
    fontSize: fontSizes.xl,
    fontFamily: fontFamilies.displaySemibold,
    color: '#1E2321',
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 8,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    color: '#8B8E84',
    textAlign: 'center',
    lineHeight: 20,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    marginHorizontal: spacing.lg,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  errorText: {
    marginLeft: 8,
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    color: '#B71C1C',
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: 8,
    paddingBottom: 24,
  },
  tenantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6E1D7',
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 12,
    ...shadows.subtle,
  },
  tenantCardActive: {
    borderColor: '#1E2321',
    borderWidth: 1.5,
  },
  tenantAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tenantInitials: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyBold,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  tenantInfo: {
    flex: 1,
    marginLeft: 14,
  },
  tenantName: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
    color: '#1E2321',
  },
  tenantDomain: {
    marginTop: 2,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyRegular,
    color: '#8B8E84',
  },
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  backText: {
    marginLeft: 6,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    color: '#8B8E84',
  },
});
