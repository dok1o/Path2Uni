-- One limit, not three.
--
-- 008 allowed four destinations, the onboarding offered three, and the comparison sheet takes
-- two or three. Three numbers for one product rule is a bug waiting for whoever changes only
-- two of them. Three is the real limit: past that the comparison step stops being a
-- comparison, and the shortlist has too few places per country to say anything.

ALTER TABLE applicant_profiles
  DROP CONSTRAINT applicant_profiles_countries_sane,
  ADD CONSTRAINT applicant_profiles_countries_sane
  CHECK (cardinality(target_countries) <= 3);
