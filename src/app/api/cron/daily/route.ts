import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateTwoLines } from '@/lib/generate';
import { sendDailyCardPush } from '@/lib/pushExpo';
import { fetchWeather } from '@/lib/weather';


export const runtime = 'nodejs';

function auth(req: Request) {
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token && token === process.env.CRON_SECRET;
}

// naive window: treat users as due if local time >= daily_time_local and no row exists for today
function isDue(nowLocal: Date, dailyHHMM: string): boolean {
  const [hh, mm] = dailyHHMM.split(':').map(n => parseInt(n, 10));
  const scheduled = new Date(nowLocal);
  scheduled.setHours(hh || 7, mm || 30, 0, 0);
  return nowLocal.getTime() >= scheduled.getTime();
}

export async function POST(req: Request) {
  try {
    if (!auth(req)) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

    // Load active users
    const { data: profiles, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('user_id, goals, tone, language, timezone, lat, lon, daily_time_local, wants_push, is_paused')
      .eq('wants_push', true)
      .eq('is_paused', false);
    if (pErr) throw pErr;

    const results: any[] = [];
    for (const p of profiles ?? []) {
      try {
        const tz = p.timezone || 'UTC';

        // Today in user's TZ
        const for_date = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit'
        }).format(new Date());

        // if already generated for today, skip push/generation check (we’ll still push)
        const { data: existing } = await supabaseAdmin
          .from('affirmations')
          .select('id, lines')
          .eq('user_id', p.user_id)
          .eq('for_date', for_date)
          .maybeSingle();

        // local "now" for due check
        const nowLocal = new Date(new Intl.DateTimeFormat('en-CA', {
          timeZone: tz, hour12:false, hour:'2-digit', minute:'2-digit'
        }).format(new Date()).replace(/-/g,'/')); // coarse

        if (!existing && !isDue(nowLocal, p.daily_time_local)) {
          results.push({ user: p.user_id, status: 'not_due' });
          continue;
        }

        // Ensure we have content
        let lines = existing?.lines as string[] | undefined;

        if (!lines) {
          const wx = await fetchWeather(p.lat, p.lon, tz);
          const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(new Date());
          const gen = await generateTwoLines({
            goals: p.goals || [],
            tone: p.tone || 'warm',
            language: p.language || 'en',
            weekday,
            weatherSummary: wx?.summary,
            temperature: wx?.tempC,
            unit: 'C',
          });

          const up = await supabaseAdmin
            .from('affirmations')
            .upsert([{
              user_id: p.user_id,
              for_date,
              lines: gen.lines,
              category: gen.category,
              visual_theme: gen.visual_theme,
              weather: wx ?? null,
              model: 'openrouter',
              prompt_version: 1,
            }], { onConflict: 'user_id,for_date' })
            .select()
            .single();
          if (up.error) throw up.error;
          lines = up.data.lines as string[];
        }

        // Push it
        const sent = await sendDailyCardPush(p.user_id, lines);
        results.push({ user: p.user_id, status: 'ok', sent: sent.sent });
      } catch (inner: any) {
        console.error('cron user error', p.user_id, inner);
        results.push({ user: p.user_id, status: 'error', error: String(inner?.message || inner) });
      }
    }

    return NextResponse.json({ ok:true, results });
  } catch (e:any) {
    console.error('cron/daily error:', e);
    return NextResponse.json({ ok:false, error: String(e?.message || e) }, { status:500 });
  }
}
