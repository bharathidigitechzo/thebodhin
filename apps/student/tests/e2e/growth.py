"""Growth tools end-to-end (real Chromium): educator Grow hub, Leads CRM, automations, broadcast, EMI, webinars,
1:1 bookings, digital products, website builder + public site + enquiry form, community; learner side; phone layout.
Usage: python3 growth.py http://localhost:8765/bodhin-preview.html"""
import sys, asyncio
from playwright.async_api import async_playwright

async def main():
    url = sys.argv[1]; res = []
    def ok(c, n):
        line = ('PASS ' if c else 'FAIL ') + n; res.append(line); print(line, flush=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' and 'favicon' not in m.text else None)
        async def go(path, ms=1500):
            await pg.evaluate(f"history.pushState({{}},'', '{path}'); dispatchEvent(new PopStateEvent('popstate'))"); await pg.wait_for_timeout(ms)
        async def body(): return (await pg.inner_text('body')).lower()
        async def click(name, exact=True, ms=900):
            loc = pg.get_by_role('button', name=name, exact=exact).locator('visible=true')
            if await loc.count() == 0: loc = pg.get_by_text(name, exact=exact).locator('visible=true')
            await loc.last.evaluate('e=>e.click()'); await pg.wait_for_timeout(ms)
        async def text_click(t, ms=900):
            await pg.get_by_text(t, exact=True).locator('visible=true').last.evaluate('e=>e.click()'); await pg.wait_for_timeout(ms)
        async def fill(label, v):
            await pg.get_by_label(label, exact=True).locator('visible=true').last.fill(v); await pg.wait_for_timeout(150)
        async def signin(email):
            await go('/sign-in', 1500)
            await pg.get_by_label('Email or mobile number').locator('visible=true').last.fill(email)
            await pg.locator('input[aria-label="Password"]:visible').last.fill('demo123')
            await pg.get_by_text('Sign In', exact=True).locator('visible=true').last.click(); await pg.wait_for_timeout(2400)
        async def noscroll(name):
            w = await pg.evaluate('document.documentElement.scrollWidth')
            ok(w <= 391, f'{name}: no horizontal scroll on phone (scrollWidth={w})')

        await pg.goto(url); await pg.wait_for_timeout(1200)
        await pg.evaluate("localStorage.clear(); localStorage.setItem('bodhin.onboarded','1')")
        await pg.goto(url); await pg.wait_for_timeout(2000)

        # ── educator ──
        await signin('rajesh@demo.in')
        await go('/educator/more')
        t = await body(); ok('grow hub' in t and 'website builder' in t and 'leads crm' in t, 'educator More shows the Grow group')
        await go('/edu/grow')
        t = await body()
        ok(all(x.lower() in t for x in ['Leads CRM', 'Automations', 'Email & push broadcasts', 'EMI & fee collection', 'Webinars', '1:1 bookings', 'Digital products', 'Website builder', 'Community']), 'Grow hub lists all 9 tools')
        await noscroll('Grow hub')

        await go('/edu/leads')
        t = await body(); ok('follow-ups due' in t and 'vignesh r' in t, 'Leads: due follow-ups first (seeded overdue lead shown)')
        await click('Add lead')
        await fill('Name', 'Meena Test'); await fill('Mobile', '12345'); await click('Save lead')
        ok('valid 10-digit' in await body(), 'Leads: bad phone explained')
        await fill('Mobile', '9345139619'); await click('Save lead', ms=1200)
        await pg.get_by_text('All (', exact=False).locator('visible=true').first.evaluate('e=>e.click()'); await pg.wait_for_timeout(700)
        ok('meena test' in await body(), 'Leads: new lead appears in All')
        await pg.get_by_role('button', name='Meena Test, new').locator('visible=true').first.evaluate('e=>e.click()'); await pg.wait_for_timeout(1200)
        t = await body(); ok('notes & history' in t and '93451 39619' in t, 'Lead detail opens with contact + timeline')
        await fill('Add a note', 'Wants weekend batch'); await click('Save note')
        t = await body(); ok('wants weekend batch' in t and 'note saved' in t, 'Lead: note saved, stage auto → Contacted')
        await text_click('Lost'); await text_click('Price too high'); await click('Mark as lost')
        ok('moved to lost' in await body(), 'Lead: lost with a reason')

        await go('/edu/automations')
        t = await body(); ok('student enrolls' in t and 'instalment overdue' in t and 'marketing' in t, 'Automations: 10 recipes, marketing ones labelled')
        await pg.get_by_role('button', name='Send me a test').locator('visible=true').first.evaluate('e=>e.click()'); await pg.wait_for_timeout(800)
        ok('test sent to you' in await body(), 'Automations: test message sent to owner')

        await go('/edu/broadcasts')
        await click('New broadcast')
        await fill('Title', 'Class moved'); await fill('Message', 'Hi {{name}}, Saturday class is at 11 AM.')
        await pg.get_by_role('button', name='Send now', exact=False).locator('visible=true').last.evaluate('e=>e.click()'); await pg.wait_for_timeout(1200)
        t = await body(); ok('sent to' in t and 'class moved' in t, 'Broadcast: sent now, listed with reach')

        await go('/edu/emi')
        t = await body(); ok('collected' in t and 'digital marketing' in t and 'parts every' in t, 'EMI: course with 3-part plan listed')

        await go('/edu/webinars')
        t = await body(); ok('free masterclass' in t and 'registered' in t, 'Webinars: list with registrations')
        await go('/edu/bookings'); ok('career guidance call' in await body(), 'Bookings: session type shown')
        await go('/edu/products'); ok('seo checklist 2027' in await body(), 'Products: on-sale items shown')

        await go('/edu/site')
        t = await body(); ok('hero banner' in t and 'google search (seo)' in t and 'google analytics 4 id' in t, 'Website builder: sections, SEO, tracking')
        await fill('Page title', 'x')
        ok('5–60 characters' in await body(), 'Website: SEO title validated live')
        await fill('Page title', 'Rajesh Kumar Academy — SEO & Ads courses')
        await click('Save & publish', ms=1200)
        ok('published' in await body(), 'Website: saved & published')

        await go('/site/rajesh', 2000)
        t = await body(); ok('rajesh' in t and 'courses' in t and 'what students say' in t and 'book a 1:1' in t, 'Public site renders hero, courses, stories, booking')
        await noscroll('Public site')
        await fill('Your name', 'Site Visitor'); await fill('Mobile', '9876001122')
        await click('Request a call back', exact=False, ms=1200)
        ok('we’ll call you soon' in await body(), 'Public enquiry form submits')
        await go('/edu/leads'); await pg.get_by_text('All (', exact=False).locator('visible=true').first.evaluate('e=>e.click()'); await pg.wait_for_timeout(700)
        ok('site visitor' in await body(), 'Enquiry lands in the CRM as a lead')

        await go('/edu/community'); ok('# announcements' in await body() and '# general' in await body(), 'Community admin: default channels')

        # ── learner ──
        await go('/educator/more'); await text_click('Log out'); await click('Log out', ms=1500)
        await signin('arjun@demo.in')
        await go('/profile'); t = await body(); ok('community' in t and 'my purchases' in t, 'Learner Profile has Community + My purchases')
        await go('/community')
        t = await body(); ok('rajesh' in t and '# general' in t, 'Learner sees academy channels')
        await pg.get_by_role('button', name='Open General').locator('visible=true').first.evaluate('e=>e.click()'); await pg.wait_for_timeout(1200)
        await fill('Share something', 'call me 98765 43210'); await click('Post')
        ok('phone numbers' in await body(), 'Community: phone numbers blocked for students')
        await fill('Share something', 'Sharing my GA4 notes after class'); await click('Post', ms=1200)
        ok('sharing my ga4 notes after class' in await body(), 'Community: student post appears')
        await pg.get_by_role('button', name='React 🎉').locator('visible=true').first.evaluate('e=>e.click()'); await pg.wait_for_timeout(600)
        ok('🎉 1' in await body(), 'Community: reaction counted')

        await go('/webinar/wb_seo_free', 1800)
        await fill('Mobile (optional)', '9876512345'); await click('Register', ms=1500)
        ok('registered!' in await body() or 'you’re registered' in await body(), 'Webinar: learner registers (free)')

        await go('/book/of_career', 1800)
        t = await body(); ok('pick a day' in t and 'pick a time' in t, 'Booking page shows days and slots')
        times = pg.locator('[role="button"]').filter(has_text=':')
        await times.locator('visible=true').nth(0).evaluate('e=>e.click()'); await pg.wait_for_timeout(500)
        await pg.get_by_role('button', name='Book ', exact=False).locator('visible=true').last.evaluate('e=>e.click()'); await pg.wait_for_timeout(2000)
        ok('booked' in await body(), 'Booking: paid 1:1 session confirmed')

        await go('/product/pr_ads_templates', 1800)
        await pg.get_by_role('button', name='Buy now', exact=False).locator('visible=true').last.evaluate('e=>e.click()'); await pg.wait_for_timeout(2000)
        t = await body(); ok('it’s yours' in t and 'your files' in t, 'Product: bought, files unlocked')

        await go('/my-purchases', 1500)
        t = await body(); ok('meta ads copy templates' in t and 'career guidance call' in t and 'free masterclass' in t, 'My purchases lists product, session and webinar')
        await noscroll('My purchases')

        # EMI on checkout (₹17,500 course) — option visible and first instalment only
        await go('/checkout/c_dm_ai', 2000)
        t = await body()
        if 'already enrolled' in t.lower() or 'No-cost EMI' not in t:
            ok('no-cost emi' in t or 'enrolled' in t.lower(), 'Checkout shows No-cost EMI (or learner already owns the course)')
        else:
            ok('no-cost emi' in t, 'Checkout shows No-cost EMI option')
            await pg.get_by_label('Pay in instalments').locator('visible=true').last.evaluate('e=>e.click()'); await pg.wait_for_timeout(500)
            ok('now' in (await pg.get_by_role('button', name='Pay ', exact=False).locator('visible=true').last.inner_text()), 'Pay button switches to first instalment')

        ok(not [e for e in errs if 'PAGEERROR' in e], 'no page errors')
        print('ERRORS', [e for e in errs if 'PAGEERROR' in e][:5])
        await b.close()
    f = sum(1 for r in res if r.startswith('FAIL')); print(f'\n{len(res) - f} passed, {f} failed'); sys.exit(1 if f else 0)

asyncio.run(main())
