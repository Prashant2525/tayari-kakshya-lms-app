import * as SecureStore from 'expo-secure-store';

/** Session tokens and the install id live in the Keychain / Android Keystore. */
export const secureStore = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};
