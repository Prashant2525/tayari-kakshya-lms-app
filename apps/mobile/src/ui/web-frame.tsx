import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Linking, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

export interface WebFrameHandle {
  /** Sends a message to the page (received as a `message` event). */
  post(message: unknown): void;
}

export interface WebFrameProps {
  uri: string;
  title: string;
  onMessage?: (data: unknown) => void;
  /** Runs in the page after it loads (phones only; the web build cannot inject into other origins). */
  injectedJavaScript?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Embedded page (video player, PDF reader). Phones: a WebView that stays on the page's own host — other links open
 * in the browser. No Referer is sent for the first load, which Bunny's signed embeds require (T-031).
 */
export const WebFrame = forwardRef<WebFrameHandle, WebFrameProps>(function WebFrame(
  { uri, title, onMessage, injectedJavaScript, style },
  ref,
) {
  const view = useRef<WebView>(null);
  const host = new URL(uri).host;
  useImperativeHandle(
    ref,
    () => ({ post: (message) => view.current?.postMessage(JSON.stringify(message)) }),
    [],
  );
  return (
    <WebView
      ref={view}
      source={{ uri }}
      accessibilityLabel={title}
      style={[styles.frame, style]}
      javaScriptEnabled
      domStorageEnabled
      allowsFullscreenVideo
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      setSupportMultipleWindows={false}
      injectedJavaScript={injectedJavaScript}
      onMessage={(event) => {
        try {
          onMessage?.(JSON.parse(event.nativeEvent.data));
        } catch {
          // Ignore messages that are not ours.
        }
      }}
      onShouldStartLoadWithRequest={(request) => {
        const target = new URL(request.url);
        if (target.host === host || request.url === 'about:blank') return true;
        if (request.isTopFrame) void Linking.openURL(request.url);
        return !request.isTopFrame;
      }}
    />
  );
});

const styles = StyleSheet.create({ frame: { flex: 1, backgroundColor: 'transparent' } });
