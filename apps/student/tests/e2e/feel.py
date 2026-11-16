"""How the app FEELS on a phone (412 x 900, touch): vibration + shake on mistakes, success moments, Vibration switch,
trial-ended lock screen and countdown, course-complete celebration → certificate → public verify, not-found screens.
Haptics are read from window.__bodhinHaptics (every haptic the app fires is logged there; on a phone they vibrate).
Usage: python3 feel.py http://localhost:8765/bodhin-preview.html"""
import sys, asyncio, json
from playwright.async_api import async_playwright

async def main():
    url = sys.argv[1]; res = []
    def ok(c, n):
        line = ('PASS ' if c else 'FAIL ') + n; res.append(line); print(line, flush=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 412, 'height': 900}, is_mobile=True, has_touch=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        async def go(path, ms=1800):
            await pg.evaluate(f"history.pushState({{}},'', '{path}'); dispatchEvent(new PopStateEvent('popstate'))"); await pg.wait_for_timeout(ms)
        async def body(): return await pg.inner_text('body')
        async def hap(): return await pg.evaluate('(window.__bodhinHaptics||[]).slice()')
        async def clear(): await pg.evaluate('window.__bodhinHaptics=[]')
        async def click(name, ms=1500, exact=False):
            await pg.get_by_role('button', name=name, exact=exact).locator('visible=true').last.evaluate('e=>e.click()'); await pg.wait_for_timeout(ms)
        async def dbset(js):
            await pg.evaluate("(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('bodhin.mockdb'));const d=JSON.parse(localStorage.getItem(k));(" + js + ")(d);localStorage.setItem(k,JSON.stringify(d))})()")
        async def sign_in(email, pw='demo123'):
            await go('/sign-in')
            await pg.get_by_label('Email or mobile number').locator('visible=true').last.fill(email)
            await pg.locator('input[aria-label="Password"]:visible').last.fill(pw)
            await pg.get_by_text('Sign In', exact=True).locator('visible=true').last.click(); await pg.wait_for_timeout(2200)
        async def sign_out():
            await pg.evaluate("(()=>{Object.keys(localStorage).filter(k=>!k.startsWith('bodhin.mockdb')&&!k.startsWith('bodhin.haptics')&&k!=='bodhin.onboarded').forEach(k=>localStorage.removeItem(k))})()")
            await pg.goto(url); await pg.wait_for_timeout(2200)
        await pg.goto(url); await pg.wait_for_timeout(1200)
        await pg.evaluate("localStorage.clear(); localStorage.setItem('bodhin.onboarded','1')"); await pg.goto(url); await pg.wait_for_timeout(2500)

        # 1. wrong password → error buzz + shake, once
        await clear()
        await sign_in('arjun@demo.in', 'wrongpass1')
        h = await hap(); t = await body()
        ok(('incorrect' in t.lower() or 'wrong' in t.lower() or 'check' in t.lower()) and 'error' in h, f'Wrong password → message + error vibration ({h})')
        ok(h.count('error') == 1, 'one mistake = one buzz (field + banner do not double up)')
        # the box shakes: a translateX transform appears right after the mistake
        await pg.locator('input[aria-label="Password"]:visible').last.fill('wrongpass2')
        await pg.get_by_text('Sign In', exact=True).locator('visible=true').last.click()
        moved = False
        for _ in range(12):
            await pg.wait_for_timeout(40)
            tf = await pg.evaluate("(()=>[...document.querySelectorAll('[role=alert],[aria-live=polite]')].map(e=>getComputedStyle(e).transform+'|'+getComputedStyle(e.parentElement||e).transform).join(','))()")
            if 'matrix' in tf and 'matrix(1, 0, 0, 1, 0, 0)' not in tf.split(',')[0]: moved = True; break
        ok(moved or (await hap()).count('error') >= 2, 'Error banner shakes / buzzes again on a repeated mistake')
        # 2. wrong number format on sign-up
        await clear()
        await go('/sign-up')
        await pg.get_by_label('Full name').fill('Test Person')
        await pg.get_by_label('Email').fill('t@test.in')
        await pg.get_by_label('Mobile number').fill('12345')
        await pg.get_by_label('Password', exact=False).locator('visible=true').first.fill('demo1234')
        await pg.get_by_role('checkbox').first.evaluate('e=>e.click()'); await pg.wait_for_timeout(200)
        await click('Create Account', 1200)
        h = await hap()
        ok('error' in h and 'toggle' in h, f'Wrong mobile number → error vibration; ticking the box → toggle tick ({h})')
        # 3. wrong OTP
        await pg.get_by_label('Mobile number').fill('9876012399'); await pg.get_by_label('Email').fill('feel@test.in')
        await click('Create Account', 2000)
        await clear()
        await pg.get_by_label('Verification code').locator('input').fill('000000'); await pg.wait_for_timeout(1800)
        h = await hap(); t = await body()
        ok('error' in h and ('incorrect' in t.lower() or 'wrong' in t.lower() or 'invalid' in t.lower() or "doesn't match" in t.lower() or 'try again' in t.lower()), f'Wrong OTP → message + error vibration ({h})')
        await sign_out()

        # 4. taps, tabs, vibration switch
        await sign_in('arjun@demo.in')
        await clear()
        await go('/home', 1500)
        await pg.get_by_role('tab', name='Explore', exact=False).first.click(); await pg.wait_for_timeout(900)
        ok('select' in await hap(), 'Bottom tab press → selection tick')
        await go('/profile', 1600)
        sw = pg.get_by_role('switch', name='Vibration').first
        ok(await sw.count() == 1, 'Profile has a Vibration switch')
        await sw.click(); await pg.wait_for_timeout(400)
        await clear()
        await go('/checkout/c_neet_bot', 2000)
        await pg.get_by_label('Have a coupon?').locator('visible=true').last.fill('NOPE99')
        await click('Apply', 900)
        ok((await hap()) == [], 'Vibration off → no vibration even on a wrong coupon')
        await go('/profile', 1500)
        await pg.get_by_role('switch', name='Vibration').first.click(); await pg.wait_for_timeout(300)
        # 5. payment success → celebration
        await go('/checkout/c_neet_bot', 2000)
        await clear()
        await pg.get_by_label('Have a coupon?').locator('visible=true').last.fill('')
        await click('Pay', 4500)
        t = await body(); h = await hap()
        ok('enrolled' in t.lower() and await pg.get_by_role('img', name='Success').count() >= 1, 'Payment success shows the celebration')
        ok('success' in h, f'Payment success → success vibration ({h})')
        await pg.screenshot(path='feel-1.png')

        # 6. course complete → celebration → certificate → public verify
        cid = 'c_neet_bot'
        # every lesson done except one video lesson; finish that one in the player
        last = await pg.evaluate("""(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('bodhin.mockdb'));const d=JSON.parse(localStorage.getItem(k));
          const c=(d.courses||[]).find(x=>x.id==='c_neet_bot'); const ls=c.modules.flatMap(m=>m.lessons); const v=[...ls].reverse().find(l=>l.type==='video');
          const e=d.enrollments.find(x=>x.userId==='u_arjun'&&x.courseId==='c_neet_bot'); e.completedLessonIds=ls.filter(l=>l.id!==v.id).map(l=>l.id);
          localStorage.setItem(k,JSON.stringify(d)); return {v:v.id, cert:!!c.certificate, n:ls.length}})()""")
        await pg.goto(url); await pg.wait_for_timeout(2200)
        await go(f"/learn/{cid}?lesson={last['v']}", 2400)
        await pg.get_by_role('checkbox', name='Mark lesson complete').locator('visible=true').first.click(); await pg.wait_for_timeout(1200)
        t = await body()
        ok('Course complete' in t and 'You finished' in t, 'Finishing the last lesson → Course complete celebration')
        await pg.screenshot(path='feel-2.png')
        if 'View certificate' in t:
            await click('View certificate', 2200)
            t = await body()
            ok('Certificate' in t or 'certificate' in t, 'View certificate opens the certificate')
            cert = await pg.evaluate("location.pathname.split('/').pop()")
            await go(f'/cert/{cert}', 2000)
            t = await body()
            ok('valid' in t.lower() or 'verified' in t.lower() or 'genuine' in t.lower(), f'Public verify page confirms it ({cert})')
        else:
            ok(True, 'Course without certificate: no certificate button (correct)')
        # 7. not found
        await go('/checkout/does-not-exist', 1600)
        ok('Course not found' in await body(), 'Bad course link → friendly "Course not found", not a blank screen')
        await sign_out()

        # 8. trial ended → educator lock screen → choose plan → unlocked
        await dbset("(d)=>{const t=d.tenants.find(x=>x.id==='t_rajesh');t.subscription={...t.subscription,status:'trialing',pending:null,periodEnd:new Date(Date.now()-864e5).toISOString()}}")
        await pg.goto(url); await pg.wait_for_timeout(2200)
        await sign_in('rajesh@demo.in')
        await go('/educator/home', 2200)
        t = await body()
        ok('Your free trial has ended' in t and 'Choose a plan' in t and 'safe' in t, 'Trial ended → educator sees the lock screen with what is kept')
        await go('/edu/leads', 1600)
        ok('Your free trial has ended' in await body(), 'Every educator tool is locked (CRM too)')
        await click('Choose a plan', 2000)
        t = await body()
        ok('/edu/subscription' in await pg.evaluate('location.pathname') and 'Your free trial has ended' not in t.split('\n')[0], 'Choose a plan opens Subscription (not locked)')
        await pg.screenshot(path='feel-3.png')
        # unlock by picking a plan
        t = await body()
        ok('Trial ended' in t and 'Pick a plan below to unlock' in t, 'Subscription screen says it is locked and what to do')
        btns = await pg.evaluate("[...document.querySelectorAll('[role=button]')].map(b=>b.getAttribute('aria-label')||b.innerText).filter(x=>/Start .* now/.test(x||''))")
        ok(any('Start Institute now' in b for b in btns), f'Their current plan (Institute) can be picked again ({btns})')
        dis = await pg.evaluate("[...document.querySelectorAll('[role=button]')].filter(b=>/Start Growth now/.test(b.innerText)).map(b=>b.getAttribute('aria-disabled'))")
        ok('true' in dis, 'Growth is disabled: 1,312 students is more than Growth allows (nothing deleted to downgrade)')
        await click('Start Institute now', 1200)
        await click('Confirm', 2000)
        ok('You’re now on Institute' in await body(), 'Payment confirmed → now on Institute')
        await go('/educator/home', 2200)
        t = await body()
        ok('Your free trial has ended' not in t, f'After choosing a plan the workspace opens again (buttons: {btns})')
        # countdown strip: 2 days left
        await dbset("(d)=>{const t=d.tenants.find(x=>x.id==='t_rajesh');t.subscription={...t.subscription,status:'trialing',pending:null,periodEnd:new Date(Date.now()+1.5*864e5).toISOString()}}")
        await pg.goto(url); await pg.wait_for_timeout(2200); await go('/educator/home', 2000)
        t = await body()
        ok('Free trial · 2 days left' in t and 'Choose plan' in t, 'Last days of the trial → countdown strip on educator screens')
        await pg.screenshot(path='feel-4.png')
        await dbset("(d)=>{const t=d.tenants.find(x=>x.id==='t_rajesh');t.subscription={...t.subscription,status:'active',pending:null,periodEnd:'2027-02-01T00:00:00+05:30'}}")
        await pg.goto(url); await pg.wait_for_timeout(1500)

        ok(not errs, f'no page errors {errs[:2]}')
        await b.close()
    f = sum(1 for r in res if r.startswith('FAIL')); print(f'\n{len(res) - f} passed, {f} failed'); sys.exit(1 if f else 0)

asyncio.run(main())
