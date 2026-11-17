"""
Database tests for migration 0010 (Nov 16 change request): certificate approval at 75% + quiz, 1:1 mentorship,
course-wide live class notifications, teaching reminders, academy categories, tutors creating courses.
Runs after db_test.py on the same database (own users and academy). Usage: python3 academy_db_test.py "<dsn>"
"""
import sys, json, uuid, psycopg2

conn = psycopg2.connect(sys.argv[1]); conn.autocommit = True
P = F = 0; FAILS = []

def ok(cond, name, extra=None):
    global P, F
    if cond: P += 1
    else: F += 1; FAILS.append(name + (f'  → {extra}' if extra is not None else ''))

def run(sql, args=None, as_user=None, role='authenticated'):
    cur = conn.cursor(); cur.execute('begin')
    try:
        if role:
            cur.execute("select set_config('role', %s, true), set_config('request.jwt.claims', %s, true)", (role, json.dumps({'sub': str(as_user) if as_user else '', 'role': role})))
        cur.execute(sql, args); rows = cur.fetchall() if cur.description else None
        cur.execute('commit'); return rows
    except Exception as e:
        cur.execute('rollback'); raise e

def err(sql, args=None, as_user=None):
    try: run(sql, args, as_user); return None
    except Exception as e: return str(e).split('\n')[0]

def admin(sql, args=None): return run(sql, args, None, None)

def new_user(name):
    uid = str(uuid.uuid4())
    admin("insert into auth.users (id, email, raw_user_meta_data) values (%s, %s, %s)", (uid, f'{uid[:8]}@acad.in', json.dumps({'name': name})))
    return uid

def notes(u, like): return admin("select count(*) from public.notifications where user_id = %s and title ilike %s", (u, like))[0][0]

boss = new_user('Super Admin'); admin("update public.profiles set staff_role = 'super_admin' where id = %s", (boss,))
owner = new_user('Owner Kumar'); tutor = new_user('Tutor Meera'); other_owner = new_user('Other Owner')
l1 = new_user('Learner One'); l2 = new_user('Learner Two'); stranger = new_user('Stranger')
slug = 'acad' + uuid.uuid4().hex[:6]
app = run("select public.submit_application('Acad Test', %s, array['Marketing'], 5, 'Madurai', 100, null)", (slug,), as_user=owner)[0][0]
T = run("select public.approve_educator(%s)", (app,), as_user=boss)[0][0]
app2 = run("select public.submit_application('Other Academy', %s, array['Coding'], 5, 'Chennai', 100, null)", ('oth' + uuid.uuid4().hex[:6],), as_user=other_owner)[0][0]
T2 = run("select public.approve_educator(%s)", (app2,), as_user=boss)[0][0]
admin("insert into public.memberships (user_id, tenant_id, role) values (%s, %s, 'tutor')", (tutor, T))

# ── tutors create courses, owner-only fields ──
TC = run("select public.tutor_create_course(%s, 'Tutor draft')", (T,), as_user=tutor)[0][0]
ok(admin("select count(*) from public.course_tutors where course_id = %s and user_id = %s", (TC, tutor))[0][0] == 1, 'tutor creates a course and is assigned to it')
ok('owner' in (err("update public.courses set price_paise = 99900 where id = %s", (TC,), as_user=tutor) or ''), 'tutor cannot change price')
ok('owner' in (err("update public.courses set status = 'published' where id = %s", (TC,), as_user=tutor) or ''), 'tutor cannot publish')
run("update public.courses set title = 'Tutor course v2' where id = %s", (TC,), as_user=tutor)
ok(admin("select title from public.courses where id = %s", (TC,))[0][0] == 'Tutor course v2', 'tutor can edit content fields')
ok(err("select public.tutor_create_course(%s, 'x')", (T,), as_user=other_owner) is not None, 'outsider cannot create a course in this academy')
run("update public.courses set price_paise = 99900 where id = %s", (TC,), as_user=owner)
ok(admin("select price_paise from public.courses where id = %s", (TC,))[0][0] == 99900, 'owner still sets the price')

# ── course with 4 lessons + a quiz ──
C = run("insert into public.courses (tenant_id, title, price_paise, status) values (%s, 'Ads Mastery', 199900, 'published') returning id", (T,), as_user=owner)[0][0]
M = run("insert into public.modules (course_id, title) values (%s, 'M1') returning id", (C,), as_user=owner)[0][0]
L = [run("insert into public.lessons (module_id, course_id, title, position) values (%s, %s, %s, %s) returning id", (M, C, f'L{i}', i), as_user=owner)[0][0] for i in range(3)]
Q = run("insert into public.lessons (module_id, course_id, title, type, position, pass_pct) values (%s, %s, 'Final quiz', 'quiz', 9, 70) returning id", (M, C), as_user=owner)[0][0]
admin("insert into public.course_tutors (course_id, user_id) values (%s, %s)", (C, tutor))
for u in (l1, l2): admin("insert into public.enrollments (user_id, course_id, tenant_id) values (%s, %s, %s)", (u, C, T))
prog = lambda u, lesson: admin("insert into public.lesson_progress (user_id, lesson_id, course_id, completed) values (%s, %s, %s, true) on conflict (user_id, lesson_id) do update set completed = true", (u, lesson, C))

# ── certificates ──
prog(l1, L[0]); prog(l1, L[1])
ok(admin("select count(*) from public.cert_requests where user_id = %s", (l1,))[0][0] == 0, 'at 50% no request')
prog(l1, L[2])
el = admin("select public.cert_eligibility(%s, %s)", (l1, C))[0][0]
ok(el['progress_pct'] == 75 and el['eligible'] is False and str(el['quiz']) == str(Q), '75% but quiz not passed → not eligible', el)
ok(err("insert into public.quiz_attempts (user_id, course_id, lesson_id, score_pct) values (%s, %s, %s, 90)", (stranger, C, Q), as_user=stranger) is not None, 'non-buyer cannot submit a quiz')
run("insert into public.quiz_attempts (user_id, course_id, lesson_id, score_pct) values (%s, %s, %s, 60)", (l1, C, Q), as_user=l1)
ok(admin("select count(*) from public.cert_requests where user_id = %s", (l1,))[0][0] == 0, 'quiz below pass mark → no request')
run("insert into public.quiz_attempts (user_id, course_id, lesson_id, score_pct) values (%s, %s, %s, 80)", (l1, C, Q), as_user=l1)
R1 = admin("select id, status, progress_pct, quiz_pct from public.cert_requests where user_id = %s", (l1,))
ok(len(R1) == 1 and R1[0][1] == 'pending' and R1[0][3] == 80, '75% + quiz passed → request pending', R1)
ok(notes(owner, 'Certificate approval needed') >= 1 and notes(l1, 'Certificate sent for approval') == 1, 'owner notified; learner told')
ok(admin("select count(*) from public.certificates where user_id = %s", (l1,))[0][0] == 0, 'no certificate before approval')
ok(len(run("select id from public.cert_requests", as_user=l1)) == 1 and len(run("select id from public.cert_requests where tenant_id = %s", (T,), as_user=stranger)) == 0, 'requests visible to the learner, not to others')
ok(err("select public.cert_decide(%s, true)", (R1[0][0],), as_user=tutor) is not None, 'tutor cannot approve')
ok(err("select public.cert_decide(%s, true)", (R1[0][0],), as_user=other_owner) is not None, 'another academy cannot approve')
ok('10 characters' in (err("select public.cert_decide(%s, false, 'no')", (R1[0][0],), as_user=owner) or ''), 'reject needs a reason')
run("select public.cert_decide(%s, false, 'Please finish the project first')", (R1[0][0],), as_user=owner)
ok(notes(l1, 'Certificate not approved yet') == 1, 'rejected → learner gets the reason')
R2 = run("select public.cert_request_again(%s)", (C,), as_user=l1)[0][0]
ok(err("select public.cert_request_again(%s)", (C,), as_user=l1) is not None, 'cannot ask twice while pending')
cid = run("select public.cert_decide(%s, true)", (R2,), as_user=owner)[0][0]
ok(cid.startswith('BODHIN-') and admin("select count(*) from public.certificates where id = %s and user_id = %s", (cid, l1))[0][0] == 1, 'approved → certificate issued', cid)
ok(notes(l1, 'Certificate approved') == 1, 'learner notified on approval')
ok(len(run("select id from public.certificates", as_user=l1)) == 1 and len(run("select id from public.certificates where user_id = %s", (l1,), as_user=stranger)) == 0, 'certificate private to learner (verify by ID via edge function)')
ok('already' in (err("select public.cert_decide(%s, true)", (R2,), as_user=owner) or ''), 'a decision is final')
admin("insert into public.course_cert_rules (course_id, no_quiz) values (%s, true) on conflict (course_id) do update set no_quiz = true", (C,))
for x in L: prog(l2, x)
ok(admin("select status from public.cert_requests where user_id = %s", (l2,))[0][0] == 'pending', 'rule "no quiz" → 75% is enough')
run("insert into public.cert_settings (tenant_id, approval) values (%s, false)", (T,), as_user=owner)
ok(err("insert into public.cert_settings (tenant_id, approval) values (%s, false)", (T2,), as_user=owner) is not None, 'owner cannot change another academy’s settings')
l3 = new_user('Learner Three'); admin("insert into public.enrollments (user_id, course_id, tenant_id) values (%s, %s, %s)", (l3, C, T))
for x in L: prog(l3, x)
ok(admin("select count(*) from public.certificates where user_id = %s", (l3,))[0][0] == 1 and admin("select count(*) from public.cert_requests where user_id = %s", (l3,))[0][0] == 0, 'approval off → issued automatically')
ids = [r[0] for r in admin("select id from public.certificates where course_id = %s", (C,))]
ok(len(ids) == len(set(ids)) == 2, 'certificate IDs unique')

# ── 1:1 mentorship ──
at = "now() + interval '2 days'"
ok('bought' in (err(f"select public.mentor_request(%s, %s, 'Need help with ad targeting', {at}, 30)", (C, tutor), as_user=stranger) or ''), 'only buyers can book')
ok('tutor' in (err(f"select public.mentor_request(%s, %s, 'Need help with ad targeting', {at}, 30)", (C, other_owner), as_user=l1) or ''), 'mentor must belong to the course')
ok(err(f"select public.mentor_request(%s, %s, 'short', {at}, 30)", (C, tutor), as_user=l1) is not None, 'topic too short refused')
ok(err("select public.mentor_request(%s, %s, 'Need help with ad targeting', now() + interval '10 minutes', 30)", (C, tutor), as_user=l1) is not None, 'too soon refused')
MR = run(f"select public.mentor_request(%s, %s, 'Need help with ad targeting', {at}, 30)", (C, tutor), as_user=l1)[0][0]
ok(notes(tutor, 'New 1:1 mentorship request') == 1, 'tutor notified')
ok(err(f"select public.mentor_request(%s, %s, 'Another question for you', {at}, 30)", (C, tutor), as_user=l1) is not None, 'one pending request per course')
ok(len(run("select id from public.mentor_requests", as_user=tutor)) == 1 and len(run("select id from public.mentor_requests", as_user=other_owner)) == 0, 'tutor sees it, other academies do not')
ok(err("select public.mentor_respond(%s, true)", (MR,), as_user=other_owner) is not None, 'outsider cannot answer')
run("select public.mentor_respond(%s, true, 'Bring screenshots', now() + interval '3 days')", (MR,), as_user=tutor)
st = admin("select status, ends_at - starts_at from public.mentor_requests where id = %s", (MR,))[0]
ok(st[0] == 'accepted' and int(st[1].total_seconds()) == 1800, 'accepted with a new time (30 min slot)', st)
ok(notes(l1, 'Mentorship confirmed') == 1, 'learner notified with the time')
MR2 = run(f"select public.mentor_request(%s, %s, 'Can we review my SEO plan please', {at}, 30)", (C, tutor), as_user=l2)[0][0]
ok('already have' in (err("select public.mentor_respond(%s, true, null, now() + interval '3 days 10 minutes')", (MR2,), as_user=tutor) or ''), 'tutor cannot double-book')
ok('10 characters' in (err("select public.mentor_respond(%s, false, 'no')", (MR2,), as_user=tutor) or ''), 'decline needs a reason')
run("select public.mentor_respond(%s, false, 'Travelling that week, pick after 25th')", (MR2,), as_user=owner)
ok(notes(l2, 'Mentorship request not accepted') == 1, 'owner can decline; learner told why')
run("select public.mentor_cancel(%s)", (MR,), as_user=l1)
ok(notes(tutor, 'Mentorship cancelled by learner') == 1 and admin("select status from public.mentor_requests where id = %s", (MR,))[0][0] == 'cancelled', 'learner cancels → tutor told')
ok(err("update public.mentor_requests set status = 'accepted' where id = %s", (MR,), as_user=l1) is not None or admin("select status from public.mentor_requests where id = %s", (MR,))[0][0] == 'cancelled', 'no direct status edits')

# ── course-wide live class → buyers notified ──
before = notes(l1, 'New live class scheduled')
S = run("insert into public.live_sessions (tenant_id, course_id, host_id, title, starts_at, ends_at) values (%s, %s, %s, 'Weekly Q&A', now() + interval '1 day', now() + interval '1 day 1 hour') returning id", (T, C, owner), as_user=owner)[0][0]
ok(notes(l1, 'New live class scheduled') == before + 1 and notes(l2, 'New live class scheduled') >= 1 and notes(stranger, 'New live class scheduled') == 0, 'every buyer notified, non-buyers not')
run("update public.live_sessions set status = 'cancelled', cancel_reason = 'Moved to Saturday' where id = %s", (S,), as_user=owner)
ok(notes(l1, 'Live class cancelled') == 1, 'cancel → buyers told with the reason')

# ── reminders ──
run("insert into public.teaching_reminders (user_id, tenant_id, kind, title, due_at) values (%s, %s, 'quiz', 'Create quiz for module 4', now() + interval '2 hours')", (tutor, T), as_user=tutor)
ok(err("insert into public.teaching_reminders (user_id, tenant_id, kind, title, due_at) values (%s, %s, 'quiz', 'Sneaky', now())", (tutor, T2), as_user=tutor) is not None, 'reminder only in your own academy')
ok(len(run("select id from public.teaching_reminders", as_user=owner)) == 0, 'reminders are private to each educator')
ok(admin("select public.send_due_reminders()")[0][0] >= 1 and notes(tutor, 'Reminder: Create quiz%') == 1, 'due reminder notified once')
ok(admin("select public.send_due_reminders()")[0][0] == 0, 'not notified twice')

# ── categories ──
run("insert into public.academy_categories (tenant_id, name, created_by) values (%s, 'Spoken Tamil', %s)", (T, tutor), as_user=tutor)
ok(err("insert into public.academy_categories (tenant_id, name, created_by) values (%s, 'spoken tamil ', %s)", (T, owner), as_user=owner) is not None, 'duplicate category refused (any case)')
ok(len(run("select id from public.academy_categories", as_user=other_owner)) == 0, 'categories visible only inside the academy')

print(f'\nacademy DB: PASS {P}  FAIL {F}')
for f in FAILS: print('  ✗ ' + f)
sys.exit(1 if F else 0)
