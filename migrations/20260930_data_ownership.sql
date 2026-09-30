-- Apply after the source rescue's exact row counts and user fields have been verified.
-- This migration adds ownership metadata; it never deletes or reallocates unknown records.
ALTER TABLE public.upload_docs ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE public.upload_docs ADD COLUMN IF NOT EXISTS storage_key text;
ALTER TABLE public.hands_on_notebooks ADD COLUMN IF NOT EXISTS user_id text;
CREATE INDEX IF NOT EXISTS upload_docs_user_idx ON public.upload_docs(user_id);
CREATE INDEX IF NOT EXISTS hands_on_notebooks_user_idx ON public.hands_on_notebooks(user_id);

-- Infer an upload's owner only when exactly one imported account's lesson references it.
WITH proven AS (
  SELECT d.id, min(u.id::text) AS user_id
  FROM public.upload_docs d
  JOIN public.lessons l ON (CASE WHEN jsonb_typeof(l.upload_ids)='array' THEN l.upload_ids ELSE '[]'::jsonb END) ? d.id
  JOIN public.users u ON u.id::text=l.user_id
  GROUP BY d.id HAVING count(DISTINCT u.id)=1
)
UPDATE public.upload_docs d SET user_id=p.user_id FROM proven p WHERE d.id=p.id AND d.user_id IS NULL;

-- A private notebook is available only to its source lesson's preserved account.
UPDATE public.hands_on_notebooks n SET user_id=u.id::text
FROM public.lessons l JOIN public.users u ON u.id::text=l.user_id
WHERE l.id::text=n.lesson_id AND n.user_id IS NULL;
