# DoneIt Planner

A tactile daily and weekly planner that turns a list of tasks into a realistic, conflict-free schedule, and keeps working with no internet connection.

It answers three questions:

1. **What do I need to do?** (Tasks)
2. **Which day will I do it?** (Week)
3. **What time will I do it?** (Day)

A task doesn't need a day or a time when you create it. It moves from *unassigned*, to *assigned to a day*, to *scheduled at a time* as your plans firm up.

---

## Features

### Planning
- **Day view**: a timeline from 06:00 to 23:00 that grows to fit early or late tasks, or switches to the full 24 hours. Tap a slot to add a task there. Drag a task to move it, and drag its top or bottom edge to resize it in 15-minute steps. A red line marks the current time.
- **Week view**: today's column sits at the left, with the next six days to the right and an *Unassigned* column. Earlier days of the week are one scroll to the left. Drag tasks between days. A timed task keeps its time on the new day if that slot is free there.
- **Tasks view**: tasks grouped as Overdue, Unassigned, Today, Tomorrow, the next five days, Later, and Completed earlier. Includes search across titles and notes.
- **Quick add**: type `Gym tomorrow 6pm` or `Standup mon 9:15-9:30`, and a preview shows how the day and time were read before the task is added.
- **Smart time inputs**: `[HH]:[MM]` fields that move the cursor forward for you. For example, `8` becomes `08` and jumps to the minutes. The end time follows the start (plus one hour) until you change it yourself.
- **No double booking**: overlapping times are blocked when you create, edit, drag, drop or resize a task, with a message naming the task in the way.
- **Edit anything**: title, day, time, colour and notes. Every delete, move and resize has an **Undo** button.

### Reminders
- Give any timed task a reminder: at the start time, or 5 minutes to 1 day before. You can also set a default reminder for new timed tasks.
- **While DoneIt is open or in the background**, reminders are scheduled on the device. They work offline and without an account. They appear as an in-app banner when the app is on screen, and as a system notification when it isn't.
- **While DoneIt is closed**, reminders arrive as Web Push notifications sent by a Supabase Edge Function. This needs a signed-in account and an internet connection.
- Both paths tag each notification with the same ID, so you never get the same reminder twice. Tapping a notification opens that task's day.
- On iPhone and iPad, web notifications only work after DoneIt is added to the Home Screen (iOS 16.4 or later).

### Works offline
- Once the app has been opened or installed, it starts **with no network at all**.
- Every task lives in a database on the device (IndexedDB). You can add, edit, move and delete tasks offline, and the changes sync automatically when the connection returns.
- If two devices edit the same task while one was offline, the more recent edit wins.
- A small status line shows *Synced*, *Syncing*, *Offline: 3 changes saved on this device*, or *Sign in to sync*.
- **Use it without an account**: everything stays on the device. Sign in later and those tasks are uploaded to your account.

### Everything else
- Installable on Windows, macOS, Android and iOS, with an in-app prompt when a new version is ready.
- Light, dark or automatic theme, a roomy or compact timeline, and an option to show or hide completed tasks.
- Mouse, touch (long-press to drag) and keyboard support. Press `?` for shortcuts: `N` new task, `1`/`2`/`3` switch views, `T` today, `←`/`→` change day, `/` search.
- Mobile layout with a bottom navigation bar, plus a desktop sidebar.

---

## Tech stack

| Area | Choice |
|---|---|
| UI | React 19 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS v4, with light and dark theme tokens in [src/index.css](src/index.css) |
| Offline app shell | vite-plugin-pwa with a custom Workbox service worker ([src/sw.ts](src/sw.ts)): precaching, push, notification clicks |
| Reminders | On-device scheduler, plus Web Push sent by a Supabase Edge Function on a pg_cron schedule |
| On-device database | Dexie (IndexedDB) |
| Backend | Supabase (Auth, Postgres with Row Level Security, Realtime) |
| Drag & drop | dnd-kit (mouse, touch, keyboard) |
| Dates / validation | date-fns, Zod |
| Tests | Vitest (logic and sync engine), Playwright (end-to-end, including offline) |

---

## How offline sync works

```text
 UI ──reads/writes──▶ IndexedDB (Dexie) ◀──▶ Sync engine ◀──▶ Supabase
                       source of truth        push dirty rows    planner_tasks
                       for every screen       pull changes       + realtime feed
```

- **Write locally first.** Each edit is saved to IndexedDB immediately and marked `dirty`. The interface never waits for the network.
- **Push.** Dirty tasks are upserted to `planner_tasks`. A database trigger ignores any write older than the server's copy, and when that happens the device takes the server's newer version.
- **Pull.** Rows changed since the last sync are fetched, using a server timestamp as the cursor, and applied unless the device has unsent edits to that task.
- **When it runs:** on start, on reconnect, when the app regains focus, shortly after each edit, every minute, and on realtime events.
- **Deletes** are soft deletes, so a device that was offline still learns about them.
- **Sign-in state** is cached on the device, so the planner opens straight into your tasks offline even after the login token has expired. Sync resumes once you're online and signed in.

The engine is in [src/sync/engine.ts](src/sync/engine.ts), and its behaviour is covered by [src/sync/engine.test.ts](src/sync/engine.test.ts).

---

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

Supabase credentials are read from [.env](.env) (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). The anon key is a public client key: access is protected by Row Level Security. Put local overrides in `.env.local`. If no credentials are set, the app runs in device-only mode.

### Database setup (one time)

Run these three files in order, either in the Supabase SQL editor or all at once with `supabase db push`. In the SQL editor, open a new query, paste **the whole file**, and click Run **with no text selected**. If text is selected, the editor runs only the selection. Each file can be run again safely, and if any statement fails, nothing from that file is applied.

1. [20261002000000_planner_tasks.sql](supabase/migrations/20261002000000_planner_tasks.sql) creates `public.planner_tasks` (UUID ids and check constraints), the last-write-wins trigger, Row Level Security, and Realtime.
2. [20261002000100_copy_v1_tasks.sql](supabase/migrations/20261002000100_copy_v1_tasks.sql) copies tasks from the v1 `public.tasks` table. Invalid legacy dates and times are repaired or dropped, re-running won't create duplicates, and the old table is left untouched. Skip this file on a brand-new project.
3. [20261002000200_reminders.sql](supabase/migrations/20261002000200_reminders.sql) adds the reminder columns, push subscriptions, and delivery tracking.

All three are tested against real Postgres (PGlite) with messy v1 data. If you sync before running step 3, the app keeps syncing everything except reminders.

### Reminders when the app is closed (optional)

Reminders already work on the device without any of this. These steps add background push. You need the [Supabase CLI](https://supabase.com/docs/guides/cli).

1. **Keys.** `supabase/functions/.env` holds the VAPID key pair and a cron secret. It is git-ignored, and its public key matches `VITE_VAPID_PUBLIC_KEY` in `.env`. Change `VAPID_SUBJECT` to your own `mailto:` address. To make new keys, run `npx web-push generate-vapid-keys`, then update both files.
2. **Deploy the function:**
   ```bash
   supabase link --project-ref oqdkkwchwyurvwpwtsft
   supabase secrets set --env-file supabase/functions/.env
   supabase functions deploy send-reminders --no-verify-jwt
   ```
   `--no-verify-jwt` is needed because the scheduler authenticates with `CRON_SECRET` instead of a user login.
3. **Schedule it:** open [supabase/reminders_cron.sql](supabase/reminders_cron.sql), replace `<CRON_SECRET>` with the value from `supabase/functions/.env`, and run it in the SQL editor. It calls the function every minute, and the secret is stored in Supabase Vault.
4. In the app, turn on **Settings → Notifications** and allow notifications when the browser asks.

Users of the previous version stay signed in after upgrading, because the same Supabase session is reused.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload (the service worker is disabled in dev) |
| `npm run build` | Type-check and production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Unit tests (scheduling rules, quick-add parser, time inputs, sync engine) |
| `npm run test:e2e` | Playwright tests on desktop and mobile: offline launch, drag, resize, undo, conflicts, reminders, push handling |

To try offline mode: run `npm run build && npm run preview`, open the app once, then go offline in DevTools (Network → Offline) and reload.

---

## Deployment

The build is a static site, so any static host works.

- **GitHub Pages**: [.github/workflows/deploy.yml](.github/workflows/deploy.yml) tests, builds and deploys on every push to `main`. In the repository settings, set **Pages → Source** to **GitHub Actions**. The workflow sets the sub-path automatically.
- **Vercel / Netlify / Cloudflare Pages**: build command `npm run build`, output directory `dist`.
- **Under a sub-path elsewhere**: build with `BASE_PATH=/your-path/ npm run build`.

---

## Project structure

```text
src/
├── main.tsx, App.tsx       entry point, auth gate, service-worker registration
├── app/                    planner shell: routing, sidebar, mobile chrome, shortcuts
├── views/                  DayView + Timeline, WeekView, TasksView
├── components/             task modal, time fields, quick add, settings, sync status, dialogs
├── dnd/                    drag-and-drop setup and drop rules
├── data/                   Dexie database, task repository, undo-able actions
├── sync/                   sync engine, Supabase adapter, status store
├── reminders/              on-device reminder scheduler, Web Push subscription
├── sw.ts                   service worker: offline precache, push, notification clicks
├── auth/                   Supabase auth + cached offline profile, sign-in screen
├── hooks/                  settings/theme, today (midnight rollover), install prompt, toasts
└── lib/                    pure logic: time, dates, scheduling rules, quick-add parser
supabase/migrations/        database schema, security policies, v1 data copy, reminders
supabase/functions/         send-reminders Edge Function (Web Push)
supabase/reminders_cron.sql schedules the Edge Function every minute
e2e/                        Playwright tests
public/                     icons and sign-in background
```

## License

MIT
