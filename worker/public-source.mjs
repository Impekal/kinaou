import { lookup } from 'node:dns/promises'
import { request as httpsRequest, Agent } from 'node:https'
import { isIP, BlockList } from 'node:net'
import { createHash } from 'node:crypto'
import { parse } from 'parse5'
import { publicSourceLimits as limits, publicSourceRequestSchema, publicSourceUrl, validatePublicSourceResult } from './public-source-protocol.mjs'

// Conservative exclusions based on IANA special-purpose registries (2026-10-03).
const blocked4 = new BlockList(), blocked6 = new BlockList(), global6 = new BlockList()
for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) blocked4.addSubnet(address,prefix,'ipv4')
global6.addSubnet('2000::',3,'ipv6')
for (const [address,prefix] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]]) blocked6.addSubnet(address,prefix,'ipv6')
export function isPublicSourceAddress(address) {
  return typeof address === 'string' && !address.includes('%') && (isIP(address) === 4 ? !blocked4.check(address,'ipv4') : isIP(address) === 6 && global6.check(address,'ipv6') && !blocked6.check(address,'ipv6'))
}
function abortable(promise, signal) {
  return new Promise((resolve,reject) => {
    const aborted = () => reject(signal.reason ?? Error('Source retrieval cancelled'))
    if (signal.aborted) return aborted()
    signal.addEventListener('abort',aborted,{once:true})
    promise.then(resolve,reject).finally(() => signal.removeEventListener('abort',aborted))
  })
}
export async function retrievePublicHtml(value, { lookupImpl = lookup, requestImpl = httpsRequest, signal } = {}) {
  const requestedUrl = publicSourceUrl(value), redirects = [], seen = new Set()
  signal ??= AbortSignal.timeout(limits.timeoutMs)
  let current = requestedUrl
  for (;;) {
    signal.throwIfAborted()
    if (seen.has(current)) throw Error('Public source redirect loop')
    seen.add(current)
    const url = new URL(current)
    const addresses = await abortable(lookupImpl(url.hostname,{all:true,verbatim:true}),signal)
    if (!Array.isArray(addresses) || !addresses.length || addresses.length > 32 || addresses.some(item => !isPublicSourceAddress(item.address) || isIP(item.address) !== item.family)) throw Error('Public source resolves to a non-public or unsupported address')
    const pinned = addresses.find(item => item.family === 4) ?? addresses[0]
    // No shared/global agent, cookies, auth, proxy, DNS re-resolution or TLS bypass.
    const agent = new Agent({keepAlive:false,maxSockets:1})
    let response
    try {
      response = await new Promise((resolve,reject) => {
        const request = requestImpl(url, { method:'GET', agent, signal, servername:url.hostname, family:pinned.family, autoSelectFamily:false,
          lookup: (_host,options,callback) => options?.all ? callback(null,[pinned]) : callback(null,pinned.address,pinned.family),
          headers:{ accept:'text/html', 'accept-encoding':'identity', 'user-agent':'KINAOU-PersonalResearch/1.0' }, maxHeaderSize:16384
        },resolve)
        request.on('error',reject); request.end()
      })
      if ([301,302,303,307,308].includes(response.statusCode)) {
        if (redirects.length >= limits.redirects || typeof response.headers.location !== 'string') throw Error('Unsupported public source redirect')
        current = publicSourceUrl(new URL(response.headers.location,url).href)
        redirects.push(current)
        continue
      }
      if (response.statusCode !== 200) throw Error(`Public source returned HTTP ${response.statusCode}; use the original link without bypassing access restrictions`)
      const mime = response.headers['content-type'] ?? '', encoding = response.headers['content-encoding']
      if (!/^text\/html(?:\s*;|$)/i.test(mime) || (encoding && encoding !== 'identity')) throw Error('Only uncompressed HTML pages are supported')
      const charset = mime.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1]
      if (charset && !/^utf-?8$/i.test(charset)) throw Error('Only UTF-8 source pages are supported')
      const length = response.headers['content-length']
      if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > limits.htmlBytes)) throw Error('Public source page exceeds byte limit')
      const chunks = []; let bytes = 0
      for await (const chunk of response) { signal.throwIfAborted(); bytes += chunk.length; if (bytes > limits.htmlBytes) throw Error('Public source page exceeds byte limit'); chunks.push(chunk) }
      if (!bytes) throw Error('Public source page is empty')
      const buffer = Buffer.concat(chunks)
      return { requestedUrl, finalUrl:current, redirectUrls:redirects, buffer }
    } finally { response?.destroy(); agent.destroy() }
  }
}
const skipped = new Set(['script','style','nav','footer','header','form','input','button','select','textarea','noscript','template','iframe','svg','canvas'])
const blocks = new Set(['article','main','body','section','div','p','h1','h2','h3','h4','h5','h6','li','ul','ol','blockquote','pre','table','tr','td','th','br','hr'])
function attr(node,name) { return node.attrs?.find(item => item.name === name)?.value }
function hidden(node) { return skipped.has(node.tagName) || attr(node,'hidden') !== undefined || attr(node,'aria-hidden') === 'true' || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attr(node,'style') ?? '') }
function clean(value) { return value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'').replace(/[\t\r ]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim() }
function nodeText(root) {
  const stack = [root], text = []
  while (stack.length) {
    const node = stack.pop()
    if (typeof node === 'string') { text.push(node); continue }
    if (hidden(node)) continue
    if (node.nodeName === '#text') { text.push(node.value); continue }
    if (blocks.has(node.tagName)) { text.push('\n'); stack.push('\n') }
    for (const child of [...(node.childNodes ?? [])].reverse()) stack.push(child)
  }
  return clean(text.join(''))
}
export function extractPublicSource(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > limits.htmlBytes) throw Error('Invalid public source bytes')
  const html = new TextDecoder('utf-8',{fatal:true}).decode(buffer), document = parse(html), nodes = [], pending = [document]
  while (pending.length) {
    const node = pending.pop()
    if (hidden(node)) continue
    nodes.push(node)
    if (nodes.length > 50000) throw Error('Public source page is too complex')
    pending.push(...(node.childNodes ?? []))
  }
  const metas = nodes.filter(node => node.tagName === 'meta')
  for (const meta of metas) {
    const charset = attr(meta,'charset') ?? ((attr(meta,'http-equiv') ?? '').toLowerCase() === 'content-type' ? attr(meta,'content')?.match(/charset\s*=\s*([^\s;]+)/i)?.[1] : undefined)
    if (charset && !/^utf-?8$/i.test(charset)) throw Error('Only UTF-8 source pages are supported')
  }
  let extraction = 'body', root = nodes.find(node => node.tagName === 'body')
  for (const tag of ['article','main']) { const candidates = nodes.filter(node => node.tagName === tag); if (candidates.length === 1) { root = candidates[0]; extraction = tag; break } }
  if (!root) throw Error('Public source has no readable body')
  const text = nodeText(root), titleNode = nodes.find(node => node.tagName === 'title'), declared = attr(nodes.find(node => node.tagName === 'html') ?? {},'lang')
  if (!text) throw Error('No readable static source text; use the original link')
  let excerpt = text.slice(0,limits.textCharacters)
  if (/[\uD800-\uDBFF]$/.test(excerpt)) excerpt = excerpt.slice(0,-1)
  return { title:titleNode ? nodeText(titleNode).slice(0,500) : '', declaredLanguage:declared && /^[a-zA-Z0-9-]{1,35}$/.test(declared) ? declared : null, extraction, text:excerpt, truncated:text.length > excerpt.length }
}
export function createPublicSourceRuntime({ retrieve = retrievePublicHtml, clock = Date.now } = {}) {
  let busy = false, lastAttempt = -Infinity
  return { async load(value) {
    const input = publicSourceRequestSchema.parse(value)
    if (busy) throw Error('A public source retrieval is already running')
    if (clock() - lastAttempt < 5000) throw Error('Wait 5 seconds before another public source retrieval')
    busy = true; lastAttempt = clock()
    try {
      const result = await retrieve(input.url)
      return validatePublicSourceResult({ schemaVersion:1, requestedUrl:result.requestedUrl, finalUrl:result.finalUrl, redirectUrls:result.redirectUrls,
        retrievedAt:new Date(clock()).toISOString(), htmlSha256:createHash('sha256').update(result.buffer).digest('hex'), htmlBytes:result.buffer.length,
        ...extractPublicSource(result.buffer), verified:false },input)
    } finally { busy = false }
  } }
}
