import OpenAI from 'openai';

/**
 * OpenRouter uses the OpenAI-compatible SDK but different baseURL and headers.
 * Docs: https://openrouter.ai/docs
 */
export const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: 'https://openrouter.ai/api/v1',
  // These two headers are recommended by OpenRouter for rate limiting & attribution
  defaultHeaders: {
    'HTTP-Referer': 'https://dreamloop.local', // or your site/app name
    'X-Title': 'DreamLoop',
  },
});
