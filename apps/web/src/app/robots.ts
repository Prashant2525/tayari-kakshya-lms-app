import type { MetadataRoute } from 'next';
import { serverEnv } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/account', '/checkout', '/payment-result', '/login', '/register'],
      },
    ],
    sitemap: `${serverEnv.siteUrl}/sitemap.xml`,
  };
}
