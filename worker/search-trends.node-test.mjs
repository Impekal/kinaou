import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { parseSearchTrendFeed, createSearchTrendRuntime } from './search-trends.mjs'
import { validateSearchTrendQuery, validateSearchTrendSnapshot, publicTrendArticleUrl, searchTrendLimits, searchTrendCountries, initialSearchTrendCountries, expandedSearchTrendCountries, expandedSearchTrendCapability, supportsSearchTrendCountry } from './search-trends-protocol.mjs'
const date = '2026-09-27T07:00:00.000Z', sha = 'a'.repeat(64)
const item = '<item><title>Example &amp; topic</title><pubDate>Sun, 27 Sep 2026 07:00:00 GMT</pubDate><ht:approx_traffic>200+</ht:approx_traffic><ht:news_item><ht:news_item_title><![CDATA[Example <report>]]></ht:news_item_title><ht:news_item_url>https://example.org/report</ht:news_item_url><ht:news_item_source>Example</ht:news_item_source></ht:news_item></item>'
const feed = (items = item) => '<rss xmlns:ht="https://trends.google.com/trending/rss"><channel><link>https://trends.google.com/trending/rss?geo=DE</link>' + items + '</channel></rss>'
const response = xml => new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } })
test('immutable bounded country list and explicit old-worker capability boundary', () => {
  assert.equal(searchTrendCountries.length, 13); assert.equal(new Set(searchTrendCountries).size, 13)
  for (const list of [searchTrendCountries, initialSearchTrendCountries, expandedSearchTrendCountries]) assert.throws(() => list.push('ZZ'))
  for (const country of initialSearchTrendCountries) assert.equal(supportsSearchTrendCountry(country, ['public-search-trends']), true)
  for (const country of expandedSearchTrendCountries) {
    assert.equal(supportsSearchTrendCountry(country, ['public-search-trends']), false)
    assert.equal(supportsSearchTrendCountry(country, [expandedSearchTrendCapability]), false)
    assert.equal(supportsSearchTrendCountry(country, ['public-search-trends', expandedSearchTrendCapability]), true)
  }
  for (const country of ['WORLD', 'worldwide', '', 'au', 'AU&geo=US', 'ZZ', null]) { assert.throws(() => validateSearchTrendQuery({ country })); assert.equal(supportsSearchTrendCountry(country, ['public-search-trends', expandedSearchTrendCapability]), false) }
})
for (const country of expandedSearchTrendCountries) test('expanded '+country+' uses exact fixed RSS, literal Unicode and isolated cache', async () => {
  const xml = feed().replace('geo=DE', 'geo='+country).replace('Example &amp; topic', 'SYNTHETIC 日本語 · futebol · sport')
  let calls = 0
  const runtime = createSearchTrendRuntime({ fetchImpl: async (url, options) => {
    calls++; assert.equal(url, 'https://trends.google.com/trending/rss?geo='+country)
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); assert.equal(options.body, undefined); assert.equal(options.headers.authorization, undefined)
    return response(xml)
  } })
  const result = await runtime.load({ country })
  assert.equal(result.country, country); assert.equal(result.items[0].query, 'SYNTHETIC 日本語 · futebol · sport'); assert.equal(result.items[0].reportedTraffic, '200+')
  assert.equal(result.feedSha256, createHash('sha256').update(xml).digest('hex'))
  assert.deepEqual(await runtime.load({ country }), result); assert.equal(calls, 1)
  assert.throws(() => validateSearchTrendSnapshot(result, { country: 'DE' }))
  assert.throws(() => parseSearchTrendFeed(feed(), country, date, sha))
})
test('strictly parses literal figures, escaped text, feed publication time and attributed links', () => {
  const snapshot = parseSearchTrendFeed(feed(), 'DE', date, sha)
  assert.equal(snapshot.items[0].query, 'Example & topic'); assert.equal(snapshot.items[0].articles[0].title, 'Example <report>')
  assert.equal(snapshot.items[0].reportedTraffic, '200+'); assert.equal(snapshot.items[0].publishedAt, date)
  assert.equal(parseSearchTrendFeed(feed(item.replace('<ht:approx_traffic>200+</ht:approx_traffic>', '')), 'DE', date, sha).items[0].reportedTraffic, null)
  assert.deepEqual(parseSearchTrendFeed(feed(''), 'DE', date, sha).items, [])
})
for (const [label, xml] of [
  ['doctype', '<!DOCTYPE rss SYSTEM "file:///etc/passwd">' + feed()],
  ['entity', feed().replace('Example &amp; topic', '&private;')],
  ['duplicate', feed().replace('<title>', '<title>Extra</title><title>')],
  ['nested', feed().replace('Example &amp; topic', '<b>Text</b>')],
  ['malformed', feed().slice(0, -6)],
  ['country', feed().replace('geo=DE', 'geo=FR')],
  ['date', feed().replace('Sun, 27 Sep 2026 07:00:00 GMT', 'not a date')],
  ['too many items', feed(item.repeat(201))],
  ['too many bytes', ' '.repeat(searchTrendLimits.feedBytes + 1)]
]) test('rejects ' + label + ' without best-effort fabricated results', () => assert.throws(() => parseSearchTrendFeed(xml, 'DE', date, sha)))
test('rejects unsafe URLs and arbitrary query parameters before fetching', async () => {
  for (const url of ['file:///etc/passwd', 'http://127.0.0.1/a', 'https://user:pass@example.org/', 'https://example.org:8443/a', 'javascript:alert(1)', 'https://x.local/a']) assert.throws(() => publicTrendArticleUrl(url))
  for (const query of [{country:'ZZ'}, {country:'DE', url:'http://127.0.0.1'}, null]) assert.throws(() => validateSearchTrendQuery(query))
  let calls = 0
  await assert.rejects(createSearchTrendRuntime({ fetchImpl: async () => { calls++; return response(feed()) } }).load({country:'DE', project:'private'}))
  assert.equal(calls, 0)
})
test('single fixed public GET, no credentials/redirects/article/image fetch, hash and immutable cache', async () => {
  let calls = 0, clock = Date.parse(date)
  const runtime = createSearchTrendRuntime({ clock: () => clock, fetchImpl: async (url, options) => {
    calls++; assert.equal(url, 'https://trends.google.com/trending/rss?geo=DE'); assert.equal(options.redirect,'error'); assert.equal(options.credentials,'omit')
    assert.equal(options.method,'GET'); assert.equal(options.body, undefined); assert.equal(options.headers.authorization, undefined); return response(feed())
  }})
  const [a,b] = await Promise.all([runtime.load({country:'DE'}),runtime.load({country:'DE'})]); assert.equal(calls,1)
  assert.equal(a.feedSha256,createHash('sha256').update(feed()).digest('hex'));a.items[0].query='mutated';assert.notEqual(b.items[0].query,'mutated')
  clock += 30000;const cached=await runtime.load({country:'DE'});assert.equal(cached.retrievedAt,date);assert.equal(calls,1)
  clock += 31000;await runtime.load({country:'DE'});assert.equal(calls,2)
})
test('failed retrieval has no stale-success fallback or automatic retry, including clock zero', async () => {
  let calls=0,clock=0;const runtime=createSearchTrendRuntime({clock:()=>clock,fetchImpl:async()=>{calls++;throw Error('offline')}})
  await assert.rejects(runtime.load({country:'DE'}),/offline/);await assert.rejects(runtime.load({country:'DE'}),/60 seconds/);assert.equal(calls,1)
  clock=61000;await assert.rejects(runtime.load({country:'DE'}),/offline/);assert.equal(calls,2)
})
for (const [label, reply] of [
  ['HTTP',()=>new Response('unavailable',{status:503})],
  ['MIME',()=>new Response(feed(),{headers:{'content-type':'text/html'}})],
  ['length',()=>new Response(feed(),{headers:{'content-type':'text/xml','content-length':String(searchTrendLimits.feedBytes+1)}})],
  ['stream',()=>response(' '.repeat(searchTrendLimits.feedBytes+1))],
  ['UTF8',()=>new Response(new Uint8Array([0xff]),{headers:{'content-type':'text/xml'}})]
]) test('rejects bad '+label+' response',async()=>await assert.rejects(createSearchTrendRuntime({fetchImpl:async()=>reply()}).load({country:'DE'})))
test('rejects forged provider, digest, dates and source-country combinations',()=>{
  const snapshot=parseSearchTrendFeed(feed(),'DE',date,sha)
  for(const patch of [{provider:'other'},{feedSha256:'fake'},{retrievedAt:'yesterday'},{sourceUrl:'https://example.org'},{country:'FR'}])assert.throws(()=>validateSearchTrendSnapshot({...snapshot,...patch},{country:'DE'}))
})
