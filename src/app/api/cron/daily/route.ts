import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateTwoLines } from '@/lib/generate';
import { fetchWeather } from '@/lib/weather';
import { sendDailyCardPush } from '@/lib/pushExpo';

export const runtime = 'nodejs';

function auth(req: Request) {
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token && token === process.env.CRON_SECRET;
}

type CronResult =
  | { user: string; status: 'ok'; sent: number }
  | { user: string; status: 'not_due' }
  | { user: string; status: 'error'; error: string };

function isDue(nowLocal: Date, dailyHHMM: string): boolean {
  const [hh, mm] = dailyHHMM.split(':').map((n) => parseInt(n, 10));
  const scheduled = new Date(nowLocal);
  scheduled.setHours(hh || 7, mm || 30, 0, 0);
  return nowLocal.getTime() >= scheduled.getTime();
}

export async function POST(req: Request) {
  try {
    if (!auth(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const { data: profiles, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('user_id, goals, tone, language, timezone, lat, lon, daily_time_local, wants_push, is_paused')
      .eq('wants_push', true)
      .eq('is_paused', false);
    if (pErr) throw pErr;

    const results: CronResult[] = [];

    for (const p of profiles ?? []) {
      try {
        const tz: string = p.timezone || 'UTC';

        const for_date = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date());

        const { data: existing } = await supabaseAdmin
          .from('affirmations')
          .select('id, lines')
          .eq('user_id', p.user_id)
          .eq('for_date', for_date)
          .maybeSingle();

        // Derive a "now" in tz for due check (coarse but fine)
        const nowLocal = new Date(
          new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
          }).format(new Date()).replace(/-/g, '/')
        );

        if (!existing && !isDue(nowLocal, p.daily_time_local)) {
          results.push({ user: p.user_id, status: 'not_due' });
          continue;
        }

        let lines: string[] | undefined = existing?.lines as string[] | undefined;

        if (!lines) {
          const wx = await fetchWeather(p.lat as number | undefined, p.lon as number | undefined, tz);
          const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(new Date());
          const gen = await generateTwoLines({
            goals: (p.goals as string[]) || [],
            tone: (p.tone as string) || 'warm',
            language: (p.language as string) || 'en',
            weekday,
            weatherSummary: wx?.summary,
            temperature: wx?.tempC,
            unit: 'C',
          });

          const up = await supabaseAdmin
            .from('affirmations')
            .upsert(
              [
                {
                  user_id: p.user_id as string,
                  for_date,
                  lines: gen.lines,
                  category: gen.category,
                  visual_theme: gen.visual_theme,
                  weather: (await fetchWeather(p.lat as number | undefined, p.lon as number | undefined, tz)) ?? null,
                  model: 'openrouter',
                  prompt_version: 1,
                },
              ],
              { onConflict: 'user_id,for_date' }
            )
            .select()
            .single();
          if (up.error) throw up.error;
          lines = up.data.lines as string[];
        }

        const sentRes = await sendDailyCardPush(p.user_id as string, lines);
        results.push({ user: p.user_id as string, status: 'ok', sent: sentRes.sent });
      } catch (innerErr: unknown) {
        const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
        console.error('cron user error', p.user_id, msg);
        results.push({ user: String(p.user_id), status: 'error', error: msg });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('cron/daily error:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
