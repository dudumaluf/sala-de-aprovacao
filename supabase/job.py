#!/usr/bin/env python3
"""Print schema.sql for one job inside a Supabase project shared by several jobs.

Usage: python3 supabase/job.py <schema> <job> <bucket> > job.sql

Each job gets its own schema (tables, rules and functions) and its own bucket. Its two logins carry
app_metadata.job = <job> and app_metadata.room = 'time' | 'cliente' instead of .side, so a login of one job opens
nothing in another. Run the output once in the SQL Editor; it also opens the schema to the API. In config.js set
SCHEMA, BUCKET and JOB to the same three names.
"""
import re
import sys
from pathlib import Path

schema, job, bucket = sys.argv[1:4]
assert re.fullmatch(r"[a-z_][a-z0-9_]{0,62}", schema) and schema != "public", "schema: a lowercase name other than public"
assert re.fullmatch(r"[a-z_][a-z0-9_]{0,62}", job), "job: a lowercase name"
assert re.fullmatch(r"[a-z0-9_-]{1,63}", bucket), "bucket: a lowercase name"

sql = (Path(__file__).parent / "schema.sql").read_text()
# the studio's API key is read from public (one key for the whole project): it is not part of a job
start = sql.index("-- ---------- the studio's API key")
sql = sql[:start] + sql[sql.index("-- Supabase grants new functions"):]
sql = "\n".join(l for l in sql.splitlines() if "estudio_hf_key" not in l) + "\n"

# who is signed in: the job's own logins only
old_side = "select coalesce(auth.jwt() -> 'app_metadata' ->> 'side', '')"
assert sql.count(old_side) == 1
sql = sql.replace(old_side, f"select case when auth.jwt() -> 'app_metadata' ->> 'job' = '{job}'\n"
                            "              then coalesce(auth.jwt() -> 'app_metadata' ->> 'room', '') else '' end")
# every object lives in the job's schema ("from public, anon" is the PUBLIC role, not the schema: no dot after it)
sql = sql.replace("public.", f"{schema}.")
sql = re.sub(r"(?<![\w.])(is_team|is_client)\(\)", rf"{schema}.\1()", sql)

# the job's bucket, with its own policy names (another schema of the same job may already have policies on it)
sql = sql.replace("values ('media', 'media', false", f"values ('{bucket}', '{bucket}', false")
sql = sql.replace("bucket_id = 'media'", f"bucket_id = '{bucket}'")
sql = re.sub(r"create policy media_(select|insert|delete)", rf"create policy {schema}_files_\1", sql)

head = f"""-- Job '{job}': schema {schema}, bucket {bucket}. Made by supabase/job.py from schema.sql.
create schema if not exists {schema};
"""
tail = f"""
-- ---------- the API ----------
-- A schema other than public is closed to the API until it is granted and exposed. The rules above still decide which
-- rows each login sees.
grant usage on schema {schema} to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema {schema} to authenticated;
grant all on all tables in schema {schema} to service_role;
do $$
declare cur text := coalesce((select substring(c from 'pgrst.db_schemas=(.*)') from pg_roles, unnest(rolconfig) c
                              where rolname = 'authenticator' and c like 'pgrst.db_schemas=%'), 'public, graphql_public');
begin
  if not '{schema}' = any (string_to_array(replace(cur, ' ', ''), ',')) then
    execute format('alter role authenticator set pgrst.db_schemas = %L', cur || ', {schema}');
  end if;
end $$;
notify pgrst, 'reload config';
"""
sys.stdout.write(head + sql + tail)
