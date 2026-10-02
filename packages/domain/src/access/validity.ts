/** How long access to a course lasts, as configured per course in the CMS. */
export type AccessValidity =
  | { type: 'days'; days: number }
  /** `YYYY-MM-DD`: access ends when that day ends in Nepal. */
  | { type: 'fixed_date'; endsOn: string }
  | { type: 'lifetime' };

/** Nepal Standard Time is UTC+05:45 all year (no daylight saving). */
const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60_000;
const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export class AccessValidityError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = 'AccessValidityError';
  }
}

/**
 * The instant access granted at `start` ends; `null` means it never ends.
 * `days` counts exact 24-hour periods from `start`; `fixed_date` ends at midnight after that day, Nepal time.
 */
export function accessEndsAt(validity: AccessValidity, start: Date): Date | null {
  switch (validity.type) {
    case 'lifetime':
      return null;
    case 'days':
      if (!Number.isInteger(validity.days) || validity.days < 1) {
        throw new AccessValidityError(`Validity days must be a positive integer, got ${validity.days}`);
      }
      return new Date(start.getTime() + validity.days * DAY_MS);
    case 'fixed_date': {
      const m = ISO_DATE.exec(validity.endsOn);
      const [y, mo, d] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [NaN, NaN, NaN];
      const midnightUtc = Date.UTC(y, mo - 1, d);
      const check = new Date(midnightUtc);
      if (!m || check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
        throw new AccessValidityError(`Invalid end date: ${validity.endsOn}`);
      }
      return new Date(midnightUtc + DAY_MS - NEPAL_OFFSET_MS);
    }
  }
}
