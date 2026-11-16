"""Smart board end-to-end (real Chromium + real mouse drawing).
1) No handwriting engine (normal browser): shapes snap, status says handwriting stays as ink, typing works (Tamil).
2) With a browser handwriting engine (Chrome's Handwriting Recognition API, stubbed with fixed answers so the test is
   deterministic): a written word becomes neat text, alternatives can be picked, and it can go back to handwriting.
Usage: python3 smartboard.py http://localhost:8765/bodhin-preview.html"""
import sys, asyncio, math
from playwright.async_api import async_playwright

STUB = """
window.__inkCalls = [];
class HandwritingStroke { constructor(){ this.p=[]; } addPoint(x){ this.p.push(x); } }
window.HandwritingStroke = HandwritingStroke;
navigator.queryHandwritingRecognizer = async (c) => (['ta','en'].includes(c.languages[0]) ? { textAlternatives: true } : null);
navigator.createHandwritingRecognizer = async (c) => ({
  startDrawing: () => { const s=[]; return { addStroke: (x) => s.push(x), clear: () => {}, getPrediction: async () => { window.__inkCalls.push({ lang: c.languages[0], strokes: s.length, pts: s.reduce((n, x) => n + x.p.length, 0) }); return c.languages[0] === 'ta' ? [{ text: 'வணக்கம்' }, { text: 'வணக்கம்!' }, { text: 'வனக்கம்' }] : [{ text: 'Hello' }, { text: 'Hella' }]; } }; },
});
"""

async def main():
    url = sys.argv[1]; res = []
    def ok(c, n):
        line = ('PASS ' if c else 'FAIL ') + n; res.append(line); print(line, flush=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for phase in ('plain', 'engine'):
            ctx = await b.new_context(viewport={'width': 1280, 'height': 860})
            if phase == 'engine': await ctx.add_init_script(STUB)
            pg = await ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            async def go(path, ms=1600):
                await pg.evaluate(f"history.pushState({{}},'', '{path}'); dispatchEvent(new PopStateEvent('popstate'))"); await pg.wait_for_timeout(ms)
            async def body(): return (await pg.inner_text('body'))
            await pg.goto(url); await pg.wait_for_timeout(1200)
            await pg.evaluate("localStorage.clear(); localStorage.setItem('bodhin.onboarded','1')"); await pg.goto(url); await pg.wait_for_timeout(2500)
            await go('/sign-in')
            await pg.get_by_label('Email or mobile number').locator('visible=true').last.fill('rajesh@demo.in')
            await pg.locator('input[aria-label="Password"]:visible').last.fill('demo123')
            await pg.get_by_text('Sign In', exact=True).locator('visible=true').last.click(); await pg.wait_for_timeout(2400)
            await go('/edu/board', 2200)
            board = pg.get_by_label('Smart board. Write or draw.').locator('visible=true').first
            bb = await board.bounding_box()
            X = lambda fx: bb['x'] + bb['width'] * fx
            Y = lambda fy: bb['y'] + bb['height'] * fy
            async def stroke(pts, steps=4):
                await pg.mouse.move(X(pts[0][0]), Y(pts[0][1])); await pg.mouse.down()
                for (a, c2) in zip(pts, pts[1:]):
                    for k in range(1, steps + 1):
                        t = k / steps; await pg.mouse.move(X(a[0] + (c2[0] - a[0]) * t), Y(a[1] + (c2[1] - a[1]) * t))
                await pg.mouse.up(); await pg.wait_for_timeout(250)
            async def paths(): return await pg.eval_on_selector_all('svg path', 'ps => ps.map(p => p.getAttribute("d") || "")')

            if phase == 'plain':
                t = await body(); ok('Neat' in t and ('handwriting stays as ink' in t or 'not available here' in t), 'Status says what the board can do here (no engine)')
                await stroke([(0.10, 0.15), (0.35, 0.16), (0.35, 0.55), (0.11, 0.54), (0.10, 0.17)])
                ps = await paths(); ok(any(' H' in d and ' V' in d and d.endswith('Z') for d in ps), 'Wobbly box snaps to a clean rectangle')
                pts = [(0.62 + 0.13 * math.cos(a / 24 * 2 * math.pi * 1.05) * 0.6, 0.40 + 0.18 * math.sin(a / 24 * 2 * math.pi * 1.05)) for a in range(25)]
                await stroke(pts, 3)
                ps = await paths(); ok(any(' a' in d for d in ps), 'Wobbly circle snaps to a clean ellipse')
                await stroke([(0.10, 0.80), (0.45, 0.81)], 10)
                ps = await paths(); ok(any(d.count('L') == 1 and d.startswith('M') for d in ps), 'Shaky line becomes a straight line')
                n_before = len(await paths())
                await stroke([(0.70, 0.75), (0.71, 0.80), (0.72, 0.76), (0.73, 0.81)], 2)
                ok(len(await paths()) == n_before + 1, 'Small handwriting stays as (smoothed) ink')
                await pg.get_by_role('radio', name='Type text').first.click(); await pg.wait_for_timeout(300)
                await pg.mouse.click(X(0.5), Y(0.12)); await pg.wait_for_timeout(400)
                await pg.get_by_label('Text for the board').fill('தமிழ் வகுப்பு'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(600)
                ok('தமிழ் வகுப்பு' in await body(), 'Typed Tamil text placed neatly on the board')
                await pg.get_by_role('button', name='Undo').first.click(); await pg.wait_for_timeout(400)
                ok('தமிழ் வகுப்பு' not in await body(), 'Undo removes it')
                await pg.get_by_role('radio', name='Pen').first.click()
                await pg.get_by_role('button', name='Writing language: English. Change').first.click(); await pg.wait_for_timeout(600)
                t = await body(); ok(all(x in t for x in ['தமிழ்', 'हिन्दी', 'తెలుగు', 'ಕನ್ನಡ', 'മലയാളം']), 'Language picker lists Indian languages')
                await pg.get_by_text('தமிழ் · Tamil').first.click(); await pg.wait_for_timeout(600)
                ok(await pg.get_by_role('button', name='Writing language: Tamil. Change').count() == 1, 'Tamil selected')
                await pg.get_by_role('button', name='Clear board').first.click(); await pg.wait_for_timeout(400)
                ok(len(await paths()) == 0, 'Clear board')
                await pg.screenshot(path='board-plain.png')
                # same board inside the live class (host room)
                await go('/edu/host/ls_now', 2600)
                await pg.get_by_role('tab', name='Board').first.click(); await pg.wait_for_timeout(1200)
                t = await body(); ok(await pg.get_by_label('Smart board. Write or draw.').count() >= 1 and 'Neat' in t, 'Live class: Board tab opens the smart board')
                bb = await pg.get_by_label('Smart board. Write or draw.').locator('visible=true').first.bounding_box()
                await stroke([(0.10, 0.15), (0.35, 0.16), (0.35, 0.55), (0.11, 0.54), (0.10, 0.17)])
                ok(any(' H' in d and d.endswith('Z') for d in await paths()), 'Live class: wobbly box snaps to a rectangle')
            else:
                await pg.get_by_role('button', name='Writing language: English. Change').first.click(); await pg.wait_for_timeout(500)
                await pg.get_by_text('தமிழ் · Tamil').first.click(); await pg.wait_for_timeout(900)
                t = await body(); ok('Neat on · தமிழ் · Browser handwriting' in t, 'Status: Tamil ready with the browser engine')
                # write a "word": four small strokes close together
                for k in range(4):
                    x0 = 0.20 + k * 0.035
                    await stroke([(x0, 0.30), (x0 + 0.01, 0.38), (x0 + 0.025, 0.31), (x0 + 0.03, 0.37)], 2)
                await pg.wait_for_timeout(1800)
                t = await body(); ok('வணக்கம்' in t, 'Handwritten word turned into neat Tamil text')
                calls = await pg.evaluate('window.__inkCalls')
                ok(len(calls) == 1 and calls[0]['lang'] == 'ta' and calls[0]['strokes'] == 4 and calls[0]['pts'] > 8, f'All 4 strokes sent once as one word in Tamil ({calls})')
                ok(not any('M' in d and 'L' in d for d in await paths()), 'The handwriting ink was replaced by the text')
                await pg.get_by_role('button', name='வணக்கம். Tap for options').first.click(); await pg.wait_for_timeout(700)
                t = await body(); ok('Did you mean' in t and 'வனக்கம்' in t, 'Tap the text → other suggestions')
                await pg.get_by_text('வணக்கம்!', exact=True).first.click(); await pg.wait_for_timeout(600)
                ok('வணக்கம்!' in await body(), 'Picked suggestion replaces the text')
                await pg.get_by_role('button', name='வணக்கம்!. Tap for options').first.click(); await pg.wait_for_timeout(600)
                await pg.get_by_text('Back to handwriting', exact=True).first.click(); await pg.wait_for_timeout(700)
                ok('வணக்கம்!' not in await body() and len(await paths()) == 4, 'Back to handwriting restores the original strokes')
                # second word far away → separate recognition
                await pg.get_by_role('switch', name='Neat mode').first.click(); await pg.wait_for_timeout(300)
                ok('Free drawing — Neat mode off' in await body(), 'Neat off is shown in the status')
                await stroke([(0.6, 0.7), (0.62, 0.78), (0.64, 0.71)], 2); await pg.wait_for_timeout(1500)
                ok(len(await pg.evaluate('window.__inkCalls')) == 1, 'With Neat off nothing is converted')
                await pg.screenshot(path='board-engine.png')
            ok(not errs, f'no page errors ({phase})'); print('ERRORS', errs[:3])
            await ctx.close()
        await b.close()
    f = sum(1 for r in res if r.startswith('FAIL')); print(f'\n{len(res) - f} passed, {f} failed'); sys.exit(1 if f else 0)

asyncio.run(main())
