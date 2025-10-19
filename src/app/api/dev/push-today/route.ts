import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendDailyCardPush } from '@/lib/pushExpo';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const user_id = searchParams.get('user_id');
    if (!user_id) return NextResponse.json({ ok: false, error: 'user_id required' }, { status: 400 });

    const { data: profile, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('timezone')
      .eq('user_id', user_id)
      .single();
    if (pErr || !profile) throw new Error('profile not found');

    const tz = profile.timezone || 'UTC';
    const for_date = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const { data: aff, error: aErr } = await supabaseAdmin
      .from('affirmations')
      .select('lines, card_image_url')
      .eq('user_id', user_id)
      .eq('for_date', for_date)
      .single();
    if (aErr || !aff) throw new Error('no affirmation for today');

    const res = await sendDailyCardPush(user_id, aff.lines as string[], aff.card_image_url ?? undefined);
    return NextResponse.json({ ok: true, sent: res.sent });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('push-today error:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
