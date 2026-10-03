import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import type { WebFrameHandle, WebFrameProps } from './web-frame';

export type { WebFrameHandle, WebFrameProps } from './web-frame';

/** Web build (development and browser tests): an iframe; messages go through `postMessage`. */
export const WebFrame = forwardRef<WebFrameHandle, WebFrameProps>(function WebFrame(
  { uri, title, onMessage, sendReferrer = false, style },
  ref,
) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const origin = new URL(uri, window.location.href).origin;

  useImperativeHandle(
    ref,
    () => ({ post: (message) => frame.current?.contentWindow?.postMessage(message, origin) }),
    [origin],
  );

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow) onMessage?.(event.data);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [onMessage]);

  return (
    <View style={[{ flex: 1 }, style as StyleProp<ViewStyle>]}>
      <iframe
        ref={frame}
        src={uri}
        title={title}
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy={sendReferrer ? 'strict-origin-when-cross-origin' : 'no-referrer'}
        style={{ border: 0, width: '100%', height: '100%', flex: 1 }}
      />
    </View>
  );
});
