import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'
import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz'

// ─── Class name utility ───────────────────────────────────────────────────────

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Date / Timezone utilities ────────────────────────────────────────────────

/**
 * Format a UTC date string in a given IANA timezone.
 * e.g. "Friday, 6 June 2025, 7:00 PM EDT"
 */
export function formatInTz(
  dateStr: string | Date,
  timezone: string,
  fmt: string = 'EEEE, d MMMM yyyy, h:mm a zzz'
): string {
  return formatInTimeZone(new Date(dateStr), timezone, fmt)
}

/**
 * Format a date as a short date string in a given timezone.
 * e.g. "Fri 6 Jun 2025"
 */
export function formatDateInTz(dateStr: string | Date, timezone: string): string {
  return formatInTimeZone(new Date(dateStr), timezone, 'EEE d MMM yyyy')
}

/**
 * Format a draw time showing timezone label.
 * e.g. "Wed, 4 Jun 2025, 7:00 PM EDT"
 */
export function formatDrawTime(drawTime: string, timezone: string): string {
  return formatInTimeZone(new Date(drawTime), timezone, 'EEE, d MMM yyyy, h:mm a zzz')
}

/**
 * Convert a UTC date to a zoned Date object for a given IANA timezone.
 */
export function toLocalTime(dateStr: string | Date, timezone: string): Date {
  return toZonedTime(new Date(dateStr), timezone)
}

/**
 * Get the Wednesday at 7:00 PM in a given timezone preceding a given Friday.
 * Returns the UTC TIMESTAMPTZ string.
 */
export function computeDrawTime(raceDateStr: string, timezone: string): Date {
  // raceDateStr is a DATE string like "2025-06-06" (a Friday)
  const raceDate = new Date(raceDateStr + 'T00:00:00')
  // Friday is day 5, Wednesday is day 3 — subtract 2 days
  const wednesday = new Date(raceDate)
  wednesday.setDate(wednesday.getDate() - 2)

  // Build "YYYY-MM-DD 19:00:00" in the club timezone, convert to UTC
  const year = wednesday.getFullYear()
  const month = String(wednesday.getMonth() + 1).padStart(2, '0')
  const day = String(wednesday.getDate()).padStart(2, '0')
  const localTimeStr = `${year}-${month}-${day}T19:00:00`

  // Use date-fns-tz to interpret this local time in the club's timezone
  return fromZonedTime(localTimeStr, timezone)
}

/**
 * Relative time string, e.g. "in 3 days", "2 hours ago".
 */
export function relativeTime(dateStr: string | Date): string {
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
}

/**
 * Format a date as ISO date string "YYYY-MM-DD".
 */
export function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/**
 * Check if a given date is a Friday (day of week 5).
 */
export function isFriday(date: Date | string): boolean {
  const d = new Date(date)
  return d.getDay() === 5
}

/**
 * Get all Fridays between two dates (inclusive).
 */
export function getFridaysBetween(startDate: Date, endDate: Date): Date[] {
  const fridays: Date[] = []
  const current = new Date(startDate)

  // Move to the first Friday on or after startDate
  while (current.getDay() !== 5) {
    current.setDate(current.getDate() + 1)
  }

  while (current <= endDate) {
    fridays.push(new Date(current))
    current.setDate(current.getDate() + 7)
  }

  return fridays
}

// ─── String utilities ─────────────────────────────────────────────────────────

/**
 * Generate a URL-safe slug from a string.
 * e.g. "Royal Yacht Club" → "royal-yacht-club"
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Capitalize the first letter of each word.
 */
export function titleCase(str: string): string {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase())
}

// ─── Role utilities ───────────────────────────────────────────────────────────

export function formatRole(role: 'helm' | 'crew'): string {
  return role === 'helm' ? 'Helm' : 'Crew'
}

export function oppositeRole(role: 'helm' | 'crew'): 'helm' | 'crew' {
  return role === 'helm' ? 'crew' : 'helm'
}

export function formatRegistrationStatus(
  primaryRole: 'helm' | 'crew',
  acceptOtherRole: boolean
): string {
  const roleLabel = formatRole(primaryRole)
  const otherRoleLabel = formatRole(oppositeRole(primaryRole))
  if (acceptOtherRole) {
    return `Registered as ${roleLabel} (will ${otherRoleLabel.toLowerCase()} if needed)`
  }
  return `Registered as ${roleLabel}`
}

// ─── Validation utilities ─────────────────────────────────────────────────────

/**
 * Validate E.164 phone number format.
 * e.g. +12125551234
 */
export function isValidE164Phone(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone)
}

// ─── Misc utilities ───────────────────────────────────────────────────────────

/**
 * Fisher-Yates shuffle — returns a new shuffled array.
 */
export function shuffle<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Chunk an array into arrays of size n.
 */
export function chunk<T>(array: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
    array.slice(i * size, i * size + size)
  )
}

/**
 * Clamp a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
