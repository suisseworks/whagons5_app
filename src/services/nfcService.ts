import NfcManager, { Ndef, NfcTech } from 'react-native-nfc-manager';

export interface NfcProgramResult {
  tagUid?: string | null;
}

export async function ensureNfcSupported(): Promise<boolean> {
  return NfcManager.isSupported();
}

export async function writeNfcUrl(url: string): Promise<NfcProgramResult> {
  const supported = await ensureNfcSupported();
  if (!supported) {
    throw new Error('This device does not support NFC.');
  }

  await NfcManager.start();
  await NfcManager.requestTechnology(NfcTech.Ndef);

  try {
    const bytes = Ndef.encodeMessage([Ndef.uriRecord(url)]);
    if (!bytes) {
      throw new Error('Unable to encode NFC URL.');
    }

    await NfcManager.ndefHandler.writeNdefMessage(bytes);
    const tag = await NfcManager.getTag().catch(() => null);
    return { tagUid: tag?.id ?? null };
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => undefined);
  }
}
