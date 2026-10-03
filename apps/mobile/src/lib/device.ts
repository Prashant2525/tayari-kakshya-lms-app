import type { DeviceInfo } from '@tk/contracts';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { secureStore } from './secure-store';

const INSTALL_ID_KEY = 'tk.installId';
let cached: string | null = null;

/** A random id for this installation (not a hardware id), used to name sessions for the device limit (D-028). */
async function installId(): Promise<string> {
  if (cached) return cached;
  let id = await secureStore.get(INSTALL_ID_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await secureStore.set(INSTALL_ID_KEY, id);
  }
  cached = id;
  return id;
}

export function platform(): DeviceInfo['platform'] {
  return Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : 'web';
}

export async function deviceInfo(): Promise<DeviceInfo> {
  const name = [Device.manufacturer, Device.modelName].filter(Boolean).join(' ').trim();
  return {
    deviceId: await installId(),
    deviceName: (name || (Platform.OS === 'web' ? 'Web browser' : 'Phone')).slice(0, 120),
    platform: platform(),
  };
}
