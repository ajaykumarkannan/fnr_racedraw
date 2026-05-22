// ─── App constants for FNR RaceDraw ──────────────────────────────────────────

export const APP_NAME = 'FNR RaceDraw'
export const APP_TAGLINE = 'Friday Night Race Draw Manager'
export const APP_DESCRIPTION =
  'Automated helm-crew pairing for sailing club race series. Register, get paired, go racing.'

// ─── Roles ────────────────────────────────────────────────────────────────────

export const ROLES = {
  HELM: 'helm',
  CREW: 'crew',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export const ROLE_LABELS: Record<Role, string> = {
  helm: 'Helm',
  crew: 'Crew',
}

export const MEMBER_ROLES = {
  MEMBER: 'member',
  RACE_CHAIR: 'race_chair',
} as const

export type MemberRole = (typeof MEMBER_ROLES)[keyof typeof MEMBER_ROLES]

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  member: 'Member',
  race_chair: 'Race Chair',
}

// ─── Race event statuses ──────────────────────────────────────────────────────

export const RACE_STATUS = {
  UPCOMING: 'upcoming',
  DRAW_COMPLETE: 'draw_complete',
  CANCELLED: 'cancelled',
  RACE_DAY_CANCELLED: 'race_day_cancelled',
} as const

export type RaceStatus = (typeof RACE_STATUS)[keyof typeof RACE_STATUS]

export const RACE_STATUS_LABELS: Record<RaceStatus, string> = {
  upcoming: 'Upcoming',
  draw_complete: 'Draw Complete',
  cancelled: 'Cancelled',
  race_day_cancelled: 'Race Day Cancelled',
}

// ─── Overflow reasons ─────────────────────────────────────────────────────────

export const OVERFLOW_REASON = {
  UNMATCHED: 'unmatched',
  BOAT_LIMIT: 'boat_limit',
  NO_PAIR_AVAILABLE: 'no_pair_available',
} as const

export type OverflowReason = (typeof OVERFLOW_REASON)[keyof typeof OVERFLOW_REASON]

// ─── IANA Timezone list ───────────────────────────────────────────────────────

export const TIMEZONES: { value: string; label: string; region: string }[] = [
  // Americas
  { value: 'America/New_York', label: 'Eastern Time (ET)', region: 'Americas' },
  { value: 'America/Chicago', label: 'Central Time (CT)', region: 'Americas' },
  { value: 'America/Denver', label: 'Mountain Time (MT)', region: 'Americas' },
  { value: 'America/Phoenix', label: 'Mountain Time - AZ (no DST)', region: 'Americas' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)', region: 'Americas' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)', region: 'Americas' },
  { value: 'America/Adak', label: 'Hawaii-Aleutian Time (HAT)', region: 'Americas' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)', region: 'Americas' },
  { value: 'America/Toronto', label: 'Eastern Time - Toronto', region: 'Americas' },
  { value: 'America/Vancouver', label: 'Pacific Time - Vancouver', region: 'Americas' },
  { value: 'America/Halifax', label: 'Atlantic Time - Halifax', region: 'Americas' },
  { value: 'America/St_Johns', label: 'Newfoundland Time', region: 'Americas' },
  { value: 'America/Sao_Paulo', label: 'Brasilia Time (BRT)', region: 'Americas' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina Time (ART)', region: 'Americas' },
  { value: 'America/Bogota', label: 'Colombia Time (COT)', region: 'Americas' },
  { value: 'America/Lima', label: 'Peru Time (PET)', region: 'Americas' },
  { value: 'America/Mexico_City', label: 'Central Time - Mexico City', region: 'Americas' },
  { value: 'America/Caracas', label: 'Venezuela Time (VET)', region: 'Americas' },
  // Europe
  { value: 'Europe/London', label: 'GMT/BST - London', region: 'Europe' },
  { value: 'Europe/Dublin', label: 'GMT/IST - Dublin', region: 'Europe' },
  { value: 'Europe/Lisbon', label: 'WET/WEST - Lisbon', region: 'Europe' },
  { value: 'Europe/Paris', label: 'CET/CEST - Paris', region: 'Europe' },
  { value: 'Europe/Berlin', label: 'CET/CEST - Berlin', region: 'Europe' },
  { value: 'Europe/Amsterdam', label: 'CET/CEST - Amsterdam', region: 'Europe' },
  { value: 'Europe/Brussels', label: 'CET/CEST - Brussels', region: 'Europe' },
  { value: 'Europe/Madrid', label: 'CET/CEST - Madrid', region: 'Europe' },
  { value: 'Europe/Rome', label: 'CET/CEST - Rome', region: 'Europe' },
  { value: 'Europe/Stockholm', label: 'CET/CEST - Stockholm', region: 'Europe' },
  { value: 'Europe/Oslo', label: 'CET/CEST - Oslo', region: 'Europe' },
  { value: 'Europe/Copenhagen', label: 'CET/CEST - Copenhagen', region: 'Europe' },
  { value: 'Europe/Helsinki', label: 'EET/EEST - Helsinki', region: 'Europe' },
  { value: 'Europe/Athens', label: 'EET/EEST - Athens', region: 'Europe' },
  { value: 'Europe/Bucharest', label: 'EET/EEST - Bucharest', region: 'Europe' },
  { value: 'Europe/Kiev', label: 'EET/EEST - Kyiv', region: 'Europe' },
  { value: 'Europe/Moscow', label: 'Moscow Time (MSK)', region: 'Europe' },
  { value: 'Europe/Istanbul', label: 'Turkey Time (TRT)', region: 'Europe' },
  // Oceania
  { value: 'Australia/Sydney', label: 'AEST/AEDT - Sydney', region: 'Oceania' },
  { value: 'Australia/Melbourne', label: 'AEST/AEDT - Melbourne', region: 'Oceania' },
  { value: 'Australia/Brisbane', label: 'AEST - Brisbane (no DST)', region: 'Oceania' },
  { value: 'Australia/Perth', label: 'AWST - Perth', region: 'Oceania' },
  { value: 'Australia/Adelaide', label: 'ACST/ACDT - Adelaide', region: 'Oceania' },
  { value: 'Australia/Darwin', label: 'ACST - Darwin (no DST)', region: 'Oceania' },
  { value: 'Pacific/Auckland', label: 'NZST/NZDT - Auckland', region: 'Oceania' },
  { value: 'Pacific/Fiji', label: 'FJT - Fiji', region: 'Oceania' },
  // Asia
  { value: 'Asia/Tokyo', label: 'JST - Tokyo', region: 'Asia' },
  { value: 'Asia/Seoul', label: 'KST - Seoul', region: 'Asia' },
  { value: 'Asia/Shanghai', label: 'CST - Shanghai', region: 'Asia' },
  { value: 'Asia/Hong_Kong', label: 'HKT - Hong Kong', region: 'Asia' },
  { value: 'Asia/Singapore', label: 'SGT - Singapore', region: 'Asia' },
  { value: 'Asia/Bangkok', label: 'ICT - Bangkok', region: 'Asia' },
  { value: 'Asia/Jakarta', label: 'WIB - Jakarta', region: 'Asia' },
  { value: 'Asia/Kolkata', label: 'IST - India', region: 'Asia' },
  { value: 'Asia/Dubai', label: 'GST - Dubai', region: 'Asia' },
  { value: 'Asia/Riyadh', label: 'AST - Riyadh', region: 'Asia' },
  { value: 'Asia/Jerusalem', label: 'IST/IDT - Jerusalem', region: 'Asia' },
  { value: 'Asia/Karachi', label: 'PKT - Karachi', region: 'Asia' },
  { value: 'Asia/Dhaka', label: 'BST - Dhaka', region: 'Asia' },
  { value: 'Asia/Yangon', label: 'MMT - Myanmar', region: 'Asia' },
  { value: 'Asia/Taipei', label: 'CST - Taipei', region: 'Asia' },
  // Africa
  { value: 'Africa/Cairo', label: 'EET - Cairo', region: 'Africa' },
  { value: 'Africa/Johannesburg', label: 'SAST - Johannesburg', region: 'Africa' },
  { value: 'Africa/Lagos', label: 'WAT - Lagos', region: 'Africa' },
  { value: 'Africa/Nairobi', label: 'EAT - Nairobi', region: 'Africa' },
  { value: 'Africa/Casablanca', label: 'WET - Casablanca', region: 'Africa' },
  // UTC
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)', region: 'UTC' },
]

export const TIMEZONE_REGIONS = [...new Set(TIMEZONES.map((tz) => tz.region))]

// ─── Pagination defaults ──────────────────────────────────────────────────────

export const PAGINATION = {
  RACES_PER_PAGE: 20,
  REGISTRATIONS_PER_PAGE: 50,
  MEMBERS_PER_PAGE: 50,
  PAST_RACES_PER_PAGE: 20,
} as const

// ─── Rate limits ──────────────────────────────────────────────────────────────

export const RATE_LIMITS = {
  CLUBS_PER_USER_PER_DAY: 3,
  VERIFICATION_EMAILS_PER_HOUR: 3,
  PASSWORD_RESET_EMAILS_PER_HOUR: 3,
  RESEND_VERIFICATION_COOLDOWN_MINUTES: 5,
  MAX_FAILED_LOGIN_ATTEMPTS: 10,
  FAILED_LOGIN_WINDOW_MINUTES: 15,
} as const

// ─── Cron job settings ────────────────────────────────────────────────────────

export const CRON = {
  REMINDER_WINDOW_HOURS_MIN: 23,
  REMINDER_WINDOW_HOURS_MAX: 25,
  DRAW_TIME_HOUR: 19, // 7:00 PM
  DRAW_DAY_OF_WEEK: 3, // Wednesday (0 = Sunday)
} as const

// ─── Email subjects ───────────────────────────────────────────────────────────

export const EMAIL_SUBJECTS = {
  WELCOME: 'Welcome to FNR RaceDraw — Please verify your email',
  REMINDER: (clubName: string) =>
    `[${clubName}] Reminder: Friday Race Draw Closes Tomorrow at 7pm`,
  REGISTRATION_CONFIRM: (clubName: string, date: string, role: string) =>
    `[${clubName}] You're registered for ${date} — ${role}`,
  DRAW_CANCELLED_INSUFFICIENT: (clubName: string, date: string) =>
    `[${clubName}] Draw Cancelled — ${date} (Insufficient Registrations)`,
  DRAW_RESULTS: (clubName: string, date: string) =>
    `[${clubName}] Friday Night Race Draw — ${date}`,
  OVERFLOW: (clubName: string, date: string) =>
    `[${clubName}] You have priority for the next draw — ${date}`,
  RACE_CANCELLED: (clubName: string, date: string) =>
    `[${clubName}] Race Cancelled — ${date}`,
  PASSWORD_RESET: 'Reset your FNR RaceDraw password',
  REGISTRATION_CANCELLED: (clubName: string, date: string) =>
    `[${clubName}] Registration cancelled for ${date}`,
  ACCOUNT_DELETED: 'Your FNR RaceDraw account has been deleted',
  MEMBER_REMOVED: (clubName: string) => `You have been removed from ${clubName}`,
} as const

// ─── Navigation paths ─────────────────────────────────────────────────────────

export const PATHS = {
  HOME: '/',
  LOGIN: '/login',
  SIGNUP: '/signup',
  FORGOT_PASSWORD: '/forgot-password',
  DASHBOARD: '/dashboard',
  SETTINGS: '/settings',
  CHAIR: '/chair',
  CLUB_PUBLIC: (slug: string) => `/clubs/${slug}`,
} as const
