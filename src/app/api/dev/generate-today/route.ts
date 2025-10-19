import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateTwoLines } from '@/lib/generate';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const user_id = searchParams.get('user_id');
    if (!user_id) {
      return NextResponse.json({ ok: false, error: 'user_id required' }, { status: 400 });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');
    }
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('Missing OPENROUTER_API_KEY');
    }

    // Load profile
    const { data: profile, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (pErr) throw new Error(`profile query failed: ${pErr.message}`);
    if (!profile) return NextResponse.json({ ok: false, error: 'profile_not_found' }, { status: 404 });

    const tz: string = profile.timezone || 'UTC';

    // Weekday and for_date in user TZ
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(new Date());
    const for_date = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const { lines, category, visual_theme } = await generateTwoLines({
      goals: profile.goals || [],
      tone: profile.tone || 'warm',
      language: profile.language || 'en',
      weekday,
    });
    if (!lines?.length) throw new Error('model returned empty lines');

    const { data: insert, error: aErr } = await supabaseAdmin
      .from('affirmations')
      .upsert(
        [
          {
            user_id,
            for_date,
            lines,
            category,
            visual_theme,
            model: 'openrouter',
            prompt_version: 1,
          },
        ],
        { onConflict: 'user_id,for_date' }
      )
      .select()
      .single();

    if (aErr) throw new Error(`affirmations upsert failed: ${aErr.message}`);

    return NextResponse.json({ ok: true, affirmation: insert });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('generate-today error:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
