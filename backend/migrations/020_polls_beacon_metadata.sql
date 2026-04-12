-- Migration 020: BEACON protocol metadata fields
-- Adds confidence_metadata and audit_trail to polls table for BEACON system integration.
-- confidence_metadata: stores beacon_idea_id, confidence_score, source_ids, verifier_notes
-- audit_trail:         stores approval_chain (append-only, never overwritten)

ALTER TABLE public.polls
  ADD COLUMN IF NOT EXISTS confidence_metadata JSONB,
  ADD COLUMN IF NOT EXISTS audit_trail         JSONB;

COMMENT ON COLUMN public.polls.confidence_metadata IS
  'BEACON confidence score and provenance. confidence_score must be >=70 to pass validation.';
COMMENT ON COLUMN public.polls.audit_trail IS
  'Append-only approval chain from BEACON agents. {approval_chain: [{agent, status, timestamp}]}';
