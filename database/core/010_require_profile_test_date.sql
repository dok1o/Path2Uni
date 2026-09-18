ALTER TABLE profile_tests
  ADD CONSTRAINT profile_tests_status_date_required
  CHECK (
    (status = 'planned' AND planned_date IS NOT NULL AND test_date IS NULL)
    OR
    (status IN ('completed', 'mock') AND test_date IS NOT NULL AND planned_date IS NULL)
  ) NOT VALID;
