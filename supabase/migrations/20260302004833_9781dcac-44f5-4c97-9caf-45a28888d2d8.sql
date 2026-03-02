-- Prevent the same FUB task from ever being imported twice
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_imported_from_unique
  ON public.tasks(assigned_to_user_id, imported_from)
  WHERE imported_from IS NOT NULL;