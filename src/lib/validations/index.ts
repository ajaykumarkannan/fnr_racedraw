'use server'

import { z } from 'zod'
import { TIMEZONES } from '@/lib/constants'

// Valid IANA timezone values from our supported list
const VALID_TIMEZONES = TIMEZONES.map((tz) => tz.value)

// ─── Club ────────────────────────────────────────────────────────────────────

export const ClubSchema = z.object({
  name: z
    .string()
    .min(2, 'Club name must be at least 2 characters')
    .max(100, 'Club name must be at most 100 characters'),
  timezone: z
    .string()
    .refine((tz) => VALID_TIMEZONES.includes(tz), 'Must be a valid IANA timezone'),
})

export const ClubUpdateSchema = z.object({
  name: z
    .string()
    .min(2, 'Club name must be at least 2 characters')
    .max(100, 'Club name must be at most 100 characters')
    .optional(),
  timezone: z
    .string()
    .refine((tz) => VALID_TIMEZONES.includes(tz), 'Must be a valid IANA timezone')
    .optional(),
  max_boats_per_race: z.number().int().min(1).max(100).nullable().optional(),
})

// ─── Season ───────────────────────────────────────────────────────────────────

export const SeasonSchema = z.object({
  name: z
    .string()
    .min(1, 'Season name is required')
    .max(100, 'Season name must be at most 100 characters'),
  year: z
    .number()
    .int()
    .min(2020, 'Year must be 2020 or later')
    .max(2030, 'Year must be 2030 or earlier'),
})

// ─── Race Event ───────────────────────────────────────────────────────────────

export const RaceEventSchema = z.object({
  date: z
    .string()
    .refine((val) => {
      // Parse as local date (YYYY-MM-DD). We use getUTCDay since the string
      // represents a calendar date, not a moment in time.
      const d = new Date(val + 'T00:00:00Z')
      return d.getUTCDay() === 5 // 5 = Friday
    }, 'Race date must be a Friday'),
})

export const RaceEventUpdateSchema = z.object({
  notes: z.string().max(1000).nullable().optional(),
  max_boats_override: z.number().int().min(1).max(100).nullable().optional(),
})

// ─── Registration ─────────────────────────────────────────────────────────────

export const RegistrationSchema = z.object({
  primary_role: z.enum(['helm', 'crew']),
  accept_other_role: z.boolean(),
})

// ─── Inferred types ───────────────────────────────────────────────────────────

export type ClubInput = z.infer<typeof ClubSchema>
export type ClubUpdateInput = z.infer<typeof ClubUpdateSchema>
export type SeasonInput = z.infer<typeof SeasonSchema>
export type RaceEventInput = z.infer<typeof RaceEventSchema>
export type RaceEventUpdateInput = z.infer<typeof RaceEventUpdateSchema>
export type RegistrationInput = z.infer<typeof RegistrationSchema>
