import { radius } from '@tk/design-tokens';
import { useEffect, useState, type ReactNode } from 'react';
import { Image, Linking, Platform, ScrollView, StyleSheet, Text, View, type TextStyle } from 'react-native';
import type { MediaMap, RichNode } from '@/api/learning';
import { fontFamilies, useTheme, type Theme } from '@/theme/theme';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

interface Ctx {
  colors: Theme['colors'];
  media: MediaMap;
  scale: number;
}

/**
 * Renders a note stored as TipTap JSON (already validated by the API's allow-list) with native components.
 * `scale` is the reader's text size (A− / A+). Images come from the media map the API returns with the note.
 */
export function RichText({ doc, media, scale = 1 }: { doc: RichNode; media: MediaMap; scale?: number }) {
  const { colors } = useTheme();
  const ctx: Ctx = { colors, media, scale };
  return <View style={styles.doc}>{(doc.content ?? []).map((n, i) => block(n, `b${i}`, ctx))}</View>;
}

function base(ctx: Ctx): TextStyle {
  return {
    fontFamily: fontFamilies[400],
    fontSize: 17 * ctx.scale,
    lineHeight: 28 * ctx.scale,
    color: ctx.colors.text,
  };
}

function align(node: RichNode): TextStyle {
  const a = node.attrs?.['textAlign'];
  return a === 'center' || a === 'right' || a === 'justify' ? { textAlign: a } : {};
}

function block(node: RichNode, key: string, ctx: Ctx): ReactNode {
  const children = node.content ?? [];
  switch (node.type) {
    case 'paragraph':
      return (
        <Text key={key} style={[base(ctx), align(node)]}>
          {children.length ? inline(children, key, ctx) : ' '}
        </Text>
      );
    case 'heading': {
      const level = Number(node.attrs?.['level'] ?? 2);
      const size = ({ 1: 23, 2: 21, 3: 19 } as Record<number, number>)[level] ?? 17;
      return (
        <Text
          key={key}
          role="heading"
          aria-level={level + 1}
          style={[
            base(ctx),
            align(node),
            {
              fontFamily: fontFamilies[level <= 2 ? 700 : 600],
              fontSize: size * ctx.scale,
              lineHeight: (size + 8) * ctx.scale,
              marginTop: 6 * ctx.scale,
            },
          ]}
        >
          {inline(children, key, ctx)}
        </Text>
      );
    }
    case 'bulletList':
    case 'orderedList': {
      const start = Number(node.attrs?.['start'] ?? 1);
      return (
        <View key={key} style={styles.list}>
          {children.map((item, i) => (
            <View key={`${key}-${i}`} style={styles.listRow}>
              <Text style={[base(ctx), styles.marker]}>
                {node.type === 'orderedList' ? `${start + i}.` : '•'}
              </Text>
              <View style={styles.listBody}>
                {(item.content ?? []).map((c, j) => block(c, `${key}-${i}-${j}`, ctx))}
              </View>
            </View>
          ))}
        </View>
      );
    }
    case 'blockquote':
      return (
        <View
          key={key}
          style={[
            styles.quote,
            { borderLeftColor: ctx.colors.primary, backgroundColor: ctx.colors.primarySoft },
          ]}
        >
          {children.map((c, i) => block(c, `${key}-${i}`, ctx))}
        </View>
      );
    case 'codeBlock':
      return (
        <ScrollView key={key} horizontal style={[styles.code, { backgroundColor: ctx.colors.surfaceMuted }]}>
          <Text
            style={[base(ctx), { fontFamily: MONO, fontSize: 14 * ctx.scale, lineHeight: 22 * ctx.scale }]}
          >
            {children.map((c) => c.text ?? '').join('')}
          </Text>
        </ScrollView>
      );
    case 'horizontalRule':
      return <View key={key} style={[styles.rule, { backgroundColor: ctx.colors.border }]} />;
    case 'image':
      return <RichImage key={key} node={node} ctx={ctx} />;
    case 'table':
      return (
        <ScrollView key={key} horizontal style={styles.tableScroll}>
          <View style={[styles.table, { borderColor: ctx.colors.borderStrong }]}>
            {children.map((row, r) => (
              <View key={`${key}-${r}`} style={styles.tableRow}>
                {(row.content ?? []).map((cell, c) => (
                  <View
                    key={`${key}-${r}-${c}`}
                    style={[
                      styles.cell,
                      { borderColor: ctx.colors.borderStrong },
                      cell.type === 'tableHeader' && { backgroundColor: ctx.colors.surfaceMuted },
                    ]}
                  >
                    {(cell.content ?? []).map((b, k) => block(b, `${key}-${r}-${c}-${k}`, ctx))}
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      );
    default:
      // Unknown blocks cannot be stored (allow-list); render any text they hold rather than nothing.
      return children.length ? (
        <Text key={key} style={base(ctx)}>
          {inline(children, key, ctx)}
        </Text>
      ) : null;
  }
}

function inline(nodes: RichNode[], key: string, ctx: Ctx): ReactNode[] {
  return nodes.map((node, i) => {
    if (node.type === 'hardBreak') return '\n';
    if (node.type !== 'text') return null;
    const style: TextStyle = {};
    const decorations: string[] = [];
    let href: string | null = null;
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') style.fontFamily = fontFamilies[700];
      else if (mark.type === 'italic') style.fontStyle = 'italic';
      else if (mark.type === 'underline') decorations.push('underline');
      else if (mark.type === 'strike') decorations.push('line-through');
      else if (mark.type === 'code')
        Object.assign(style, { fontFamily: MONO, backgroundColor: ctx.colors.surfaceMuted });
      else if (mark.type === 'highlight') style.backgroundColor = ctx.colors.warningSoft;
      else if (mark.type === 'subscript' || mark.type === 'superscript') style.fontSize = 13 * ctx.scale;
      else if (mark.type === 'link') {
        const value = mark.attrs?.['href'];
        if (typeof value === 'string' && SAFE_LINK.test(value)) href = value;
      }
    }
    if (decorations.length)
      style.textDecorationLine = decorations.join(' ') as TextStyle['textDecorationLine'];
    if (href) {
      const target = href;
      return (
        <Text
          key={`${key}-t${i}`}
          role="link"
          style={[style, { color: ctx.colors.link, textDecorationLine: 'underline' }]}
          onPress={() => void Linking.openURL(target)}
        >
          {node.text}
        </Text>
      );
    }
    return (
      <Text key={`${key}-t${i}`} style={style}>
        {node.text}
      </Text>
    );
  });
}

function RichImage({ node, ctx }: { node: RichNode; ctx: Ctx }) {
  const asset = ctx.media[String(node.attrs?.['mediaId'] ?? '')];
  const uri = asset?.variants['w1280'] ?? asset?.variants['w640'] ?? asset?.url ?? null;
  const [ratio, setRatio] = useState(16 / 9);
  useEffect(() => {
    if (uri)
      Image.getSize(
        uri,
        (w, h) => h > 0 && setRatio(w / h),
        () => undefined,
      );
  }, [uri]);
  if (!uri) return null;
  const alt = typeof node.attrs?.['alt'] === 'string' ? (node.attrs['alt'] as string) : '';
  return (
    <Image
      source={{ uri }}
      accessibilityLabel={alt}
      accessibilityIgnoresInvertColors
      style={[styles.image, { aspectRatio: ratio }]}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  doc: { gap: 12 },
  list: { gap: 6 },
  listRow: { flexDirection: 'row', gap: 8 },
  marker: { minWidth: 22, textAlign: 'right' },
  listBody: { flex: 1, gap: 6 },
  quote: { borderLeftWidth: 3, paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderRadius: radius.sm },
  code: { borderRadius: radius.sm, padding: 12 },
  rule: { height: 1, marginVertical: 8 },
  image: { width: '100%', borderRadius: radius.md },
  tableScroll: { flexGrow: 0 },
  table: { borderWidth: 1, borderRadius: radius.sm, overflow: 'hidden' },
  tableRow: { flexDirection: 'row' },
  cell: { minWidth: 120, maxWidth: 280, padding: 8, borderRightWidth: 1, borderBottomWidth: 1, gap: 4 },
});
