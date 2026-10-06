import type { LocalizedText } from '@tk/contracts';

/** The API's answers the website reads (shapes as the API sends them). */

export interface Pricing {
  pricePaisa: number;
  salePricePaisa: number | null;
  saleEndsAt: string | null;
  effectivePricePaisa: number;
}

export interface Validity {
  type: string;
  days: number | null;
  endsOn: string | null;
}

export interface CourseCard {
  id: string;
  slug: string;
  title: LocalizedText;
  shortDescription: LocalizedText | null;
  thumbnailUrl: string | null;
  isFree: boolean;
  isFeatured: boolean;
  /** Null where this channel does not sell or for free courses. */
  pricing: Pricing | null;
}

export interface RichNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  content?: RichNode[];
}

export interface CourseDetail extends CourseCard {
  description: { en?: RichNode; ne?: RichNode } | null;
  descriptionMedia: Record<string, { url: string; variants: Record<string, string> }>;
  validity: Validity;
  contentCounts: Partial<Record<'note' | 'pdf' | 'video', number>>;
  subjects: Array<{
    id: string;
    name: LocalizedText;
    summary: LocalizedText | null;
    fullMarks: number | null;
    passMarks: number | null;
  }>;
  instructors: Array<{
    id: string;
    displayName: LocalizedText;
    bio: LocalizedText | null;
    photoUrl: string | null;
  }>;
  access: { entitled: boolean; canEnrol: boolean } | null;
}

export interface PlanView {
  id: string;
  slug: string;
  name: LocalizedText;
  description: LocalizedText | null;
  features: LocalizedText[];
  coverage: 'selected' | 'all_courses';
  isFeatured: boolean;
  isFree: boolean;
  validity: Validity;
  courses: Array<{ id: string; slug: string; title: LocalizedText }>;
  pricing: Pricing | null;
  mine: { endsAt: string | null } | null;
}

export interface Quote {
  kind: 'course' | 'plan';
  title: LocalizedText;
  validity: Validity;
  regularPricePaisa: number;
  subtotalPaisa: number;
  discountPaisa: number;
  coupon: { code: string } | null;
  /** D-058: the friend's referral discount on their first purchase. */
  referral: { discountPaisa: number } | null;
  /** A valid coupon smaller than the referral discount, so not used (D-059). */
  couponSkipped: string | null;
  tax: { rateBps: number; inclusive: boolean; paisa: number } | null;
  totalPaisa: number;
}

export type OrderStatus = 'pending' | 'paid' | 'refunded' | 'expired' | 'cancelled';

export interface OrderView {
  id: string;
  orderNo: number;
  status: OrderStatus;
  totalPaisa: number;
  createdAt: string;
  paidAt: string | null;
  receipt: { number: string } | null;
  items: Array<{
    kind: 'course' | 'plan';
    slug: string | null;
    planSlug: string | null;
    title: LocalizedText;
  }>;
  payments: Array<{ status: 'initiated' | 'pending' | 'completed' | 'failed' | 'cancelled' | 'expired' }>;
}

export interface Me {
  id: string;
  fullName: string;
  email: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
}

export interface PaymentOptions {
  providers: Array<{ provider: 'esewa' | 'khalti'; testMode: boolean }>;
}

export interface CertificateCheck {
  code: string;
  status: 'valid' | 'revoked';
  holderName: string;
  courseTitle: LocalizedText;
  issuerName: LocalizedText;
  issuedAt: string;
  revokedAt: string | null;
}

export type CheckoutItem = { courseId: string } | { planId: string };
