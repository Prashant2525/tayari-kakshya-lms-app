import * as Linking from 'expo-linking';
import { create } from 'zustand';

/**
 * A checkout share link (`…/checkout/<slug>?coupon=CODE`, D-056) opened while signed out: the guards send the student
 * to sign in first, so the link is kept here and opened once they are in. In memory only — it is a convenience.
 */
export const usePendingLink = create<{ href: string | null; set(href: string | null): void }>((set) => ({
  href: null,
  set: (href) => set({ href }),
}));

/** The in-app address of a checkout link, or null for anything else. */
export function checkoutHref(url: string | null): string | null {
  if (!url) return null;
  const { path, queryParams } = Linking.parse(url);
  const clean = (path ?? '').replace(/^\/+|\/+$/g, '');
  if (!/^checkout\/(plan\/)?[a-z0-9-]+$/.test(clean)) return null;
  const coupon = typeof queryParams?.coupon === 'string' ? queryParams.coupon : null;
  return coupon && /^[A-Za-z0-9-]{3,32}$/.test(coupon)
    ? `/${clean}?coupon=${encodeURIComponent(coupon)}`
    : `/${clean}`;
}
