# Bodhin — Multi-Tenant LMS Platform (POC)

**Bodhin** ([thebodhin.com](https://thebodhin.com)) is a unified multi-tenant learning management system (LMS).
- **Students, Educators (Owners & Tutors), and Super Admins share one single application.**
- The user's role on sign-in decides the experience, landing page, and permissions.
- Runs cross-platform: **Web (Desktop & Mobile), iOS, and Android** (built on Expo SDK 58, React Native 0.88, Expo Router, and TypeScript).

---

## 🚀 Quick Start (For Developers & Antigravity Agents)

You can run Bodhin in two modes:

### Mode 1: Quickstart (Zero Database / Pure Mock Mode)
Runs standalone in 60 seconds without installing or configuring any database.
```bash
# 1. Install dependencies
npm install
cd apps/student && npm install && cd ../..

# 2. Run web portal
npm run web
```
Open **[http://localhost:8081](http://localhost:8081)** in your browser. Press `w` in terminal to re-open web.

---

### Mode 2: Full-Stack Mode (Local PostgreSQL 18 + Bridge Server)
Connects the web frontend and mobile APK to a local PostgreSQL instance.

#### 1. PostgreSQL Prerequisites
- PostgreSQL 18 running on `127.0.0.1:5432`
- Database name: `bodhin_db`
- Default user: `postgres`
- Password: Use your own local PostgreSQL password (set via `.env` or `PGPASSWORD`)

#### 2. Apply Migrations (One-time)
Apply SQL files sequentially from `supabase/migrations/`:
- `0001_tables.sql` through `0011_app_store_sync.sql`

#### 3. Start Backend Bridge Server
Provide your local PostgreSQL password via `.env` or in terminal:

```bash
# Option A: In apps/student/.env.local (or root .env)
PGPASSWORD=your_postgres_password

# Option B: Terminal command
# Windows (PowerShell):
$env:PGPASSWORD="your_postgres_password"; npm run backend:local

# macOS / Linux:
PGPASSWORD="your_postgres_password" npm run backend:local
```
Verify health check: [http://127.0.0.1:54321/health](http://127.0.0.1:54321/health) (returns `{ status: 'ok', database: 'bodhin_db' }`).

#### 4. Environment Configuration
Ensure `apps/student/.env.local` contains:
```env
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=local-dev-anon-key
EXPO_PUBLIC_CLOUD=on
PGPASSWORD=your_postgres_password
```

#### 5. Start Frontend
```bash
npm run web
```

---

### Mode 3: Live Production Mode (Supabase Cloud + Vercel Web + Mobile APK)

Both the **Vercel Web Portal** and the **Android APK** connect to the same real-time Supabase Cloud database, keeping learners, educators, courses, batches, and progress 100% synchronized in real time.

#### 🔑 Live Supabase Cloud Credentials
| Property | Value |
| :--- | :--- |
| **Supabase Project URL** | `https://pfjlpcrextppuixgriot.supabase.co` |
| **Supabase Anon Public Key** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmamxwY3JleHRwcHVpeGdyaW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwNTY0NzYsImV4cCI6MjExMDYzMjQ3Nn0.GSjYJw-zQKqLbhJrhkZAARn3nX0CHZjQD1L6LkL_1rw` |
| **Database Password** | `Bodhin_2026` |
| **Cloud Sync Switch** | `EXPO_PUBLIC_CLOUD=on` |

---

#### ⚡ முக்கியமான தகவல் / Crucial Supabase Setup: SQL Editor
If starting on a fresh Supabase project or setting up auth, ensure these two migrations are run in **Supabase Dashboard ➔ SQL Editor ➔ New Query ➔ Run**:
1. `supabase/migrations/0011_app_store_sync.sql` (Creates `public.app_store` table, RLS policies, and `login_email` RPC)
2. `supabase/migrations/0012_app_sign_up.sql` (Creates `public.app_sign_up` RPC so students/educators register instantly with pre-confirmed email without hitting Supabase mailer limits)

---

#### பகுதி 1: Vercel-ல் Database ENV போடுவது (Web Live)
1. Vercel Dashboard-ல் Project ➔ **Settings** ➔ **Environment Variables** பகுதிக்குச் செல்லவும்.
2. கீழே உள்ள 3 Variables-ஐ ஒவ்வொன்றாக Add செய்யவும் (**Production**, **Preview**, **Development** என 3 டிக் பாக்ஸும் Select ஆகியிருக்க வேண்டும்):

| Variable Key | Value | Targets |
| :--- | :--- | :--- |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://pfjlpcrextppuixgriot.supabase.co` | Production, Preview, Development |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmamxwY3JleHRwcHVpeGdyaW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwNTY0NzYsImV4cCI6MjExMDYzMjQ3Nn0.GSjYJw-zQKqLbhJrhkZAARn3nX0CHZjQD1L6LkL_1rw` | Production, Preview, Development |
| `EXPO_PUBLIC_CLOUD` | `on` | Production, Preview, Development |

3. **அடுத்து செய்ய வேண்டியது (Redeploy):**
   - மேலே உள்ள **Deployments** tab-ஐ கிளிக் செய்யவும்.
   - பட்டியலில் முதலில் இருக்கும் (கடைசி deployment)-ன் வலதுபுறம் உள்ள மூன்று புள்ளிகளை **`...`** கிளிக் செய்து **"Redeploy"** கொடுக்கவும்.
   - 1 அல்லது 2 நிமிடங்களில் Vercel Website Live Supabase Database உடன் முழுமையாக இயங்கத் தொடங்கிவிடும்!

---

#### பகுதி 2: லேப்டாப்பில் APK Build செய்வது (Mobile App Live)
Web மற்றும் APK இரண்டும் ஒரே டேட்டாபேஸை பயன்படுத்த, லேப்டாப்பில் கீழ்வரும் 2 எளிய படிகளைச் செய்யவும்:

##### படி 1: Local Environment-ல் புதிய Supabase Keys-ஐ சரிபார்க்கவும்
Codebase-ல் உள்ள `apps/student/.env.local` ஃபைலில் (மற்றும் `apps/student/.env`, `apps/student/eas.json`) Live Keys ஏற்கனவே தயார் செய்யப்பட்டுள்ளன:
```env
EXPO_PUBLIC_SUPABASE_URL=https://pfjlpcrextppuixgriot.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmamxwY3JleHRwcHVpeGdyaW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwNTY0NzYsImV4cCI6MjExMDYzMjQ3Nn0.GSjYJw-zQKqLbhJrhkZAARn3nX0CHZjQD1L6LkL_1rw
EXPO_PUBLIC_CLOUD=on
```

##### படி 2: Terminal / VS Code-ல் APK Build ரன் செய்யுங்கள்
Terminal (PowerShell / Command Prompt)-ல் கீழ்வரும் கமாண்டுகளை ஒவ்வொன்றாக இயக்கவும்:
```bash
# 1. student ஃபோல்டருக்கு செல்லவும்
cd apps/student

# 2. Expo-வில் Login செய்யவும் (அவர்களின் Expo username & password கேட்கும்)
npx eas-cli login

# 3. APK Build கமாண்டை இயக்கவும்
npx eas-cli build -p android --profile preview
```

---

#### பகுதி 3: எப்படி வேலை செய்கிறது என்று Verify செய்வது (Checking & Realtime Sync)
1. **Vercel Website-ல்:**
   - Live Website URL-க்குச் சென்று, **Sign Up** செய்து ஒரு புதிய மாணவர் கணக்கை உருவாக்குங்கள் (அல்லது course வாங்குங்கள்).
2. **APK-ல்:**
   - EAS Build முடிந்ததும் வரும் லிங்க்கில் இருந்து APK-ஐ டவுன்லோட் செய்து மொபைலில் Install செய்து கொள்ளுங்கள்.
   - Vercel வெப்சைட்டில் நீங்கள் Register செய்த அதே email & password போட்டு மொபைல் ஆப்பில் **Login** செய்யுங்கள்.
3. **முடிவு:**
   - வெப்சைட்டில் செய்த அனைத்தும் மொபைலிலும் உடனே தோன்றும்! (100% Realtime Synced) 🎉

---

## 🔑 Demo Logins & Roles

All demo accounts use password **`demo123`** and OTP **`123456`**.
The Sign-In screen (`/sign-in`) includes **⚡ 1-Tap Demo Quick Fill** chips for instant access:

| Role | Email | Password | Landing Page | Key Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| 🛡️ **Super Admin** | `admin@demo.in` | `demo123` | `/admin` | Full platform control: manage tenants, payouts, approve educators, curate courses, system audit & kill-switches. |
| 💼 **Educator (Owner)** | `rajesh@demo.in` | `demo123` | `/educator/home` | Academy owner: course creator, batch management, live classes, revenue analytics, student grading. |
| 🎓 **Tutor** | `meera@demo.in` | `demo123` | `/educator/home` | Teaching staff: conducts live classes, evaluates assigned courses & batches, answers student doubts. |
| 📚 **Student** | `arjun@demo.in` | `demo123` | `/home` | Learner: enrolled courses, video player, assignments, quizzes, certificates, code playground. |

> **Tip:** Clear browser cache or press `Ctrl + F5` on [http://localhost:8081/sign-in](http://localhost:8081/sign-in) if you previously had a stale session. The active local cache version is `bodhin.mockdb.v28`.

---

## 📁 Repository Structure

```
bodhin-poc/
├── backend/
│   └── local_server.js       # Local Node.js bridge between Expo client and PostgreSQL 18
├── supabase/
│   └── migrations/           # 0001 to 0011 PostgreSQL schema migrations
├── apps/
│   └── student/              # Unified Expo & React Native app (Students + Educators + Admin)
│       ├── .env.local        # Local environment variables
│       ├── src/
│       │   ├── app/          # Expo Router file-based screens
│       │   │   ├── (auth)/   # Sign-in, sign-up, OTP, onboarding
│       │   │   ├── (tabs)/   # Student tabs: Home, Explore, My Learning, Live, Profile
│       │   │   ├── educator/ # Educator tabs: Home, Courses, Batches, Live, More
│       │   │   ├── edu/      # Educator detailed workflows (course builder, live host, assess)
│       │   │   ├── admin/    # Super Admin portal (Command center, tenants, approvals, money)
│       │   │   └── welcome.tsx # Public landing page
│       │   ├── api/
│       │   │   ├── client.ts # Central API & auth entrypoint (cloud + local fallback)
│       │   │   ├── cloud.ts  # Postgres app_store sync & Supabase client
│       │   │   └── mockDb.ts # Seed data, types & in-memory state (cache key: v28)
│       │   ├── core/         # Pure TypeScript domain models (plans, business rules, catalog)
│       │   ├── store/        # React context (Auth, Session, Theme)
│       │   ├── theme/        # Multi-tenant styling & color tokens
│       │   └── ui/           # Reusable UI components & responsive frame
└── package.json              # Root project scripts
```

---

## 🛠️ Essential Commands

| Command | Description |
| :--- | :--- |
| `npm run web` | Start Expo Web development server on `http://localhost:8081` |
| `npm run backend:local` | Start local PostgreSQL bridge server on `http://127.0.0.1:54321` |
| `npm run typecheck` | Run strict TypeScript validation across the codebase |
| `npm run export:web` | Build static production web bundle into `apps/student/dist/` |
| `npx eas-cli@latest build -p android --profile preview` | Build installable Android APK |

---

## 🤖 Guide for Antigravity AI Agents

When working with this repository via Antigravity or other AI coding assistants:

1. **Preserve Existing UI Identity**:
   - Do NOT redesign, replace, or overwrite existing themes, typography, colors, animations, or styling.
   - Refine spacing, sizing, alignment, and responsiveness only where explicitly instructed.

2. **Responsive Layout System**:
   - The app uses `useLayout()` from `src/ui/responsive.tsx` providing `isPhone (<768px)`, `isTablet (768-1023px)`, and `isDesktop (>=1024px)`.
   - Maintain the thumb-first layout for phones and side-rail/grid layout for desktops.

3. **Data Layer Consistency**:
   - UI components must only call methods via `src/api/client.ts`.
   - If demo accounts or auth data need refreshing, bump `KEY` in `src/api/mockDb.ts` to invalidate stale browser `localStorage`.
   - Always ensure `cloudSignIn` retains local demo fallbacks so developers never get locked out during offline development.
