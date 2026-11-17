"""Brand-new accounts with no data: a learner who just signed up and an educator who was just approved (no courses,
no students, no sales). Every screen must show a helpful empty state: no crash, no blank, no NaN/undefined, no "0 of 0 = NaN%".
Usage: python3 empty_accounts.py http://localhost:8765/bodhin-preview.html"""
import sys, asyncio, re
from playwright.async_api import async_playwright

LEARNER = ['/home', '/explore', '/learning', '/live', '/profile', '/certificates', '/payments', '/downloads', '/my-purchases', '/notifications', '/community', '/refer', '/playground', '/help', '/quizzes', '/assignments', '/mentorship']
EDU = ['/educator/home', '/educator/courses', '/educator/batches', '/educator/live', '/educator/more', '/edu/timetable', '/edu/earnings', '/edu/analytics',
       '/edu/grow', '/edu/leads', '/edu/doubts', '/edu/grading', '/edu/coupons', '/edu/subscription', '/edu/workspace', '/edu/team', '/edu/showcase', '/edu/products',
       '/edu/webinars', '/edu/bookings', '/edu/bundles', '/edu/affiliates', '/edu/emi', '/edu/broadcasts', '/edu/automations', '/edu/community', '/edu/site', '/edu/schedule', '/edu/batch-new', '/edu/assess',
       '/edu/certificates', '/edu/mentorship', '/edu/students', '/edu/account']
PROBE = r"""() => { const t = document.body.innerText || ''; return { len: t.trim().length, crashed: /Something went wrong|Unexpected error|Render Error/.test(t),
  broken: (t.match(/\bundefined\b|\bNaN\b|\[object Object\]|Invalid Date|Infinity|₹NaN|-0%/g) || []).slice(0, 4), snip: t.trim().slice(0, 120).replace(/\s+/g, ' ') }; }"""

async def main():
    url = sys.argv[1]; res = []
    def ok(c, n):
        line = ('PASS ' if c else 'FAIL ') + n; res.append(line); print(line, flush=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        async def go(path, ms=1600):
            await pg.evaluate(f"history.pushState({{}},'', '{path}'); dispatchEvent(new PopStateEvent('popstate'))"); await pg.wait_for_timeout(ms)
        async def click(name, ms=1500):
            await pg.get_by_role('button', name=name, exact=False).locator('visible=true').last.evaluate('e=>e.click()'); await pg.wait_for_timeout(ms)
        async def check(role, paths):
            for path in paths:
                n0 = len(errs); await go(path)
                r = await pg.evaluate(PROBE)
                bad = [x for x, c in [('JS ' + (errs[-1] if len(errs) > n0 else ''), len(errs) > n0), ('CRASH', r['crashed']), ('TEXT ' + ','.join(r['broken']), bool(r['broken'])), ('BLANK', r['len'] < 25)] if c]
                ok(not bad, f"{role} {path} {' '.join(bad)[:150]}")
        await pg.goto(url); await pg.wait_for_timeout(1000)
        await pg.evaluate("localStorage.clear(); localStorage.setItem('bodhin.onboarded','1'); localStorage.setItem('bodhin.cookie.v1','essential')"); await pg.goto(url); await pg.wait_for_timeout(2200)
        # brand-new learner
        await go('/sign-up')
        await pg.get_by_label('Full name').fill('Nila Newcomer')
        await pg.get_by_label('Email').fill('nila@new.in')
        await pg.get_by_label('Mobile number').fill('9876011223')
        await pg.get_by_label('Password', exact=False).locator('visible=true').first.fill('demo1234')
        await pg.get_by_role('checkbox').first.evaluate('e=>e.click()')
        await click('Create Account', 2000)
        await pg.get_by_label('Verification code').locator('input').fill('123456'); await pg.wait_for_timeout(2500)
        await check('new-learner', LEARNER)
        # same person taps Profile → Teach on Bodhin; admin approves; empty academy
        await go('/profile', 1600)
        ok(await pg.get_by_text('Teach on Bodhin').count() >= 1, 'Learner sees “Teach on Bodhin” in Profile')
        await pg.get_by_text('Teach on Bodhin').first.click(); await pg.wait_for_timeout(1800)
        await pg.get_by_label('Academy name').fill('Nila Science Academy')
        await pg.get_by_label('Subjects you teach').fill('Physics, Chemistry')
        await pg.get_by_label('Experience (years)').fill('4')
        await pg.get_by_label('Students planned').fill('80')
        await pg.get_by_label('City').fill('Madurai')
        vb = pg.get_by_role('button', name='Verify', exact=True).locator('visible=true')
        if await vb.count(): await vb.first.evaluate('e=>e.click()'); await pg.wait_for_timeout(2500)
        for cb in await pg.get_by_role('checkbox').all():
            if (await cb.get_attribute('aria-checked')) != 'true': await cb.evaluate('e=>e.click()')
        await click('Submit', 2200)
        await pg.evaluate("(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('bodhin.mockdb'));const d=JSON.parse(localStorage.getItem(k));const u=d.users.find(x=>x.email==='nila@new.in');const a=d.applications.find(x=>x.userId===u.id);window.__app=a&&a.id;window.__st=a&&a.status})()")
        st = await pg.evaluate('window.__st')
        ok(st in ('submitted', 'under_review'), f'educator application submitted ({st})')
        # approve as admin in the same browser session
        await pg.evaluate("(()=>{Object.keys(localStorage).filter(k=>!k.startsWith('bodhin.mockdb')&&k!=='bodhin.onboarded'&&!k.startsWith('bodhin.cookie')).forEach(k=>localStorage.removeItem(k))})()")
        await pg.goto(url); await pg.wait_for_timeout(2000)
        await go('/sign-in')
        await pg.get_by_label('Email or mobile number').locator('visible=true').last.fill('admin@demo.in')
        await pg.locator('input[aria-label="Password"]:visible').last.fill('demo123')
        await pg.get_by_text('Sign In', exact=True).locator('visible=true').last.click(); await pg.wait_for_timeout(2200)
        t = await pg.inner_text('body')
        if 'verification' in t.lower() or 'Demo code' in t:
            await pg.get_by_label('Verification code').locator('input').last.fill('123456'); await pg.wait_for_timeout(800)
            try: await pg.get_by_role('button', name='Verify', exact=False).last.evaluate('e=>e.click()')
            except Exception: pass
            await pg.wait_for_timeout(1800)
        app_id = await pg.evaluate("(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('bodhin.mockdb'));const d=JSON.parse(localStorage.getItem(k));const u=d.users.find(x=>x.email==='nila@new.in');return d.applications.find(x=>x.userId===u.id).id})()")
        await go(f'/admin/review/educator/{app_id}', 2200)
        try:
            await click('Approve', 1500)
            for nm in ['Approve & create', 'Confirm', 'Approve']:
                l = pg.get_by_role('button', name=nm, exact=False).locator('visible=true')
                if await l.count(): await l.last.evaluate('e=>e.click()'); await pg.wait_for_timeout(1800); break
        except Exception as e:
            print('approve step:', str(e)[:120])
        approved = await pg.evaluate("(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('bodhin.mockdb'));const d=JSON.parse(localStorage.getItem(k));const u=d.users.find(x=>x.email==='nila@new.in');return d.tenants.some(t=>t.ownerUserId===u.id)})()")
        ok(approved, 'Super Admin approves → academy created')
        await pg.evaluate("(()=>{Object.keys(localStorage).filter(k=>!k.startsWith('bodhin.mockdb')&&k!=='bodhin.onboarded'&&!k.startsWith('bodhin.cookie')).forEach(k=>localStorage.removeItem(k))})()")
        await pg.goto(url); await pg.wait_for_timeout(2000)
        await go('/sign-in')
        await pg.get_by_label('Email or mobile number').locator('visible=true').last.fill('nila@new.in')
        await pg.locator('input[aria-label="Password"]:visible').last.fill('demo1234')
        await pg.get_by_text('Sign In', exact=True).locator('visible=true').last.click(); await pg.wait_for_timeout(2400)
        await check('new-educator', EDU)
        # non-educator opening an educator page → explained, not blank
        await pg.evaluate("(()=>{Object.keys(localStorage).filter(k=>!k.startsWith('bodhin.mockdb')&&k!=='bodhin.onboarded'&&!k.startsWith('bodhin.cookie')).forEach(k=>localStorage.removeItem(k))})()")
        await pg.goto(url); await pg.wait_for_timeout(2000)
        await go('/sign-in')
        await pg.get_by_label('Email or mobile number').locator('visible=true').last.fill('arjun@demo.in')
        await pg.locator('input[aria-label="Password"]:visible').last.fill('demo123')
        await pg.get_by_text('Sign In', exact=True).locator('visible=true').last.click(); await pg.wait_for_timeout(2200)
        for path in ['/edu/schedule', '/edu/batch-new', '/educator/home', '/edu/leads']:
            n0 = len(errs); await go(path)
            t = await pg.inner_text('body')
            ok('This is the educator area' in t and 'Teach on Bodhin' in t and len(errs) == n0, f'learner opens {path} → “This is the educator area” + Teach on Bodhin, no crash')
        # locked educator: every educator page shows the lock, none crash
        await pg.evaluate("(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('bodhin.mockdb'));const d=JSON.parse(localStorage.getItem(k));const t=d.tenants.find(x=>x.id==='t_rajesh');t.subscription={...t.subscription,status:'trialing',pending:null,periodEnd:new Date(Date.now()-864e5).toISOString()};Object.keys(localStorage).filter(k=>!k.startsWith('bodhin.mockdb')&&k!=='bodhin.onboarded'&&!k.startsWith('bodhin.cookie')).forEach(k=>localStorage.removeItem(k));localStorage.setItem(k,JSON.stringify(d))})()")
        await pg.goto(url); await pg.wait_for_timeout(2000)
        await go('/sign-in')
        await pg.get_by_label('Email or mobile number').locator('visible=true').last.fill('rajesh@demo.in')
        await pg.locator('input[aria-label="Password"]:visible').last.fill('demo123')
        await pg.get_by_text('Sign In', exact=True).locator('visible=true').last.click(); await pg.wait_for_timeout(2200)
        bad = []
        for path in EDU + ['/edu/course/c_dm_ai', '/edu/batch/b_dm_wk', '/edu/host/ls_now', '/edu/board']:
            n0 = len(errs); await go(path, 1300)
            t = await pg.inner_text('body')
            if len(errs) > n0 or 'Something went wrong' in t or ('Your free trial has ended' not in t and not path.startswith('/edu/subscription')): bad.append(f"{path}: {(errs[-1] if len(errs) > n0 else t[:60])[:90]}")
        ok(not bad, f'locked educator: all {len(EDU) + 4} educator pages show the lock, none crash {bad[:4]}')
        await b.close()
    f = sum(1 for r in res if r.startswith('FAIL')); print(f'\n{len(res) - f} passed, {f} failed'); sys.exit(1 if f else 0)

asyncio.run(main())
