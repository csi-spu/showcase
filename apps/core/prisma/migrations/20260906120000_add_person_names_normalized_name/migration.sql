ALTER TABLE private.person_names
  ADD COLUMN normalized_name text
  GENERATED ALWAYS AS (
    lower(regexp_replace(normalize(btrim(first_name_th || ' ' || last_name_th), NFKC), '[[:space:]]+', ' ', 'g'))
  ) STORED;

CREATE INDEX person_names_normalized_name_idx
  ON private.person_names USING btree (normalized_name);
