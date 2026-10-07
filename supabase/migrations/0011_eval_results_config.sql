-- 0011_eval_results_config.sql
--
-- Which layer configuration produced a result row.
--
-- The suite runs each question under up to 8 configs (baseline, +gate,
-- +citation, +claims), so (run_id, question_id) alone is ambiguous: four
-- rows share it and nothing in the schema says which layers were on.
-- eval_runs.config holds the plan; every result now carries its slice of
-- it, which is what makes the per-config table and the ConfigBadge in
-- the UI answerable questions.
--
-- No default: the runner always writes the config it ran, and
-- eval_results is empty everywhere (run_evals could never execute —
-- the worker image could not import the code it runs, fixed in this
-- branch — so there are no legacy rows to backfill).

alter table public.eval_results
    add column config text not null;
