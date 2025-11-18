# Masjid Al Madar – Shift Brothers

A small web app to help brothers on shift look out for each other and organise their prayers.

The app:

- shows who is on shift **right now** from their work iCal rotas
- shows which brothers are on shift **during the current prayer time**
- lets brothers tick off whether they’ve prayed or not
- lets each brother save their **break time** for the day and see who is on break with them

Built with **Next.js 16 (App Router)**, **TypeScript**, **Supabase**, and the **London Prayer Times API**.

---

## Features

### 👤 “I am…” – select yourself
- Searchable dropdown of all registered workers.
- Stored in `localStorage` so the app remembers who you are on this device.

### 🕌 Prayer during this shift
- Fetches today’s prayer times for London (Fajr, Dhuhr, Asr, Asr (mithl 2), Maghrib, Isha).
- Determines which prayer is **currently in effect**.
- Shows all brothers whose rotas cover this prayer time.
- Each brother can tick/untick **“Prayed / Not yet”** for the current prayer.
- Status resets automatically at midnight.

### 👥 Brothers in the system
- Shows all brothers who have added their rota.
- Optional “Check at time” input to see who would be on shift at a specific date/time.
- “Who’s on now?” button scrolls down to the “On shift right now” section.

### ⏰ On shift right now
- Shows everyone whose iCal events cover **the current time** (or the test time).

### ☕ Breaks for the day
- Brothers can select a date and save their **break start/end** times.
- Shows everyone’s breaks for that day.
- Calculates overlaps so you can see who’s on break with whom.
- Each brother can **edit or delete their own break**.

### 📅 Add your rota (iCal link)
- Simple form to add your name and iCal URL.
- iCal link is stored on the server (via Supabase) and never shown publicly.

### ❓ Help popup
- “How to use this page” button opens a small modal explaining the steps.

---

## Tech stack

- **Framework:** Next.js 16 (App Router, TypeScript)
- **UI:** React, Tailwind CSS
- **Database / auth:** Supabase
- **Calendar parsing:** [`node-ical`](https://github.com/icalingua/node-ical)
- **Prayer times:** London Prayer Times API
- **Deployment:** Vercel

---

## Getting started

### 1. Prerequisites

- Node.js 18+ and npm
- A Supabase project
- A London Prayer Times API key

### 2. Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME
npm install
