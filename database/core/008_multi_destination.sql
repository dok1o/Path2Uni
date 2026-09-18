-- More than one destination country per applicant.
--
-- 005 deliberately allowed exactly one ("a person with two destinations is a later problem").
-- It is now that later problem: an applicant choosing between Germany, the Netherlands and
-- Poland is the normal case, not the exception, and a shortlist drawn from a single country
-- cannot show them the trade-off they are actually making.
--
-- `target_country_code` stays, and stays the FIRST element of the array. It carries the index
-- that 005 created, it is what a plan is anchored to (a roadmap is written for one admission
-- system at a time), and keeping it in sync means nothing that already reads it has to change.
-- The array is the addition, not the replacement.

ALTER TABLE applicant_profiles
  ADD COLUMN target_countries char(2)[] NOT NULL DEFAULT '{}';

-- Existing profiles have one destination; it becomes a one-element list.
UPDATE applicant_profiles
   SET target_countries = ARRAY[target_country_code]
 WHERE target_country_code IS NOT NULL;

-- Four is a working limit, not a technical one: past that the comparison step stops being a
-- comparison. Empty is allowed only for a profile that has no destination at all yet.
ALTER TABLE applicant_profiles
  ADD CONSTRAINT applicant_profiles_countries_sane
  CHECK (cardinality(target_countries) <= 4),
  -- The head of the array and the scalar column are one fact stored twice, so the database
  -- enforces that they agree rather than trusting every future writer to remember.
  ADD CONSTRAINT applicant_profiles_primary_country_matches
  CHECK (
    cardinality(target_countries) = 0
    OR target_country_code = target_countries[1]
  );

CREATE INDEX idx_profiles_countries ON applicant_profiles USING gin (target_countries);

COMMENT ON COLUMN applicant_profiles.target_countries IS
  'Destinations in preference order. target_countries[1] equals target_country_code by constraint.';
