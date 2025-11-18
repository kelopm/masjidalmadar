// app/api/prayer/route.ts
import { NextResponse } from 'next/server';
import ical from 'node-ical';
import { supabaseServer } from '@/lib/supabaseServer';

type PrayerKey = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

type PrayerTimesToday = {
  fajr: string;
  dhuhr: string;
  asr: string;
  asr2: string | null;
  maghrib: string;
  isha: string;
  sunrise: string;
};

type WorkerRow = {
  id: string;
  display_name: string;
  ical_url: string;
};

function toMinutes(time: string): number {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  return h * 60 + m;
}

function minutesToTimeString(mins: number): string {
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function minutesToTodayDate(mins: number): Date {
  const d = new Date();
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  d.setHours(h, m, 0, 0);
  return d;
}

async function fetchPrayerTimesToday(): Promise<PrayerTimesToday> {
  const key = process.env.LONDON_PRAYER_TIMES_KEY;
  if (!key) {
    throw new Error('LONDON_PRAYER_TIMES_KEY is not set');
  }

  const url = `https://www.londonprayertimes.com/api/times/?format=json&24hours=true&key=${key}`;
  const res = await fetch(url, { cache: 'no-store' });

  if (!res.ok) {
    throw new Error(`Prayer times API error: ${res.status}`);
  }

  const data: any = await res.json();
  // Sample shape (from docs):
  // {
  //   "fajr":"02:51",
  //   "sunrise":"04:48",
  //   "dhuhr":"13:10",
  //   "asr":"17:27",
  //   "asr_2":"17:57",
  //   "magrib":"21:24",
  //   "isha":"23:00",
  //   ...
  // }

  return {
    fajr: data.fajr,
    dhuhr: data.dhuhr,
    asr: data.asr,
    asr2: data.asr_2 ?? null,
    maghrib: data.magrib,
    isha: data.isha,
    sunrise: data.sunrise,
  };
}

// Find all workers whose rota overlaps [windowStart, windowEnd]
async function getWorkersOnShiftDuring(windowStart: Date, windowEnd: Date) {
  const { data: workers, error } = await supabaseServer
    .from('workers')
    .select('id, display_name, ical_url');

  if (error) {
    console.error('Error loading workers for prayer:', error);
    throw new Error('Failed to load workers');
  }

  const onShift: { id: string; name: string }[] = [];
  if (!workers) return onShift;

  for (const w of workers as WorkerRow[]) {
    if (!w.ical_url) continue;

    try {
      const events = await (ical as any).async.fromURL(w.ical_url, {});
      const hasOverlap = Object.values(events).some((ev: any) => {
        if (!ev || ev.type !== 'VEVENT') return false;
        const start: Date | undefined = ev.start;
        const end: Date | undefined = ev.end;
        if (!start || !end) return false;

        // overlap if shiftStart < prayerEnd AND shiftEnd > prayerStart
        return start < windowEnd && end > windowStart;
      });

      if (hasOverlap) {
        onShift.push({ id: w.id, name: w.display_name });
      }
    } catch (e) {
      console.error('Error reading calendar for worker', w.id, e);
    }
  }

  onShift.sort((a, b) => a.name.localeCompare(b.name));
  return onShift;
}

export async function GET() {
  try {
    const times = await fetchPrayerTimesToday();

    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();

    const fajrMins = toMinutes(times.fajr);
    const sunriseMins = toMinutes(times.sunrise);
    const dhuhrMins = toMinutes(times.dhuhr);
    const asrMins = toMinutes(times.asr);
    const maghribMins = toMinutes(times.maghrib);
    const ishaMins = toMinutes(times.isha);

    const windows: {
      key: PrayerKey;
      label: string;
      start: number;
      end: number;
    }[] = [
      { key: 'fajr', label: 'Fajr', start: fajrMins, end: sunriseMins },
      { key: 'dhuhr', label: 'Dhuhr', start: dhuhrMins, end: asrMins },
      { key: 'asr', label: 'Asr', start: asrMins, end: maghribMins },
      { key: 'maghrib', label: 'Maghrib', start: maghribMins, end: ishaMins },
      { key: 'isha', label: 'Isha', start: ishaMins, end: 24 * 60 },
    ];

    let current =
      windows.find((w) => nowMins >= w.start && nowMins < w.end) ?? null;

    // If it's before Fajr, treat it as still Isha time
    if (!current) {
      if (nowMins < fajrMins) {
        current = windows.find((w) => w.key === 'isha') ?? windows[0];
      } else {
        current = windows[0];
      }
    }

    const windowStartDate = minutesToTodayDate(current.start);
    const windowEndDate = minutesToTodayDate(
      Math.min(current.end, 24 * 60 - 1)
    );

    const onShift = await getWorkersOnShiftDuring(
      windowStartDate,
      windowEndDate
    );

    const todayStr = new Date().toISOString().slice(0, 10);
    const workerIds = onShift.map((w) => w.id);

    const statusMap = new Map<string, boolean>();

    if (workerIds.length > 0) {
      const { data: statuses, error: statusError } = await supabaseServer
        .from('prayer_statuses')
        .select('worker_id, has_prayed')
        .eq('prayer_date', todayStr)
        .eq('prayer_name', current.key)
        .in('worker_id', workerIds);

      if (statusError) {
        console.error('Error loading prayer statuses:', statusError);
        throw new Error('Failed to load prayer statuses');
      }

      (statuses ?? []).forEach((row) => {
        statusMap.set(row.worker_id, row.has_prayed);
      });
    }

    const workersWithStatus = onShift.map((w) => ({
      id: w.id,
      name: w.name,
      hasPrayed: statusMap.get(w.id) ?? false,
    }));

    // Pick the official time for the current prayer
    let currentTime = '';
    if (current.key === 'fajr') currentTime = times.fajr;
    if (current.key === 'dhuhr') currentTime = times.dhuhr;
    if (current.key === 'asr') currentTime = times.asr;
    if (current.key === 'maghrib') currentTime = times.maghrib;
    if (current.key === 'isha') currentTime = times.isha;

    return NextResponse.json({
      at: now.toISOString(),
      times,
      currentPrayer: {
        key: current.key,
        label: current.label,
        time: currentTime,
        windowStart: minutesToTimeString(current.start),
        windowEnd: minutesToTimeString(
          Math.min(current.end, 24 * 60 - 1)
        ),
      },
      onShift: workersWithStatus,
    });
  } catch (e: any) {
    console.error('Error in GET /api/prayer:', e);
    return NextResponse.json(
      { error: e.message ?? 'Failed to load prayer info' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workerId, prayerKey, hasPrayed } = body as {
      workerId?: string;
      prayerKey?: PrayerKey;
      hasPrayed?: boolean;
    };

    if (!workerId || !prayerKey || typeof hasPrayed !== 'boolean') {
      return NextResponse.json(
        { error: 'workerId, prayerKey and hasPrayed are required' },
        { status: 400 }
      );
    }

    const todayStr = new Date().toISOString().slice(0, 10);

    const { error } = await supabaseServer
      .from('prayer_statuses')
      .upsert(
        {
          worker_id: workerId,
          prayer_date: todayStr,
          prayer_name: prayerKey,
          has_prayed: hasPrayed,
        },
        {
          onConflict: 'worker_id,prayer_date,prayer_name',
        }
      );

    if (error) {
      console.error('Error saving prayer status:', error);
      return NextResponse.json(
        { error: 'Failed to save prayer status' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('Error in POST /api/prayer:', e);
    return NextResponse.json(
      { error: e.message ?? 'Failed to save prayer status' },
      { status: 500 }
    );
  }
}
