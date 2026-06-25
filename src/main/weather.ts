import { loadSettings } from './settings'

/** open-meteo: prob. de lluvia y temp máx de hoy. null si no hay lat/lon. */
export async function fetchWeather(): Promise<{ rainProb: number | null; tempMax: number | null } | null> {
  const s = loadSettings()
  if (s.weatherLat === null || s.weatherLon === null) return null
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${s.weatherLat}&longitude=${s.weatherLon}` +
    `&daily=precipitation_probability_max,temperature_2m_max&forecast_days=1&timezone=auto`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`open-meteo HTTP ${res.status}`)
  const data = (await res.json()) as {
    daily?: { precipitation_probability_max?: number[]; temperature_2m_max?: number[] }
  }
  return {
    rainProb: data.daily?.precipitation_probability_max?.[0] ?? null,
    tempMax: data.daily?.temperature_2m_max?.[0] ?? null,
  }
}
