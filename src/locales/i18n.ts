import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';
import en from './en.json';
import es from './es.json';

const i18n = new I18n({ en, es });

i18n.defaultLocale = 'en';
i18n.enableFallback = true;

// Detect device locale, default to 'en' if unsupported
const deviceLocale = Localization.getLocales()?.[0]?.languageCode ?? 'en';
i18n.locale = deviceLocale === 'es' ? 'es' : 'en';

export default i18n;
