import { formatNpr, MoneyError, rupeesToPaisa } from '@tk/domain';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Card, CardHeader } from '@/components/ui/primitives';
import { isoToNepalLocal, nepalLocalToIso, paisaToRupeesInput } from '@/lib/content';
import { formatDateTimeBs } from '@/lib/format';

export interface PricingValue {
  pricePaisa: number;
  salePricePaisa: number | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  validityType: 'days' | 'fixed_date' | 'lifetime';
  validityDays: number | null;
  validityEndsOn: string | null;
}

function parseRupees(value: string): number | null | 'invalid' {
  if (!value.trim()) return null;
  try {
    return rupeesToPaisa(value.replace(/,/g, ''));
  } catch (err) {
    if (err instanceof MoneyError) return 'invalid';
    throw err;
  }
}

/**
 * Price, sale and validity, as used by courses and plans. Amounts are typed in rupees and sent in paisa; the server
 * validates again.
 */
export function PricingCard({
  value,
  readOnly,
  saving,
  error,
  onError,
  onSave,
  zeroHint,
  validityHint,
  note,
}: {
  value: PricingValue;
  readOnly: boolean;
  saving: boolean;
  error: string | null;
  onError: (message: string) => void;
  onSave: (body: PricingValue) => void;
  /** What a price of 0 means here. */
  zeroHint: string;
  validityHint: string;
  note?: ReactNode;
}) {
  const [v, setV] = useState({
    price: paisaToRupeesInput(value.pricePaisa),
    sale: paisaToRupeesInput(value.salePricePaisa),
    saleStarts: isoToNepalLocal(value.saleStartsAt),
    saleEnds: isoToNepalLocal(value.saleEndsAt),
    validityType: value.validityType,
    validityDays: value.validityDays?.toString() ?? '',
    validityEndsOn: value.validityEndsOn ?? '',
  });
  const set = <K extends keyof typeof v>(key: K, next: (typeof v)[K]) => setV((x) => ({ ...x, [key]: next }));
  const price = parseRupees(v.price);
  const sale = parseRupees(v.sale);
  const submit = () => {
    if (price === null || price === 'invalid')
      return onError('Enter the price in rupees, e.g. 3000 or 2999.50');
    if (sale === 'invalid') return onError('Enter the sale price in rupees');
    if (v.validityType === 'days' && !/^\d+$/.test(v.validityDays))
      return onError('Enter the number of days');
    onSave({
      pricePaisa: price,
      salePricePaisa: sale,
      saleStartsAt: sale === null ? null : nepalLocalToIso(v.saleStarts),
      saleEndsAt: sale === null ? null : nepalLocalToIso(v.saleEnds),
      validityType: v.validityType,
      validityDays: v.validityType === 'days' ? Number(v.validityDays) : null,
      validityEndsOn: v.validityType === 'fixed_date' ? v.validityEndsOn || null : null,
    });
  };
  return (
    <Card>
      <CardHeader
        title="Price"
        description="Entered by your team; never calculated in the app. Amounts in Nepali rupees."
      />
      <div className="flex flex-col gap-4 p-5">
        {error ? <Alert tone="danger" title={error} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Price (Rs)"
            hint={typeof price === 'number' ? (price === 0 ? zeroHint : formatNpr(price, 'en')) : undefined}
          >
            {(a) => (
              <Input
                {...a}
                inputMode="decimal"
                value={v.price}
                disabled={readOnly}
                onChange={(e) => set('price', e.target.value)}
              />
            )}
          </Field>
          <Field label="Sale price (Rs)" hint={typeof sale === 'number' ? formatNpr(sale, 'en') : 'Optional'}>
            {(a) => (
              <Input
                {...a}
                inputMode="decimal"
                value={v.sale}
                disabled={readOnly}
                onChange={(e) => set('sale', e.target.value)}
              />
            )}
          </Field>
        </div>
        {sale !== null ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Sale starts (Nepal time)"
              hint={v.saleStarts ? formatDateTimeBs(nepalLocalToIso(v.saleStarts)) : 'Empty = now'}
            >
              {(a) => (
                <Input
                  {...a}
                  type="datetime-local"
                  value={v.saleStarts}
                  disabled={readOnly}
                  onChange={(e) => set('saleStarts', e.target.value)}
                />
              )}
            </Field>
            <Field
              label="Sale ends (Nepal time)"
              hint={v.saleEnds ? formatDateTimeBs(nepalLocalToIso(v.saleEnds)) : 'Empty = no end'}
            >
              {(a) => (
                <Input
                  {...a}
                  type="datetime-local"
                  value={v.saleEnds}
                  disabled={readOnly}
                  onChange={(e) => set('saleEnds', e.target.value)}
                />
              )}
            </Field>
          </div>
        ) : null}
      </div>
      <CardHeader title="Validity" description={validityHint} className="border-t" />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Access lasts">
          {(a) => (
            <Select
              {...a}
              value={v.validityType}
              disabled={readOnly}
              onChange={(e) => set('validityType', e.target.value as typeof v.validityType)}
            >
              <option value="days">A number of days</option>
              <option value="fixed_date">Until a fixed date</option>
              <option value="lifetime">Lifetime</option>
            </Select>
          )}
        </Field>
        {v.validityType === 'days' ? (
          <Field label="Days">
            {(a) => (
              <Input
                {...a}
                inputMode="numeric"
                value={v.validityDays}
                disabled={readOnly}
                onChange={(e) => set('validityDays', e.target.value)}
              />
            )}
          </Field>
        ) : v.validityType === 'fixed_date' ? (
          <Field label="Last day" hint="Access ends at midnight Nepal time after this day.">
            {(a) => (
              <Input
                {...a}
                type="date"
                value={v.validityEndsOn}
                disabled={readOnly}
                onChange={(e) => set('validityEndsOn', e.target.value)}
              />
            )}
          </Field>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-4">
        {note ? <p className="mr-auto text-xs text-text-muted">{note}</p> : null}
        <Button onClick={submit} loading={saving} disabled={readOnly}>
          Save
        </Button>
      </div>
    </Card>
  );
}
