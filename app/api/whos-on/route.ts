import { NextResponse } from 'next/server';
import * as ical from 'node-ical';
import { createClient } from '@supabase/supabase-js';

type WorkerRow = {
  id: string;
  display_name: string;
  ical_url: string;
};

type OnShiftPerson = {
  id: string;
  name: string;
};

function getSupabaseClient() {
  const url =
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase env vars are missing. Please set SUPABASE_URL and SUPABASE_ANON_KEY (or the NEXT_PUBLIC_ equivalents).'
    );
  }

  return createClient(url, key);
}

export async function GET(req: Request) {
  const supabase = getSupabaseClient();

  const { searchParams } = new URL(req.url);
  const atParam = searchParams.get('at');

  // Time we are checking at: ?at=... or now
  let at = atParam ? new Date(atParam) : new Date();
  if (Number.isNaN(at.getTime())) {
    at = new Date();
  }

  const { data, error } = await supabase
    .from('workers')
    .select('id, display_name, ical_url');

  if (error) {
    console.error('Error loading workers', error);
    return NextResponse.json(
      { error: 'Failed to load workers' },
      { status: 500 }
    );
  }

  const workers = (data ?? []) as WorkerRow[];

  // Check each worker's iCal to see if they're on at "at"
  const results = await Promise.all(
    workers.map(async (w) => {
      const on = await isWorkerOnShift(w, at);
      return on ? ({ id: w.id, name: w.display_name } as OnShiftPerson) : null;
    })
  );

  const onShift = results.filter(
    (x): x is OnShiftPerson => x !== null
  );

  return NextResponse.json({
    onShift,
    at: at.toISOString(),
  });
}

async function isWorkerOnShift(worker: WorkerRow, at: Date): Promise<boolean> {
  if (!worker.ical_url) return false;

  try {
    const res = await fetch(worker.ical_url);
    if (!res.ok) {
      console.error(
        'Failed to fetch iCal for worker',
        worker.id,
        res.status,
        res.statusText
      );
      return false;
    }

    const icsText = await res.text();

    // Synchronous parse; returns an object of events
    const events = ical.parseICS(icsText) as any;
    const atMs = at.getTime();

    const values = Object.values(events) as any[];

    for (const ev of values) {
      if (!ev || ev.type !== 'VEVENT') continue;

      const start: Date | undefined = ev.start;
      const end: Date | undefined = ev.end;
      if (!start || !end) continue;

      const s = start.getTime();
      const e = end.getTime();

      if (atMs >= s && atMs <= e) {
        return true;
      }
    }

    return false;
  } catch (err) {
    console.error('Error reading calendar for worker', worker.id, err);
    return false;
  }
}
