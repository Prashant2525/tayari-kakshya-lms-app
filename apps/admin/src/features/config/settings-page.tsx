import { SETTINGS, type SettingKey, type SettingValue } from '@tk/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
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
