/**
 * notificationTones.ts – Notification tone definitions for the mobile app.
 *
 * On Android, notification sounds are tied to notification channels. We create
 * one channel per predefined tone at startup. When a push notification arrives
 * with a `notification_tone` data field, we route it to the matching channel.
 *
 * On iOS, custom sounds require bundled audio files. We bundle the predefined
 * tone wav files with the native app and map `notification_tone` to the
 * matching filename for both remote and local notifications.
 */

// ---------------------------------------------------------------------------
// Tone definitions (shared with web client)
// ---------------------------------------------------------------------------

export interface ToneDefinition {
  id: string;
  name: string;
  description: string;
}

export const NOTIFICATION_TONES: ToneDefinition[] = [
  { id: 'default', name: 'Default',      description: 'System default notification sound' },
  { id: 'chime',   name: 'Chime',        description: 'Two-note ascending chime' },
  { id: 'bell',    name: 'Bell',         description: 'Single bell strike with decay' },
  { id: 'ping',    name: 'Ping',         description: 'Short high-pitched ping' },
  { id: 'alert',   name: 'Alert',        description: 'Urgent two-tone alert' },
  { id: 'soft',    name: 'Soft',         description: 'Gentle low-frequency hum' },
  { id: 'triple',  name: 'Triple Beep',  description: 'Three quick ascending beeps' },
  { id: 'none',    name: 'Silent',       description: 'No sound' },
];

const KNOWN_TONE_IDS = new Set(NOTIFICATION_TONES.map(t => t.id));

// ---------------------------------------------------------------------------
// Channel ID mapping
// ---------------------------------------------------------------------------

/** Prefix for all tone-specific Android notification channels. */
const TONE_CHANNEL_PREFIX = 'whagons_tone_';

/**
 * Get the Android notification channel ID for a given tone.
 * Falls back to the default channel if the tone is unknown.
 */
export function getChannelIdForTone(toneId?: string | null): string {
  if (!toneId || toneId === '') {
    return 'whagons_default';
  }

  if (toneId === 'none') {
    return `${TONE_CHANNEL_PREFIX}none`;
  }

  // Check if it's a known tone
  const known = NOTIFICATION_TONES.find(t => t.id === toneId);
  if (known) {
    return `${TONE_CHANNEL_PREFIX}${toneId}`;
  }

  // Unknown tone → default channel
  return 'whagons_default';
}

/**
 * Get the iOS notification sound filename for a given tone.
 * - `default`/unknown -> system default
 * - `none` -> silent
 * - known tones -> bundled wav filename
 */
export function getIosSoundForTone(toneId?: string | null): string | undefined {
  if (!toneId || toneId === '' || toneId === 'default') {
    return 'default';
  }

  if (toneId === 'none') {
    return undefined;
  }

  if (!KNOWN_TONE_IDS.has(toneId)) {
    return 'default';
  }

  return `tone_${toneId}.wav`;
}

/**
 * List of all tone channel IDs that need to be created at startup.
 * Excludes 'default' since that uses the existing whagons_default channel.
 */
export function getAllToneChannelConfigs(): Array<{
  id: string;
  name: string;
  sound: string;
  silent: boolean;
}> {
  return NOTIFICATION_TONES
    .filter(t => t.id !== 'default')
    .map(t => ({
      id: `${TONE_CHANNEL_PREFIX}${t.id}`,
      name: `Tone: ${t.name}`,
      // Android looks for res/raw/tone_<id>.wav (no extension in the ref).
      // If the file doesn't exist yet, Android falls back to system default.
      // Run app/scripts/generate-notification-sounds.sh to create them.
      sound: t.id === 'none' ? '' : `tone_${t.id}`,
      silent: t.id === 'none',
    }));
}
