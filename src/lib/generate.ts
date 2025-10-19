import { openai } from './openai';

const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

const VALID_CATEGORIES = ['focus', 'confidence', 'calm', 'gratitude', 'creativity'] as const;
type Cat = (typeof VALID_CATEGORIES)[number];

function coerceCategory(raw: unknown): Cat {
  const s = String(raw ?? '').toLowerCase();
  for (const c of VALID_CATEGORIES) if (s.includes(c)) return c;
  return 'focus';
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'string');
}

export async function generateTwoLines(input: {
  goals: string[];
  tone: string;
  language: string;
  weekday: string;
  weatherSummary?: string;
  temperature?: number;
  unit?: 'C' | 'F';
}) {
  const sys = `You are a compassionate, succinct daily coach.
Return JSON only with two short affirmations (<=18 words each), plus a category and visual_theme.
No exclamation marks, no clichés, supportive, second-person. Allowed categories: focus, confidence, calm, gratitude, creativity.`;

  const weatherPart =
    input.temperature != null && input.unit
      ? `${input.weatherSummary ?? '—'}, ${input.temperature}°${input.unit}`
      : `${input.weatherSummary ?? '—'}`;

  const user = `
Goals: ${input.goals.join(', ') || 'general wellbeing'}
Tone: ${input.tone}
Language: ${input.language}
Today: ${input.weekday}
Weather: ${weatherPart}

Return JSON:
{"lines":["...","..."],"category":"focus","visual_theme":"5–8 words"}`;

  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' } as unknown, // some OR models accept this
    temperature: 0.7,
  });

  const txt = res.choices?.[0]?.message?.content ?? '{}';

  // Robust JSON parse
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(txt) as Record<string, unknown>;
  } catch {
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]) as Record<string, unknown>;
  }

  const lines = isStringArray(parsed.lines) ? parsed.lines.slice(0, 2).map((s) => s.trim()) : [];
  const category = coerceCategory(parsed.category);
  const visual_theme = String(parsed.visual_theme ?? 'soft gradient waves');

  return { lines, category, visual_theme };
}
