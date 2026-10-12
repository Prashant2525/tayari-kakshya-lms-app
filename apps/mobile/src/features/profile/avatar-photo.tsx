import { Image, StyleSheet } from 'react-native';

/**
 * The student's profile photo (D-074) filling a round avatar; the avatar shows the initials when there is none.
 * The surrounding view clips it (`overflow: 'hidden'`).
 */
export function AvatarPhoto({ url }: { url: string }) {
  return (
    <Image
      source={{ uri: url }}
      style={StyleSheet.absoluteFill}
      resizeMode="cover"
      accessibilityIgnoresInvertColors
    />
  );
}
