-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Clubs table
CREATE TABLE public.clubs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  name_lower TEXT NOT NULL GENERATED ALWAYS AS (lower(name)) STORED,
  slug TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  max_boats_per_race INTEGER NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(name),
  UNIQUE(slug)
);
CREATE INDEX idx_clubs_name_lower ON public.clubs(name_lower);

-- Club members
CREATE TABLE public.club_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'race_chair')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, club_id)
);
CREATE INDEX idx_club_members_club_id ON public.club_members(club_id);
CREATE INDEX idx_club_members_user_id ON public.club_members(user_id);

-- Seasons
CREATE TABLE public.seasons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  year INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX one_active_season_per_club ON public.seasons (club_id) WHERE is_active = true;
CREATE INDEX idx_seasons_club_id ON public.seasons(club_id);

-- Race events
CREATE TABLE public.race_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs(id),
  race_date DATE NOT NULL,
  draw_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'draw_complete', 'cancelled', 'race_day_cancelled')),
  max_boats_override INTEGER NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(club_id, race_date)
);
CREATE INDEX idx_race_events_club_id ON public.race_events(club_id);
CREATE INDEX idx_race_events_season_id ON public.race_events(season_id);
CREATE INDEX idx_race_events_draw_time ON public.race_events(draw_time);

-- Race registrations
CREATE TABLE public.race_registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  race_event_id UUID NOT NULL REFERENCES public.race_events(id) ON DELETE CASCADE,
  primary_role TEXT NOT NULL CHECK (primary_role IN ('helm', 'crew')),
  accept_other_role BOOLEAN NOT NULL DEFAULT false,
  overflow_priority INTEGER NOT NULL DEFAULT 0,
  cancelled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, race_event_id)
);
CREATE INDEX idx_race_registrations_race_event_id ON public.race_registrations(race_event_id);
CREATE INDEX idx_race_registrations_user_id ON public.race_registrations(user_id);

-- Draw results
CREATE TABLE public.draw_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  race_event_id UUID NOT NULL REFERENCES public.race_events(id) ON DELETE RESTRICT,
  helm_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  crew_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  helm_played_non_primary BOOLEAN NOT NULL DEFAULT false,
  crew_played_non_primary BOOLEAN NOT NULL DEFAULT false,
  boat_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(race_event_id, helm_user_id),
  UNIQUE(race_event_id, crew_user_id)
);
CREATE INDEX idx_draw_results_race_event_id ON public.draw_results(race_event_id);

-- Overflow records
CREATE TABLE public.overflow_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  race_event_id UUID NOT NULL REFERENCES public.race_events(id) ON DELETE RESTRICT,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE RESTRICT,
  primary_role TEXT NOT NULL CHECK (primary_role IN ('helm', 'crew')),
  accept_other_role BOOLEAN NOT NULL,
  priority_at_draw INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT 'unmatched' CHECK (reason IN ('unmatched', 'boat_limit', 'no_pair_available')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, race_event_id)
);
CREATE INDEX idx_overflow_records_user_id ON public.overflow_records(user_id);
CREATE INDEX idx_overflow_records_club_id ON public.overflow_records(club_id);

-- Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.race_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.race_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overflow_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Profiles
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Service role full access profiles" ON public.profiles FOR ALL USING (auth.role() = 'service_role');

-- Clubs: anyone can read, authenticated users can create
CREATE POLICY "Anyone can view clubs" ON public.clubs FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create clubs" ON public.clubs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Race chairs can update their club" ON public.clubs FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.club_members WHERE club_id = id AND user_id = auth.uid() AND role = 'race_chair')
);

-- Club members: readable by all, managed by race chairs
CREATE POLICY "Anyone can view club members" ON public.club_members FOR SELECT USING (true);
CREATE POLICY "Users can join clubs" ON public.club_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave clubs" ON public.club_members FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Race chairs can manage members" ON public.club_members FOR ALL USING (
  EXISTS (SELECT 1 FROM public.club_members cm2 WHERE cm2.club_id = club_id AND cm2.user_id = auth.uid() AND cm2.role = 'race_chair')
);

-- Seasons
CREATE POLICY "Anyone can view seasons" ON public.seasons FOR SELECT USING (true);
CREATE POLICY "Race chairs can manage seasons" ON public.seasons FOR ALL USING (
  EXISTS (SELECT 1 FROM public.club_members WHERE club_id = seasons.club_id AND user_id = auth.uid() AND role = 'race_chair')
);

-- Race events
CREATE POLICY "Anyone can view race events" ON public.race_events FOR SELECT USING (true);
CREATE POLICY "Race chairs can manage race events" ON public.race_events FOR ALL USING (
  EXISTS (SELECT 1 FROM public.club_members WHERE club_id = race_events.club_id AND user_id = auth.uid() AND role = 'race_chair')
);

-- Race registrations
CREATE POLICY "Users can view registrations for their clubs" ON public.race_registrations FOR SELECT USING (
  user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.club_members cm
    JOIN public.race_events re ON re.id = race_event_id
    WHERE cm.club_id = re.club_id AND cm.user_id = auth.uid())
);
CREATE POLICY "Users can manage own registrations" ON public.race_registrations FOR ALL USING (auth.uid() = user_id);

-- Draw results and overflow: readable by club members
CREATE POLICY "Club members can view draw results" ON public.draw_results FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.club_members cm
    JOIN public.race_events re ON re.id = race_event_id
    WHERE cm.club_id = re.club_id AND cm.user_id = auth.uid())
);
CREATE POLICY "Club members can view overflow" ON public.overflow_records FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.club_members WHERE club_id = overflow_records.club_id AND user_id = auth.uid())
);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_clubs_updated_at BEFORE UPDATE ON public.clubs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_seasons_updated_at BEFORE UPDATE ON public.seasons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_race_events_updated_at BEFORE UPDATE ON public.race_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_race_registrations_updated_at BEFORE UPDATE ON public.race_registrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Function to automatically create a profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, phone, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.email, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to compute overflow priority for a user registering for a race
CREATE OR REPLACE FUNCTION public.compute_overflow_priority(
  p_user_id UUID,
  p_club_id UUID,
  p_target_race_date DATE
)
RETURNS INTEGER AS $$
BEGIN
  RETURN COALESCE(
    (
      SELECT or_.priority_at_draw + 1
      FROM public.overflow_records or_
      JOIN public.race_events re ON re.id = or_.race_event_id
      JOIN public.seasons s ON s.id = re.season_id
      WHERE or_.user_id = p_user_id
        AND or_.club_id = p_club_id
        AND s.is_active = true
        AND NOT EXISTS (
          SELECT 1
          FROM public.draw_results dr
          JOIN public.race_events re2 ON re2.id = dr.race_event_id
          JOIN public.seasons s2 ON s2.id = re2.season_id
          WHERE s2.club_id = p_club_id
            AND s2.is_active = true
            AND (dr.helm_user_id = p_user_id OR dr.crew_user_id = p_user_id)
            AND re2.race_date > re.race_date
            AND re2.race_date < p_target_race_date
        )
      ORDER BY re.race_date DESC
      LIMIT 1
    ),
    0
  );
END;
$$ LANGUAGE plpgsql;
