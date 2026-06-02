import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CommonActions, RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useNetwork } from '../context/NetworkContext';
import { fontFamilies, radius } from '../config/designTokens';
import { RootStackParamList } from '../models/types';

type NfcTapRoute = RouteProp<RootStackParamList, 'NfcTap'>;
type FeedbackState = 'idle' | 'running' | 'success' | 'error';

function makeClientTapId() {
  return `mobile-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const NfcTapScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<NfcTapRoute>();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { token, isLoading: authLoading, subdomain, selectTenant } = useAuth();
  const { isOnline } = useNetwork();
  const executeTap = useMutation(api.nfc.executeTap);
  const [feedback, setFeedback] = useState<FeedbackState>('idle');
  const [message, setMessage] = useState('Preparing NFC action...');
  const [detail, setDetail] = useState<string | null>(null);
  const startedRef = useRef(false);
  const { uuid, tenantId: tenantFromLink } = route.params;

  const targetTenantId = tenantFromLink || subdomain;
  const secondaryText = isDarkMode ? 'rgba(255,255,255,0.66)' : '#667085';
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)';
  const surfaceColor = isDarkMode ? 'rgba(255,255,255,0.06)' : '#FFFFFF';
  const accentColor = feedback === 'error' ? '#DC2626' : feedback === 'success' ? '#16A34A' : primaryColor;

  const deviceData = useMemo(
    () => ({
      source: 'mobile_deep_link',
      platform: Platform.OS,
      tenantFromLink,
    }),
    [tenantFromLink],
  );

  const openMain = useCallback(() => {
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Main' }] }));
  }, [navigation]);

  const runTap = useCallback(async () => {
    if (!uuid) {
      setFeedback('error');
      setMessage('This NFC link is missing its tag id.');
      return;
    }

    if (!isOnline) {
      setFeedback('error');
      setMessage('NFC actions need a connection.');
      setDetail('Try again when Whagons is back online.');
      Vibration.vibrate([0, 80, 60, 80]);
      return;
    }

    if (!token) {
      setFeedback('error');
      setMessage('Sign in to run this NFC action.');
      setDetail('Whagons needs to verify your tenant and permissions first.');
      return;
    }

    if (!targetTenantId) {
      setFeedback('error');
      setMessage('Select a tenant before running this NFC action.');
      return;
    }

    setFeedback('running');
    setMessage('Running NFC action...');
    setDetail(null);

    try {
      if (tenantFromLink && subdomain !== tenantFromLink) {
        await selectTenant(tenantFromLink);
      }

      const result = await executeTap({
        tenantId: targetTenantId,
        uuid,
        clientTapId: makeClientTapId(),
        deviceData,
      });

      if (!result?.ok) {
        setFeedback('error');
        setMessage(result?.message || 'Unable to run NFC action.');
        setDetail('The tag may be disabled, blocked by workflow rules, or unavailable to your role.');
        Vibration.vibrate([0, 80, 60, 80]);
        return;
      }

      setFeedback('success');
      setMessage(result.message || 'NFC action completed.');
      setDetail(result.action === 'finished' ? 'Task session finished.' : result.action === 'started' ? 'Task session started.' : null);
      Vibration.vibrate(60);

      if (result.externalUrl) {
        setTimeout(() => {
          Linking.openURL(result.externalUrl).catch(() => undefined);
        }, 450);
      }
    } catch (error: any) {
      setFeedback('error');
      setMessage(error?.message || 'Unable to run NFC action.');
      setDetail('Whagons could not complete this tap.');
      Vibration.vibrate([0, 80, 60, 80]);
    }
  }, [deviceData, executeTap, isOnline, selectTenant, subdomain, targetTenantId, tenantFromLink, token, uuid]);

  useEffect(() => {
    if (authLoading || startedRef.current) return;
    startedRef.current = true;
    void runTap();
  }, [authLoading, runTap]);

  const showSpinner = feedback === 'idle' || feedback === 'running';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: surfaceColor, borderColor }]}>
          <View style={[styles.statusIcon, { backgroundColor: `${accentColor}1A` }]}>
            {showSpinner ? (
              <ActivityIndicator color={accentColor} />
            ) : (
              <Text style={[styles.statusGlyph, { color: accentColor }]}>
                {feedback === 'success' ? '✓' : '!'}
              </Text>
            )}
          </View>

          <Text style={[styles.title, { color: colors.text }]}>{message}</Text>
          {detail ? <Text style={[styles.subtitle, { color: secondaryText }]}>{detail}</Text> : null}

          {feedback === 'error' && !token ? (
            <TouchableOpacity
              style={[styles.button, { backgroundColor: primaryColor }]}
              onPress={() => navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] }))}
            >
              <Text style={styles.buttonText}>Sign in</Text>
            </TouchableOpacity>
          ) : null}

          {feedback === 'error' && token ? (
            <TouchableOpacity style={[styles.button, { backgroundColor: primaryColor }]} onPress={() => void runTap()}>
              <Text style={styles.buttonText}>Try again</Text>
            </TouchableOpacity>
          ) : null}

          {feedback === 'success' ? (
            <TouchableOpacity style={[styles.button, { backgroundColor: primaryColor }]} onPress={openMain}>
              <Text style={styles.buttonText}>Open Whagons</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    alignItems: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 16,
    padding: 24,
  },
  statusIcon: {
    alignItems: 'center',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  statusGlyph: {
    fontFamily: fontFamilies.displaySemibold,
    fontSize: 28,
    lineHeight: 34,
  },
  title: {
    fontFamily: fontFamilies.displaySemibold,
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  button: {
    alignItems: 'center',
    borderRadius: radius.md,
    minWidth: 160,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontFamily: fontFamilies.bodySemibold,
    fontSize: 15,
  },
});
