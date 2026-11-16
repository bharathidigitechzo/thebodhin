"""Monkey test: on every screen (same list as mobile_audit, per role), tap every visible button/tab/switch one after
another and catch anything that breaks: JS errors, "Something went wrong", broken text (undefined/NaN/[object Object]),
blank screens. Skips sign-out and a few navigation-away actions; everything else is fair game (mock data).
Usage: python3 monkey.py http://localhost:8765/bodhin-preview.html [max_taps_per_screen]"""
import sys, asyncio, re, json
from playwright.async_api import async_playwright
from mobile_audit import PUBLIC, LEARNER, EDU, ADMIN

URL = sys.argv[1]; MAX = int(sys.argv[2]) if len(sys.argv) > 2 else 14
SKIP = re.compile(r'sign ?out|log ?out|switch to learning|delete account|^back$|go back|close|cancel', re.I)
PROBE = r"""() => { const t = document.body.innerText || ''; return { len: t.trim().length, crashed: /Something went wrong|Unexpected error|Render Error/.test(t),
  broken: (t.match(/\bundefined\b|\bNaN\b|\[object Object\]|Invalid Date|₹NaN/g) || []).slice(0, 3) }; }"""
TARGETS = r"""() => { const out = []; for (const el of document.querySelectorAll('[role=button],[role=tab],[role=switch],[role=checkbox],[role=radio],button')) {
  const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
  if (r.width < 2 || r.height < 2 || s.visibility === 'hidden' || r.bottom < 0 || r.top > innerHeight * 2.5) continue;
  if (el.getAttribute('aria-disabled') === 'true') continue;
  out.push((el.getAttribute('aria-label') || el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 50)); } return out; }"""

async def main():
    problems = []; taps = 0
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for role, email, routes in [('public', None, PUBLIC), ('learner', 'arjun@demo.in', LEARNER), ('educator', 'rajesh@demo.in', EDU), ('admin', 'admin@demo.in', ADMIN)]:
            ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
            pg = await ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)[:220]))
            pg.on('dialog', lambda d: asyncio.ensure_future(d.dismiss()))
            async def go(path, ms=1400):
                await pg.evaluate(f"history.pushState({{}},'', '{path}'); dispatchEvent(new PopStateEvent('popstate'))"); await pg.wait_for_timeout(ms)
            await pg.goto(URL); await pg.wait_for_timeout(1000)
            await pg.evaluate("localStorage.clear(); localStorage.setItem('bodhin.onboarded','1'); localStorage.setItem('bodhin.cookie.v1','essential')"); await pg.goto(URL); await pg.wait_for_timeout(2200)
            if email:
                await go('/sign-in')
                await pg.get_by_label('Email or mobile number').locator('visible=true').last.fill(email)
                await pg.locator('input[aria-label="Password"]:visible').last.fill('demo123')
                await pg.get_by_text('Sign In', exact=True).locator('visible=true').last.click(); await pg.wait_for_timeout(2200)
                if role == 'admin':
                    t = await pg.inner_text('body')
                    if 'verification' in t.lower() or 'Demo code' in t:
                        await pg.get_by_label('Verification code').locator('input').last.fill('123456'); await pg.wait_for_timeout(800)
                        try: await pg.get_by_role('button', name='Verify', exact=False).last.evaluate('e=>e.click()')
                        except Exception: pass
                        await pg.wait_for_timeout(1800)
            for path in routes:
                if re.search(r'live-room|edu/host', path): continue  # covered by live tests (long-running rooms)
                await go(path)
                labels = [l for l in await pg.evaluate(TARGETS) if l and not SKIP.search(l)]
                seen = []
                for lab in labels:
                    if lab in seen: continue
                    seen.append(lab)
                    if len(seen) > MAX: break
                    n0 = len(errs)
                    try:
                        loc = pg.locator('[role=button],[role=tab],[role=switch],[role=checkbox],[role=radio],button').filter(has_text=lab) if not lab.startswith('Show ') else pg.get_by_label(lab)
                        loc = pg.get_by_label(lab, exact=True) if await pg.get_by_label(lab, exact=True).count() else loc
                        await loc.first.evaluate('e => e.click()', timeout=2500); taps += 1
                        await pg.wait_for_timeout(450)
                        pr = await pg.evaluate(PROBE)
                    except Exception as e:
                        continue
                    bad = []
                    if len(errs) > n0: bad.append('JS: ' + errs[-1])
                    if pr['crashed']: bad.append('CRASH screen')
                    if pr['broken']: bad.append('TEXT ' + ','.join(pr['broken']))
                    if pr['len'] < 20: bad.append('BLANK')
                    if bad:
                        problems.append({'role': role, 'path': path, 'tap': lab, 'bad': bad, 'now': await pg.evaluate('location.pathname')})
                        print(f"FAIL {role:8} {path:34} tap «{lab}» → {' | '.join(bad)[:160]}", flush=True)
                    # back to the screen under test (and close any sheet)
                    await pg.keyboard.press('Escape')
                    if (await pg.evaluate('location.pathname')) != path.split('?')[0]: await go(path, 1000)
                print(f"ok   {role:8} {path:34} {len(seen)} taps", flush=True)
            await ctx.close()
        await b.close()
    json.dump(problems, open('/tmp/claude-0/probe/monkey.json', 'w'), indent=1)
    print(f"\n{taps} taps, {len(problems)} problems"); sys.exit(1 if problems else 0)

asyncio.run(main())
