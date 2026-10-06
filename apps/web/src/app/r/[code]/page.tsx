import { redirect } from 'next/navigation';

/** A referral link (D-058): `/r/<code>` opens sign-up with the code filled in. */
export default async function ReferralLink({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(
    /^[A-Za-z0-9]{6,12}$/.test(code)
      ? `/register?ref=${encodeURIComponent(code.toUpperCase())}`
      : '/register',
  );
}
