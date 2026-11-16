"""Round 2 end-to-end (real Chromium, phone): public home/pricing/legal, educator bundles, add-ons, affiliates, certificate
designer, analytics, international pricing, embed; learner bundle purchase, refer & earn, certificate PDF page, checkout add-on + USD.
Usage: python3 round2.py http://localhost:8765/bodhin-preview.html"""
import sys, asyncio
from playwright.async_api import async_playwright

async def main():
    url = sys.argv[1]; res = []
    def ok(c, n):
        line = ('PASS ' if c else 'FAIL ') + n; res.append(line); print(line, flush=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await (await b.new_context(viewport={'width': 390, 'height': 844})).new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        async def go(path, ms=1500):
            await pg.evaluate(f"history.pushState({{}},'', '{path}'); dispatchEvent(new PopStateEvent('popstate'))"); await pg.wait_for_timeout(ms)
        async def body(): return (await pg.inner_text('body')).lower()
        async def click(name, exact=True, ms=1000):
            loc = pg.get_by_role('button', name=name, exact=exact).locator('visible=true')
            if await loc.count() == 0: loc = pg.get_by_text(name, exact=exact).locator('visible=true')
            await loc.last.evaluate('e=>e.click()'); await pg.wait_for_timeout(ms)
        async def signin(email):
            await go('/sign-in')
            await pg.get_by_label('Email or mobile number').locator('visible=true').last.fill(email)
            await pg.locator('input[aria-label="Password"]:visible').last.fill('demo123')
            await pg.get_by_text('Sign In', exact=True).locator('visible=true').last.click(); await pg.wait_for_timeout(2400)
        async def noscroll(n):
            w = await pg.evaluate('document.documentElement.scrollWidth'); ok(w <= 391, f'{n}: no horizontal scroll (scrollWidth={w})')

        await pg.goto(url); await pg.wait_for_timeout(1200)
        await pg.evaluate("localStorage.clear()"); await pg.goto(url); await pg.wait_for_timeout(3200)

        # public site: landing + navigation flow
        ok(await pg.evaluate('location.pathname') == '/welcome', 'New web visitor lands on the public home')
        t = await body(); ok('free lessons' in t and 'watch all free videos' in t, 'Home: floating video wall of free lessons')
        await pg.get_by_role('button', name='Play free video', exact=False).locator('visible=true').first.evaluate('e=>e.click()'); await pg.wait_for_timeout(1500)
        t = await body(); ok('free video ·' in t and 'join ·' in t and 'more videos' in t, 'Tap a video → plays in a sheet with Join + More videos')
        await click('More videos', ms=1800); ok(await pg.evaluate('location.pathname') == '/watch' and 'learn something before you decide' in await body(), 'Watch page with all free videos')
        await go('/welcome', 1800)
        t = await body(); ok('i want to learn' in t and 'i want to teach' in t, 'Home: two clear paths (learn / teach)')
        await pg.get_by_role('button', name='Open menu').locator('visible=true').first.evaluate('e=>e.click()'); await pg.wait_for_timeout(700)
        ok('you are here' in await body(), 'Phone menu shows where you are')
        await pg.get_by_role('link', name='For educators').locator('visible=true').last.evaluate('e=>e.click()'); await pg.wait_for_timeout(1800)
        t = await body(); ok(await pg.evaluate('location.pathname') == '/for-educators' and 'your name on the door' in t and 'four steps to your first student' in t, 'Menu → For educators page')
        await noscroll('For educators')
        await click('See pricing', ms=1800); ok(await pg.evaluate('location.pathname') == '/pricing', 'Bottom action bar → Pricing')
        await click('Up to 1,000'); await pg.get_by_label('Leads CRM').locator('visible=true').last.evaluate('e=>e.click()'); await pg.wait_for_timeout(500)
        t = await body(); ok('institute · ₹7,999/month' in t and 'start with institute' in t, 'Plan finder recommends Institute for 1,000 students + CRM')
        await go('/features', 1500); t = await body(); ok('tools. one login.' in t and 'leads crm' in t and 'growth+' in t, 'Features: every tool with its starting plan')
        await click('Sell (7)', ms=700); t = await body(); ok('emi / instalments' in t and 'leads crm' not in t, 'Features filter by job')
        await go('/for-educators', 1500); t = await body(); ok('follow the money' in t and '₹0' in t, 'Money-flow diagram (own student → ₹0 to Bodhin)')
        await click('Found you on Bodhin', ms=2200); ok('20%' in await body() and '− ₹400' in await body(), 'Marketplace case shows 20% = ₹400')
        await go('/cert/check', 1300); await pg.get_by_label('Certificate ID').locator('visible=true').last.fill('NOPE-1'); await click('Check', ms=1300)
        ok('not found' in await body() and 'no certificate with this id' in await body(), 'Certificate check: unknown ID says Not found')
        await go('/site/rajesh', 2000); t = await body()
        ok('can rajesh' in t and 'decline' in t and 'accept' in t, 'Academy site asks before loading analytics')
        await click('Decline', ms=800); t = await body(); ok('analytics off · change' in t, 'Choice shown as a status chip (Analytics off)')
        ok(await pg.evaluate('!window.__bodhinTrackers'), 'Declined → no tracker loaded')
        ok((await pg.title()).lower().startswith('rajesh kumar academy'), 'Academy site sets its SEO title')
        await go('/pricing', 1300); ok('pricing' in (await pg.title()).lower() and '₹799' in await pg.title(), 'Pricing page has its own title')
        await go('/about', 1200); ok('four rules we build by' in await body(), 'About page')
        await go('/contact', 1200)
        await pg.get_by_label('Your name').locator('visible=true').last.fill('Test Visitor'); await pg.get_by_label('Mobile', exact=True).locator('visible=true').last.fill('9345100000')
        await click('Request a call back', ms=1200); ok('got it, test' in await body(), 'Contact form: clear success state + next steps')
        await noscroll('Contact')

        # public pages
        await go('/welcome', 1800); t = await body()
        ok('watch before you join' in t and 'educators on bodhin' in t and 'free preview' in t, 'Home: showcase with free previews + educators')
        await noscroll('Home')
        await go('/pricing', 1500); t = await body()
        ok('₹799' in t and '₹1,499' in t and '₹3,499' in t and '₹7,999' in t, 'Pricing: all plan prices from the pricing document')
        ok('compare tools' in t and 'leads crm' in t and '20%' in t, 'Pricing: comparison table + 20% marketplace note')
        await click('Annual (save ~20%)'); ok('₹7,670' in await body(), 'Pricing: annual prices')
        await noscroll('Pricing')
        await go('/legal/privacy', 1200); ok('digital personal data protection' in await body() and 'draft for review' in await body(), 'Privacy page (draft flagged for lawyer)')
        await go('/sign-in', 1200); ok('pricing for educators' in await body(), 'Sign-in links to pricing / legal')

        # educator
        await signin('rajesh@demo.in')
        await go('/edu/showcase'); t = await body(); ok('showcase videos' in t and 'promotion on' in t and 'plays' in t, 'Educator: showcase videos with consent state')
        await go('/edu/grow'); t = await body()
        ok(all(x in t for x in ['analytics', 'bundles & add-ons', 'certificate designer', 'affiliate program', 'international pricing', 'embed & wordpress']), 'Grow hub lists round-2 tools')
        await go('/edu/bundles'); ok('digital growth pack' in await body(), 'Bundles: seeded bundle')
        await click('New bundle'); await pg.get_by_label('Bundle name').locator('visible=true').last.fill('Test pack')
        await click('Publish'); ok('pick 2–10' in await body(), 'Bundles: validation shown')
        await click('Checkout add-ons'); ok('track your seo results' in await body(), 'Add-ons tab shows offer + take rate')
        await go('/edu/affiliates'); t = await body(); ok('karthi7q2x' in t and 'ready to pay' in t, 'Affiliates: program, affiliates, payouts')
        await go('/edu/certificate', 1500); t = await body(); ok('certificate of completion' in t and 'arjun kumar' in t, 'Certificate designer: live preview')
        await click('Modern'); await click('Save design', ms=1200); ok('saved.' in await body(), 'Certificate design saved')
        await go('/edu/analytics', 1500); t = await body(); ok('daily earnings' in t and 'course page → paid' in t and 'countries' in t, 'Analytics: trend, funnel, countries')
        await go('/edu/intl'); t = await body(); ok('connected' in t and '$199' in t, 'International pricing: gateway + USD price')
        await go('/edu/embed'); t = await body(); ok('[bodhin academy="rajesh"]' in t and '<iframe' in t, 'Embed: WordPress + iframe snippets')
        await go('/embed/rajesh', 1500); ok('enrol now' in await body(), 'Public embed widget renders')

        # learner
        await go('/educator/more'); await click('Log out'); await click('Log out', ms=1500)
        await signin('arjun@demo.in')
        await go('/profile'); ok('refer & earn' in await body(), 'Profile shows Refer & earn')
        await go('/refer'); await click('Join · earn 15%', ms=1200); ok('you’re in' in await body() and '?aff=' in await body(), 'Refer: joined, link shown')
        await go('/bundle/bd_growth_pack', 1500); t = await body(); ok('save' in t and 'bundle price' in t, 'Bundle page shows savings')
        await go('/course/c_seo_growth', 1800); ok('bundle: digital growth pack' in await body(), 'Course page shows its bundle')
        await go('/checkout/c_dm_ai', 1800); t = await body()
        if 'enrolled' in t and '$199' not in t: ok(True, 'Checkout (already enrolled — skipped currency check)')
        else:
            ok('$199' in t and 'pay in' in t, 'Checkout offers USD for international learners')
            await click('$199', ms=600); ok('pay $199' in await body(), 'Pay button switches to USD')
        await go('/certificates', 1500)
        cert = pg.get_by_role('button', name='Certificate:', exact=False).locator('visible=true')
        if await cert.count():
            await cert.first.evaluate('e=>e.click()'); await pg.wait_for_timeout(800)
            await click('Open & PDF', ms=1500); t = await body()
            ok('download pdf' in t and 'this is to certify that' in t, 'Certificate page with academy design + PDF')
        else: ok(False, 'learner has a certificate to open')
        await noscroll('Certificate')
        # super admin: growth overview + showcase moderation
        await go('/profile', 1200)
        if await pg.get_by_text('Log out', exact=True).locator('visible=true').count():
            await click('Log out'); await click('Log out', ms=1500)
        await go('/sign-in')
        await pg.get_by_label('Email or mobile number').locator('visible=true').last.fill('admin@demo.in')
        await pg.locator('input[aria-label="Password"]:visible').last.fill('demo123')
        await pg.get_by_text('Sign In', exact=True).locator('visible=true').last.click(); await pg.wait_for_timeout(2200)
        if 'verification' in (await body()):
            await pg.get_by_label('Verification code').locator('input').last.fill('123456'); await pg.wait_for_timeout(2200)
        await go('/admin/growth', 1800); t = await body()
        ok('growth tools' in t and 'adoption' in t and 'rajesh kumar academy' in t, 'Super Admin: growth adoption per academy')
        await click('Showcase videos', exact=False, ms=900); t = await body()
        ok('remove from bodhin pages' in t and 'plays' in t, 'Super Admin: showcase video list')
        await click('Remove from Bodhin pages', ms=800); await click('Poor audio/video quality', ms=300); await click('Remove', ms=1200)
        ok('removed. the educator was notified' in await body() and 'blocked by bodhin' in await body(), 'Super Admin removes a video with a reason')
        ok(not errs, 'no page errors'); print('ERRORS', errs[:3])
        await b.close()
    f = sum(1 for r in res if r.startswith('FAIL')); print(f'\n{len(res) - f} passed, {f} failed'); sys.exit(1 if f else 0)

asyncio.run(main())
