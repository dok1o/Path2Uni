-- Applicant test results: which exams are taken or planned, and the score.
--
-- Renumbered from 004 on merge: 004_auth_hardening.sql already existed on the other branch.
-- The init scripts are applied in filename order, so two files sharing a number leaves the
-- order to chance, and an ALTER that lands before the table it depends on fails the boot.

BEGIN;

CREATE TYPE exam_status AS ENUM ('completed', 'planned');

ALTER TABLE profile_tests
  ADD COLUMN test_name text,
  ADD COLUMN status exam_status NOT NULL DEFAULT 'completed';

COMMIT;

