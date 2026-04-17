export const BUSINESS_START_HOUR = 9;
export const BUSINESS_START_MINUTE = 0;
export const BUSINESS_END_HOUR = 18;
export const BUSINESS_END_MINUTE = 30;

const START_MIN = BUSINESS_START_HOUR * 60 + BUSINESS_START_MINUTE;
const END_MIN = BUSINESS_END_HOUR * 60 + BUSINESS_END_MINUTE;

/**
 * Clamp a datetime to business hours (09:00–18:30).
 * - Before 09:00 → 09:00 same day
 * - After 18:30 → 09:00 next day
 * - Within range → unchanged
 */
export function normalizeToBusinessHours(date: Date): Date {
  const r = new Date(date);
  const minutes = r.getHours() * 60 + r.getMinutes();
  if (minutes < START_MIN) {
    r.setHours(BUSINESS_START_HOUR, BUSINESS_START_MINUTE, 0, 0);
  } else if (minutes > END_MIN) {
    r.setDate(r.getDate() + 1);
    r.setHours(BUSINESS_START_HOUR, BUSINESS_START_MINUTE, 0, 0);
  } else {
    r.setSeconds(0, 0);
  }
  return r;
}

export function isWithinBusinessHours(date: Date): boolean {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes >= START_MIN && minutes <= END_MIN;
}

export function hasTimeComponent(date: Date): boolean {
  return date.getHours() !== 0 || date.getMinutes() !== 0;
}
