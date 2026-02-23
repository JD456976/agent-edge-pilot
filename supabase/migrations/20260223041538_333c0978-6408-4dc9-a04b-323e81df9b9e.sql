
-- Add agent_role column to open_houses (listing_agent or facilitator)
ALTER TABLE public.open_houses 
ADD COLUMN agent_role text NOT NULL DEFAULT 'listing_agent';
