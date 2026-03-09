/**
 * notificationTones.ts – Notification tone definitions for the mobile app.
 *
 * On Android, notification sounds are tied to notification channels. We create
 * one channel per predefined tone at startup. When a push notification arrives
 * with a `notification_tone` data field, we route it to the matching channel.
 *
 * On iOS, custom sounds require bundled audio files. For now the 'default'
 * system sound is used; per-tone playback can be added later by bundling
 * audio assets.
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
      // On Android, custom channel sounds require bundled raw audio resources.
      // Until custom audio files are added to android/app/src/main/res/raw/,
      // all channels use 'default' system sound (except 'none' which is silent).
      sound: t.id === 'none' ? '' : 'default',
      silent: t.id === 'none',
    }));
}
