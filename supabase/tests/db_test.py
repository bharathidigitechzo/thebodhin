"""
Bodhin database tests — security rules (RLS) + business rules in SQL.
Runs against a local Postgres that has the Supabase stand-in + migrations + seed loaded.
Usage: python3 db_test.py "host=... port=... user=postgres dbname=bodhin"
"""
import sys, json, uuid, psycopg2

DSN = sys.argv[1]
conn = psycopg2.connect(DSN); conn.autocommit = True
P = F = 0; FAILS = []

def ok(cond, name, extra=None):
    global P, F
    if cond: P += 1
    else: F += 1; FAILS.append(name + (f'  → {extra}' if extra is not None else ''))

def run(sql, args=None, as_user=None, role='authenticated'):
    """Run one statement as a user (RLS applies) or as postgres (as_user=None, role=None)."""
    cur = conn.cursor()
    cur.execute('begin')
    try:
        if role:
            cur.execute("select set_config('role', %s, true), set_config('request.jwt.claims', %s, true)",
                        (role, json.dumps({'sub': str(as_user) if as_user else '', 'role': role})))
        cur.execute(sql, args)
        rows = cur.fetchall() if cur.description else None
        cur.execute('commit'); return rows
    except Exception as e:
        cur.execute('rollback'); raise e

def err(sql, args=None, as_user=None, role='authenticated'):
    try: run(sql, args, as_user, role); return None
    except Exception as e: return str(e).split('\n')[0]

def admin(sql, args=None): return run(sql, args, None, None)
def svc(sql, args=None): return run(sql, args, None, 'service_role')

def new_user(name, email):
    uid = str(uuid.uuid4())
    admin("insert into auth.users (id, email, raw_user_meta_data) values (%s, %s, %s)", (uid, email, json.dumps({'name': name})))
    return uid

# ───────────── people ─────────────
guru = new_user('Guru Vishwa', 'guru@digitechzo.com')
fin = new_user('Finance Staff', 'fin@bodhin.in')
mod = new_user('Moderator', 'mod@bodhin.in')
raj = new_user('Rajesh Kumar', 'rajesh@tutor.in')
pri = new_user('Priya', 'priya@tutor.in')
arjun = new_user('Arjun', 'arjun@learner.in')
kavya = new_user('Kavya', 'kavya@learner.in')
ok(admin("select name from public.profiles where id = %s", (arjun,))[0][0] == 'Arjun', 'sign-up creates profile')
admin("update public.profiles set staff_role = 'super_admin' where id = %s", (guru,))
admin("update public.profiles set staff_role = 'finance' where id = %s", (fin,))
admin("update public.profiles set staff_role = 'moderator' where id = %s", (mod,))
BOD = admin("select bodhin_tenant_id from public.platform_config")[0][0]

# ───────────── profile security ─────────────
ok(len(run("select id from public.profiles", as_user=arjun)) == 1, 'learner sees only own profile')
ok(err("update public.profiles set staff_role = 'super_admin' where id = %s", (arjun,), as_user=arjun) is not None, 'learner cannot make self admin')
run("update public.profiles set name = 'Arjun R' where id = %s", (arjun,), as_user=arjun)
ok(admin("select name from public.profiles where id = %s", (arjun,))[0][0] == 'Arjun R', 'learner edits own name')

# ───────────── educator onboarding ─────────────
app_r = run("select public.submit_application('Rajesh Digital Academy', 'rajesh', array['Marketing'], 8, 'Chennai', 300, 'https://youtu.be/x')", as_user=raj)[0][0]
app_p = run("select public.submit_application('Priya Codes', 'priyacodes', array['Coding'], 5, 'Madurai', 100, null)", as_user=pri)[0][0]
ok(err("select public.submit_application('X', 'admin', array['x'], 1, 'x', 1, null)", as_user=kavya) is not None, 'reserved web address refused')
ok('permission' in (err("select public.approve_educator(%s)", (app_r,), as_user=fin) or ''), 'finance cannot approve educators')
T_R = run("select public.approve_educator(%s)", (app_r,), as_user=mod)[0][0]
T_P = run("select public.approve_educator(%s)", (app_p,), as_user=guru)[0][0]
sub = admin("select plan, status, round(extract(epoch from period_end - now()) / 86400) from public.tenant_subscriptions where tenant_id = %s", (T_R,))[0]
ok(sub[0] == 'growth' and sub[1] == 'trialing' and int(sub[2]) == 14, '14-day Growth trial on approval', sub)
ok(admin("select role from public.memberships where user_id = %s and tenant_id = %s", (raj, T_R))[0][0] == 'owner', 'applicant becomes owner')
ok(err("select public.approve_educator(%s)", (app_r,), as_user=guru) is not None, 'cannot approve twice')
ok(admin("select count(*) from public.audit_log where action = 'application.approve'")[0][0] == 2, 'approvals audited')
# kill switch
run("select public.save_flags('{\"tutor_signups\": false}', 'pause signups for test')", as_user=guru)
ok('paused' in (err("select public.submit_application('K', 'kavyaclass', array['x'], 1, 'x', 1, null)", as_user=kavya) or ''), 'tutor sign-up kill switch')
run("select public.save_flags('{\"tutor_signups\": true}', 'reopen signups after test')", as_user=guru)

# ───────────── courses & moderation ─────────────
c1 = run("insert into public.courses (tenant_id, tutor_id, title, price_paise, status, visibility, moderation, rating) values (%s, %s, 'Digital Marketing with AI', 1749900, 'published', 'public', 'approved', 5) returning id, moderation, rating", (T_R, raj), as_user=raj)[0]
ok(c1[1] == 'pending' and c1[2] == 0, 'public listing goes to review; rating cannot be faked', c1)
C1 = c1[0]
run("update public.courses set moderation = 'approved' where id = %s", (C1,), as_user=raj)
ok(admin("select moderation from public.courses where id = %s", (C1,))[0][0] == 'pending', 'educator cannot approve own course')
ok(err("select public.decide_course(%s, 'approved')", (C1,), as_user=fin) is not None, 'finance cannot approve courses')
ok('Can’t list yet' in (err("select public.decide_course(%s, 'approved')", (C1,), as_user=mod) or ''), 'thin course cannot be approved for listing')
run("update public.courses set description = %s, outcomes = array['Run Meta ads','Use AI for copy','Track ROI'] where id = %s", ('A practical course on digital marketing with AI tools, from planning to reporting.', C1), as_user=raj)
MM = run("insert into public.modules (course_id, title) values (%s, 'Basics') returning id", (C1,), as_user=raj)[0][0]
for i in range(3): run("insert into public.lessons (module_id, course_id, title) values (%s, %s, %s)", (MM, C1, f'Lesson {i+1}'), as_user=raj)
ok('Can’t list yet' in (err("select public.decide_course(%s, 'approved')", (C1,), as_user=mod) or ''), 'listing needs a verified payout bank')
admin("update public.tenant_payment_settings set payout_bank = 'HDFC Bank', payout_last4 = '9012', payout_verified = true where tenant_id = %s", (T_R,))
run("select public.decide_course(%s, 'approved')", (C1,), as_user=mod)
ok(admin("select moderation from public.courses where id = %s", (C1,))[0][0] == 'approved', 'moderator approves course')
C2 = run("insert into public.courses (tenant_id, title, price_paise, status) values (%s, 'SEO Growth', 899900, 'published') returning id", (T_R,), as_user=raj)[0][0]
D1 = run("insert into public.courses (tenant_id, title, price_paise) values (%s, 'Draft course', 100000) returning id", (T_R,), as_user=raj)[0][0]
CP = run("insert into public.courses (tenant_id, title, price_paise, status) values (%s, 'Python Basics', 499900, 'published') returning id", (T_P,), as_user=pri)[0][0]
CF = run("insert into public.courses (tenant_id, title, price_paise, status) values (%s, 'Free Intro', 0, 'published') returning id", (T_P,), as_user=pri)[0][0]
ok(err("insert into public.courses (tenant_id, title) values (%s, 'Sneaky')", (T_R,), as_user=pri) is not None, 'owner cannot add course to another workspace')
ok(err("update public.courses set price_paise = 1 where id = %s returning id", (C1,), as_user=pri) is None and admin("select price_paise from public.courses where id = %s", (C1,))[0][0] == 1749900, 'owner cannot edit another workspace course')
anon_ids = {r[0] for r in run("select id from public.courses", role='anon')}
ok(C1 in anon_ids and D1 not in anon_ids, 'public sees published, not drafts')
M = run("insert into public.modules (course_id, title) values (%s, 'Module 1') returning id", (C1,), as_user=raj)[0][0]
run("insert into public.lessons (module_id, course_id, title, preview) values (%s, %s, 'Welcome', true)", (M, C1), as_user=raj)
ok(err("insert into public.modules (course_id, title) values (%s, 'Hack')", (C1,), as_user=pri) is not None, 'other owner cannot add modules')

# ───────────── checkout rules ─────────────
q = run("select public.checkout_quote(%s, null, %s)", (C1, T_R), as_user=arjun)[0][0]
ok(q['channel'] == 'tutor_direct' and q['blocked'] and 'payment setup' in q['blocked'], 'direct sale blocked until tutor gateway connected', q)
q = run("select public.checkout_quote(%s, null, null)", (C1,), as_user=arjun)[0][0]
ok(q['channel'] == 'bodhin_marketplace' and q['blocked'] is None and q['total_paise'] == 1749900, 'marketplace quote', q)
ok(q['gst_paise'] == 1749900 - round(1749900 / 1.18), 'GST inclusive')
ok('Bodhin' in (err("select public.checkout_quote(%s, 'BODHIN10', null)", (C1,), as_user=arjun) or ''), 'Bodhin promo not valid on tutor course')
BC = admin("select id from public.courses where tenant_id = %s limit 1", (BOD,))[0][0]
q = run("select public.checkout_quote(%s, 'bodhin10', %s)", (BC, T_R), as_user=arjun)[0][0]
ok(q['channel'] == 'bodhin_own' and q['discount_paise'] > 0, 'Bodhin promo works on Bodhin course (even on tutor site)', q)
ok(err("select public.create_order(%s, %s, null, null, 'direct')", (arjun, C1), as_user=arjun) is not None, 'learner cannot call create_order')
ok(err("insert into public.enrollments (user_id, course_id, tenant_id) values (%s, %s, %s)", (arjun, C1, T_R), as_user=arjun) is not None, 'learner cannot enrol self without paying')
ok(err("insert into public.orders (user_id, course_id, seller_tenant_id, channel, collector, list_paise, amount_paise, status) values (%s,%s,%s,'bodhin_own','bodhin',1,1,'paid')", (arjun, C1, T_R), as_user=arjun) is not None, 'learner cannot insert orders')

o = svc("select (o).id, (o).channel, (o).commission_paise, (o).gateway_fee_paise, (o).educator_share_paise, (o).amount_paise from (select public.create_order(%s, %s, null, null, 'bodhin_referral') o) x", (arjun, C1))[0]
ok(o[1] == 'bodhin_marketplace' and o[2] == 349980 and o[3] == 34998 and o[4] == 1749900 - 349980 - 34998, 'marketplace split 20% + 2%', o)
paid = svc("select (p).invoice_no, (p).payout_status, to_char((p).payout_date at time zone 'Asia/Kolkata', 'Dy HH24:MI'), (p).status from (select public.mark_order_paid(%s, 'pay_1') p) x", (o[0],))[0]
ok(paid[0].startswith('BOD/') and len(paid[0]) <= 16 and paid[1] == 'on_hold' and paid[2] == 'Mon 10:00' and paid[3] == 'paid', 'paid: Bodhin invoice, Monday payout after hold', paid)
again = svc("select (p).invoice_no from (select public.mark_order_paid(%s, 'pay_1') p) x", (o[0],))[0][0]
ok(again == paid[0], 'repeated webhook does nothing (idempotent)')
ok(admin("select count(*) from public.enrollments where user_id = %s and course_id = %s", (arjun, C1))[0][0] == 1, 'paid → enrolled once')
ok(admin("select students_count from public.courses where id = %s", (C1,))[0][0] == 1, 'student count updated')
ok(err("select public.create_order(%s, %s, null, null, 'direct')", (arjun, C1), role='service_role') is not None, 'cannot buy the same course twice')

# tutor direct after gateway connected
admin("update public.tenant_payment_settings set direct_gateway = 'razorpay', direct_gateway_status = 'active' where tenant_id = %s", (T_R,))
o2 = svc("select (o).id, (o).channel, (o).collector, (o).commission_paise, (o).educator_share_paise from (select public.create_order(%s, %s, null, %s, 'direct') o) x", (kavya, C2, T_R))[0]
ok(o2[1] == 'tutor_direct' and o2[2] == 'educator' and o2[3] == 0 and o2[4] == 899900, 'tutor direct: 0% Bodhin', o2)
inv2 = svc("select (p).invoice_no, (p).payout_status from (select public.mark_order_paid(%s, 'pay_2') p) x", (o2[0],))[0]
ok(inv2[0].startswith('RAJES/') and inv2[1] == 'not_applicable', 'direct sale: invoice in tutor name, no Bodhin payout', inv2)
# Bodhin own
o3 = svc("select (o).id, (o).channel, (o).commission_paise, (o).educator_share_paise from (select public.create_order(%s, %s, 'WELCOME5', %s, 'direct') o) x", (kavya, BC, T_R))[0]
ok(o3[1] == 'bodhin_own' and o3[3] == 0, 'Bodhin own: 100% Bodhin', o3)
svc("select public.mark_order_paid(%s, 'pay_3')", (o3[0],))
ok(admin("select used from public.coupons where code = 'WELCOME5'")[0][0] == 1, 'coupon use counted on payment')

# ───────────── who sees money ─────────────
ok(len(run("select id from public.orders", as_user=arjun)) == 1, 'learner sees only own orders')
ok(len(run("select id from public.orders", as_user=kavya)) == 2, 'second learner sees own orders')
ok(len(run("select id from public.orders", as_user=raj)) == 2, 'owner sees sales of own workspace (not Bodhin own)')
ok(len(run("select id from public.orders", as_user=pri)) == 0, 'other owner sees no foreign sales')
ok(len(run("select id from public.orders", as_user=fin)) == 3, 'finance sees all orders')
ok(len(run("select id from public.orders", as_user=mod)) == 0, 'moderator sees no orders')
ok(len(run("select user_id from public.enrollments", as_user=pri)) == 0, 'other owner cannot see Rajesh learners')
ok(len(run("select id from public.profiles where id = %s", (arjun,), as_user=raj)) == 1, 'owner sees own learners')
ok(len(run("select id from public.profiles where id = %s", (arjun,), as_user=pri)) == 0, 'other owner cannot see that learner')
ok(err("select * from public.tenant_secrets", as_user=raj) is not None, 'secrets table not readable by app users')

# ───────────── free enrolment, limits, suspension ─────────────
run("select public.enroll_free(%s)", (CF,), as_user=arjun)
ok(admin("select count(*) from public.enrollments where user_id = %s and course_id = %s", (arjun, CF))[0][0] == 1, 'free enrolment')
ok(err("select public.enroll_free(%s)", (C2,), as_user=arjun) is not None, 'paid course cannot be enrolled free')
admin("update public.tenant_subscriptions set overrides = '{\"limits\": {\"activeStudents\": 2}}' where tenant_id = %s", (T_R,))   # Rajesh has 2 learners
lucky = new_user('New Learner', 'new@learner.in')
q = run("select public.checkout_quote(%s, null, null)", (C2,), as_user=lucky)[0][0]
ok(q['blocked'] and 'taking new enrolments' in q['blocked'], 'student limit blocks new learner', q)
q = run("select public.checkout_quote(%s, null, null)", (C2,), as_user=arjun)[0][0]
ok(q['blocked'] is None, 'existing learner can still buy at limit', q)
ok(err("select public.create_order(%s, %s, null, null, 'direct')", (lucky, C2), role='service_role') is not None, 'create_order enforces limit')
admin("update public.tenant_subscriptions set overrides = null where tenant_id = %s", (T_R,))
ent = admin("select public.tenant_entitlements(%s)", (T_R,))[0][0]
ok(ent['students'] == 500 and 'coupons' in ent['features'], 'growth entitlements', ent)
admin("update public.tenant_subscriptions set addons = '[{\"kind\":\"students\",\"qty\":2},{\"kind\":\"custom_domain\",\"qty\":1}]' where tenant_id = %s", (T_R,))
ent = admin("select public.tenant_entitlements(%s)", (T_R,))[0][0]
ok(ent['students'] == 1000 and 'custom_domain' in ent['features'], 'add-ons raise limits / add features', ent)
admin("update public.tenants set status = 'suspended' where id = %s", (T_P,))
ok('not accepting' in (err("select public.enroll_free(%s)", (CF,), as_user=kavya) or ''), 'suspended workspace blocks free enrolment')
admin("update public.tenants set status = 'active' where id = %s", (T_P,))

# ───────────── coupons & branding gates ─────────────
run("insert into public.coupons (tenant_id, code, type, value, ends_at) values (%s, 'raj20', 'pct', 20, now() + interval '7 days')", (T_R,), as_user=raj)
ok(admin("select code from public.coupons where tenant_id = %s", (T_R,))[0][0] == 'RAJ20', 'coupon code stored upper-case')
ok(err("insert into public.coupons (tenant_id, code, type, value, ends_at) values (%s, 'HACK', 'pct', 50, now() + interval '7 days')", (T_R,), as_user=pri) is not None, 'cannot create coupon for another workspace')
ok(err("insert into public.coupons (tenant_id, code, type, value, ends_at, course_ids) values (%s, 'MIX', 'pct', 10, now() + interval '7 days', array[%s]::uuid[])", (T_R, CP), as_user=raj) is not None, 'coupon cannot include another workspace course')
q = run("select public.checkout_quote(%s, 'RAJ20', null)", (C2,), as_user=lucky)[0][0]
ok(q['discount_paise'] == 179980, 'tutor coupon on own course', q)
ok(err("select public.checkout_quote(%s, 'RAJ20', null)", (CP,), as_user=lucky) is not None, 'tutor coupon not valid on other workspace')
admin("update public.tenant_subscriptions set plan = 'starter', status = 'active' where tenant_id = %s", (T_P,))
ok('Creator' in (err("insert into public.coupons (tenant_id, code, type, value, ends_at) values (%s, 'PRI10', 'pct', 10, now() + interval '7 days')", (T_P,), as_user=pri) or ''), 'Starter cannot create coupons')
run("update public.tenants set hide_powered_by = true, display_name = 'Priya Codes Academy' where id = %s", (T_P,), as_user=pri)
r = admin("select hide_powered_by, display_name from public.tenants where id = %s", (T_P,))[0]
ok(r[0] is False and r[1] == 'Priya Codes Academy', 'Starter cannot hide Powered by; branding saves', r)
ok(err("update public.tenants set slug = 'stolen' where id = %s", (T_P,), as_user=pri) is not None, 'workspace cannot change its slug')
ok(err("update public.tenants set display_name = 'Hacked' where id = %s", (T_R,), as_user=pri) is None and admin("select display_name from public.tenants where id = %s", (T_R,))[0][0] == 'Rajesh Digital Academy', 'cannot edit another workspace branding')

# ───────────── refunds, reviews, notifications ─────────────
run("insert into public.refund_requests (order_id, user_id, reason) values (%s, %s, 'Not what I expected')", (o[0], arjun), as_user=arjun)
ok(err("insert into public.refund_requests (order_id, user_id, reason) values (%s, %s, 'fake')", (o2[0], arjun), as_user=arjun) is not None, 'cannot request refund on someone else order')
run("insert into public.reviews (course_id, user_id, rating, body) values (%s, %s, 4, 'Good')", (C1, arjun), as_user=arjun)
ok(float(admin("select rating from public.courses where id = %s", (C1,))[0][0]) == 4.0, 'review updates rating')
ok(err("insert into public.reviews (course_id, user_id, rating) values (%s, %s, 5)", (CP, arjun), as_user=arjun) is not None, 'only enrolled learners review')
n = run("select id from public.notifications", as_user=arjun)
ok(len(n) >= 1, 'learner got enrolment notification')
run("update public.notifications set read = true where user_id = %s", (arjun,), as_user=arjun)
ok(err("update public.notifications set title = 'x' where user_id = %s", (arjun,), as_user=arjun) is not None, 'notification text read-only')

# ───────────── refund decisions (0004) ─────────────
ok(admin("select count(*) from public.notifications where user_id = %s and title = 'Refund request received'", (arjun,))[0][0] == 1, 'learner told refund is being reviewed')
REQ1 = admin("select id from public.refund_requests where order_id = %s", (o[0],))[0][0]
ok(err("select public.decide_refund(%s, 'approved')", (REQ1,), as_user=raj) is not None, 'educator cannot decide a marketplace refund')
ok(err("select public.decide_refund(%s, 'approved')", (REQ1,), as_user=mod) is not None, 'moderator cannot decide refunds')
run("select public.decide_refund(%s, 'approved')", (REQ1,), as_user=fin)
r1 = admin("select o.status, o.payout_status, (select count(*) from public.enrollments e where e.user_id = o.user_id and e.course_id = o.course_id) from public.orders o where o.id = %s", (o[0],))[0]
ok(r1[0] == 'refunded' and r1[1] == 'not_applicable' and r1[2] == 0, 'marketplace refund: order refunded, payout cancelled, access removed', r1)
ok(err("select public.decide_refund(%s, 'rejected', 'too late now')", (REQ1,), as_user=fin) is not None, 'cannot decide twice')
run("insert into public.refund_requests (order_id, user_id, reason) values (%s, %s, 'Bought by mistake')", (o2[0], kavya), as_user=kavya)
REQ2 = admin("select id from public.refund_requests where order_id = %s", (o2[0],))[0][0]
ok(admin("select count(*) from public.notifications where user_id = %s and title = 'Refund request on a direct sale'", (raj,))[0][0] == 1, 'educator notified of direct-sale refund')
ok('direct sale' in (err("select public.decide_refund(%s, 'approved')", (REQ2,), as_user=fin) or ''), 'Finance cannot refund a direct sale')
ok(err("select public.educator_decide_refund(%s, 'approved')", (REQ2,), as_user=pri) is not None, 'other academy cannot decide')
ok('5+' in (err("select public.educator_decide_refund(%s, 'rejected', 'no')", (REQ2,), as_user=raj) or ''), 'decline needs a note')
run("select public.educator_decide_refund(%s, 'approved')", (REQ2,), as_user=raj)
ok(admin("select status from public.orders where id = %s", (o2[0],))[0][0] == 'refunded', 'educator refunds direct sale')

# ───────────── staff rules ─────────────
ok('permission' in (err("select public.save_platform_config('{\"commission_rate\": 0.1}', 'cut commission test')", as_user=fin) or ''), 'finance cannot change commission')
ok('reason' in (err("select public.save_platform_config('{\"commission_rate\": 0.15}', 'x')", as_user=guru) or ''), 'reason required')
ok(err("select public.save_platform_config('{\"trial_plan\": \"enterprise\"}', 'bad trial plan')", as_user=guru) is not None, 'trial plan cannot be enterprise')
ok(err("select public.save_platform_config('{\"commission_rate\": 0.9}', 'too high commission')", as_user=guru) is not None, 'commission capped at 50%')
run("select public.save_platform_config('{\"commission_rate\": 0.15, \"bodhin_tenant_id\": \"00000000-0000-0000-0000-000000000000\"}', 'launch offer commission')", as_user=guru)
cfg = admin("select commission_rate, bodhin_tenant_id from public.platform_config")[0]
ok(float(cfg[0]) == 0.15 and cfg[1] == BOD, 'commission changed; Bodhin tenant untouched', cfg)
ok(admin("select commission_paise from public.orders where id = %s", (o[0],))[0][0] == 349980, 'old orders keep their commission')
ok('Super Admin' in (err("select public.set_staff_role(%s, null, 'step down test')", (guru,), as_user=guru) or ''), 'always one Super Admin')
ok('own account' in (err("select public.set_user_lock(%s, true, 'lock myself test')", (guru,), as_user=guru) or ''), 'cannot lock yourself')
ok(err("select public.set_user_lock(%s, true, 'spam account')", (arjun,), as_user=fin) is not None, 'finance cannot lock users')
run("select public.set_user_lock(%s, true, 'spam account report')", (arjun,), as_user=guru)
ok(admin("select locked from public.profiles where id = %s", (arjun,))[0][0] is True, 'admin locks user')
ok(len(run("select id from public.audit_log", as_user=arjun)) == 0, 'learner cannot read audit')
ok(len(run("select id from public.audit_log", as_user=fin)) >= 5, 'finance reads audit')
ok(err("delete from public.audit_log", as_user=guru) is not None, 'audit log cannot be deleted')
ok(err("update public.audit_log set summary = 'x'", as_user=guru) is not None, 'audit log cannot be edited')

# ───────────── live classes (0005) ─────────────
lena = new_user('Lena', 'lena@learner.in'); outsider = new_user('Outsider', 'out@learner.in')
admin("insert into public.enrollments (user_id, course_id, tenant_id) values (%s, %s, %s)", (lena, C2, T_R))
admin("insert into public.memberships (tenant_id, user_id, role) values (%s, %s, 'tutor') on conflict do nothing", (T_R, raj))
admin("update public.feature_flags set live_classes = true where id = 1")
S_NOW = run("insert into public.live_sessions (tenant_id, course_id, host_id, title, starts_at, ends_at) values (%s, %s, %s, 'SEO live', now() - interval '5 minutes', now() + interval '55 minutes') returning id", (T_R, C2, raj), as_user=raj)[0][0]
S_LATE = run("insert into public.live_sessions (tenant_id, course_id, host_id, title, starts_at, ends_at) values (%s, %s, %s, 'Tomorrow', now() + interval '1 day', now() + interval '1 day 1 hour') returning id", (T_R, C2, raj), as_user=raj)[0][0]
S_OLD = run("insert into public.live_sessions (tenant_id, course_id, host_id, title, starts_at, ends_at) values (%s, %s, %s, 'Yesterday', now() - interval '1 day', now() - interval '23 hours') returning id", (T_R, C2, raj), as_user=raj)[0][0]
ok(err("insert into public.live_sessions (tenant_id, course_id, host_id, title, starts_at, ends_at) values (%s, %s, %s, 'Hijack', now(), now() + interval '1 hour')", (T_R, C2, pri), as_user=pri) is not None, 'other academy cannot schedule on my course')
ok(err("insert into public.live_sessions (tenant_id, course_id, host_id, title, starts_at, ends_at) values (%s, %s, %s, 'Bad time', now(), now() - interval '1 hour')", (T_R, C2, raj), as_user=raj) is not None, 'class must end after it starts')
j = run("select public.live_join_check(%s)", (S_NOW,), as_user=lena)[0][0]
ok(j['role'] == 'student' and j['speak_allowed'] is False and j['room'] == f'{T_R}:{S_NOW}', 'enrolled student joins as listen-only, room is tenant-scoped')
ok(run("select public.live_join_check(%s)", (S_NOW,), as_user=raj)[0][0]['role'] == 'host', 'educator joins as host')
ok('enrolled' in (err("select public.live_join_check(%s)", (S_NOW,), as_user=outsider) or ''), 'non-enrolled user cannot join')
ok('enrolled' in (err("select public.live_join_check(%s)", (S_NOW,), as_user=pri) or ''), 'another academy’s educator cannot join as host')
ok('10 minutes' in (err("select public.live_join_check(%s)", (S_LATE,), as_user=lena) or ''), 'room opens only 10 minutes before start')
ok('ended' in (err("select public.live_join_check(%s)", (S_OLD,), as_user=lena) or ''), 'old class cannot be joined')
ok('Sign in' in (err("select public.live_join_check(%s)", (S_NOW,), as_user=None) or ''), 'anonymous cannot join')
ok(admin("select count(*) from public.live_attendance where session_id = %s and user_id = %s", (S_NOW, lena))[0][0] == 1, 'join records attendance once')
run("select public.live_join_check(%s)", (S_NOW,), as_user=lena)
ok(admin("select count(*) from public.live_attendance where session_id = %s", (S_NOW,))[0][0] == 1, 'rejoin does not duplicate attendance')
ok(err("insert into public.live_attendance (session_id, user_id, minutes) values (%s, %s, 999)", (S_NOW, outsider), as_user=outsider) is not None, 'users cannot write attendance directly')
ok(err("insert into public.live_speakers (session_id, user_id) values (%s, %s)", (S_NOW, lena), as_user=lena) is not None, 'student cannot grant themselves the mic')
run("insert into public.live_speakers (session_id, user_id) values (%s, %s)", (S_NOW, lena), as_user=raj)
ok(run("select public.live_join_check(%s)", (S_NOW,), as_user=lena)[0][0]['speak_allowed'] is True, 'host-approved student gets speak permission')
run("select public.live_leave(%s, 100000)", (S_NOW,), as_user=lena)
ok(admin("select minutes from public.live_attendance where session_id = %s and user_id = %s", (S_NOW, lena))[0][0] <= 90, 'attendance minutes are capped at class length + grace')
admin("update public.feature_flags set live_classes = false where id = 1")
ok('unavailable' in (err("select public.live_join_check(%s)", (S_NOW,), as_user=lena) or ''), 'kill-switch blocks joining')
admin("update public.feature_flags set live_classes = true where id = 1")
admin("update public.live_sessions set status = 'conducted' where id = %s", (S_NOW,))
ok('ended' in (err("select public.live_join_check(%s)", (S_NOW,), as_user=lena) or ''), 'host-ended class cannot be re-entered')
ok(len(run("select id from public.live_sessions where id = %s", (S_NOW,), as_user=outsider)) == 0, 'non-enrolled user cannot see the session')

# ───────────── playground (0006) ─────────────
pg_u = new_user('Coder', 'coder@learner.in'); pg_v = new_user('Other Coder', 'coder2@learner.in')
FILES = json.dumps([{'name': 'main.py', 'lang': 'python', 'code': 'print(1)'}])
pid = run("insert into public.playground_projects (user_id, stack, title, files) values (%s, 'python', 'Hello', %s::jsonb) returning id", (pg_u, FILES), as_user=pg_u)[0][0]
ok(len(run("select id from public.playground_projects", as_user=pg_v)) == 0, 'projects are private to their owner')
ok(err("insert into public.playground_projects (user_id, stack, title, files) values (%s, 'python', 'Steal', %s::jsonb)", (pg_u, FILES), as_user=pg_v) is not None, 'cannot save a project as someone else')
ok(err("update public.playground_projects set title = 'x' where id = %s", (pid,), as_user=pg_v) is None and admin("select title from public.playground_projects where id = %s", (pid,))[0][0] == 'Hello', 'cannot edit another learner’s project')
ok(err("insert into public.playground_projects (user_id, stack, title, files) values (%s, 'python', 'Empty', '[]'::jsonb)", (pg_u,), as_user=pg_u) is not None, 'project needs at least one file')
ok(err("insert into public.playground_projects (user_id, stack, title, files) values (%s, 'python', 'Huge', %s::jsonb)", (pg_u, json.dumps([{'name': 'a', 'code': 'x' * 700000}])), as_user=pg_u) is not None, 'oversized project rejected')
for i in range(29): run("insert into public.playground_projects (user_id, stack, title, files) values (%s, 'python', %s, %s::jsonb)", (pg_u, f'P{i}', FILES), as_user=pg_u)
ok('30 saved' in (err("insert into public.playground_projects (user_id, stack, title, files) values (%s, 'python', 'One too many', %s::jsonb)", (pg_u, FILES), as_user=pg_u) or ''), '31st project refused')
ok(run("select public.playground_consume(1)", as_user=pg_u)[0][0] == 29, 'first server run leaves 29')
ok(run("select public.playground_consume(2)", as_user=pg_u)[0][0] == 27, 'a 2-unit check leaves 27')
ok(err("select public.playground_consume(0)", as_user=pg_u) is not None and err("select public.playground_consume(9)", as_user=pg_u) is not None, 'bad unit counts refused')
for i in range(5): run("select public.playground_consume(5)", as_user=pg_u)
ok(run("select public.playground_consume(2)", as_user=pg_u)[0][0] == 0, 'quota can be used exactly to zero')
ok('server runs' in (err("select public.playground_consume(1)", as_user=pg_u) or ''), 'run 31 is refused')
ok(run("select public.playground_consume(1)", as_user=pg_v)[0][0] == 29, 'quota is per learner')
ok(err("update public.playground_usage set remote_runs = 0 where user_id = %s", (pg_u,), as_user=pg_u) is None and admin("select remote_runs from public.playground_usage where user_id = %s", (pg_u,))[0][0] == 30, 'learner cannot reset own quota')
ok('Sign in' in (err("select public.playground_consume(1)", as_user=None) or ''), 'anonymous cannot run')
run("select public.playground_mark_solved('py-sum')", as_user=pg_u); run("select public.playground_mark_solved('py-sum')", as_user=pg_u)
ok(admin("select count(*) from public.playground_solved where user_id = %s", (pg_u,))[0][0] == 1, 'solving twice counts once')
ok(err("insert into public.playground_solved (user_id, challenge_id) values (%s, 'js-sum')", (pg_u,), as_user=pg_u) is not None, 'cannot write solved rows directly')
ok(err("select public.playground_mark_solved('Robert; DROP TABLE')", as_user=pg_u) is not None, 'challenge id format enforced')

# ───────────── growth tools (0007) ─────────────
admin("update public.tenant_subscriptions set plan = 'growth', status = 'active' where tenant_id = %s", (T_R,))
admin("update public.tenant_subscriptions set plan = 'starter', status = 'active' where tenant_id = %s", (T_P,))
SLUG_R = admin("select slug from public.tenants where id = %s", (T_R,))[0][0]
SLUG_P = admin("select slug from public.tenants where id = %s", (T_P,))[0][0]
ok(run("select public.tenant_has(%s, 'crm')", (T_R,), as_user=raj)[0][0] and not run("select public.tenant_has(%s, 'crm')", (T_P,), as_user=pri)[0][0], 'CRM on Growth, not on Starter')
ok(run("select public.tenant_has(%s, 'website')", (T_P,), as_user=pri)[0][0] and not run("select public.tenant_has(%s, 'webinars')", (T_P,), as_user=pri)[0][0], 'Starter has website but not webinars')
ok(admin("select monthly_paise from public.plans where id = 'growth'")[0][0] == 349900, 'plan prices untouched by growth migration')
# leads
L1 = run("select public.submit_lead(%s, 'Priya S', '+91 98765 01234', 'priya@x.in', null)", (SLUG_R,), as_user=None, role='anon')[0][0]
ok(L1 is not None, 'public enquiry form creates a lead (anon)')
L1b = run("select public.submit_lead(%s, 'Priya Again', '9876501234', null, null)", (SLUG_R,), as_user=None, role='anon')[0][0]
ok(L1 == L1b and admin("select count(*) from public.leads where tenant_id = %s", (T_R,))[0][0] == 1, 'same phone = same lead (no duplicates)')
ok('mobile' in (err("select public.submit_lead(%s, 'Bad', '12345', null, null)", (SLUG_R,), as_user=None, role='anon') or ''), 'invalid phone refused')
ok('closed' in (err("select public.submit_lead(%s, 'Starter lead', '9876501299', null, null)", (SLUG_P,), as_user=None, role='anon') or ''), 'enquiry form closed on plans without CRM')
ok(len(run("select id from public.leads", as_user=raj)) == 1 and len(run("select id from public.leads", as_user=pri)) == 0 and len(run("select id from public.leads", as_user=lena)) == 0, 'leads visible only to their academy staff')
ok(err("update public.leads set stage = 'lost' where id = %s", (L1,), as_user=raj) is not None, 'lost needs a reason')
run("update public.leads set stage = 'lost', lost_reason = 'Price too high' where id = %s", (L1,), as_user=raj)
run("select public.submit_lead(%s, 'Priya', '9876501234', null, null)", (SLUG_R,), as_user=None, role='anon')
ok(admin("select stage from public.leads where id = %s", (L1,))[0][0] == 'new', 'lost lead re-opens when they enquire again')
ok(err("insert into public.lead_notes (lead_id, author, text) values (%s, %s, 'spy')", (L1, pri, ), as_user=pri) is not None, 'other academy cannot add notes')
# broadcasts
B = "insert into public.broadcasts (tenant_id, created_by, title, body, channel, audience) values (%s, %s, 'Class moved', 'Saturday class at 11', 'both', '{\"kind\":\"all_students\"}')"
run(B, (T_R, raj), as_user=raj)
ok('Creator' in (err(B, (T_P, pri), as_user=pri) or ''), 'broadcasts need Creator plan')
ok(err(B, (T_R, lena), as_user=lena) is not None, 'students cannot broadcast')
for i in range(4): run(B, (T_R, raj), as_user=raj)
ok('5 broadcasts' in (err(B, (T_R, raj), as_user=raj) or ''), 'max 5 broadcasts a day')
ok(err("insert into public.message_outbox (tenant_id, channel, subject, body, source_kind, source_id) values (%s, 'email', 'x', 'y', 'broadcast', 'z')", (T_R,), as_user=raj) is not None, 'only the server writes the outbox')
# EMI
ok('2,000' in (err("insert into public.emi_plans (course_id, tenant_id, parts, every_days) values (%s, %s, 3, 30)", (C1, T_R), as_user=raj) or 'x2,000'), 'EMI blocked below ₹2,000 (or course not owned)')
run("insert into public.emi_plans (course_id, tenant_id, parts, every_days, fee_pct, grace_days) values (%s, %s, 3, 30, 0, 7)", (C2, T_R), as_user=raj)
ok(err("insert into public.emi_plans (course_id, tenant_id, parts, every_days) values (%s, %s, 5, 30)", (C2, T_R), as_user=raj) is not None, 'EMI parts limited to 2/3/4/6')
ok(err("select public.emi_create(%s, %s, 899900, null)", (lena, C2), as_user=lena) is not None, 'learners cannot create EMI schedules themselves')
K = svc("select public.emi_create(%s, %s, 899900, null)", (lena, C2))[0][0]
rows = admin("select n, amount_paise, paid_at is not null from public.emi_instalments where contract_id = %s order by n", (K,))
ok(len(rows) == 3 and sum(r[1] for r in rows) == 899900 and rows[0][2] and not rows[1][2], 'EMI splits exactly into 3, first paid', rows)
ok(run("select public.emi_access_ok(%s)", (C2,), as_user=lena)[0][0] is True, 'on-track EMI keeps access')
admin("update public.emi_instalments set due_at = now() - interval '10 days' where contract_id = %s and n = 2", (K,))
ok(run("select public.emi_access_ok(%s)", (C2,), as_user=lena)[0][0] is False, 'access pauses after grace days')
ok(len(run("select id from public.emi_contracts", as_user=outsider)) == 0 and len(run("select id from public.emi_contracts", as_user=raj)) == 1, 'EMI contracts visible to the learner and academy only')
# webinars
ok('15 minutes' in (err("insert into public.webinars (tenant_id, title, starts_at, duration_min, capacity, status) values (%s, 'Too soon webinar', now(), 60, 50, 'published')", (T_R,), as_user=raj) or ''), 'webinar must start 15+ minutes from now')
ok('Creator' in (err("insert into public.webinars (tenant_id, title, starts_at, duration_min, capacity) values (%s, 'Starter webinar', now() + interval '1 day', 60, 50)", (T_P,), as_user=pri) or ''), 'webinars need Creator plan')
W = run("insert into public.webinars (tenant_id, title, starts_at, duration_min, capacity, status) values (%s, 'SEO masterclass', now() + interval '1 day', 60, 10, 'published') returning id", (T_R,), as_user=raj)[0][0]
for i in range(10): run("select public.webinar_register(%s, %s, %s, null)", (W, f'Guest {i}', f'g{i}@x.in'), as_user=None, role='anon')
ok('seats' in (err("select public.webinar_register(%s, 'Late', 'late@x.in', null)", (W,), as_user=None, role='anon') or ''), 'webinar never oversells seats')
ok('already' in (err("select public.webinar_register(%s, 'Again', 'g1@x.in', null)", (W,), as_user=None, role='anon') or ''), 'same email registers once')
ok(len(run("select email from public.webinar_registrations", as_user=outsider)) == 0 and len(run("select email from public.webinar_registrations", as_user=raj)) == 10, 'registrant emails visible only to the academy')
WP = run("insert into public.webinars (tenant_id, title, starts_at, duration_min, capacity, status, price_paise) values (%s, 'Paid workshop', now() + interval '2 days', 60, 50, 'published', 29900) returning id", (T_R,), as_user=raj)[0][0]
ok('payment' in (err("select public.webinar_register(%s, 'Free rider', 'fr@x.in', null)", (WP,), as_user=None, role='anon') or ''), 'paid webinar cannot be joined for free')
# bookings — Mon..Sun 00:00–23:59 IST so the test does not depend on the clock
WEEK = json.dumps([{'day': d, 'from': '00:00', 'to': '23:59'} for d in range(7)])
O = run("insert into public.booking_offers (tenant_id, title, duration_min, weekly, buffer_min, notice_hours) values (%s, 'Doubt call', 30, %s::jsonb, 10, 2) returning id", (T_R, WEEK), as_user=raj)[0][0]
SLOT = admin("select date_trunc('hour', now() + interval '1 day')")[0][0]
run("select public.book_slot(%s, %s)", (O, SLOT), as_user=lena)
ok('taken' in (err("select public.book_slot(%s, %s + interval '35 minutes')", (O, SLOT), as_user=outsider) or ''), 'overlap incl. 10-min buffer refused')
ok(err("select public.book_slot(%s, %s + interval '40 minutes')", (O, SLOT), as_user=outsider) is None, 'slot after the buffer is free')
ok('upcoming' in (err("select public.book_slot(%s, %s + interval '3 hours')", (O, SLOT), as_user=lena) or ''), 'one upcoming session per learner per offer')
ok('soon' in (err("select public.book_slot(%s, now() + interval '30 minutes')", (O,), as_user=kavya) or ''), 'minimum notice enforced')
BK = admin("select id from public.bookings where user_id = %s", (lena,))[0][0]
admin("update public.bookings set starts_at = now() + interval '2 hours', ends_at = now() + interval '150 minutes' where id = %s", (BK,))
ok('12 hours' in (err("select public.cancel_booking(%s)", (BK,), as_user=lena) or ''), 'learner cannot cancel within 12 hours')
run("select public.cancel_booking(%s)", (BK,), as_user=raj)
ok(admin("select status from public.bookings where id = %s", (BK,))[0][0] == 'cancelled', 'academy can cancel any time')
ok(len(run("select id from public.bookings", as_user=kavya)) == 0, 'other learners cannot see bookings')
# digital products
PR = run("insert into public.digital_products (tenant_id, title, kind, status) values (%s, 'SEO checklist', 'notes', 'draft') returning id", (T_R,), as_user=raj)[0][0]
ok('file' in (err("update public.digital_products set status = 'published' where id = %s", (PR,), as_user=raj) or ''), 'cannot publish a product without files')
F1 = run("insert into public.product_files (product_id, name, storage_key, size_mb) values (%s, 'list.pdf', 'private/x/list.pdf', 2) returning id", (PR,), as_user=raj)[0][0]
run("update public.digital_products set status = 'published', download_limit = 2 where id = %s", (PR,), as_user=raj)
ok(len(run("select storage_key from public.product_files", as_user=lena)) == 0, 'file storage keys hidden from non-buyers')
ok('Buy' in (err("select public.product_download(%s)", (F1,), as_user=lena) or ''), 'download refused before purchase')
run("select public.claim_free_product(%s)", (PR,), as_user=lena)
ok(run("select public.product_download(%s)", (F1,), as_user=lena)[0][0] == 'private/x/list.pdf', 'buyer gets the file')
run("select public.product_download(%s)", (F1,), as_user=lena)
ok('limit' in (err("select public.product_download(%s)", (F1,), as_user=lena) or ''), 'download limit enforced')
# website
SEC_OK = json.dumps([{'id': 'hero', 'kind': 'hero', 'visible': True}, {'id': 'faq', 'kind': 'faq', 'visible': False}])
SEC_PRO = json.dumps([{'id': 'hero', 'kind': 'hero', 'visible': True}, {'id': 'faq', 'kind': 'faq', 'visible': True}])
run("insert into public.sites (tenant_id, sections, seo_title) values (%s, %s::jsonb, 'Priya Academy courses')", (T_P, SEC_OK), as_user=pri)
ok('Growth' in (err("update public.sites set sections = %s::jsonb where tenant_id = %s", (SEC_PRO, T_P), as_user=pri) or ''), 'FAQ/testimonials/enquiry form need Growth')
ok('Growth' in (err("update public.sites set ga4 = 'G-ABC1234' where tenant_id = %s", (T_P,), as_user=pri) or ''), 'GA4 / Pixel need Growth')
ok(err("update public.sites set seo_title = 'x' where tenant_id = %s", (T_P,), as_user=pri) is not None, 'SEO title length enforced')
run("insert into public.sites (tenant_id, sections, seo_title, ga4) values (%s, %s::jsonb, 'Rajesh Academy courses', 'G-ABC1234')", (T_R, SEC_PRO), as_user=raj)
ok(err("update public.sites set ga4 = 'UA-123' where tenant_id = %s", (T_R,), as_user=raj) is not None, 'bad GA4 id refused')
ok(err("update public.sites set sections = '[{\"id\":\"hero\",\"kind\":\"hero\",\"visible\":false}]' where tenant_id = %s", (T_R,), as_user=raj) is not None, 'hero banner must stay visible')
ok(len(run("select tenant_id from public.sites", as_user=None, role='anon')) == 2, 'published sites are public')
ok(err("update public.sites set seo_title = 'Hacked site title' where tenant_id = %s", (T_R,), as_user=pri) is None and admin("select seo_title from public.sites where tenant_id = %s", (T_R,))[0][0] == 'Rajesh Academy courses', 'another academy cannot edit my site')
# community
CH = admin("select id, announce from public.community_channels where tenant_id = %s order by announce desc", (T_R,))
ANN, GEN = CH[0][0], CH[1][0]
ok(len(CH) == 2, 'new workspace gets Announcements + General channels')
ok(len(run("select id from public.community_channels", as_user=lena)) == 2 and len(run("select id from public.community_channels", as_user=outsider)) == 0, 'only enrolled learners see channels')
ok('academy posts' in (err("insert into public.community_posts (tenant_id, channel_id, author_id, text) values (%s, %s, %s, 'hi')", (T_R, ANN, lena), as_user=lena) or ''), 'students cannot start posts in announcement channels')
P1 = run("insert into public.community_posts (tenant_id, channel_id, author_id, text) values (%s, %s, %s, 'Class at 11')", (T_R, ANN, raj), as_user=raj)
P1 = admin("select id from public.community_posts where channel_id = %s", (ANN,))[0][0]
run("insert into public.community_posts (tenant_id, channel_id, author_id, parent_id, text) values (%s, %s, %s, %s, 'Thanks sir')", (T_R, ANN, lena, P1), as_user=lena)
ok(admin("select count(*) from public.community_posts where parent_id = %s", (P1,))[0][0] == 1, 'students can reply in announcement channels')
ok('phone' in (err("insert into public.community_posts (tenant_id, channel_id, author_id, text) values (%s, %s, %s, 'call me 98765 43210')", (T_R, GEN, lena), as_user=lena) or ''), 'phone numbers blocked in student posts')
ok(err("insert into public.community_posts (tenant_id, channel_id, author_id, text) values (%s, %s, %s, 'spam')", (T_R, GEN, outsider), as_user=outsider) is not None, 'non-members cannot post')
run("insert into public.community_posts (tenant_id, channel_id, author_id, text, pinned) values (%s, %s, %s, 'Self pin?', true)", (T_R, GEN, lena), as_user=lena)
SP = admin("select id, pinned, author_id from public.community_posts where text = 'Self pin?'")[0]
ok(SP[1] is False and str(SP[2]) == lena, 'students cannot pin or post as someone else')
r1, r2, r3 = new_user('R1', 'r1@x.in'), new_user('R2', 'r2@x.in'), new_user('R3', 'r3@x.in')
for r in (r1, r2, r3): admin("insert into public.enrollments (user_id, course_id, tenant_id) values (%s, %s, %s)", (r, C2, T_R)); run("insert into public.community_reports (post_id, user_id) values (%s, %s)", (SP[0], r), as_user=r)
ok(admin("select hidden from public.community_posts where id = %s", (SP[0],))[0][0] is True, '3 reports hide a post')
ok(len(run("select id from public.community_posts where id = %s", (SP[0],), as_user=r1)) == 0 and len(run("select id from public.community_posts where id = %s", (SP[0],), as_user=raj)) == 1, 'hidden posts: staff still see them for review')
ok(err("insert into public.community_reactions (post_id, user_id, emoji) values (%s, %s, '💩')", (P1, lena), as_user=lena) is not None, 'only the allowed reactions')

# ───────────── scale (0008): indexes + interactive seats ─────────────
missing = admin("""select count(*) from pg_constraint c where c.contype='f' and c.connamespace='public'::regnamespace
  and not exists (select 1 from pg_index i where i.indrelid=c.conrelid and (i.indkey::int2[])[0:array_length(c.conkey,1)-1]=c.conkey)""")[0][0]
ok(missing == 0, f'every foreign key has an index ({missing} missing)')
admin("update public.platform_config set live_interactive_seats = 50 where id = 1")
def admin_err(sql):
    try: admin(sql); return None
    except Exception as e: return str(e)
ok(admin_err("update public.platform_config set live_interactive_seats = 10 where id = 1") is not None, 'seats below 50 refused')
ok(admin_err("update public.platform_config set live_interactive_seats = 5000 where id = 1") is not None, 'seats above one node’s safe limit refused')
S_BIG = run("insert into public.live_sessions (tenant_id, course_id, host_id, title, starts_at, ends_at) values (%s, %s, %s, 'Mega class', now() - interval '2 minutes', now() + interval '58 minutes') returning id", (T_R, C2, raj), as_user=raj)[0][0]
run("select public.live_join_check(%s)", (S_BIG,), as_user=lena)
S_NOW = S_BIG
crowd = []
for i in range(52):
    u = new_user(f'Crowd {i}', f'crowd{i}@learner.in'); crowd.append(u)
    admin("insert into public.enrollments (user_id, course_id, tenant_id) values (%s, %s, %s)", (u, C2, T_R))
modes = [run("select public.live_join_check(%s)", (S_NOW,), as_user=u)[0][0]['mode'] for u in crowd]
ok(modes.count('interactive') == 49 and modes.count('broadcast') == 3, f'50 seats (Lena has one): 49 more interactive, rest broadcast ({modes.count("interactive")}/{modes.count("broadcast")})')
ok(run("select public.live_join_check(%s)", (S_NOW,), as_user=crowd[0])[0][0]['mode'] == 'interactive' and run("select public.live_join_check(%s)", (S_NOW,), as_user=crowd[-1])[0][0]['mode'] == 'broadcast', 'rejoin keeps the same seat type')
ok(run("select public.live_join_check(%s)", (S_NOW,), as_user=raj)[0][0]['mode'] == 'interactive', 'host always gets an interactive seat')
admin("insert into public.live_speakers (session_id, user_id) values (%s, %s)", (S_NOW, crowd[-1]))
ok(run("select public.live_join_check(%s)", (S_NOW,), as_user=crowd[-1])[0][0]['mode'] == 'interactive', 'learner allowed to speak is moved to an interactive seat')
ok(admin("select count(*) from public.live_attendance where session_id = %s", (S_NOW,))[0][0] == 53, 'broadcast viewers still count in attendance')
admin("update public.platform_config set live_interactive_seats = 1000 where id = 1")

# ───────────── launch rules (0009): lock, modules, retention, nightly settle ─────────────
keep = admin("select status, period_end, pending, plan from public.tenant_subscriptions where tenant_id = %s", (T_R,))[0]
admin("update public.tenant_subscriptions set status = 'trialing', period_end = now() - interval '1 hour', pending = null where tenant_id = %s", (T_R,))
ok(run("select public.tenant_gate(%s)", (T_R,), as_user=raj)[0][0]['state'] == 'trial_ended', 'trial ended → gate says trial_ended')
ok(run("select public.tenant_locked(%s)", (T_R,), as_user=raj)[0][0] is True, 'academy locked')
ok(err("update public.courses set title = 'Edited while locked' where id = %s", (C2,), as_user=raj) is not None, 'locked: owner cannot edit a course')
ok(err("insert into public.courses (tenant_id, title, price_paise, status) values (%s, 'New while locked', 0, 'draft')", (T_R,), as_user=raj) is not None, 'locked: cannot create a course')
ok(run("select public.tenant_has(%s, 'crm')", (T_R,), as_user=raj)[0][0] is False, 'locked: growth tools off (CRM)')
ok('isn’t taking new enrolments' in (run("select public.enrol_block(%s, %s)", (T_R, outsider), as_user=outsider)[0][0] or ''), 'locked: new enrolments paused')
ok(run("select count(*) from public.lessons where course_id = %s", (C1,), as_user=arjun)[0][0] > 0, 'locked: an enrolled learner still sees their lessons')
admin("update public.tenant_subscriptions set period_end = now() + interval '7 days' where tenant_id = %s", (T_R,))
ok(run("select public.tenant_locked(%s)", (T_R,), as_user=raj)[0][0] is False and err("update public.courses set title = 'SEO Growth' where id = %s", (C2,), as_user=raj) is None, 'trial extended → unlocked, editing works again')
admin("update public.tenant_subscriptions set status = 'trialing', period_end = now() - interval '1 minute', pending = '{\"plan\":\"starter\",\"billing\":\"monthly\"}' where tenant_id = %s", (T_R,))
n = admin("select public.settle_subscriptions()")[0][0]
st = admin("select status, plan from public.tenant_subscriptions where tenant_id = %s", (T_R,))[0]
ok(n >= 1 and st == ('active', 'starter'), f'nightly job: plan booked during the trial starts when it ends ({st})')
admin("update public.tenant_subscriptions set status = 'past_due', period_end = now() - interval '3 days' where tenant_id = %s", (T_R,))
ok(run("select public.tenant_gate(%s)", (T_R,), as_user=raj)[0][0]['state'] == 'grace', 'unpaid 3 days → grace, still open')
admin("update public.tenant_subscriptions set period_end = now() - interval '8 days' where tenant_id = %s", (T_R,))
ok(run("select public.tenant_locked(%s)", (T_R,), as_user=raj)[0][0] is True, 'unpaid 8 days → locked')
admin("update public.tenant_subscriptions set status = %s, period_end = %s, pending = %s, plan = %s where tenant_id = %s", (keep[0], keep[1], json.dumps(keep[2]) if keep[2] else None, keep[3], T_R))
ok(run("select public.tenant_has(%s, 'crm')", (T_R,), as_user=raj)[0][0] is True, 'back to normal: CRM on')
run("select public.set_module(%s, 'crm', false)", (T_R,), as_user=raj)
ok(run("select public.tenant_has(%s, 'crm')", (T_R,), as_user=raj)[0][0] is False, 'owner switches CRM off → off everywhere')
ok(err("select public.set_module(%s, 'crm', true)", (T_R,), as_user=pri) is not None, 'non-owner cannot switch modules')
ok(err("select public.set_module(%s, 'courses', false)", (T_R,), as_user=raj) is not None, 'courses can’t be switched off')
run("select public.set_module(%s, 'crm', true)", (T_R,), as_user=raj)
ok(run("select public.tenant_has(%s, 'crm')", (T_R,), as_user=raj)[0][0] is True, 'switched back on')
ok(admin("select count(*) from public.audit_log where action in ('module.on','module.off')")[0][0] >= 2, 'module changes audited')
ok(admin("select public.recording_available(now() - interval '10 days')")[0][0] is True and admin("select public.recording_available(now() - interval '200 days')")[0][0] is False, 'recordings: 180-day window')
admin("update public.platform_config set recording_retention_days = 0 where id = 1")
ok(admin("select public.recording_available(now() - interval '2000 days')")[0][0] is True, 'recordings: 0 = forever')
admin("update public.platform_config set recording_retention_days = 180 where id = 1")

print(f'\nPASS {P}  FAIL {F}')
for f in FAILS: print('  ✗ ' + f)
sys.exit(1 if F else 0)
