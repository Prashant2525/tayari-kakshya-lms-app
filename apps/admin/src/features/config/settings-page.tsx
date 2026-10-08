import { SETTINGS, type SettingKey, type SettingValue } from '@tk/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  ErrorState,
  PageHeader,
  Spinner,
  Switch,
} from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  COUNTED_ATTEMPT_LABEL,
  LATE_START_LABEL,
  PREMIUM_ACCESS_HINT,
  PREMIUM_ACCESS_LABEL,
  RESULT_RELEASE_LABEL,
} from '@/lib/assessments';
import { QUESTION_TYPE_LABEL } from '@/lib/questions';

const QUESTION_TYPES = Object.keys(QUESTION_TYPE_LABEL) as Array<keyof typeof QUESTION_TYPE_LABEL>;

interface SettingRow {
  key: SettingKey;
  value: unknown;
  default: unknown;
  isDefault: boolean;
}

/** One card per setting: local draft, validated with the shared schema before saving. */
function SettingCard<K extends SettingKey>({
  row,
  title,
  description,
  children,
}: {
  row: SettingRow & { key: K };
  title: string;
  description: ReactNode;
  children: (draft: SettingValue<K>, set: (next: SettingValue<K>) => void, disabled: boolean) => ReactNode;
}) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [draft, setDraft] = useState(row.value as SettingValue<K>);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // When the saved value changes (after save or refetch), reset the draft during render (React-recommended).
  const [base, setBase] = useState(row.value);
  if (base !== row.value) {
    setBase(row.value);
    setDraft(row.value as SettingValue<K>);
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(row.value);
  const editable = can('settings:update');
  const headingId = useId();

  const save = async () => {
    const parsed = SETTINGS[row.key].schema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid value');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.put(`/admin/settings/${row.key}`, { value: parsed.data });
      await qc.invalidateQueries({ queryKey: ['settings'] });
      await qc.invalidateQueries({ queryKey: ['app-config'] });
      toast.success(`${title} saved`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card role="region" aria-labelledby={headingId}>
      <CardHeader
        titleId={headingId}
        title={title}
        description={description}
        actions={row.isDefault ? <Badge>Default</Badge> : <Badge tone="primary">Customised</Badge>}
      />
      <div className="flex flex-col gap-4 px-5 py-4">
        {children(draft, setDraft, !editable)}
        {error ? <Alert tone="danger" title={error} /> : null}
      </div>
      {editable ? (
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={!dirty || saving}
            onClick={() => setDraft(row.value as SettingValue<K>)}
          >
            Discard
          </Button>
          <Button size="sm" disabled={!dirty} loading={saving} onClick={() => void save()}>
            Save
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/** A select over a label map; `empty` adds a "no value" option. */
function OptionSelect<V extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  empty,
  hint,
}: {
  label: string;
  hint?: string;
  value: V | '';
  options: Record<V, string>;
  onChange: (v: V) => void;
  disabled: boolean;
  empty?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      {(a) => (
        <Select {...a} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as V)}>
          {empty !== undefined ? <option value="">{empty}</option> : null}
          {(Object.entries(options) as Array<[V, string]>).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-text">{label}</p>
        {hint ? <p className="text-xs text-text-muted">{hint}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} label={label} />
    </div>
  );
}

/** A percentage typed as text (keeps "12." while typing) and stored in basis points; NaN while not a number. */
function PercentField({
  label,
  hint,
  bps,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  bps: number;
  disabled: boolean;
  onChange: (bps: number) => void;
}) {
  const toBps = (s: string) =>
    /^\d{1,3}(\.\d{1,2})?$/.test(s.trim()) ? Math.round(Number(s) * 100) : Number.NaN;
  const [text, setText] = useState(Number.isNaN(bps) ? '' : String(bps / 100));
  // A saved value or Discard replaces what is typed.
  if (!Number.isNaN(bps) && toBps(text) !== bps) setText(String(bps / 100));
  return (
    <Field label={label} hint={hint}>
      {(a) => (
        <Input
          {...a}
          inputMode="decimal"
          className="w-32"
          value={text}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            onChange(toBps(e.target.value));
          }}
        />
      )}
    </Field>
  );
}

/** Rupees typed as text (keeps "12." while typing), stored in paisa; empty = null, not a number = NaN. */
function RupeeField({
  label,
  hint,
  paisa,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  paisa: number | null;
  disabled: boolean;
  onChange: (paisa: number | null) => void;
}) {
  const toPaisa = (s: string) =>
    !s.trim() ? null : /^\d+(\.\d{1,2})?$/.test(s.trim()) ? Math.round(Number(s) * 100) : Number.NaN;
  const shown = (p: number | null) => (p === null || Number.isNaN(p) ? '' : String(p / 100));
  const [text, setText] = useState(shown(paisa));
  // A saved value or Discard replaces what is typed.
  const typed = toPaisa(text);
  if (
    !(paisa !== null && Number.isNaN(paisa)) &&
    typed !== paisa &&
    !(Number.isNaN(typed) && paisa === null)
  ) {
    setText(shown(paisa));
  }
  return (
    <Field label={label} hint={hint}>
      {(a) => (
        <Input
          {...a}
          inputMode="decimal"
          className="w-full max-w-40"
          value={text}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            onChange(toPaisa(e.target.value));
          }}
        />
      )}
    </Field>
  );
}

type DiscountDraft = {
  type: 'percent' | 'fixed';
  percentBps: number | null;
  amountPaisa: number | null;
  maxDiscountPaisa: number | null;
};

/** Percent (with an optional cap) or a fixed amount — as coupons are set up. */
function DiscountFields<D extends DiscountDraft>({
  value,
  onChange,
  disabled,
}: {
  value: D;
  onChange: (next: D) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <OptionSelect
        label="Type"
        value={value.type}
        options={{ percent: 'Percentage', fixed: 'Fixed amount' }}
        disabled={disabled}
        onChange={(type) => onChange({ ...value, type })}
      />
      {value.type === 'percent' ? (
        <>
          <PercentField
            label="Percent off"
            bps={value.percentBps ?? Number.NaN}
            disabled={disabled}
            onChange={(bps) => onChange({ ...value, percentBps: Number.isNaN(bps) ? null : bps })}
          />
          <RupeeField
            label="Largest discount (Rs)"
            hint="Optional."
            paisa={value.maxDiscountPaisa}
            disabled={disabled}
            onChange={(p) => onChange({ ...value, maxDiscountPaisa: p })}
          />
        </>
      ) : (
        <RupeeField
          label="Amount off (Rs)"
          paisa={value.amountPaisa}
          disabled={disabled}
          onChange={(p) => onChange({ ...value, amountPaisa: p })}
        />
      )}
    </div>
  );
}

/** One text in English and Nepali, side by side (a textarea when `rows` is given). */
function BilingualFields({
  label,
  value,
  onChange,
  disabled,
  max,
  rows,
}: {
  label: string;
  value: { en: string; ne: string };
  onChange: (next: { en: string; ne: string }) => void;
  disabled: boolean;
  max: number;
  rows?: number;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {(['en', 'ne'] as const).map((lang) => (
        <Field key={lang} label={`${label} (${lang === 'en' ? 'English' : 'नेपाली'})`}>
          {(a) =>
            rows ? (
              <Textarea
                {...a}
                lang={lang}
                rows={rows}
                maxLength={max}
                value={value[lang]}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
              />
            ) : (
              <Input
                {...a}
                lang={lang}
                maxLength={max}
                value={value[lang]}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
              />
            )
          }
        </Field>
      ))}
    </div>
  );
}

type EmailTemplate = { subject: { en: string; ne: string }; body: { en: string; ne: string } };

/** Subject and message of an email in both languages. */
function EmailTemplateFields({
  value,
  onChange,
  disabled,
}: {
  value: EmailTemplate;
  onChange: (next: EmailTemplate) => void;
  disabled: boolean;
}) {
  const set = (part: 'subject' | 'body', lang: 'en' | 'ne', text: string) =>
    onChange({ subject: value.subject, body: value.body, [part]: { ...value[part], [lang]: text } });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Subject (English)">
        {(a) => (
          <Input
            {...a}
            maxLength={150}
            value={value.subject.en}
            disabled={disabled}
            onChange={(e) => set('subject', 'en', e.target.value)}
          />
        )}
      </Field>
      <Field label="विषय (नेपाली)">
        {(a) => (
          <Input
            {...a}
            lang="ne"
            maxLength={150}
            value={value.subject.ne}
            disabled={disabled}
            onChange={(e) => set('subject', 'ne', e.target.value)}
          />
        )}
      </Field>
      <Field label="Message (English)">
        {(a) => (
          <Textarea
            {...a}
            rows={8}
            maxLength={4000}
            value={value.body.en}
            disabled={disabled}
            onChange={(e) => set('body', 'en', e.target.value)}
          />
        )}
      </Field>
      <Field label="सन्देश (नेपाली)">
        {(a) => (
          <Textarea
            {...a}
            lang="ne"
            rows={8}
            maxLength={4000}
            value={value.body.ne}
            disabled={disabled}
            onChange={(e) => set('body', 'ne', e.target.value)}
          />
        )}
      </Field>
    </div>
  );
}

const UNIT_MINUTES = { minutes: 1, hours: 60, days: 1440 } as const;
type Unit = keyof typeof UNIT_MINUTES;
const unitOf = (minutes: number): Unit =>
  minutes % 1440 === 0 ? 'days' : minutes % 60 === 0 ? 'hours' : 'minutes';

/** One reminder: an amount and its unit, kept as minutes (the unit stays as chosen while typing). */
function ReminderTime({
  index,
  minutes,
  onChange,
  onRemove,
  disabled,
}: {
  index: number;
  minutes: number;
  onChange: (minutes: number) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const [unit, setUnit] = useState<Unit>(unitOf(minutes));
  const amount = minutes / UNIT_MINUTES[unit];
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label={`Reminder ${index + 1}`} className="w-28">
        {(a) => (
          <Input
            {...a}
            type="number"
            min={1}
            value={Number.isFinite(amount) ? amount : ''}
            disabled={disabled}
            onChange={(e) => onChange(Math.round(Number(e.target.value) * UNIT_MINUTES[unit]))}
          />
        )}
      </Field>
      <Select
        aria-label={`Reminder ${index + 1} unit`}
        className="w-32"
        value={unit}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value as Unit;
          setUnit(next);
          onChange(Math.round(amount * UNIT_MINUTES[next]));
        }}
      >
        <option value="minutes">{amount === 1 ? 'minute' : 'minutes'}</option>
        <option value="hours">{amount === 1 ? 'hour' : 'hours'}</option>
        <option value="days">{amount === 1 ? 'day' : 'days'}</option>
      </Select>
      <span className="pb-2 text-sm text-text-muted">before it opens</span>
      {!disabled ? (
        <Button variant="ghost" size="sm" className="mb-0.5" onClick={onRemove}>
          Remove
        </Button>
      ) : null}
    </div>
  );
}

function ReminderTimes({
  minutes,
  onChange,
  disabled,
}: {
  minutes: number[];
  onChange: (minutes: number[]) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {minutes.map((m, i) => (
        <ReminderTime
          key={`${i}-${minutes.length}`}
          index={i}
          minutes={m}
          disabled={disabled}
          onChange={(next) => onChange(minutes.map((old, j) => (j === i ? next : old)))}
          onRemove={() => onChange(minutes.filter((_, j) => j !== i))}
        />
      ))}
      {minutes.length === 0 ? (
        <p className="text-sm text-text-muted">No reminder times: none are sent.</p>
      ) : null}
      {!disabled && minutes.length < 3 ? (
        <div>
          <Button variant="secondary" size="sm" onClick={() => onChange([...minutes, 60])}>
            Add a reminder
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function SettingsPage() {
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<SettingRow[]>('/admin/settings'),
  });
  if (settings.isPending) return <Spinner />;
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;
  const byKey = Object.fromEntries(settings.data.map((r) => [r.key, r])) as Record<SettingKey, SettingRow>;
  const row = <K extends SettingKey>(key: K) => byKey[key] as SettingRow & { key: K };

  return (
    <>
      <PageHeader
        title="System settings"
        description="Business rules you control without an app update. Every change is recorded in the audit log."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <SettingCard
          row={row('auth.deviceLimit')}
          title="Device limit"
          description="How many devices a student can be signed in on at once."
        >
          {(d, set, disabled) => (
            <>
              <ToggleRow
                label="Limit devices"
                hint="Off means students can sign in on any number of devices."
                checked={d.maxActiveSessions !== null}
                onChange={(on) => set({ ...d, maxActiveSessions: on ? 2 : null })}
                disabled={disabled}
              />
              {d.maxActiveSessions !== null ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Maximum devices">
                    {(a) => (
                      <Input
                        {...a}
                        type="number"
                        min={1}
                        max={20}
                        value={d.maxActiveSessions ?? ''}
                        disabled={disabled}
                        onChange={(e) => set({ ...d, maxActiveSessions: Number(e.target.value) })}
                      />
                    )}
                  </Field>
                  <Field label="When the limit is reached">
                    {(a) => (
                      <Select
                        {...a}
                        value={d.onLimit}
                        disabled={disabled}
                        onChange={(e) => set({ ...d, onLimit: e.target.value as typeof d.onLimit })}
                      >
                        <option value="block">Ask the student to sign out a device</option>
                        <option value="revoke_oldest">Sign out the oldest device automatically</option>
                      </Select>
                    )}
                  </Field>
                </div>
              ) : null}
            </>
          )}
        </SettingCard>

        <SettingCard
          row={row('auth.verification')}
          title="Account verification"
          description="How students can verify their account."
        >
          {(d, set, disabled) => (
            <>
              <ToggleRow
                label="Verify by email"
                checked={d.channels.email}
                disabled={disabled}
                onChange={(v) => set({ ...d, channels: { ...d.channels, email: v } })}
              />
              <ToggleRow
                label="Verify by phone (SMS)"
                hint="Requires an SMS provider to be configured on the server."
                checked={d.channels.phone}
                disabled={disabled}
                onChange={(v) => set({ ...d, channels: { ...d.channels, phone: v } })}
              />
              <ToggleRow
                label="Require verification before learning"
                checked={d.requiredForLearning}
                disabled={disabled}
                onChange={(v) => set({ ...d, requiredForLearning: v })}
              />
            </>
          )}
        </SettingCard>

        <SettingCard
          row={row('auth.staffMfa')}
          title="Staff two-factor authentication"
          description="Who must use an authenticator app to access this panel."
        >
          {(d, set, disabled) => (
            <Field label="Required for">
              {(a) => (
                <Select
                  {...a}
                  value={d.requiredFor}
                  disabled={disabled}
                  onChange={(e) => set({ requiredFor: e.target.value as typeof d.requiredFor })}
                >
                  <option value="super_admins">Super Admins only (recommended minimum)</option>
                  <option value="all_staff">All staff</option>
                  <option value="none">Nobody (not recommended)</option>
                </Select>
              )}
            </Field>
          )}
        </SettingCard>

        <SettingCard
          row={row('account.deletionGraceDays')}
          title="Account deletion grace period"
          description="Days a student has to cancel a deletion request before their data is erased."
        >
          {(d, set, disabled) => (
            <Field label="Grace period (days)">
              {(a) => (
                <Input
                  {...a}
                  type="number"
                  min={1}
                  max={60}
                  value={d.days}
                  disabled={disabled}
                  onChange={(e) => set({ days: Number(e.target.value) })}
                />
              )}
            </Field>
          )}
        </SettingCard>

        <SettingCard
          row={row('purchase.channels')}
          title="Purchase channels"
          description="Where students can buy. Changes apply to installed apps without an update."
        >
          {(d, set, disabled) => (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Android app">
                {(a) => (
                  <Select
                    {...a}
                    value={d.android}
                    disabled={disabled}
                    onChange={(e) => set({ ...d, android: e.target.value as typeof d.android })}
                  >
                    <option value="in_app">In the app</option>
                    <option value="web_only">Website only</option>
                    <option value="disabled">Disabled</option>
                  </Select>
                )}
              </Field>
              <Field label="iOS app">
                {(a) => (
                  <Select
                    {...a}
                    value={d.ios}
                    disabled={disabled}
                    onChange={(e) => set({ ...d, ios: e.target.value as typeof d.ios })}
                  >
                    <option value="web_only">Website only</option>
                    <option value="disabled">Disabled</option>
                  </Select>
                )}
              </Field>
              <Field label="Website">
                {(a) => (
                  <Select
                    {...a}
                    value={d.web}
                    disabled={disabled}
                    onChange={(e) => set({ ...d, web: e.target.value as typeof d.web })}
                  >
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                  </Select>
                )}
              </Field>
            </div>
          )}
        </SettingCard>

        <SettingCard
          row={row('questions.types')}
          title="Question types"
          description="Which kinds of questions your team can create, and the names students see. Existing questions keep working when a type is turned off."
        >
          {(d, set, disabled) => (
            <ul className="divide-y divide-border rounded-sm border border-border">
              {QUESTION_TYPES.map((type) => {
                const on = d.enabled.includes(type);
                const label = d.labels[type];
                return (
                  <li key={type} className="grid gap-3 p-3 sm:grid-cols-[200px_1fr_1fr] sm:items-center">
                    <label className="flex items-center gap-3 text-sm font-semibold text-text">
                      <Switch
                        checked={on}
                        disabled={disabled}
                        label={`${QUESTION_TYPE_LABEL[type]} enabled`}
                        onCheckedChange={(v) =>
                          set({
                            ...d,
                            enabled: v ? [...d.enabled, type] : d.enabled.filter((x) => x !== type),
                          })
                        }
                      />
                      {QUESTION_TYPE_LABEL[type]}
                    </label>
                    {(['en', 'ne'] as const).map((lang) => (
                      <Input
                        key={lang}
                        lang={lang}
                        aria-label={`${QUESTION_TYPE_LABEL[type]} name (${lang === 'en' ? 'English' : 'Nepali'})`}
                        placeholder={
                          lang === 'en' ? `Name shown (default: ${QUESTION_TYPE_LABEL[type]})` : 'नेपाली नाम'
                        }
                        value={label?.[lang] ?? ''}
                        disabled={disabled}
                        onChange={(e) => {
                          const next = { ...label, [lang]: e.target.value || undefined };
                          const labels = { ...d.labels };
                          if (next.en || next.ne)
                            labels[type] = next as (typeof labels)[typeof type] & object;
                          else delete labels[type];
                          set({ ...d, labels });
                        }}
                      />
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
        </SettingCard>

        <SettingCard
          row={row('app.minVersions')}
          title="Minimum app versions"
          description="Older app versions are asked to update (format 1.2.3). Leave empty to allow all."
        >
          {(d, set, disabled) => (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Android">
                {(a) => (
                  <Input
                    {...a}
                    value={d.android ?? ''}
                    placeholder="e.g. 1.0.0"
                    disabled={disabled}
                    onChange={(e) => set({ ...d, android: e.target.value || null })}
                  />
                )}
              </Field>
              <Field label="iOS">
                {(a) => (
                  <Input
                    {...a}
                    value={d.ios ?? ''}
                    placeholder="e.g. 1.0.0"
                    disabled={disabled}
                    onChange={(e) => set({ ...d, ios: e.target.value || null })}
                  />
                )}
              </Field>
            </div>
          )}
        </SettingCard>

        <SettingCard
          row={row('app.storeLinks')}
          title="App store links"
          description="Where the “Update now” button opens when an app is older than the minimum version (https links)."
        >
          {(d, set, disabled) => (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Google Play page">
                {(a) => (
                  <Input
                    {...a}
                    type="url"
                    value={d.android ?? ''}
                    placeholder="https://play.google.com/store/apps/details?id=…"
                    disabled={disabled}
                    onChange={(e) => set({ ...d, android: e.target.value || null })}
                  />
                )}
              </Field>
              <Field label="App Store page">
                {(a) => (
                  <Input
                    {...a}
                    type="url"
                    value={d.ios ?? ''}
                    placeholder="https://apps.apple.com/app/…"
                    disabled={disabled}
                    onChange={(e) => set({ ...d, ios: e.target.value || null })}
                  />
                )}
              </Field>
            </div>
          )}
        </SettingCard>

        <SettingCard
          row={row('assessments.defaults')}
          title="Assessment defaults"
          description="Prefilled on every new assessment; each assessment can still change them. Scoring left on “No default” must be chosen per assessment."
        >
          {(d, set, disabled) => (
            <div className="grid gap-4 sm:grid-cols-2">
              <OptionSelect
                label="When students see results"
                value={d.resultRelease}
                options={RESULT_RELEASE_LABEL}
                disabled={disabled}
                onChange={(v) => set({ ...d, resultRelease: v })}
              />
              <Field label="Attempts allowed" hint="Blank = unlimited.">
                {(a) => (
                  <Input
                    {...a}
                    type="number"
                    min={1}
                    max={100}
                    value={d.maxAttempts ?? ''}
                    disabled={disabled}
                    onChange={(e) =>
                      set({ ...d, maxAttempts: e.target.value === '' ? null : Number(e.target.value) })
                    }
                  />
                )}
              </Field>
              <OptionSelect
                label="Premium access"
                hint={PREMIUM_ACCESS_HINT}
                value={d.premiumAccess}
                options={PREMIUM_ACCESS_LABEL}
                disabled={disabled}
                onChange={(v) => set({ ...d, premiumAccess: v })}
              />
              <OptionSelect
                label="Late start (time window)"
                value={d.lateStart}
                options={LATE_START_LABEL}
                disabled={disabled}
                onChange={(v) => set({ ...d, lateStart: v })}
              />
              <OptionSelect
                label="Official attempt (with retakes)"
                value={d.countedAttempt}
                options={COUNTED_ATTEMPT_LABEL}
                disabled={disabled}
                onChange={(v) => set({ ...d, countedAttempt: v })}
              />
              <ToggleRow
                label="Show explanations"
                checked={d.showExplanations}
                disabled={disabled}
                onChange={(v) => set({ ...d, showExplanations: v })}
              />
              <OptionSelect
                label="Negative marking"
                value={d.scoring.negativeMarking === null ? '' : String(d.scoring.negativeMarking)}
                options={{ true: 'On', false: 'Off' }}
                empty="No default"
                disabled={disabled}
                onChange={(v) =>
                  set({ ...d, scoring: { ...d.scoring, negativeMarking: v === '' ? null : v === 'true' } })
                }
              />
              <OptionSelect
                label="Lowest total"
                value={d.scoring.scoreFloor ?? ''}
                options={{ zero: 'Never below zero', none: 'Can go below zero' }}
                empty="No default"
                disabled={disabled}
                onChange={(v) => set({ ...d, scoring: { ...d.scoring, scoreFloor: v || null } })}
              />
              <OptionSelect
                label="Multiple-answer questions"
                value={d.scoring.multipleChoice ?? ''}
                options={{
                  all_or_nothing: 'All or nothing',
                  partial_if_no_wrong: 'Part marks if no wrong option',
                }}
                empty="No default"
                disabled={disabled}
                onChange={(v) => set({ ...d, scoring: { ...d.scoring, multipleChoice: v || null } })}
              />
              <OptionSelect
                label="Match the following"
                value={d.scoring.match ?? ''}
                options={{ all_or_nothing: 'All or nothing', per_pair: 'Part marks per pair' }}
                empty="No default"
                disabled={disabled}
                onChange={(v) => set({ ...d, scoring: { ...d.scoring, match: v || null } })}
              />
              <OptionSelect
                label="Fill in the blank"
                value={d.scoring.fillBlank ?? ''}
                options={{ all_or_nothing: 'All or nothing', per_blank: 'Part marks per blank' }}
                empty="No default"
                disabled={disabled}
                onChange={(v) => set({ ...d, scoring: { ...d.scoring, fillBlank: v || null } })}
              />
            </div>
          )}
        </SettingCard>

        <SettingCard
          row={row('assessments.timing')}
          title="Exam timing"
          description="Answers that arrive this many seconds after an attempt's time is up still count (slow connections). After that the attempt is submitted automatically."
        >
          {(d, set, disabled) => (
            <Field label="Grace period (seconds)" className="sm:max-w-xs">
              {(a) => (
                <Input
                  {...a}
                  type="number"
                  min={0}
                  max={300}
                  value={d.graceSeconds}
                  disabled={disabled}
                  onChange={(e) => set({ graceSeconds: Number(e.target.value) })}
                />
              )}
            </Field>
          )}
        </SettingCard>

        <SettingCard
          row={row('notifications.examReminders')}
          title="Exam reminders"
          description="Before a scheduled test opens, students who can take it get a reminder in the app, and by push and email unless they turned exam reminders off."
        >
          {(d, set, disabled) => (
            <>
              <ToggleRow
                label="Send exam reminders"
                checked={d.enabled}
                disabled={disabled}
                onChange={(v) => set({ ...d, enabled: v })}
              />
              {d.enabled ? (
                <ReminderTimes
                  minutes={d.minutesBefore}
                  disabled={disabled}
                  onChange={(minutesBefore) => set({ ...d, minutesBefore })}
                />
              ) : null}
            </>
          )}
        </SettingCard>

        <SettingCard
          row={row('emails.welcome')}
          title="Welcome email"
          description="Sent once to every new student account (any phone or the website), with the How-to-get-courses box below it. {name} and {website} are filled in."
        >
          {(d, set, disabled) => (
            <>
              <ToggleRow
                label="Send the welcome email"
                checked={d.enabled}
                disabled={disabled}
                onChange={(v) => set({ ...d, enabled: v })}
              />
              <EmailTemplateFields
                value={d}
                disabled={disabled}
                onChange={(next) => set({ ...d, ...next })}
              />
            </>
          )}
        </SettingCard>

        <SettingCard
          row={row('emails.buyingGuide')}
          title="How-to-get-courses box in emails"
          description="Shown under the welcome, sign-up verification, notice, course update, exam reminder, result and buying-link emails — not password or sign-in codes, and not receipts. The iPhone line is highlighted. {website} is filled in. Emails are outside the app, so Apple allows this."
        >
          {(d, set, disabled) => (
            <>
              <ToggleRow
                label="Show the box"
                checked={d.enabled}
                disabled={disabled}
                onChange={(v) => set({ ...d, enabled: v })}
              />
              <BilingualFields
                label="Heading"
                value={d.title}
                max={80}
                disabled={disabled}
                onChange={(title) => set({ ...d, title })}
              />
              <BilingualFields
                label="iPhone / iPad (highlighted)"
                value={d.iphone}
                max={400}
                rows={5}
                disabled={disabled}
                onChange={(iphone) => set({ ...d, iphone })}
              />
              <BilingualFields
                label="Android"
                value={d.android}
                max={400}
                rows={2}
                disabled={disabled}
                onChange={(android) => set({ ...d, android })}
              />
              <BilingualFields
                label="Already bought"
                value={d.alreadyBought}
                max={200}
                rows={2}
                disabled={disabled}
                onChange={(alreadyBought) => set({ ...d, alreadyBought })}
              />
            </>
          )}
        </SettingCard>

        <SettingCard
          row={row('emails.purchaseLink')}
          title="Buying link email"
          description="What staff send from Sales → Interested on iPhone, in the student's language (they can change it before sending). {name}, {course} and {link} are filled in; keep {link}."
        >
          {(d, set, disabled) => (
            <EmailTemplateFields value={d} disabled={disabled} onChange={(next) => set({ ...d, ...next })} />
          )}
        </SettingCard>

        <SettingCard
          row={row('leaderboards.display')}
          title="Leaderboards"
          description="How other students appear on leaderboards. Students always see their own rank and score."
        >
          {(d, set, disabled) => (
            <OptionSelect
              label="Names shown"
              value={d.names}
              options={{
                first_initial: 'First name + initial (e.g. Aarati S.)',
                full: 'Full name',
                none: 'No names (own rank only)',
              }}
              disabled={disabled}
              onChange={(v) => set({ names: v })}
            />
          )}
        </SettingCard>

        <SettingCard
          row={row('dailyChallenge.rules')}
          title="Daily challenge"
          description="A day's challenge counts for the streak and that day's ranking only when taken on its day (Nepal time)."
        >
          {(d, set, disabled) => (
            <ToggleRow
              label="Past challenges stay open as practice"
              hint="Practice never counts for streaks or rankings."
              checked={d.pastAsPractice}
              disabled={disabled}
              onChange={(v) => set({ pastAsPractice: v })}
            />
          )}
        </SettingCard>

        <SettingCard
          row={row('payments.providers')}
          title="Payment methods"
          description="Which gateways students can pay with. Each also needs its merchant credentials on the server (.env); payments already started still finish."
        >
          {(d, set, disabled) => (
            <>
              <ToggleRow
                label="eSewa"
                checked={d.esewa}
                disabled={disabled}
                onChange={(v) => set({ ...d, esewa: v })}
              />
              <ToggleRow
                label="Khalti"
                checked={d.khalti}
                disabled={disabled}
                onChange={(v) => set({ ...d, khalti: v })}
              />
            </>
          )}
        </SettingCard>

        <SettingCard
          row={row('commerce.tax')}
          title="VAT and business details"
          description="Off until the business is VAT-registered. When on, every new order records the VAT it contains (or adds it on top) and receipts show these details. Orders already made keep what applied to them."
        >
          {(d, set, disabled) => (
            <>
              <ToggleRow
                label="VAT-registered"
                hint="Check with your auditor first: some education services are VAT-exempt."
                checked={d.vatRegistered}
                disabled={disabled}
                onChange={(v) => set({ ...d, vatRegistered: v })}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <PercentField
                  label="VAT rate (%)"
                  hint="Nepal's VAT Act: 13%."
                  bps={d.rateBps}
                  disabled={disabled}
                  onChange={(bps) => set({ ...d, rateBps: bps })}
                />
                <OptionSelect
                  label="Prices typed in the CMS"
                  value={d.pricesIncludeVat ? 'inclusive' : 'exclusive'}
                  options={{ inclusive: 'Already include VAT', exclusive: 'VAT is added at checkout' }}
                  disabled={disabled}
                  onChange={(v) => set({ ...d, pricesIncludeVat: v === 'inclusive' })}
                />
                <Field label="Registered business name">
                  {(a) => (
                    <Input
                      {...a}
                      value={d.businessName}
                      disabled={disabled}
                      onChange={(e) => set({ ...d, businessName: e.target.value })}
                    />
                  )}
                </Field>
                <Field label="PAN / VAT number" hint="9 digits.">
                  {(a) => (
                    <Input
                      {...a}
                      inputMode="numeric"
                      value={d.panNumber}
                      disabled={disabled}
                      onChange={(e) => set({ ...d, panNumber: e.target.value.trim() })}
                    />
                  )}
                </Field>
              </div>
              <Field label="Business address">
                {(a) => (
                  <Input
                    {...a}
                    value={d.address}
                    disabled={disabled}
                    onChange={(e) => set({ ...d, address: e.target.value })}
                  />
                )}
              </Field>
            </>
          )}
        </SettingCard>

        <SettingCard
          row={row('commerce.receipts')}
          title="Receipt numbers"
          description="Every paid order gets the next number, e.g. TK-2083/84-000001. A change applies to receipts issued after it; issued receipts never change."
        >
          {(d, set, disabled) => (
            <>
              <Field label="Prefix" hint="1–10 capital letters or digits.">
                {(a) => (
                  <Input
                    {...a}
                    className="w-40 font-mono uppercase"
                    value={d.prefix}
                    disabled={disabled}
                    onChange={(e) => set({ ...d, prefix: e.target.value.toUpperCase() })}
                  />
                )}
              </Field>
              <ToggleRow
                label="Restart each fiscal year"
                hint="Adds the Nepali fiscal year (from 1 Shrawan) and starts again from 000001."
                checked={d.resetEachFiscalYear}
                disabled={disabled}
                onChange={(v) => set({ ...d, resetEachFiscalYear: v })}
              />
            </>
          )}
        </SettingCard>

        <SettingCard
          row={row('referrals.rules')}
          title="Referral programme"
          description="Every student gets a personal code. A friend who signs up with it gets a discount on their first purchase (or their coupon, whichever is bigger — never both); when that purchase is paid, the student who invited them gets a one-time coupon only they can use. A full refund switches off a reward not used yet."
        >
          {(d, set, disabled) => (
            <>
              <ToggleRow
                label="Programme on"
                hint="When off, codes are not shown and sign-up ignores them."
                checked={d.enabled}
                disabled={disabled}
                onChange={(v) => set({ ...d, enabled: v })}
              />
              <p className="text-sm font-semibold text-text">The friend's first purchase</p>
              <DiscountFields
                value={d.friendDiscount}
                disabled={disabled}
                onChange={(friendDiscount) => set({ ...d, friendDiscount })}
              />
              <ToggleRow
                label="Friend discount works on sale prices"
                hint="Off: no referral discount while a sale price applies (as for coupons)."
                checked={d.friendDiscount.allowOnSale}
                disabled={disabled}
                onChange={(v) => set({ ...d, friendDiscount: { ...d.friendDiscount, allowOnSale: v } })}
              />
              <p className="text-sm font-semibold text-text">The reward for the student who invited them</p>
              <DiscountFields
                value={d.reward}
                disabled={disabled}
                onChange={(reward) => set({ ...d, reward })}
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Reward valid for (days)">
                  {(a) => (
                    <Input
                      {...a}
                      type="number"
                      min={1}
                      max={3650}
                      className="w-32"
                      value={d.reward.validDays ?? ''}
                      disabled={disabled}
                      onChange={(e) =>
                        set({
                          ...d,
                          reward: {
                            ...d.reward,
                            validDays: e.target.value === '' ? null : Number(e.target.value),
                          },
                        })
                      }
                    />
                  )}
                </Field>
              </div>
              <ToggleRow
                label="Reward works on sale prices"
                checked={d.reward.allowOnSale}
                disabled={disabled}
                onChange={(v) => set({ ...d, reward: { ...d.reward, allowOnSale: v } })}
              />
            </>
          )}
        </SettingCard>

        <SettingCard
          row={row('mistakes.revision')}
          title="Mistake notebook"
          description="Wrong and partly correct answers from tests and practice are collected for revision. A question leaves the notebook after this many correct answers in a row (or when the student removes it)."
        >
          {(d, set, disabled) => (
            <Field label="Correct answers in a row" hint="From 1 to 10.">
              {(a) => (
                <Input
                  {...a}
                  type="number"
                  min={1}
                  max={10}
                  className="w-32"
                  value={Number.isNaN(d.correctInARow) ? '' : d.correctInARow}
                  disabled={disabled}
                  onChange={(e) =>
                    set({ correctInARow: e.target.value === '' ? Number.NaN : Number(e.target.value) })
                  }
                />
              )}
            </Field>
          )}
        </SettingCard>

        <SettingCard
          row={row('progress.topics')}
          title="Progress analytics"
          description="Students see their accuracy over recent days and which topics need more practice (weak) or are going well (strong). A topic is listed once it has enough answers."
        >
          {(d, set, disabled) => (
            <div className="flex flex-wrap gap-4">
              {(
                [
                  ['windowDays', 'Accuracy over the last (days)', 'From 7 to 365.', 7, 365],
                  ['minAnswers', 'Answers before a topic is listed', 'From 1 to 100.', 1, 100],
                  ['weakBelow', 'Weak below (%)', 'From 1 to 100.', 1, 100],
                  ['strongFrom', 'Strong from (%)', 'At least the weak line.', 1, 100],
                ] as const
              ).map(([key, label, hint, min, max]) => (
                <Field key={key} label={label} hint={hint}>
                  {(a) => (
                    <Input
                      {...a}
                      type="number"
                      min={min}
                      max={max}
                      className="w-32"
                      value={Number.isNaN(d[key]) ? '' : d[key]}
                      disabled={disabled}
                      onChange={(e) =>
                        set({ ...d, [key]: e.target.value === '' ? Number.NaN : Number(e.target.value) })
                      }
                    />
                  )}
                </Field>
              ))}
            </div>
          )}
        </SettingCard>

        <SettingCard
          row={row('certificates.verification')}
          title="Certificate verification"
          description="Printed on every certificate with a QR code, followed by the certificate number. Leave blank to print the number only."
        >
          {(d, set, disabled) => (
            <Field
              label="Verification page"
              hint="https address without the trailing /, e.g. your website's certificate page."
            >
              {(a) => (
                <Input
                  {...a}
                  type="url"
                  value={d.baseUrl ?? ''}
                  placeholder="https://example.com/certificates"
                  disabled={disabled}
                  onChange={(e) => set({ baseUrl: e.target.value.trim() || null })}
                />
              )}
            </Field>
          )}
        </SettingCard>

        <SettingCard
          row={row('app.maintenance')}
          title="Maintenance mode"
          description="Temporarily closes the student app and website. This admin panel stays available."
        >
          {(d, set, disabled) => (
            <>
              <ToggleRow
                label="Maintenance mode on"
                checked={d.enabled}
                disabled={disabled}
                onChange={(v) => set({ ...d, enabled: v })}
              />
              {d.enabled ? (
                <Alert tone="warning" title="Students cannot use the app while this is on." />
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Message (English)">
                  {(a) => (
                    <Input
                      {...a}
                      value={d.message?.en ?? ''}
                      disabled={disabled}
                      onChange={(e) => {
                        const message = { ...(d.message ?? {}), en: e.target.value || undefined };
                        set({ ...d, message: message.en || message.ne ? message : null });
                      }}
                    />
                  )}
                </Field>
                <Field label="सन्देश (नेपाली)">
                  {(a) => (
                    <Input
                      {...a}
                      lang="ne"
                      value={d.message?.ne ?? ''}
                      disabled={disabled}
                      onChange={(e) => {
                        const message = { ...(d.message ?? {}), ne: e.target.value || undefined };
                        set({ ...d, message: message.en || message.ne ? message : null });
                      }}
                    />
                  )}
                </Field>
              </div>
            </>
          )}
        </SettingCard>
      </div>
    </>
  );
}
