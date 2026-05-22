import { createClient } from '@supabase/supabase-js'

interface Club {
  id: string
  name: string
}

interface ClubInsert {
  name: string
}

interface Database {
  public: {
    Tables: {
      clubs: {
        Row: Club
        Insert: ClubInsert
        Update: Partial<ClubInsert>
        Relationships: { foreignKeyName: string; columns: string[]; referencedRelation: string; referencedColumns: string[] }[]
      }
    }
    Views: {
      [key: string]: {
        Row: Record<string, unknown>
        Relationships: { foreignKeyName: string; columns: string[]; referencedRelation: string; referencedColumns: string[] }[]
      }
    }
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>
    Enums: Record<string, never>
  }
}

const supabase = createClient<Database>('url', 'key')
const x = supabase.from('clubs').insert({ name: 'test' } as never)
