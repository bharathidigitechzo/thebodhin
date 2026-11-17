"""Nov 16 change request, end to end in the browser (phone 390 x 844, then desktop 1366 x 900):
student Quizzes / Assignments / Certificates sections, 1:1 mentorship request → tutor accepts → student notified,
certificate at 75% → educator approves → student downloads + public verify, course-wide live class → buyers see it,
Community → Create announcement, Timetable reminders, tutor Create course with category "Other", cover image and intro
video upload with preview, navigation that never disappears on inner pages, role-correct sidebars, Switch dashboard,
admin portal (Live classes, Certificates, Students). Usage: python3 change_request.py http://localhost:8765/bodhin-preview.html"""
import sys, asyncio, base64, os, tempfile
from playwright.async_api import async_playwright

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAGklEQVR4nGNkYPjPQApgIkn1qIZRDaMaBk8DAG9UARJOKmm4AAAAAElFTkSuQmCC')

async def main():
    url = sys.argv[1]; res = []
    def ok(c, n):
        line = ('PASS ' if c else 'FAIL ') + n; res.append(line); print(line, flush=True)
    tmp = tempfile.mkdtemp()
    cover = os.path.join(tmp, 'cover.png'); open(cover, 'wb').write(PNG)
    video = os.path.join(tmp, 'intro.mp4'); open(video, 'wb').write(b'\x00\x00\x00\x18ftypmp42' + b'\x00' * 2048)
    bad = os.path.join(tmp, 'cover.gif'); open(bad, 'wb').write(b'GIF89a' + b'\x00' * 64)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        async def go(path, ms=1700):
            await pg.evaluate(f"history.pushState({{}},'', '{path}'); dispatchEvent(new PopStateEvent('popstate'))"); await pg.wait_for_timeout(ms)
        async def body(): return await pg.inner_text('body')
        async def btn(name, ms=1400, exact=False):
            await pg.get_by_role('button', name=name, exact=exact).locator('visible=true').last.evaluate('e=>e.click()'); await pg.wait_for_timeout(ms)
        async def dbset(js):
            await pg.evaluate("(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('bodhin.mockdb'));const d=JSON.parse(localStorage.getItem(k));(" + js + ")(d);localStorage.setItem(k,JSON.stringify(d))})()")
        async def dbget(js):
            return await pg.evaluate("(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('bodhin.mockdb'));const d=JSON.parse(localStorage.getItem(k));return (" + js + ")(d)})()")
        async def sign_out():
            await pg.evaluate("(()=>{Object.keys(localStorage).filter(k=>!k.startsWith('bodhin.mockdb')&&k!=='bodhin.onboarded'&&!k.startsWith('bodhin.cookie')).forEach(k=>localStorage.removeItem(k))})()")
            await pg.goto(url); await pg.wait_for_timeout(2000)
        async def sign_in(email):
            await sign_out()
            await go('/sign-in')
            await pg.get_by_label('Email or mobile number').locator('visible=true').last.fill(email)
            await pg.locator('input[aria-label="Password"]:visible').last.fill('demo123')
            await pg.get_by_text('Sign In', exact=True).locator('visible=true').last.click(); await pg.wait_for_timeout(2400)
            t = await body()
            if 'Demo code' in t or 'verification code' in t.lower():
                await pg.get_by_label('Verification code').locator('input').last.fill('123456'); await pg.wait_for_timeout(800)
                try: await pg.get_by_role('button', name='Verify', exact=False).last.evaluate('e=>e.click()')
                except Exception: pass
                await pg.wait_for_timeout(2000)
        async def bar_ok():
            return await pg.locator('[data-testid="area-bar"]').locator('visible=true').count() == 1

        await pg.goto(url); await pg.wait_for_timeout(1000)
        await pg.evaluate("localStorage.clear(); localStorage.setItem('bodhin.onboarded','1'); localStorage.setItem('bodhin.cookie.v1','essential')"); await pg.goto(url); await pg.wait_for_timeout(2200)

        # ── Student portal ──
        await sign_in('arjun@demo.in')
        await go('/quizzes'); t = await body()
        ok('Quizzes' in t and ('Start quiz' in t or 'Result' in t or 'No quizzes yet' in t) and 'Assignment' not in t.split('Quizzes', 1)[1][:200], 'Student → Quizzes section lists quizzes of bought courses')
        ok(await bar_ok(), 'Quizzes page keeps the bottom navigation (no disappearing modules)')
        await go('/assignments'); t = await body()
        ok('Assignments' in t and ('Submit' in t or 'Feedback' in t or 'View' in t or 'No assignments yet' in t), 'Student → Assignments section')
        await go('/profile', 1800); t = await body()
        ok('YOUR SECTIONS' in t and 'Quizzes' in t and 'Certificates' in t and 'Playground' in t, 'Profile shows every student section (nothing hidden under More)')
        await go('/live', 2000); t = await body()
        ok('Book a 1:1 with your tutor' in t and '1:1 MENTORSHIP' in t, 'Live tab: 1:1 mentorship section')
        await go('/mentorship', 1800)
        await btn('Book a 1:1', 1200)
        t = await body()
        ok('Meera' in t or 'Rajesh' in t or 'Bodhin mentors' in t, 'Booking: tutors of the chosen course are listed')
        # pick c_dm_ai (has tutor Meera)
        dm = 'Digital Marketing & AI Mastery'
        await pg.get_by_role('button', name=dm[:26], exact=False).locator('visible=true').first.evaluate('e=>e.click()'); await pg.wait_for_timeout(400)
        await pg.get_by_role('button', name='Meera', exact=False).locator('visible=true').first.evaluate('e=>e.click()'); await pg.wait_for_timeout(300)
        await pg.get_by_label('What do you need help with?').locator('visible=true').last.fill('Please review my Meta ads campaign structure')
        await btn('Send request', 1600)
        t = await body()
        ok('Request sent' in t and 'Waiting for reply' in t, 'Student sends a 1:1 request → status "Waiting for reply"')

        # ── Tutor (Meera) ──
        await sign_in('meera@demo.in')
        await go('/educator/home', 2200); t = await body()
        ok('YOUR MODULES' in t and 'Timetable' in t and 'Quizzes' in t and 'Community' in t, 'Tutor dashboard shows all teaching modules')
        ok('Playground' not in t and 'Learner' not in t, 'Tutor dashboard has no Playground / learner dashboard')
        await pg.get_by_role('button', name='Create', exact=True).locator('visible=true').last.evaluate('e=>e.click()'); await pg.wait_for_timeout(900)
        t = await body()
        ok('Create course' in t and 'Quiz or assignment' in t and 'Schedule live class' in t, 'Create menu includes Create course (tutor)')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        n_before = await dbget("(d)=>d.notifications.filter(n=>n.userId==='u_meera'&&/mentorship request/i.test(n.title)).length")
        ok(n_before >= 1, 'Tutor got a notification for the 1:1 request')
        await go('/edu/mentorship', 2000); t = await body()
        ok('Please review my Meta ads' in t and 'WAITING FOR YOUR REPLY' in t, 'Tutor sees the request in 1:1 mentorship')
        ok(await bar_ok(), 'Mentorship page keeps the bottom navigation with More')
        await btn('Accept', 1000)
        await pg.get_by_label('Note for the student (optional)').locator('visible=true').last.fill('Bring your ad account screenshots')
        await btn('Confirm and notify', 1800)
        t = await body()
        ok('Confirmed.' in t and 'UPCOMING SESSIONS' in t, 'Tutor accepts → session confirmed')
        await go('/edu/community', 2000); t = await body()
        ok('Create announcement' in t, 'Community has Create announcement')
        ok(await bar_ok(), 'Community keeps the navigation (More does not disappear)')
        await btn('Create announcement', 1000)
        await pg.get_by_label('Title').locator('visible=true').last.fill('Doubt clearing on Saturday')
        await pg.get_by_label('Message').locator('visible=true').last.fill('Join at 7 pm. Bring your questions.')
        await btn('Post announcement', 1800)
        ok('Announcement posted' in await body(), 'Announcement posted and students notified')
        await go('/edu/timetable', 1800)
        await pg.get_by_role('tab', name='Reminders', exact=False).locator('visible=true').first.evaluate('e=>e.click()'); await pg.wait_for_timeout(600)
        await btn('Reminder', 900)
        await pg.get_by_label('What to do').locator('visible=true').last.fill('Create quiz for module 4')
        await btn('Add reminder', 1400)
        t = await body()
        ok('Create quiz for module 4' in t and 'Reminder added' in t, 'Timetable → Reminders: add a teaching reminder')
        await pg.get_by_role('tab', name='Meetings', exact=False).locator('visible=true').first.evaluate('e=>e.click()'); await pg.wait_for_timeout(600)
        ok('Create quiz for module 4' not in await body(), 'Reminders are not shown as meetings')
        await go('/educator/more', 1800); t = await body()
        ok('Switch to learner view' not in t and 'Profile & account' in t, 'More: no learner view; Profile & account instead')
        await go('/edu/account', 1600); t = await body()
        ok('password' in t.lower() and not any(x in t for x in ['Playground', 'Refer', 'Downloads', 'My purchases', 'My certificates']), 'Tutor profile has only account items')
        # create course as tutor
        await go('/edu/new-course', 2600)
        ok('/edu/course/' in await pg.evaluate('location.pathname'), 'Tutor: Create course opens the course builder')
        await pg.get_by_label('Category: choose a category').locator('visible=true').first.evaluate('e=>e.click()'); await pg.wait_for_timeout(700)
        await pg.get_by_label('Other: add a new category').locator('visible=true').first.evaluate('e=>e.click()'); await pg.wait_for_timeout(500)
        await pg.get_by_label('New category name').locator('visible=true').last.fill('Spoken Tamil')
        await btn('Save category', 900)
        ok(await pg.get_by_label('Category: Spoken Tamil').count() >= 1, 'Category "Other" → new category saved and selected')
        async with pg.expect_file_chooser() as fc:
            await btn('Upload cover image', 300)
        await (await fc.value).set_files(bad); await pg.wait_for_timeout(900)
        ok('Use a JPG, PNG or WebP image' in await body(), 'Cover upload rejects a GIF with a clear message')
        async with pg.expect_file_chooser() as fc:
            await btn('Upload cover image', 300)
        await (await fc.value).set_files(cover); await pg.wait_for_timeout(1500)
        ok(await pg.locator('[aria-label$=" cover"]').count() >= 1 and 'Replace image' in await body(), 'Cover image preview shown; Replace / Remove offered')
        async with pg.expect_file_chooser() as fc:
            await btn('Upload intro video', 300)
        await (await fc.value).set_files(video); await pg.wait_for_timeout(1200)
        ok(await pg.locator('video').count() >= 1 and 'intro.mp4' in await body(), 'Intro video preview shown before saving')

        # ── Student gets the replies ──
        await sign_in('arjun@demo.in')
        await go('/notifications', 1800); t = await body()
        ok('Mentorship confirmed' in t and 'Doubt clearing on Saturday' in t, 'Student notified: 1:1 confirmed + announcement')
        await go('/mentorship', 1600)
        ok('Confirmed' in await body(), 'Student sees the 1:1 as Confirmed')

        # ── Certificate: 75% + quiz → educator approves ──
        await dbset("""(d)=>{const ids=[];[5,6,5,6].forEach((n,m)=>{for(let i=1;i<=n;i++)ids.push(`dm_m${m+1}_l${i}`)});const e=d.enrollments.find(x=>x.userId==='u_arjun'&&x.courseId==='c_dm_ai');e.completedLessonIds=ids;
          d.academy=Object.assign({v:1,certRequests:[],certSettings:{},certDesigns:[],mentor:[],reminders:[],categories:[],courseLive:[],liveCancelled:{}},d.academy||{});d.academy.certSettings['t_rajesh']={mode:'approval',requiredQuiz:{c_dm_ai:'none'}};window.__next='dm_m5_l1'}""")
        nxt = await pg.evaluate('window.__next')
        await pg.goto(url); await pg.wait_for_timeout(2200)
        await go(f'/learn/c_dm_ai?lesson={nxt}', 2600)
        await pg.get_by_role('checkbox', name='Mark lesson complete').locator('visible=true').first.click(); await pg.wait_for_timeout(1200)
        await go('/certificates', 2200); t = await body()
        ok('In review' in t, 'At 75% (+ quiz) the certificate goes to the educator: "In review"')
        await sign_in('rajesh@demo.in')
        await go('/edu/certificates', 2000); t = await body()
        ok('Arjun' in t and 'Approve' in t, 'Educator sees the certificate request')
        await btn('Approve', 1800)
        ok('Approved.' in await body(), 'Educator approves')
        # course-wide live class
        await go('/edu/schedule', 2000)
        await pg.get_by_role('button', name='Everyone who bought a course', exact=False).locator('visible=true').first.evaluate('e=>e.click()'); await pg.wait_for_timeout(400)
        await pg.get_by_role('button', name=dm[:30], exact=False).locator('visible=true').first.evaluate('e=>e.click()'); await pg.wait_for_timeout(300)
        await pg.get_by_label('Class title').locator('visible=true').last.fill('Course-wide doubt session')
        await btn('Schedule class', 2000)
        ok('/educator/live' in await pg.evaluate('location.pathname'), 'Educator schedules a live class for the whole course')
        await sign_in('arjun@demo.in')
        await go('/certificates', 2200); t = await body()
        ok(dm in t and 'In review' not in t, 'Student: approved certificate is in Certificates')
        cid = await dbget("(d)=>d.certificates.find(c=>c.userId==='u_arjun'&&c.courseId==='c_dm_ai').id")
        await go(f'/cert/{cid}', 2000); t = (await body()).lower()
        ok('valid' in t or 'verified' in t or 'genuine' in t, 'Public verify page confirms it')
        await go('/live', 2000); t = await body()
        ok('Course-wide doubt session' in t, 'Student sees the course-wide class in Live')
        await go('/notifications', 1500)
        ok('Certificate approved' in await body() and 'New live class scheduled' in await body(), 'Student notified: certificate approved + class scheduled')
        await ctx.close()

        # ── Desktop: sidebars per role, switch dashboard, admin portal ──
        ctx = await b.new_context(viewport={'width': 1366, 'height': 900})
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await pg.goto(url); await pg.wait_for_timeout(1500)
        await sign_in('rajesh@demo.in')
        await go('/edu/community', 2200)
        nav = await pg.evaluate("[...document.querySelectorAll('[role=navigation] a,[role=navigation] [role=link]')].map(e=>e.getAttribute('aria-label')||e.innerText)")
        want = ['Dashboard', 'Courses', 'Create course', 'Live classes', 'Timetable', 'Quizzes', 'Assignments', 'Students', 'Community', '1:1 mentorship', 'Certificates']
        ok(all(w in nav for w in want) and 'Playground' not in nav, f'Educator sidebar shows all teaching modules in order, no Playground ({len(nav)} items)')
        ok([nav.index(w) for w in want[:6]] == sorted(nav.index(w) for w in want[:6]), 'Teaching modules ordered by priority')
        await pg.get_by_label('Switch dashboard').first.click(); await pg.wait_for_timeout(700)
        await pg.get_by_role('button', name='Student dashboard', exact=False).first.click(); await pg.wait_for_timeout(2200)
        nav = await pg.evaluate("[...document.querySelectorAll('[role=navigation] a,[role=navigation] [role=link]')].map(e=>e.getAttribute('aria-label')||e.innerText)")
        ok(['Home', 'Explore', 'My Learning', 'Live', 'Quizzes', 'Assignments', 'Community', 'Playground', 'Certificates', 'Profile'] == nav, f'Switch dashboard → student sidebar with every section, in order ({nav})')
        await pg.get_by_label('Switch dashboard').first.click(); await pg.wait_for_timeout(700)
        await pg.get_by_role('button', name='Educator dashboard', exact=False).first.click(); await pg.wait_for_timeout(2200)
        ok('/educator/home' in await pg.evaluate('location.pathname'), 'Switch back → educator dashboard')
        await sign_in('admin@demo.in')
        await go('/admin/classes', 2200); t = await body()
        ok('Live classes' in t and 'Schedule live class' in t, 'Admin portal → Live classes (Bodhin courses)')
        await go('/edu/students', 2200); t = await body()
        nav = await pg.evaluate("[...document.querySelectorAll('[role=navigation] a,[role=navigation] [role=link]')].map(e=>e.getAttribute('aria-label')||e.innerText)")
        ok('Students' in t and 'BODHIN ADMIN' in t and 'Bodhin courses' in nav and 'Tenants' in nav, 'Admin on shared tools keeps the admin sidebar (role-correct navigation)')
        await go('/edu/certificates', 2000)
        ok('Certificates' in await body() and 'Requests' in await body(), 'Admin → Certificate management')
        await go('/edu/mentorship', 2000)
        ok('1:1 mentorship' in await body(), 'Admin → 1:1 mentorship inbox')
        ok(not errs, f'no page errors {errs[:3]}')
        await b.close()
    f = sum(1 for r in res if r.startswith('FAIL')); print(f'\n{len(res) - f} passed, {f} failed'); sys.exit(1 if f else 0)

asyncio.run(main())
