'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { orderStatusAction, receiptLinkAction } from '@/app/actions/checkout';
import { useT } from './i18n-provider';
import { button } from './ui';

/** While a payment is being confirmed: asks the server again every few seconds, then shows the new state. */
export function PaymentPoller({ orderId }: { orderId: string }) {
  const router = useRouter();
  useEffect(() => {
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      const status = await orderStatusAction(orderId);
      if ((status && status !== 'pending') || tries >= 40) {
        clearInterval(timer);
        router.refresh();
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [orderId, router]);
  return null;
}

/** Opens the receipt PDF (D-057) through a link that works for a few minutes. */
export function ReceiptButton({
  orderId,
  label,
  variant = 'secondary',
}: {
  orderId: string;
  label: string;
  variant?: 'secondary' | 'link';
}) {
  const { t } = useT();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={pending}
        className={variant === 'link' ? button.link : button.secondary}
        onClick={() =>
          start(async () => {
            const url = await receiptLinkAction(orderId);
            setFailed(!url);
            if (url) window.open(url, '_blank', 'noopener');
          })
        }
      >
        {label}
      </button>
      {failed ? <span className="text-xs text-danger">{t('error.generic')}</span> : null}
    </span>
  );
}
