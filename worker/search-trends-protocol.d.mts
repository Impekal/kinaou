export type SearchTrendCountry = 'DE' | 'FR' | 'GB' | 'US' | 'CA' | 'AT' | 'CH'
export interface SearchTrendQuery { country: SearchTrendCountry }
export interface SearchTrendItem { query: string; reportedTraffic: string | null; publishedAt: string; articles: Array<{ title: string; url: string; source: string }> }
export interface SearchTrendSnapshot { schemaVersion: 1; provider: 'google-trends-rss'; country: SearchTrendCountry; sourceUrl: string; retrievedAt: string; feedSha256: string; items: SearchTrendItem[] }
export const searchTrendCountries: SearchTrendCountry[]
export const searchTrendLimits: { feedBytes: number; items: number; articles: number; snapshotBytes: number }
export function validateSearchTrendQuery(value: unknown): SearchTrendQuery
export function searchTrendFeedUrl(country: SearchTrendCountry): string
export function publicTrendArticleUrl(value: unknown): string
export function validateSearchTrendItem(value: unknown): SearchTrendItem
export function validateSearchTrendSnapshot(value: unknown, query: SearchTrendQuery): SearchTrendSnapshot
