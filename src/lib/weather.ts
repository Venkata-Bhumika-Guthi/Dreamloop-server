export async function fetchWeather(lat?: number, lon?: number, tz: string = 'UTC') {
  try {
    if (!lat || !lon) {
      console.log('No coordinates for weather, skipping');
      return null;
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=${encodeURIComponent(
      tz
    )}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Weather API error ${res.status}`);
    const data = await res.json();

    const current = data.current_weather || {};
    return {
      summary: `${current.weathercode ?? 'Clear sky'}`,
      tempC: current.temperature,
      icon: '☀️',
    };
  } catch (e) {
    console.error('Weather fetch failed:', e);
    return null;
  }
}
