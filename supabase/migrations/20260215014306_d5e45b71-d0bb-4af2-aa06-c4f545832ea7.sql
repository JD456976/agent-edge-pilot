
-- Part 1A: Add outcome columns to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS converted_at timestamptz NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lost_at timestamptz NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS outcome_note text NULL;

-- Part 1B: Add outcome columns to deals
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS closed_at timestamptz NULL;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS cancelled_at timestamptz NULL;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS outcome_note text NULL;

-- Part 1C: Add completion_note to tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completion_note text NULL;

-- Part 2: Create scoring_preferences table
CREATE TABLE IF NOT EXISTS public.scoring_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  inactivity_3d_points int NOT NULL DEFAULT 20,
  inactivity_7d_points int NOT NULL DEFAULT 40,
  closing_7d_points int NOT NULL DEFAULT 20,
  closing_3d_points int NOT NULL DEFAULT 30,
  milestone_points int NOT NULL DEFAULT 20,
  drift_conflict_points int NOT NULL DEFAULT 30,
  lead_hot_points int NOT NULL DEFAULT 30,
  lead_warm_points int NOT NULL DEFAULT 15,
  lead_new_48h_points int NOT NULL DEFAULT 20,
  engagement_points int NOT NULL DEFAULT 15,
  gap_2d_points int NOT NULL DEFAULT 15,
  gap_5d_points int NOT NULL DEFAULT 25,
  drift_new_lead_points int NOT NULL DEFAULT 20,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scoring_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own scoring preferences"
  ON public.scoring_preferences FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
