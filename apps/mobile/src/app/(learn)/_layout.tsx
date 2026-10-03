import { Stack } from 'expo-router';

/** Course → subject → lesson screens (signed in, verified when required, onboarded — see features/guards). */
export default function LearnLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
