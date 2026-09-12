# DoneIt Planner

> **A tactile daily and weekly personal planning application designed to turn a list of tasks into a realistic, conflict-free schedule.**

[![PWA Ready](https://img.shields.io/badge/PWA-Ready-2F44C8.svg)](./manifest.json)
[![Database](https://img.shields.io/badge/Backend-Supabase-3ECF8E.svg)](https://supabase.com)
[![Mobile Optimized](https://img.shields.io/badge/UI-Mobile%20Optimized-blueviolet.svg)](#mobile-experience)
[![Dark Mode](https://img.shields.io/badge/Theme-Dark%20Mode-121215.svg)](#dark-mode)

---

## Table of Contents

- [Overview](#overview)
- [Core Planning Philosophy](#core-planning-philosophy)
- [Key Features](#key-features)
  - [Mobile Optimization & Navigation](#mobile-optimization--navigation)
  - [Day Schedule & Live Multi-Hour Drag/Resize](#day-schedule--live-multi-hour-dragresize)
  - [Smart Time Input & Conflict Prevention](#smart-time-input--conflict-prevention)
  - [Forthcoming Days Dropdown](#forthcoming-days-dropdown)
  - [Dark Mode & Settings](#dark-mode--settings)
  - [Week View Focus](#week-view-focus)
  - [Progressive Web App (PWA)](#progressive-web-app-pwa)
  - [Supabase Cloud Sync & Offline Support](#supabase-cloud-sync--offline-support)
- [Application Architecture](#application-architecture)
- [Database Schema & Security](#database-schema--security)
- [User Workflows](#user-workflows)
- [Local Development](#local-development)
- [Project File Structure](#project-file-structure)

---

## Overview

**DoneIt Planner** is a lightweight, responsive planning web application that answers three core questions:

1. **What do I need to do?** (Tasks View)
2. **Which day am I going to do it?** (Week View)
3. **What time am I going to do it?** (Day View)

It bridges the gap between simple to-do lists (which lack realistic time constraints) and heavy calendar software (which demands rigid event metadata).

---

## Core Planning Philosophy

The application distinguishes between **having a task** and **scheduling a task**. 

A task does not need to have a day or time assigned at the moment of creation:

```text
TASK (What?)
  │
  ├── Unassigned (Inbox of ideas)
  │
  └── Assigned to a Day (Which day?)
        │
        ├── Unscheduled (Committed to the day, time flexible)
        │
        └── Scheduled (What time?)
              └── e.g., 08:57 – 10:30 (Fixed timeline block)
```

Tasks move naturally down this hierarchy as your day takes shape.

---

## Key Features

### Mobile Optimization & Navigation
- **Responsive Layout**: Adapts dynamically between desktop and mobile screen sizes (`< 768px`).
- **Mobile Header**: Sticky top bar showing app branding, quick task creation (`+ Task`), and instant dark mode toggle.
- **Bottom Navigation Bar**: Fixed bottom bar providing thumb-friendly access in the requested workflow order:
  1. **Tasks** (Capture & triage)
  2. **Today** (Day planner & timeline)
  3. **Week** (7-day distribution & planning)
  4. **Settings** (Profile, theme, install, logout)
- **Stacked Layout**: Day timeline and unscheduled task queues stack cleanly on small viewports with comfortable touch targets.

### Day Schedule & Live Multi-Hour Drag/Resize
- **Tactile Drag & Resize**: Each scheduled task block features top and bottom resize handles.
  - Drag the bottom edge downwards to extend duration across multiple hours (e.g. from 6:00 to 8:00, 9:00, etc.).
  - Drag the top edge to adjust the task start time.
  - Supports both **mouse** and **touch** gestures with 15-minute fluid snapping.
- **Accessible 01:00 to 24:00 Range**:
  - Comfortable default schedule covers daytime hours (`06:00` to `22:00`).
  - Automatically expands if any task is scheduled in earlier or later hours.
  - Manual expansion controls: `▲ Show earlier hours (01:00 – ...)` and `▼ Show later hours (... – 24:00)`.
  - Toggle between compact 6–22h view and full 24h view with one tap.

### Smart Time Input & Conflict Prevention
- **Segmented Time Inputs (`[ HH ] : [ MM ]`)**:
  - **Auto-Advancing Cursor**: Typing an hour digit $\ge 3$ (e.g., `8` or `9`) automatically formats to `08` and jumps focus straight to the minutes field.
  - Typing two digits (e.g., `14` or `08`) immediately advances cursor to minutes.
  - Pressing `:` or `Enter` shifts focus to minutes; `Backspace` on an empty minute field returns to hour.
  - **Arbitrary Minute Precision**: Schedule tasks at exact minutes such as `08:57` or `14:32`.
  - Quick duration chips: `+30m`, `+1h`, `+2h`, and `Clear`.
- **Slot Conflict Validation**:
  - Real-time overlap detector checks if the candidate time range overlaps with any other task on that day.
  - Displays a clean SVG warning message: `Slot conflict: "[Task Name]" is already scheduled ([Start] – [End])`.
  - Blocks submission while a conflict is present, preventing double bookings.

### Forthcoming Days Dropdown
- Day assignment dropdowns start from **Today onwards** (e.g., *Today*, *Tomorrow*, and the upcoming 14 days).
- Past date options are preserved for previously scheduled tasks so historical data remains intact.

### Dark Mode & Settings
- **Settings Section**: Accessible at the bottom of the sidebar on desktop and via a slide-up sheet on mobile:
  - **User Profile**: Displays user initials avatar, full name, and email address.
  - **Dark Mode Switch**: Smooth animated switch with SVG icons (strictly zero emojis).
  - **PWA Download**: Dedicated button to trigger standalone app installation.
  - **Log Out**: Secure authentication sign-out button.
- **Tailored Palette**: Custom HSL-tuned dark background (`#121215`), surfaces (`#1B1B20`), borders (`#2A2A33`), and high-contrast dark mode task chips. Persisted in `localStorage` (`doneit_theme`).

### Week View Focus
- **Auto-Scroll to Today**: Opening the Week tab automatically centers the view on Today's column.
- Previous days remain to the left and can be reviewed by scrolling back.
- Past days feature subtle visual dimming (`0.7` opacity) and a `PAST` badge for temporal clarity.

### Progressive Web App (PWA)
- Fully installable on **Windows**, **macOS** (Chrome, Edge), **iOS** (Safari "Add to Home Screen"), and **Android** (Chrome).
- Offline asset caching powered by Service Worker (`sw.js`).
- Complete web app manifest (`manifest.json`) with maskable application icons.

### Supabase Cloud Sync & Offline Support
- Real-time synchronization across devices using Supabase PostgreSQL and Realtime WebSockets (`postgres_changes`).
- Instant optimistic UI updates with automatic fallback to `localStorage`.
- Unobtrusive status: Clean interface with no unnecessary sync banners.

---

## Application Architecture

```text
┌────────────────────────────────────────────────────────┐
│                   Client Browser / PWA                 │
│                                                        │
│   index.html (HTML5, Vanilla CSS, Templates)           │
│   ├── Reactive Template Engine (<x-dc>, <sc-if>)       │
│   ├── Component Logic (DCLogic extends React.Component)│
│   └── Local Cache & Optimistic State (localStorage)    │
└───────────┬────────────────────────────────┬───────────┘
            │                                │
     Offline Cache (SW)              REST & WebSockets
            │                                │
┌───────────▼───────────┐        ┌───────────▼───────────┐
│     sw.js (PWA Cache) │        │   Supabase Cloud      │
│  - Static assets      │        │   ├── Authentication  │
│  - App Shell          │        │   ├── PostgreSQL      │
│  - Offline fallback   │        │   └── Realtime Engine │
└───────────────────────┘        └───────────────────────┘
```

---

## Database Schema & Security

The application communicates with a Supabase PostgreSQL table named `public.tasks`:

### Table Structure

```sql
CREATE TABLE public.tasks (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  color text DEFAULT 'blue',
  date text,               -- Format: YYYY-MM-DD
  start text,              -- Format: HH:MM
  end text,                -- Format: HH:MM
  done boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);
```

### Row Level Security (RLS)

Ensure RLS is enabled so users can only access their own data:

```sql
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Select policy
CREATE POLICY "Users can view own tasks" 
ON public.tasks FOR SELECT 
USING (auth.uid() = user_id);

-- Insert policy
CREATE POLICY "Users can create own tasks" 
ON public.tasks FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Update policy
CREATE POLICY "Users can update own tasks" 
ON public.tasks FOR UPDATE 
USING (auth.uid() = user_id);

-- Delete policy
CREATE POLICY "Users can delete own tasks" 
ON public.tasks FOR DELETE 
USING (auth.uid() = user_id);
```

---

## User Workflows

### 1. Creating and Scheduling a Task

1. Tap **+ New Task** (or click any empty time slot in the Day schedule).
2. Enter the task title (e.g., `Team Sync`).
3. Select the day from the **Day** dropdown (defaults to Today).
4. Type Start Time:
   - Type `8` → focus moves automatically to minutes.
   - Type `30` → Start is `08:30`. End automatically defaults to `09:30`.
5. A randomized color is pre-selected (or pick another swatch).
6. Click **Add Task**. The task appears on the timeline.

### 2. Extending Task Duration

1. In the **Today** view, locate the task card on the timeline.
2. Hover or tap the bottom edge handle (marked by a subtle drag bar).
3. Drag downward to stretch the block to `11:00`.
4. Release to commit the updated duration to Supabase.

---

## Local Development

Because DoneIt Planner uses standard web standards and client-side compilation, you can run it locally without a heavy build step:

### Running with a Local Server

Using Node.js:
```bash
npx serve .
```

Or using Python:
```bash
python -m http.server 3000
```

Open `http://localhost:3000` in your web browser.

### Supabase Configuration

Supabase credentials are configured in `index.html`:

```javascript
const SUPABASE_URL = 'https://<YOUR-PROJECT-REF>.supabase.co';
const SUPABASE_KEY = '<YOUR-ANON-KEY>';
```

---

## Project File Structure

```text
Planner/
├── index.html       # Primary application markup, styling, and logic
├── support.js       # Runtime compiler & template engine
├── sw.js            # Service Worker for offline PWA caching (v3)
├── manifest.json    # Progressive Web App manifest
├── icon-192.png     # PWA application icon (192x192)
├── icon-512.png     # PWA application icon (512x512)
├── image.jpg        # Auth background image
├── design.md        # Original design specification
└── README.md        # Comprehensive documentation
```

---

## License

MIT License. Designed and built with a focus on simplicity, speed, and tactile planning.
