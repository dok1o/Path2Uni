BEGIN;

CREATE TYPE exam_status AS ENUM ('completed', 'planned');

ALTER TABLE profile_tests
  ADD COLUMN test_name text,
  ADD COLUMN status exam_status NOT NULL DEFAULT 'completed';

COMMIT;

