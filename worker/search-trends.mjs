import crypto from 'node:crypto'
import { SaxesParser } from 'saxes'
import { searchTrendLimits as limits, searchTrendFeedUrl, validateSearchTrendQuery, validateSearchTrendSnapshot } from './search-trends-protocol.mjs'
const ht = 'https://trends.google.com/trending/rss'
/** Strict bounded XML. Never fetch DTDs, entities, article pages, thumbnails or arbitrary URLs. */
export function parseSearchTrendFeed(xml, country, retrievedAt, feedSha256) {
  if (typeof xml !== 'string' || Buffer.byteLength(xml) > limits.feedBytes || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('Unsafe or oversized trend XML')
  const parser = new SaxesParser({ xmlns: true, defaultXMLVersion: '1.0', forceXMLVersion: true }), stack = []
  let root, nodes = 0
  parser.on('doctype', () => { throw Error('Trend DTDs are forbidden') })
  parser.on('opentag', tag => {
    if (++nodes > 20000 || stack.length >= 12) throw Error('Trend XML structure exceeds limits')
    const node = { name: tag.local, uri: tag.uri, text: '', children: [] }
    if (stack.length) stack.at(-1).children.push(node); else root = node
    stack.push(node)
  })
  const append = value => { if (stack.length) stack.at(-1).text += value }
  parser.on('text', append); parser.on('cdata', append); parser.on('closetag', () => stack.pop())
  parser.write(xml).close()
  const children = (node, name, uri = '') => node.children.filter(child => child.name === name && child.uri === uri)
  const one = (node, name, uri = '', optional = false) => {
    const found = children(node, name, uri)
    if (found.length > 1 || (!optional && found.length !== 1)) throw Error('Missing or ambiguous trend field: ' + name)
    if (!found.length) return null
    if (found[0].children.length) throw Error('Nested markup is not a trend text field')
    return found[0].text.replace(/\s+/g, ' ').trim()
  }
  if (root?.name !== 'rss' || root.uri !== '' || children(root, 'channel').length !== 1) throw Error('Expected an RSS channel')
  const channel = children(root, 'channel')[0], items = children(channel, 'item')
  if (items.length > limits.items) throw Error('Too many trend entries; refusing silent truncation')
  const sourceUrl = searchTrendFeedUrl(country)
  if (one(channel, 'link') !== sourceUrl) throw Error('Trend channel does not match requested country')
  const parsed = items.map(item => {
    const rawDate = one(item, 'pubDate'), timestamp = Date.parse(rawDate ?? '')
    if (!Number.isFinite(timestamp)) throw Error('Invalid trend publication date')
    const articles = children(item, 'news_item', ht)
    if (articles.length > limits.articles) throw Error('Too many article references; refusing silent truncation')
    return { query: one(item, 'title'), reportedTraffic: one(item, 'approx_traffic', ht, true) || null, publishedAt: new Date(timestamp).toISOString(),
      articles: articles.map(article => ({ title: one(article, 'news_item_title', ht), url: one(article, 'news_item_url', ht), source: one(article, 'news_item_source', ht) })) }
  })
  return validateSearchTrendSnapshot({ schemaVersion: 1, provider: 'google-trends-rss', country, sourceUrl, retrievedAt, feedSha256, items: parsed }, { country })
}
/** Explicit public RSS reads only; cache retains original retrieval time and never invents fresh data. */
export function createSearchTrendRuntime({ fetchImpl = fetch, clock = () => Date.now() } = {}) {
  const cache = new Map(), pending = new Map(), lastAttempt = new Map()
  async function retrieve(country) {
    const now = clock(), previous = cache.get(country)
    if (previous && now >= previous.time && now - previous.time < 60000) return structuredClone(previous.snapshot)
    const last = lastAttempt.get(country)
    if (last !== undefined && now >= last && now - last < 60000) throw Error('Wait 60 seconds before retrying this public feed; no automatic retry')
    lastAttempt.set(country, now)
    const response = await fetchImpl(searchTrendFeedUrl(country), { method: 'GET', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8', 'User-Agent': 'KINAOU/0.1 (public RSS reader)' } })
    try {
      if (!response.ok) throw Error('Public trend feed returned HTTP ' + response.status)
      if (!/^(application\/(rss\+xml|xml)|text\/xml)(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw Error('Public trend feed is not XML')
      const length = response.headers.get('content-length')
      if (length && (!/^\d+$/.test(length) || Number(length) > limits.feedBytes)) throw Error('Public trend feed exceeds byte limit')
    } catch (error) { await response.body?.cancel().catch(() => {}); throw error }
    if (!response.body) throw Error('Public trend feed is empty')
    const reader = response.body.getReader(), chunks = []; let size = 0
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limits.feedBytes) throw Error('Public trend feed exceeds byte limit'); chunks.push(value) } }
    catch (error) { await reader.cancel().catch(() => {}); throw error }
    finally { reader.releaseLock() }
    const bytes = Buffer.concat(chunks), xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const snapshot = parseSearchTrendFeed(xml, country, new Date(clock()).toISOString(), crypto.createHash('sha256').update(bytes).digest('hex'))
    cache.set(country, { time: clock(), snapshot }); return structuredClone(snapshot)
  }
  return { async load(value) {
    const { country } = validateSearchTrendQuery(value)
    if (!pending.has(country)) pending.set(country, retrieve(country).finally(() => pending.delete(country)))
    return structuredClone(await pending.get(country))
  } }
}
