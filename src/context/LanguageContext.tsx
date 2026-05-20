import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTenant } from '../hooks/useTenant';
import i18n from '../locales/i18n';
import { useOfflineMutation } from '../hooks/useOfflineMutation';
import { useAuth } from './AuthContext';

const STORAGE_KEY = '@whagons/language';
const TIME_FORMAT_STORAGE_KEY = '@whagons/time_format';

export type SupportedLanguage = 'en' | 'es';
export type TimeFormatPreference = '12h' | '24h';

interface LanguageContextType {
  language: SupportedLanguage;
  timeFormat: TimeFormatPreference;
  setLanguage: (lang: SupportedLanguage) => void;
  setTimeFormat: (format: TimeFormatPreference) => void;
  t: (scope: string, options?: Record<string, any>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(i18n.locale as SupportedLanguage);
  const [timeFormat, setTimeFormatState] = useState<TimeFormatPreference>('12h');
  const { tenantId } = useTenant();
  const { token } = useAuth();
  const convexUser = useQuery(api.users.me, tenantId && token ? { tenantId } : 'skip');
  const updateMe = useOfflineMutation(api.users.updateMe, 'users.updateMe');

  const normalizeLanguage = useCallback((value?: string | null): SupportedLanguage => {
    return value === 'es' ? 'es' : 'en';
  }, []);

  const queuedServerLanguageRef = React.useRef<SupportedLanguage | null>(null);
  const awaitingServerLanguageRef = React.useRef<SupportedLanguage | null>(null);

  const persistLanguagePreference = useCallback(async (nextLanguage: SupportedLanguage) => {
    if (!tenantId || !convexUser) return;
    try {
      await updateMe({
        tenantId,
        settings: { preferred_language: nextLanguage },
      });
    } catch {
      awaitingServerLanguageRef.current = null;
    }
  }, [convexUser, tenantId, updateMe]);

  useEffect(() => {
    AsyncStorage.multiGet([STORAGE_KEY, TIME_FORMAT_STORAGE_KEY]).then((entries) => {
      const storedLanguage = entries[0][1];
      const storedTimeFormat = entries[1][1];
      if (storedLanguage === 'en' || storedLanguage === 'es') {
        i18n.locale = storedLanguage;
        setLanguageState(storedLanguage);
      }
      if (storedTimeFormat === '12h' || storedTimeFormat === '24h') {
        setTimeFormatState(storedTimeFormat);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!tenantId || convexUser === undefined) return;

    const queuedLanguage = queuedServerLanguageRef.current;
    if (queuedLanguage && convexUser) {
      queuedServerLanguageRef.current = null;
      awaitingServerLanguageRef.current = queuedLanguage;
      void persistLanguagePreference(queuedLanguage);
      return;
    }

    const awaitingLanguage = awaitingServerLanguageRef.current;

    const rawServerPreferred = (convexUser as any)?.settings?.preferred_language;
    if (rawServerPreferred === undefined || rawServerPreferred === null || rawServerPreferred === '') {
      if (awaitingLanguage) {
        return;
      }

      awaitingServerLanguageRef.current = language;
      void persistLanguagePreference(language);
      return;
    }

    const serverPreferred = normalizeLanguage(rawServerPreferred ?? null);

    if (awaitingLanguage) {
      if (serverPreferred === awaitingLanguage) {
        awaitingServerLanguageRef.current = null;
      } else {
        return;
      }
    }

    if (convexUser && serverPreferred !== language) {
      i18n.locale = serverPreferred;
      setLanguageState(serverPreferred);
    }
  }, [convexUser, language, normalizeLanguage, persistLanguagePreference, tenantId]);

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    const normalizedLanguage = normalizeLanguage(lang);
    i18n.locale = normalizedLanguage;
    setLanguageState(normalizedLanguage);
    AsyncStorage.setItem(STORAGE_KEY, normalizedLanguage).catch(() => {});

    if (!tenantId || convexUser === undefined) {
      queuedServerLanguageRef.current = normalizedLanguage;
      return;
    }

    if (!convexUser) return;

    awaitingServerLanguageRef.current = normalizedLanguage;
    void persistLanguagePreference(normalizedLanguage);
  }, [convexUser, normalizeLanguage, persistLanguagePreference, tenantId]);

  const setTimeFormat = useCallback((format: TimeFormatPreference) => {
    const normalizedFormat = format === '24h' ? '24h' : '12h';
    setTimeFormatState(normalizedFormat);
    AsyncStorage.setItem(TIME_FORMAT_STORAGE_KEY, normalizedFormat).catch(() => {});
  }, []);

  const t = useCallback((scope: string, options?: Record<string, any>) => {
    return i18n.t(scope, options);
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, timeFormat, setLanguage, setTimeFormat, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
};
