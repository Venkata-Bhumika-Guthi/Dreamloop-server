import { openai } from './openai';

const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

export async function generateTwoLines(input: {
  goals: string[];
  tone: string;
  language: string;
  weekday: string;
  weatherSummary?: string;
  temperature?: number;
  unit?: 'C'|'F';
}) {
  const sys = `You are a compassionate, succinct daily coach.
Return JSON only with two short affirmations (<=18 words each), plus a category and visual_theme.
No exclamation marks, no clichés, supportive, second-person.`;

  const user = `
Goals: ${input.goals.join(', ') || 'general wellbeing'}
Tone: ${input.tone}
Language: ${input.language}
Today: ${input.weekday}
Weather: ${input.weatherSummary ?? '—'}, ${input.temperature ?? ''}${input.unit ?? ''}

Return JSON:
{"lines":["...","..."],"category":"focus|confidence|calm|gratitude|creativity","visual_theme":"5–8 words"}`;

  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ],
    // Many OpenRouter models support this; if not, we'll fall back below.
    response_format: { type: 'json_object' } as any,
    temperature: 0.7,
  });

  let txt = res.choices?.[0]?.message?.content ?? '{}';

  // Fallback: some models could wrap JSON in backticks or add prose.
  // Try to extract the first JSON object if parsing fails.
  let parsed: any;
  try {
    parsed = JSON.parse(txt);
  } catch {
    const match = txt.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : {};
  }

  return {
    lines: (parsed.lines as string[]) || [],
    category: (parsed.category as string) || 'focus',
    visual_theme: (parsed.visual_theme as string) || 'soft gradient waves',
  };
}
