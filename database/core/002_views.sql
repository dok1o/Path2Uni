CREATE VIEW v_program_total_cost AS
SELECT
  program_id,
  academic_year,
  currency,
  sum(amount) FILTER (WHERE mandatory) AS mandatory_total,
  sum(amount) AS estimated_total
FROM cost_items
GROUP BY program_id, academic_year, currency;

CREATE VIEW v_admission_funnel AS
SELECT
  cycle_id,
  segment,
  applicants,
  admitted,
  enrolled,
  CASE WHEN applicants > 0 THEN admitted::numeric / applicants END AS acceptance_rate,
  CASE WHEN admitted > 0 THEN enrolled::numeric / admitted END AS yield_rate
FROM admission_statistics;

CREATE VIEW v_next_roadmap_action AS
SELECT DISTINCT ON (roadmap_id)
  roadmap_id,
  id AS task_id,
  title,
  due_at,
  priority,
  status
FROM roadmap_tasks
WHERE status IN ('todo', 'in_progress')
ORDER BY roadmap_id, priority ASC, due_at ASC NULLS LAST;

