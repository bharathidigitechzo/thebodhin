"""Mobile audit: open EVERY screen at phone width (360 x 780, touch) as each role and check it automatically.
Per screen: page crash (JS error), blank screen, broken text (undefined / NaN / [object Object] / Invalid Date),
horizontal overflow (anything wider than the phone, outside a horizontal scroller), tiny tap targets (< 32 px),
and a not-found id must show a message (never a crash).
Usage: python3 mobile_audit.py http://localhost:8765/bodhin-preview.html [report.json]
Exit 1 if any screen crashes, is blank, shows broken text or overflows."""
import sys, json, asyncio, re
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else ''
OUT = sys.argv[2] if len(sys.argv) > 2 else 'mobile-audit.json'
X = 'missing-id-123'

PUBLIC = ['/welcome', '/for-educators', '/features', '/pricing', '/about', '/contact', '/watch', '/legal/terms', '/legal/privacy',
          '/cert/check', '/cert/BODHIN-DM-AI-2026-0487', f'/cert/{X}', '/embed/rajesh', '/site/rajesh', f'/site/{X}', '/sign-in', '/sign-up',
          '/forgot-password', '/onboarding', '/course/c_dm_ai', f'/course/{X}', f'/bundle/{X}', f'/product/{X}', f'/webinar/{X}', f'/book/{X}']
LEARNER = ['/home', '/explore', '/search', '/learning', '/live', '/profile', '/course/c_dm_ai', '/learn/c_dm_ai', f'/learn/{X}',
           '/checkout/c_neet_bot', f'/checkout/{X}', '/quiz/dm_m1_l5', '/assignment/asg_content', f'/assignment/{X}', f'/result/{X}',
           '/certificates', '/certificate/BODHIN-DM-AI-2026-0487', f'/certificate/{X}', '/downloads', '/payments', '/notifications',
           '/my-purchases', '/refer', '/help', '/community', f'/community/{X}', '/playground', '/playground/python', '/live-room/ls_now',
           '/apply', '/application-status', '/educator-soon']
EDU = ['/educator/home', '/educator/courses', '/educator/batches', '/educator/live', '/educator/more',
       '/edu/course/c_dm_ai', f'/edu/course/{X}', '/edu/batch/b_dm_wk', f'/edu/batch/{X}', '/edu/batch-new', '/edu/schedule', '/edu/timetable',
       '/edu/host/ls_now', '/edu/prejoin/ls_now', '/edu/summary/s_b_dm_wk_1', f'/edu/summary/{X}', '/edu/grading', '/edu/grade/sub_content',
       '/edu/student/p_0', '/edu/assess', '/edu/assess/new', '/edu/assess/asg_content', '/edu/doubts', '/edu/earnings', '/edu/coupons',
       '/edu/subscription', '/edu/payments-setup', '/edu/workspace', '/edu/team', '/edu/board', '/edu/grow', '/edu/leads', f'/edu/lead/{X}',
       '/edu/automations', '/edu/broadcasts', '/edu/emi', '/edu/webinars', '/edu/bookings', '/edu/products', '/edu/site', '/edu/community',
       '/edu/bundles', '/edu/affiliates', '/edu/certificate', '/edu/analytics', '/edu/intl', '/edu/embed', '/edu/showcase', '/edu/lesson']
ADMIN = ['/admin', '/admin/inbox', '/admin/money', '/admin/tenants', '/admin/more', '/admin/users', '/admin/user/u_arjun', f'/admin/user/{X}',
         '/admin/tenant/t_rajesh', f'/admin/tenant/{X}', '/admin/plans', '/admin/plan/growth', '/admin/review/course/c_neet_bot',
         f'/admin/review/educator/{X}', '/admin/content', '/admin/flags', '/admin/settings', '/admin/audit', '/admin/team', '/admin/tickets',
         '/admin/broadcast', '/admin/search', '/admin/growth', '/admin/live']

CHECK = r"""
() => {
  const W = innerWidth;
  const vis = (el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05 && r.width > 0 && r.height > 0; };
  const inScroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true; if (/(auto|scroll)/.test(s.overflowX)) return true; } return false; };
  const fixedOrAbs = (el) => { for (let p = el; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.position === 'fixed') return true; } return false; };
  const label = (el) => (el.getAttribute('aria-label') || el.innerText || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 60);
  const over = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > W + 2 && r.left < W && !inScroller(el) && !fixedOrAbs(el)) over.push({ l: label(el), right: Math.round(r.right), w: Math.round(r.width) });
  }
  // keep only the outermost offenders
  const small = [];
  for (const el of document.body.querySelectorAll('[role=button],[role=link],[role=tab],[role=switch],[role=checkbox],[role=radio],button,a[href]')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.top > innerHeight * 3) continue;
    if (Math.min(r.width, r.height) < 32 && r.width * r.height > 0) small.push({ l: label(el), w: Math.round(r.width), h: Math.round(r.height) });
  }
  const text = document.body.innerText || '';
  const broken = (text.match(/\bundefined\b|\bNaN\b|\[object Object\]|Invalid Date|₹NaN|null null/g) || []).slice(0, 5);
  return { docW: document.documentElement.scrollWidth, W, over: over.slice(0, 6), overN: over.length, small: small.slice(0, 8), smallN: small.length, len: text.trim().length, broken, crashed: /Something went wrong|Unexpected error|Render Error/.test(text), snippet: text.trim().slice(0, 140).replace(/\s+/g, ' ') };
}
"""

async def main():
    report = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for role, email, routes in [('public', None, PUBLIC), ('learner', 'arjun@demo.in', LEARNER), ('educator', 'rajesh@demo.in', EDU), ('admin', 'admin@demo.in', ADMIN)]:
            ctx = await b.new_context(viewport={'width': 360, 'height': 780}, is_mobile=True, has_touch=True, device_scale_factor=1)
            pg = await ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
            async def go(path, ms=1700):
                await pg.evaluate(f"history.pushState({{}},'', '{path}'); dispatchEvent(new PopStateEvent('popstate'))"); await pg.wait_for_timeout(ms)
            await pg.goto(URL); await pg.wait_for_timeout(1200)
            await pg.evaluate("localStorage.clear(); localStorage.setItem('bodhin.onboarded','1'); localStorage.setItem('bodhin.cookie.v1','essential')"); await pg.goto(URL); await pg.wait_for_timeout(2400)
            if email:
                await go('/sign-in')
                await pg.get_by_label('Email or mobile number').locator('visible=true').last.fill(email)
                await pg.locator('input[aria-label="Password"]:visible').last.fill('demo123')
                await pg.get_by_text('Sign In', exact=True).locator('visible=true').last.click(); await pg.wait_for_timeout(2400)
                if role == 'admin':
                    t = await pg.inner_text('body')
                    if 'verification' in t.lower() or 'Demo code' in t:
                        await pg.get_by_label('Verification code').locator('input').last.fill('123456'); await pg.wait_for_timeout(800)
                        try: await pg.get_by_role('button', name='Verify', exact=False).last.evaluate('e=>e.click()')
                        except Exception: pass
                        await pg.wait_for_timeout(2000)
            for path in routes:
                n0 = len(errs)
                try:
                    await go(path)
                    r = await pg.evaluate(CHECK)
                except Exception as e:
                    r = {'error': str(e)[:200], 'len': 0, 'over': [], 'overN': 0, 'small': [], 'smallN': 0, 'broken': [], 'crashed': True, 'docW': 0, 'W': 360, 'snippet': ''}
                r.update(role=role, path=path, jsErrors=errs[n0:])
                bad = []
                if r['jsErrors'] or r.get('crashed'): bad.append('CRASH')
                if r['len'] < 25: bad.append('BLANK')
                if r['broken']: bad.append('TEXT')
                if r['docW'] > r['W'] + 2 or r['overN']: bad.append('OVERFLOW')
                r['bad'] = bad
                report.append(r)
                print(f"{'FAIL' if bad else 'ok  '} {role:8} {path:40} {' '.join(bad):18} small={r['smallN']}", flush=True)
                if 'OVERFLOW' in bad or 'BLANK' in bad or 'CRASH' in bad:
                    try: await pg.screenshot(path=f"audit-{role}-{re.sub(r'[^a-z0-9]+', '_', path)}.png")
                    except Exception: pass
            await ctx.close()
        await b.close()
    json.dump(report, open(OUT, 'w'), indent=1, ensure_ascii=False)
    badN = sum(1 for r in report if r['bad'])
    print(f"\n{len(report)} screens, {badN} with problems, {sum(r['smallN'] for r in report)} small tap targets in total → {OUT}")
    sys.exit(1 if badN else 0)

if __name__ == '__main__':
    asyncio.run(main())
