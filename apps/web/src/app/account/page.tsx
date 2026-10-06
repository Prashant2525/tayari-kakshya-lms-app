import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { signOutAction } from '@/app/actions/auth';
import { ReceiptButton } from '@/components/order-parts';
import { button, Chip, PageTitle } from '@/components/ui';
import { api, ApiError, signedIn } from '@/lib/api';
import { getI18n } from '@/lib/i18n';
import type { Me, OrderView } from '@/lib/types';

export const metadata: Metadata = { robots: { index: false } };

const STATUS_TONE = {
  paid: 'success',
  refunded: 'neutral',
  pending: 'primary',
  expired: 'neutral',
  cancelled: 'neutral',
} as const;

/** The student's purchases (with receipts) and sign-out. */
export default async function AccountPage() {
  if (!(await signedIn())) redirect('/login?next=/account');
  const [me, orders] = await Promise.all([api<Me>('/me'), api<OrderView[]>('/me/orders')]).catch(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) redirect('/login?next=/account');
      throw err;
    },
  );
  const { t, npr, localized, bsDate } = await getI18n();
  return (
    <>
      <PageTitle sub={me.email ?? undefined}>{me.fullName}</PageTitle>
      <section aria-labelledby="purchases">
        <h2 id="purchases" className="mb-3 text-xl font-bold text-text">
          {t('account.purchases')}
        </h2>
        {orders.length === 0 ? (
          <p className="text-text-secondary">{t('account.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {orders.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text">
                    {o.items
                      .map((i) =>
                        i.kind === 'plan'
                          ? t('account.plan', { name: localized(i.title) })
                          : localized(i.title),
                      )
                      .join(', ')}
                  </p>
                  <p className="text-sm text-text-secondary">
                    {t('account.line', {
                      no: String(o.orderNo).padStart(6, '0'),
                      date: bsDate(o.paidAt ?? o.createdAt),
                      amount: npr(o.totalPaisa),
                    })}
                  </p>
                </div>
                <Chip tone={STATUS_TONE[o.status]}>{t(`status.${o.status}`)}</Chip>
                {o.receipt ? (
                  <ReceiptButton
                    orderId={o.id}
                    label={t('account.receipt', { no: o.receipt.number })}
                    variant="link"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <form action={signOutAction} className="mt-10">
        <button className={button.secondary}>{t('auth.signOut')}</button>
      </form>
    </>
  );
}
