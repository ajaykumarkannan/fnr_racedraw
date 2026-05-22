// Database types for FNR RaceDraw
// These match the Supabase PostgreSQL schema

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ─── Row types (what you get from SELECT) ───────────────────────────────────

export interface Profile {
  id: string
  name: string
  phone: string
  email: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface Club {
  id: string
  name: string
  name_lower: string
  slug: string
  timezone: string
  max_boats_per_race: number | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface ClubMember {
  id: string
  user_id: string
  club_id: string
  role: 'member' | 'race_chair'
  joined_at: string
}

export interface Season {
  id: string
  club_id: string
  name: string
  year: number
  is_active: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export interface RaceEvent {
  id: string
  season_id: string
  club_id: string
  race_date: string
  draw_time: string
  status: 'upcoming' | 'draw_complete' | 'cancelled' | 'race_day_cancelled'
  max_boats_override: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface RaceRegistration {
  id: string
  user_id: string
  race_event_id: string
  primary_role: 'helm' | 'crew'
  accept_other_role: boolean
  overflow_priority: number
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

export interface DrawResult {
  id: string
  race_event_id: string
  helm_user_id: string
  crew_user_id: string
  helm_played_non_primary: boolean
  crew_played_non_primary: boolean
  boat_number: number
  created_at: string
}

export interface OverflowRecord {
  id: string
  user_id: string
  race_event_id: string
  club_id: string
  primary_role: 'helm' | 'crew'
  accept_other_role: boolean
  priority_at_draw: number
  reason: 'unmatched' | 'boat_limit' | 'no_pair_available'
  created_at: string
}

// ─── Insert types (for INSERT operations) ────────────────────────────────────

export interface ProfileInsert {
  id: string
  name: string
  phone: string
  email: string
  deleted_at?: string | null
}

export interface ClubInsert {
  name: string
  slug: string
  timezone: string
  max_boats_per_race?: number | null
  created_by: string
}

export interface ClubMemberInsert {
  user_id: string
  club_id: string
  role?: 'member' | 'race_chair'
}

export interface SeasonInsert {
  club_id: string
  name: string
  year: number
  is_active?: boolean
  created_by: string
}

export interface RaceEventInsert {
  season_id: string
  club_id: string
  race_date: string
  draw_time: string
  status?: 'upcoming' | 'draw_complete' | 'cancelled' | 'race_day_cancelled'
  max_boats_override?: number | null
  notes?: string | null
}

export interface RaceRegistrationInsert {
  user_id: string
  race_event_id: string
  primary_role: 'helm' | 'crew'
  accept_other_role?: boolean
  overflow_priority?: number
  cancelled_at?: string | null
}

export interface DrawResultInsert {
  race_event_id: string
  helm_user_id: string
  crew_user_id: string
  helm_played_non_primary?: boolean
  crew_played_non_primary?: boolean
  boat_number: number
}

export interface OverflowRecordInsert {
  user_id: string
  race_event_id: string
  club_id: string
  primary_role: 'helm' | 'crew'
  accept_other_role: boolean
  priority_at_draw: number
  reason?: 'unmatched' | 'boat_limit' | 'no_pair_available'
}

// ─── Update types (for UPDATE operations) ────────────────────────────────────

export type ProfileUpdate = Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at' | 'name_lower'>>
export type ClubUpdate = Partial<Omit<Club, 'id' | 'created_at' | 'updated_at' | 'name_lower' | 'created_by'>>
export type ClubMemberUpdate = Partial<Pick<ClubMember, 'role'>>
export type SeasonUpdate = Partial<Omit<Season, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'club_id'>>
export type RaceEventUpdate = Partial<Omit<RaceEvent, 'id' | 'created_at' | 'updated_at' | 'season_id' | 'club_id'>>
export type RaceRegistrationUpdate = Partial<Pick<RaceRegistration, 'primary_role' | 'accept_other_role' | 'cancelled_at'>>

// ─── Joined / enriched types ─────────────────────────────────────────────────

export interface RaceEventWithClub extends RaceEvent {
  club: Club
}

export interface RaceEventWithSeason extends RaceEvent {
  season: Season
}

export interface RaceEventFull extends RaceEvent {
  club: Club
  season: Season
}

export interface ClubMemberWithProfile extends ClubMember {
  profile: Profile
}

export interface ClubMemberWithClub extends ClubMember {
  club: Club
}

export interface RegistrationWithProfile extends RaceRegistration {
  profile: Profile
}

export interface RegistrationWithRaceEvent extends RaceRegistration {
  race_event: RaceEvent
}

export interface RegistrationFull extends RaceRegistration {
  profile: Profile
  race_event: RaceEvent & { club: Club }
}

export interface DrawResultWithProfiles extends DrawResult {
  helm: Profile
  crew: Profile
}

export interface DrawResultFull extends DrawResult {
  helm: Profile
  crew: Profile
  race_event: RaceEvent & { club: Club }
}

export interface OverflowRecordWithProfile extends OverflowRecord {
  profile: Profile
}

// ─── Database schema type for Supabase client ────────────────────────────────

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: ProfileInsert
        Update: ProfileUpdate
        Relationships: { foreignKeyName: string; columns: string[]; isOneToOne?: boolean; referencedRelation: string; referencedColumns: string[] }[]
      }
      clubs: {
        Row: Club
        Insert: ClubInsert
        Update: ClubUpdate
        Relationships: { foreignKeyName: string; columns: string[]; isOneToOne?: boolean; referencedRelation: string; referencedColumns: string[] }[]
      }
      club_members: {
        Row: ClubMember
        Insert: ClubMemberInsert
        Update: ClubMemberUpdate
        Relationships: { foreignKeyName: string; columns: string[]; isOneToOne?: boolean; referencedRelation: string; referencedColumns: string[] }[]
      }
      seasons: {
        Row: Season
        Insert: SeasonInsert
        Update: SeasonUpdate
        Relationships: { foreignKeyName: string; columns: string[]; isOneToOne?: boolean; referencedRelation: string; referencedColumns: string[] }[]
      }
      race_events: {
        Row: RaceEvent
        Insert: RaceEventInsert
        Update: RaceEventUpdate
        Relationships: { foreignKeyName: string; columns: string[]; isOneToOne?: boolean; referencedRelation: string; referencedColumns: string[] }[]
      }
      race_registrations: {
        Row: RaceRegistration
        Insert: RaceRegistrationInsert
        Update: RaceRegistrationUpdate
        Relationships: { foreignKeyName: string; columns: string[]; isOneToOne?: boolean; referencedRelation: string; referencedColumns: string[] }[]
      }
      draw_results: {
        Row: DrawResult
        Insert: DrawResultInsert
        Update: Partial<DrawResultInsert>
        Relationships: { foreignKeyName: string; columns: string[]; isOneToOne?: boolean; referencedRelation: string; referencedColumns: string[] }[]
      }
      overflow_records: {
        Row: OverflowRecord
        Insert: OverflowRecordInsert
        Update: Partial<OverflowRecordInsert>
        Relationships: { foreignKeyName: string; columns: string[]; isOneToOne?: boolean; referencedRelation: string; referencedColumns: string[] }[]
      }
    }
    Views: {
      [key: string]: {
        Row: Record<string, unknown>
        Relationships: { foreignKeyName: string; columns: string[]; isOneToOne?: boolean; referencedRelation: string; referencedColumns: string[] }[]
      }
    }
    Functions: {
      compute_overflow_priority: {
        Args: {
          p_user_id: string
          p_club_id: string
          p_target_race_date: string
        }
        Returns: number
      }
    }
    Enums: Record<string, never>
  }
}
