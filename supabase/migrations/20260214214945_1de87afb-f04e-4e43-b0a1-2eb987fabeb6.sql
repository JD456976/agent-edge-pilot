
-- ══════════════════════════════════════════════════════════
-- Deal Pilot: Full Schema — Organizations, Teams, Deals, etc.
-- ══════════════════════════════════════════════════════════

-- ── Enums ────────────────────────────────────────────────
CREATE TYPE public.app_role AS ENUM ('admin', 'agent', 'reviewer', 'beta');
CREATE TYPE public.team_role AS ENUM ('leader', 'agent', 'isa', 'admin');
CREATE TYPE public.participant_role AS ENUM ('primary_agent', 'co_agent', 'referral_partner', 'showing_agent');
CREATE TYPE public.deal_stage AS ENUM ('offer', 'offer_accepted', 'pending', 'closed');
CREATE TYPE public.risk_level AS ENUM ('green', 'yellow', 'red');
CREATE TYPE public.task_type AS ENUM ('call', 'text', 'email', 'showing', 'follow_up', 'closing', 'open_house', 'thank_you');
CREATE TYPE public.alert_type AS ENUM ('speed', 'urgent', 'risk', 'opportunity');
CREATE TYPE public.lead_temperature AS ENUM ('cold', 'warm', 'hot');

-- ── Profiles ─────────────────────────────────────────────
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  theme_preference TEXT NOT NULL DEFAULT 'dark',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ── User Roles ───────────────────────────────────────────
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ── Security Definer for role checks ─────────────────────
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- ── Organizations ────────────────────────────────────────
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ── Teams ────────────────────────────────────────────────
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  team_leader_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- ── Team Members ─────────────────────────────────────────
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role team_role NOT NULL DEFAULT 'agent',
  default_split_percent NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- ── Leads ────────────────────────────────────────────────
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  last_contact_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  engagement_score INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  status_tags TEXT[] DEFAULT '{}',
  assigned_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ,
  lead_temperature lead_temperature DEFAULT 'cold',
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- ── Deals ────────────────────────────────────────────────
CREATE TABLE public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  stage deal_stage NOT NULL DEFAULT 'offer',
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_rate NUMERIC(5,4),
  commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  referral_fee_percent NUMERIC(5,2) DEFAULT 0,
  close_date TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  risk_level risk_level NOT NULL DEFAULT 'green',
  assigned_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_touched_at TIMESTAMPTZ,
  risk_flags TEXT[] DEFAULT '{}',
  milestone_inspection TEXT DEFAULT 'unknown',
  milestone_financing TEXT DEFAULT 'unknown',
  milestone_appraisal TEXT DEFAULT 'unknown',
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL
);
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

-- ── Deal Participants ────────────────────────────────────
CREATE TABLE public.deal_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role participant_role NOT NULL DEFAULT 'primary_agent',
  split_percent NUMERIC(5,2) NOT NULL DEFAULT 100,
  commission_override NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deal_id, user_id)
);
ALTER TABLE public.deal_participants ENABLE ROW LEVEL SECURITY;

-- ── Tasks ────────────────────────────────────────────────
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  type task_type NOT NULL DEFAULT 'follow_up',
  due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  related_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  related_deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  assigned_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- ── Alerts ───────────────────────────────────────────────
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type alert_type NOT NULL DEFAULT 'speed',
  title TEXT NOT NULL,
  detail TEXT DEFAULT '',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  related_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  related_deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════
-- RLS Policies
-- ══════════════════════════════════════════════════════════

-- Profiles: users see own, admins see all
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- User Roles: users see own, admins manage all
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Organizations: members can view, admins manage
CREATE POLICY "Authenticated can view orgs" ON public.organizations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage orgs" ON public.organizations
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Teams: members can view, admins manage
CREATE POLICY "Authenticated can view teams" ON public.teams
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage teams" ON public.teams
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Team Members: viewable by team, managed by admins
CREATE POLICY "Authenticated can view team members" ON public.team_members
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage team members" ON public.team_members
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Leads: assigned user or admin
CREATE POLICY "Users can view assigned leads" ON public.leads
  FOR SELECT TO authenticated USING (assigned_to_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can manage assigned leads" ON public.leads
  FOR ALL TO authenticated USING (assigned_to_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Deals: assigned user, participants, or admin
CREATE POLICY "Users can view deals" ON public.deals
  FOR SELECT TO authenticated USING (
    assigned_to_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.deal_participants dp WHERE dp.deal_id = id AND dp.user_id = auth.uid())
  );
CREATE POLICY "Users can manage assigned deals" ON public.deals
  FOR ALL TO authenticated USING (assigned_to_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Deal Participants: viewable by deal participants, managed by deal owner or admin
CREATE POLICY "Users can view deal participants" ON public.deal_participants
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND d.assigned_to_user_id = auth.uid())
  );
CREATE POLICY "Deal owners can manage participants" ON public.deal_participants
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND d.assigned_to_user_id = auth.uid())
  );

-- Tasks: assigned user or admin
CREATE POLICY "Users can view assigned tasks" ON public.tasks
  FOR SELECT TO authenticated USING (assigned_to_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can manage assigned tasks" ON public.tasks
  FOR ALL TO authenticated USING (assigned_to_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Alerts: viewable by all authenticated, managed by admin
CREATE POLICY "Authenticated can view alerts" ON public.alerts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage alerts" ON public.alerts
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert alerts" ON public.alerts
  FOR INSERT TO authenticated WITH CHECK (true);

-- ══════════════════════════════════════════════════════════
-- Triggers & Functions
-- ══════════════════════════════════════════════════════════

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.email, '')
  );
  -- Default role: agent
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'agent');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
