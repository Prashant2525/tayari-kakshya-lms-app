import type { Metadata } from 'next';
import { StaticPageView, staticPageMetadata } from '@/components/static-page';

export function generateMetadata(): Promise<Metadata> {
  return staticPageMetadata('terms');
}

export default function Page() {
  return <StaticPageView slug="terms" />;
}
