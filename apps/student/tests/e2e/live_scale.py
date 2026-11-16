"""Live class at scale in a real browser: a normal class gives an interactive seat; when the class is full the learner
gets Broadcast view (no mic/camera/chat, Q&A + polls still work, 1 question / 30 s). Admin can see and change the seat setting.
Usage: python3 live_scale.py http://localhost:8765/bodhin-preview.html"""
import sys, asyncio
from playwright.async_api import async_playwright

async def main():
    url = sys.argv[1]; res = []
    def ok(c, n):
        line = ('PASS ' if c else 'FAIL ') + n; res.append(line); print(line, flush=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 412, 'height': 900}); pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        async def go(path, ms=1800):
            await pg.evaluate(f"history.pushState({{}},'', '{path}'); dispatchEvent(new PopStateEvent('popstate'))"); await pg.wait_for_timeout(ms)
        async def body(): return await pg.inner_text('body')
        async def sign_in(email):
            await go('/sign-in')
            await pg.get_by_label('Email or mobile number').locator('visible=true').last.fill(email)
            await pg.locator('input[aria-label="Password"]:visible').last.fill('demo123')
            await pg.get_by_text('Sign In', exact=True).locator('visible=true').last.click(); await pg.wait_for_timeout(2400)
        async def set_seats(n):
            await pg.evaluate(f"(()=>{{const k=Object.keys(localStorage).find(k=>k.startsWith('bodhin.mockdb'));const d=JSON.parse(localStorage.getItem(k));d.platformConfig.liveInteractiveSeats={n};localStorage.setItem(k,JSON.stringify(d))}})()")
            await pg.goto(url); await pg.wait_for_timeout(2400)
        await pg.goto(url); await pg.wait_for_timeout(1200)
        await pg.evaluate("localStorage.clear(); localStorage.setItem('bodhin.onboarded','1')"); await pg.goto(url); await pg.wait_for_timeout(2500)
        await sign_in('arjun@demo.in')
        await go('/live', 2200)
        live_id = await pg.evaluate("(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('bodhin.mockdb'));return k?1:0})()")
        # find a class that is live now for Arjun from the Live tab
        await pg.get_by_text('Join class', exact=True).first.click(); await pg.wait_for_timeout(2600)
        t = await body(); ok('Raise hand' in t and 'Broadcast view' not in t, 'Normal class → interactive seat (mic, hand, chat)')
        path = await pg.evaluate('location.pathname')
        await set_seats(100)  # demo room already has 247 people
        await go(path, 3000)
        t = await body()
        ok('Broadcast view' in t and 'behind' in t, 'Full class → Broadcast view banner says it is a few seconds behind')
        ok('Raise hand' not in t and 'Unmute' not in t, 'No mic / camera / raise hand in broadcast view')
        ok(await pg.get_by_role('tab', name='Chat').count() == 0 and await pg.get_by_role('tab', name='Q&A').count() >= 1, 'Open chat hidden, Q&A available')
        box = pg.get_by_label('Ask a question')
        await box.fill('What is a good CTR for search ads?'); await box.press('Enter'); await pg.wait_for_timeout(500)
        ok('What is a good CTR' in await body(), 'Broadcast viewer can ask a question')
        await box.fill('Second question too fast?'); await box.press('Enter'); await pg.wait_for_timeout(500)
        ok('one question every 30 seconds' in await body(), 'Second question within 30 s is held back with a clear message')
        await pg.screenshot(path='ls-1.png')
        # admin sees the setting
        await pg.evaluate("(()=>{Object.keys(localStorage).filter(k=>!k.startsWith('bodhin.mockdb')&&k!=='bodhin.onboarded').forEach(k=>localStorage.removeItem(k))})()")
        await pg.goto(url); await pg.wait_for_timeout(2200)
        await sign_in('admin@demo.in')
        t = await body()
        if 'verification' in t.lower() or 'Demo code' in t:
            await pg.get_by_label('Verification code').locator('input').last.fill('123456'); await pg.wait_for_timeout(800)
            try: await pg.get_by_role('button', name='Verify', exact=False).last.evaluate('e=>e.click()')
            except Exception: pass
            await pg.wait_for_timeout(2000)
        await go('/admin/settings', 2200)
        t = await body(); ok('Interactive seats per class' in t and '100 seats' in t, 'Admin Platform rules shows the seat setting')
        ok(not errs, f'no page errors {errs[:2]}')
        await b.close()
    f = sum(1 for r in res if r.startswith('FAIL')); print(f'\n{len(res) - f} passed, {f} failed'); sys.exit(1 if f else 0)
asyncio.run(main())
