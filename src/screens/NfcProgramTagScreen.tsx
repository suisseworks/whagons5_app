import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CommonActions, RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useMutation } from 'convex/react';
import * as Crypto from 'expo-crypto';
import { api } from '../../../convex/_generated/api';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useNetwork } from '../context/NetworkContext';
import { fontFamilies, radius } from '../config/designTokens';
import { RootStackParamList } from '../models/types';
import { writeNfcUrl } from '../services/nfcService';

type NfcProgramTagRoute = RouteProp<RootStackParamList, 'NfcProgramTag'>;
type FeedbackState = 'idle' | 'running' | 'success' | 'error';

async function hashTagUid(tagUid?: string | null) {
  if (!tagUid) return undefined;
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, tagUid);
}

export const NfcProgramTagScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<NfcProgramTagRoute>();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { token, subdomain, selectTenant } = useAuth();
  const { isOnline } = useNetwork();
  const markProgrammed = useMutation(api.nfc.markProgrammed);
  const [feedback, setFeedback] = useState<FeedbackState>('idle');
  const [message, setMessage] = useState('Ready to program NFC tag.');
  const [detail, setDetail] = useState<string | null>('Hold the physical tag near this phone when prompted.');
  const { tagId, url, tenantId: tenantFromLink } = route.params;
  const targetTenantId = tenantFromLink || subdomain;

  const secondaryText = isDarkMode ? 'rgba(255,255,255,0.66)' : '#667085';
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)';
  const surfaceColor = isDarkMode ? 'rgba(255,255,255,0.06)' : '#FFFFFF';
  const accentColor = feedback === 'error' ? '#DC2626' : feedback === 'success' ? '#16A34A' : primaryColor;

  const decodedUrl = useMemo(() => {
    try {
      return decodeURIComponent(url);
    } catch {
      return url;
    }
  }, [url]);

  const openMain = useCallback(() => {
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Main' }] }));
  }, [navigation]);

  const programTag = useCallback(async () => {
    if (!tagId || !decodedUrl) {
      setFeedback('error');
      setMessage('This programming link is missing tag details.');
      setDetail(null);
      return;
    }

    if (!isOnline) {
      setFeedback('error');
      setMessage('Programming needs a connection.');
      setDetail('Try again when Whagons is back online.');
      Vibration.vibrate([0, 80, 60, 80]);
      return;
    }

    if (!token) {
      setFeedback('error');
      setMessage('Sign in to program NFC tags.');
      setDetail('Whagons needs to verify your tenant and NFC management permission first.');
      return;
    }

    if (!targetTenantId) {
      setFeedback('error');
      setMessage('Select a tenant before programming this tag.');
      setDetail(null);
      return;
    }

    setFeedback('running');
    setMessage('Waiting for NFC tag...');
    setDetail('Keep the tag still until Whagons confirms it was written.');

    try {
      if (tenantFromLink && subdomain !== tenantFromLink) {
        await selectTenant(tenantFromLink);
      }

      const result = await writeNfcUrl(decodedUrl);
      await markProgrammed({
        tenantId: targetTenantId,
        id: tagId as any,
        tagUidHash: await hashTagUid(result.tagUid),
      });

      setFeedback('success');
      setMessage('NFC tag programmed.');
      setDetail(decodedUrl);
      Vibration.vibrate(80);
    } catch (error: any) {
      setFeedback('error');
      setMessage(error?.message || 'Unable to program NFC tag.');
      setDetail('Make sure NFC is enabled and the tag supports NDEF writes.');
      Vibration.vibrate([0, 80, 60, 80]);
    }
  }, [decodedUrl, isOnline, markProgrammed, selectTenant, subdomain, tagId, targetTenantId, tenantFromLink, token]);

  const showSpinner = feedback === 'running';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: surfaceColor, borderColor }]}>
          <View style={[styles.statusIcon, { backgroundColor: `${accentColor}1A` }]}>
            {showSpinner ? (
              <ActivityIndicator color={accentColor} />
            ) : (
              <Text style={[styles.statusGlyph, { color: accentColor }]}>
                {feedback === 'success' ? '✓' : feedback === 'error' ? '!' : 'N'}
              </Text>
            )}
          </View>

          <Text style={[styles.title, { color: colors.text }]}>{message}</Text>
          {detail ? <Text style={[styles.subtitle, { color: secondaryText }]}>{detail}</Text> : null}

          {feedback !== 'success' ? (
            <TouchableOpacity
              disabled={feedback === 'running'}
              style={[styles.button, { backgroundColor: primaryColor, opacity: feedback === 'running' ? 0.7 : 1 }]}
              onPress={() => void programTag()}
            >
              <Text style={styles.buttonText}>{feedback === 'running' ? 'Programming...' : 'Program tag'}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.button, { backgroundColor: primaryColor }]} onPress={openMain}>
              <Text style={styles.buttonText}>Open Whagons</Text>
            </TouchableOpacity>
          )}
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
    fontSize: 24,
    lineHeight: 30,
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
