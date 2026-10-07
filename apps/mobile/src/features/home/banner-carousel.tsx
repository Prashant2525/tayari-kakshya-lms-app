import { radius } from '@tk/design-tokens';
import { useQuery } from '@tanstack/react-query';
import type { LocalizedText } from '@tk/contracts';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { api } from '@/api/client';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { useTheme } from '@/theme/theme';

interface Banner {
  id: string;
  title: LocalizedText;
  image: { url: string; variants: Record<string, string> };
  link: { type: 'course' | 'plan' | 'article' | 'page' | 'url'; value: string } | null;
}

/** Where a banner leads (the server leaves out, on iPhone, the ones that lead to buying, D-027). */
function open(link: Banner['link']) {
  if (!link) return;
  switch (link.type) {
    case 'course':
      return router.push({ pathname: '/course/[slug]', params: { slug: link.value } });
    case 'article':
      return router.push({ pathname: '/article/[slug]', params: { slug: link.value } });
    case 'page':
      return router.push({ pathname: '/page/[slug]', params: { slug: link.value } });
    case 'plan':
      return router.push('/plans');
    case 'url':
      return void WebBrowser.openBrowserAsync(link.value);
  }
}

/** Banners from the CMS (D-064) at the top of Home; swipe between them. */
export function BannerCarousel() {
  const { colors } = useTheme();
  const { locale } = useT();
  const banners = useQuery({
    queryKey: ['banners', 'app'],
    queryFn: () => api.get<Banner[]>('/banners?placement=app'),
    staleTime: 5 * 60_000,
  });
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const list = banners.data ?? [];
  if (!list.length) return null;
  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ gap: 8 }}>
      {width > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          onScroll={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          scrollEventThrottle={64}
        >
          {list.map((b) => {
            const uri = b.image.variants['w1280'] ?? b.image.variants['w640'] ?? b.image.url;
            const title = localized(b.title, locale);
            return (
              <Pressable
                key={b.id}
                role={b.link ? 'link' : 'img'}
                aria-label={title}
                disabled={!b.link}
                onPress={() => open(b.link)}
                style={{ width }}
              >
                <Image
                  source={{ uri }}
                  style={[styles.image, { backgroundColor: colors.surfaceMuted }]}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                />
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <View style={[styles.image, { backgroundColor: colors.surfaceMuted }]} />
      )}
      {list.length > 1 ? (
        <View style={styles.dots} aria-hidden>
          {list.map((b, i) => (
            <View
              key={b.id}
              style={[styles.dot, { backgroundColor: i === index ? colors.primary : colors.borderStrong }]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', aspectRatio: 16 / 7, borderRadius: radius.md },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
