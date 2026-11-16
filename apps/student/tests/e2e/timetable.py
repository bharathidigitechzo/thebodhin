"""Timetable & live classes in a real browser: educator week timetable, moving a class (with clash check),
learner Timetable tab, Super Admin live monitor.
Usage: python3 timetable.py http://localhost:8765/bodhin-preview.html"""
import sys, asyncio, re
from playwright.async_api import async_playwright

async def main():
    url = sys.argv[1]; res = []
    def ok(c, n):
        line = ('PASS ' if c else 'FAIL ') + n; res.append(line); print(line, flush=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 412, 'height': 900})
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        async def go(path, ms=1800):
            await pg.evaluate(f"history.pushState({{}},'', '{path}'); dispatchEvent(new PopStateEvent('popstate'))"); await pg.wait_for_timeout(ms)
        async def body(): return await pg.inner_text('body')
        async def sign_in(email):
            await go('/sign-in')
            await pg.get_by_label('Email or mobile number').locator('visible=true').last.fill(email)
            await pg.locator('input[aria-label="Password"]:visible').last.fill('demo123')
            await pg.get_by_text('Sign In', exact=True).locator('visible=true').last.click(); await pg.wait_for_timeout(2400)
        async def sign_out():
            await pg.evaluate("(()=>{Object.keys(localStorage).filter(k=>!k.startsWith('bodhin.mockdb')&&k!=='bodhin.onboarded').forEach(k=>localStorage.removeItem(k))})()")
            await pg.goto(url); await pg.wait_for_timeout(2200)
        await pg.goto(url); await pg.wait_for_timeout(1200)
        await pg.evaluate("localStorage.clear(); localStorage.setItem('bodhin.onboarded','1')"); await pg.goto(url); await pg.wait_for_timeout(2500)

        # ── educator ──
        await sign_in('rajesh@demo.in')
        await go('/educator/live', 2200)
        ok('Week timetable' in await body(), 'Educator Live shows the Week timetable entry')
        await pg.get_by_label('Open week timetable').first.click(); await pg.wait_for_timeout(1800)
        t = await body(); ok('This week' in t and 'Timetable' in t, 'Timetable opens on this week')
        tabs = await pg.get_by_role('tab').count(); ok(tabs >= 7, f'7-day strip shown ({tabs} tabs)')
        await pg.get_by_label('Next week').first.click(); await pg.wait_for_timeout(700)
        t = await body(); ok('Next week' in t and ('Online' in t or 'In person' in t or 'No classes this day' in t), 'Next week view works')
        await pg.screenshot(path='tt-1.png')
        # move a class from the batch schedule
        await go('/edu/batch/b_dm_wk?tab=schedule', 2400)
        try: await pg.get_by_role('tab', name='Schedule').first.click(); await pg.wait_for_timeout(900)
        except Exception: pass
        await pg.get_by_role('button', name=re.compile(r'^Class \d')).locator('visible=true').nth(1).click(); await pg.wait_for_timeout(900)
        ok('Change date / time' in await body(), 'Class sheet offers Change date / time (future class)')
        await pg.get_by_text('Change date / time', exact=True).first.click(); await pg.wait_for_timeout(900)
        t = await body(); ok('Move this class' in t and 'clashes' in t, 'Move sheet explains the clash check')
        await pg.get_by_text('1 h 30', exact=True).first.click(); await pg.wait_for_timeout(300)
        await pg.get_by_text('Save new time', exact=True).first.click(); await pg.wait_for_timeout(1500)
        t = await body(); ok('Class moved' in t or 'Clashes with' in t, 'Saving shows the result (moved, or the clash reason)')
        await pg.screenshot(path='tt-2.png')
        # learner-side data after the move
        st = await pg.evaluate("(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('bodhin.mockdb'));const d=JSON.parse(localStorage.getItem(k));return (d.classSessions||[]).filter(s=>s.batchId==='b_dm_wk'&&s.status==='scheduled').some(s=>new Date(s.endsAt)-new Date(s.startsAt)===90*6e4)})()")
        ok(st, 'The moved class now runs 1 h 30 in the saved data')

        # ── learner ──
        await sign_out(); await sign_in('arjun@demo.in')
        await go('/live', 2400)
        await pg.get_by_role('tab', name='Timetable').first.click(); await pg.wait_for_timeout(1000)
        t = await body(); ok('This week' in t and ('Online' in t or 'No classes this day' in t), 'Learner Live → Timetable tab shows the week')
        ok(await pg.get_by_role('tab', name='Past').count() >= 1, 'Past tab still there')
        await pg.screenshot(path='tt-3.png')

        # ── super admin ──
        await sign_out(); await sign_in('admin@demo.in')
        t = await body()
        if 'verification' in t.lower() or 'Demo code' in t:
            await pg.get_by_label('Verification code').locator('input').last.fill('123456'); await pg.wait_for_timeout(800)
            try: await pg.get_by_role('button', name='Verify', exact=False).last.evaluate('e=>e.click()')
            except Exception: pass
            await pg.wait_for_timeout(2000)
        await go('/admin/more', 2000)
        ok('Live classes' in await body(), 'Admin More lists Live classes')
        await go('/admin/live', 2200)
        t = (await body()).lower(); ok(all(x in t for x in ['live now', 'today', 'room-hours by academy']), 'Admin live monitor shows live now, today, room-hours')
        ok('rajesh kumar academy' in t, 'Academy names listed')
        await pg.screenshot(path='tt-4.png')
        ok(not errs, f'no page errors {errs[:2]}')
        await b.close()
    f = sum(1 for r in res if r.startswith('FAIL')); print(f'\n{len(res) - f} passed, {f} failed'); sys.exit(1 if f else 0)

asyncio.run(main())
