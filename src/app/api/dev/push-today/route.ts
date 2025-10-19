import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendDailyCardPush } from '@/lib/pushExpo';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const user_id = searchParams.get('user_id');
    if (!user_id) return NextResponse.json({ ok:false, error:'user_id required' }, { status:400 });

    // Find user's timezone
    const { data: profile, error: pErr } = await supabaseAdmin
      .from('profiles').select('timezone').eq('user_id', user_id).single();
    if (pErr || !profile) throw new Error('profile not found');

    const tz = profile.timezone || 'UTC';
    const for_date = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit'
    }).format(new Date());

    // Get today's lines
    const { data: aff, error: aErr } = await supabaseAdmin
      .from('affirmations')
      .select('lines, card_image_url')
      .eq('user_id', user_id)
      .eq('for_date', for_date)
      .single();
    if (aErr || !aff) throw new Error('no affirmation for today');

    const res = await sendDailyCardPush(user_id, aff.lines, aff.card_image_url ?? undefined);
    return NextResponse.json({ ok:true, sent: res.sent });
  } catch (e:any) {
    console.error('push-today error:', e);
    return NextResponse.json({ ok:false, error: String(e?.message || e) }, { status:500 });
  }
}
