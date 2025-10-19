// server/src/app/api/dev/generate-today/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateTwoLines } from '@/lib/generate';

export const runtime = 'nodejs'; // ✅ important: use Node, not Edge

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const user_id = searchParams.get('user_id');
    if (!user_id) {
      return NextResponse.json({ ok: false, error: 'user_id required' }, { status: 400 });
    }

    // Quick env sanity
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');
    }
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('Missing OPENROUTER_API_KEY');
    }

    // Load profile (must exist — we synced it from the app)
    const { data: profile, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (pErr) throw new Error(`profile query failed: ${pErr.message}`);
    if (!profile) return NextResponse.json({ ok: false, error: 'profile_not_found' }, { status: 404 });

    // Compute user-local weekday/date
const tz = profile.timezone || 'UTC';

// Weekday (e.g., "Saturday") in user's TZ
const weekday = new Intl.DateTimeFormat('en-US', {
  timeZone: tz,
  weekday: 'long',
}).format(new Date());

// "YYYY-MM-DD" in user's TZ — no re-parsing needed
const for_date = new Intl.DateTimeFormat('en-CA', {
  timeZone: tz,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date()); // e.g., "2025-10-18"

    // Call the model via OpenRouter
    const { lines, category, visual_theme } = await generateTwoLines({
      goals: profile.goals || [],
      tone: profile.tone || 'warm',
      language: profile.language || 'en',
      weekday,
    });
    if (!lines?.length) throw new Error('model returned empty lines');

    // Upsert (idempotent per user/day)
    const { data: insert, error: aErr } = await supabaseAdmin
      .from('affirmations')
      .upsert(
        [{ user_id, for_date, lines, category, visual_theme, model: 'openrouter', prompt_version: 1 }],
        { onConflict: 'user_id,for_date' }
      )
      .select()
      .single();

    if (aErr) throw new Error(`affirmations upsert failed: ${aErr.message}`);

    return NextResponse.json({ ok: true, affirmation: insert });
  } catch (e: any) {
    console.error('generate-today error:', e); // ← see terminal for full stack
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
