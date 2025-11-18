// app/api/workers/route.ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

// GET /api/workers  -> list all brothers (no iCal URLs)
export async function GET() {
  const { data, error } = await supabaseServer
    .from('workers')
    .select('id, display_name, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error loading workers:', error);
    return NextResponse.json(
      { error: 'Failed to load workers' },
      { status: 500 }
    );
  }

  return NextResponse.json({ workers: data });
}

// POST /api/workers  -> add a brother
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, icalUrl } = body;

    if (!name || !icalUrl) {
      return NextResponse.json(
        { error: 'name and icalUrl are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseServer
      .from('workers')
      .insert({
        display_name: name,
        ical_url: icalUrl,
      })
      .select('id, display_name, created_at')
      .single();

    if (error) {
      console.error('Error inserting worker:', error);
      return NextResponse.json(
        { error: 'Failed to add worker' },
        { status: 500 }
      );
    }

    return NextResponse.json({ worker: data }, { status: 201 });
  } catch (err) {
    console.error('Error parsing POST body:', err);
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400 }
    );
  }
}
