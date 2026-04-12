-- Backfill email_primary from notes where it contains "Email: xxx"
UPDATE public.leads
SET email_primary = trim(substring(notes FROM 'Email:\s*([^\n,]+)'))
WHERE email_primary IS NULL
  AND notes IS NOT NULL
  AND notes ~ 'Email:\s*\S+';

-- Backfill phone_primary from notes where it contains "Phone: xxx"
UPDATE public.leads
SET phone_primary = trim(substring(notes FROM 'Phone:\s*([^\n,]+)'))
WHERE phone_primary IS NULL
  AND notes IS NOT NULL
  AND notes ~ 'Phone:\s*\S+';