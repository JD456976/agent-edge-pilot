-- Enable realtime for open_house_visitors so we can stream live sign-ins
ALTER PUBLICATION supabase_realtime ADD TABLE public.open_house_visitors;