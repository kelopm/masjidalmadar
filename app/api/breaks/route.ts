// app/api/breaks/route.ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

// GET /api/breaks?date=YYYY-MM-DD -> list breaks for that day
export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date');

  if (!date) {
    return NextResponse.json(
      { error: 'Missing date parameter (YYYY-MM-DD)' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseServer
    .from('breaks')
    .select('id, worker_id, break_date, start_time, end_time')
    .eq('break_date', date)
    .order('start_time', { ascending: true });

  if (error) {
    console.error('Error loading breaks:', error);
    return NextResponse.json(
      { error: 'Failed to load breaks' },
      { status: 500 }
    );
  }

  return NextResponse.json({ breaks: data });
}

// POST /api/breaks -> save or update a break
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workerId, breakDate, startTime, endTime } = body;

    if (!workerId || !breakDate || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'workerId, breakDate, startTime and endTime are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseServer
      .from('breaks')
      .upsert(
        {
          worker_id: workerId,
          break_date: breakDate,
          start_time: startTime,
          end_time: endTime,
        },
        {
          onConflict: 'worker_id,break_date', // unique constraint
        }
      )
      .select('id, worker_id, break_date, start_time, end_time')
      .single();

    if (error) {
      console.error('Error upserting break:', error);
      return NextResponse.json(
        { error: error.message ?? 'Failed to save break' },
        { status: 500 }
      );
    }

    return NextResponse.json({ break: data }, { status: 201 });
  } catch (err) {
    console.error('Error parsing POST body for breaks:', err);
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400 }
    );
  }
}

// DELETE /api/breaks?id=BREAK_ID -> delete a break by id
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { error: 'id query parameter is required' },
      { status: 400 }
    );
  }

  const { error } = await supabaseServer
    .from('breaks')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting break:', error);
    return NextResponse.json(
      { error: 'Failed to delete break' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
