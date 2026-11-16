"""Join-burst race test: 400 learners press Join at the same moment from 80 parallel connections.
The interactive seats (set to 100) must never be overfilled. Run after run_db_tests.sh (uses its database).
Usage: python3 supabase/tests/seat_race_test.py "host=/tmp port=5499 user=postgres dbname=bodhin" """
import sys, json, uuid, time, threading, psycopg2
from concurrent.futures import ThreadPoolExecutor
DSN = sys.argv[1]
adm = psycopg2.connect(DSN); adm.autocommit = True
q = lambda sql, a=None: (lambda c: (c.execute(sql, a), c.fetchall() if c.description else None)[1])(adm.cursor())
T, C, HOST = q("select c.tenant_id, c.id, m.user_id from public.courses c join public.memberships m on m.tenant_id = c.tenant_id and m.role in ('owner','tutor') join public.lessons l on l.course_id = c.id limit 1")[0]
q("update public.feature_flags set live_classes = true where id = 1")
q("update public.platform_config set live_interactive_seats = 100 where id = 1")
S = q("insert into public.live_sessions (tenant_id, course_id, host_id, title, starts_at, ends_at) values (%s,%s,%s,'Race class', now() - interval '1 minute', now() + interval '1 hour') returning id", (T, C, HOST))[0][0]
users = []
for i in range(400):
    u = str(uuid.uuid4()); users.append(u)
    q("insert into auth.users (id, email, raw_user_meta_data) values (%s,%s,%s)", (u, f'race{i}_{u[:6]}@t.in', json.dumps({'name': f'R{i}'})))
    q("insert into public.enrollments (user_id, course_id, tenant_id) values (%s,%s,%s)", (u, C, T))
local = threading.local()
def join(u):
    if not hasattr(local, 'c'):
        local.c = psycopg2.connect(DSN)
    cur = local.c.cursor()
    cur.execute('begin')
    cur.execute("select set_config('role','authenticated',true), set_config('request.jwt.claims',%s,true)", (json.dumps({'sub': u, 'role': 'authenticated'}),))
    cur.execute("select public.live_join_check(%s)", (S,)); r = cur.fetchone()[0]
    cur.execute('commit'); return r['mode']
t0 = time.time()
with ThreadPoolExecutor(80) as ex: modes = list(ex.map(join, users))
dt = time.time() - t0
inter = modes.count('interactive'); db_inter = q("select count(*) from public.live_attendance where session_id=%s and mode='interactive'", (S,))[0][0]
print(f'400 joins in {dt:.2f}s ({400/dt:.0f}/s) → interactive {inter}, broadcast {modes.count("broadcast")}, stored interactive {db_inter}')
q("update public.platform_config set live_interactive_seats = 1000 where id = 1")
ok = inter == 100 and db_inter == 100
print('PASS seats never overfilled under a join burst' if ok else 'FAIL seats overfilled'); sys.exit(0 if ok else 1)
