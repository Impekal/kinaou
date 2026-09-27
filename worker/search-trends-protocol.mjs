export const searchTrendCountries = ['DE','FR','GB','US','CA','AT','CH']
export const searchTrendLimits = { feedBytes: 2 * 1024 ** 2, items: 200, articles: 5, snapshotBytes: 1024 ** 2 }
export function validateSearchTrendQuery(value) {
  if (!value || !searchTrendCountries.includes(value.country) || Object.keys(value).some(key => key !== 'country')) throw Error('Select a supported public trend country')
  return { country: value.country }
}
export function searchTrendFeedUrl(country) { validateSearchTrendQuery({ country }); return `https://trends.google.com/trending/rss?geo=${country}` }
function text(value, max) { if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw Error('Invalid trend text'); return value }
function date(value) { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw Error('Invalid trend date'); return value }
export function publicTrendArticleUrl(value) {
  text(value, 2048)
  const url = new URL(value)
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password || url.port || !url.hostname.includes('.') || /[:\[\]]/.test(url.hostname) || /^[\d.]+$/.test(url.hostname) || /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)) throw Error('Unsafe trend article link')
  return url.href
}
export function validateSearchTrendItem(value) {
  if (!value || !Array.isArray(value.articles) || value.articles.length > searchTrendLimits.articles) throw Error('Invalid trend articles')
  return { query: text(value.query, 500), reportedTraffic: value.reportedTraffic === null ? null : text(value.reportedTraffic, 80), publishedAt: date(value.publishedAt),
    articles: value.articles.map(article => ({ title: text(article?.title, 1000), url: publicTrendArticleUrl(article.url), source: text(article.source, 200) })) }
}
export function validateSearchTrendSnapshot(value, query) {
  const { country } = validateSearchTrendQuery(query)
  if (value?.schemaVersion !== 1 || value.provider !== 'google-trends-rss' || value.country !== country || value.sourceUrl !== searchTrendFeedUrl(country)
    || typeof value.feedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.feedSha256) || !Array.isArray(value.items) || value.items.length > searchTrendLimits.items) throw Error('Trend snapshot does not match the requested source/country')
  const snapshot = { schemaVersion: 1, provider: 'google-trends-rss', country, sourceUrl: value.sourceUrl, retrievedAt: date(value.retrievedAt), feedSha256: value.feedSha256, items: value.items.map(validateSearchTrendItem) }
  if (new TextEncoder().encode(JSON.stringify(snapshot)).length > searchTrendLimits.snapshotBytes) throw Error('Trend snapshot exceeds size limit')
  return snapshot
}
