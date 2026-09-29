export type TacticsLanguage = 'de' | 'en' | 'fr'
export type TacticsTeam = 'home' | 'away'
export interface TacticsPoint { x: number; y: number }
export interface TacticsPlayer extends TacticsPoint { id: string; team: TacticsTeam; number: number; label: string }
export interface TacticsArrow { id: string; from: string; to: TacticsPoint; kind: 'pass' | 'run' }
export interface FootballTacticsBoard { schemaVersion: 1; title: string; language: TacticsLanguage; home: string; away: string; players: TacticsPlayer[]; ball: TacticsPoint; arrows: TacticsArrow[] }
export const footballPitch = { x: 80, y: 145, width: 1760, height: 810 }
export function validateTacticsImageProbe<T extends { width?: number; height?: number; videoCodec?: string }>(probe: T): T {
  if (probe.width !== 1920 || probe.height !== 1080 || probe.videoCodec !== 'png') throw Error('Saved tactics image must be a 1920 × 1080 PNG')
  return probe
}
export const tacticsLabels = {
  de: { title: 'Spielaufbau erklären', home: 'Team A', away: 'Team B', notice: 'Schematische Illustration · keine Spielaufnahme oder gemessenen Trackingdaten', pass: 'Pass', run: 'Laufweg' },
  en: { title: 'Explain the build-up', home: 'Team A', away: 'Team B', notice: 'Schematic illustration · not match footage or measured tracking data', pass: 'Pass', run: 'Run' },
  fr: { title: 'Expliquer la construction', home: 'Équipe A', away: 'Équipe B', notice: 'Illustration schématique · ni séquence de match ni données de suivi mesurées', pass: 'Passe', run: 'Course' }
}
const point = (value: unknown): TacticsPoint => {
  const p = value as TacticsPoint
  if (!p || ![p.x, p.y].every(n => Number.isFinite(n) && n >= 0 && n <= 100)) throw Error('Tactics coordinates must be between 0 and 100')
  return { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }
}
const text = (value: unknown, max: number, empty = false) => {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max || /[\x00-\x1f\x7f]/.test(value) || new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(value)) !== value) throw Error('Invalid tactics label')
  return value
}
export function parseFootballTactics(value: unknown): FootballTacticsBoard {
  const b = value as FootballTacticsBoard
  if (b?.schemaVersion !== 1 || !['de','en','fr'].includes(b.language) || !Array.isArray(b.players) || b.players.length !== 22 || !Array.isArray(b.arrows) || b.arrows.length > 12) throw Error('Invalid tactics board')
  const ids = new Set<string>(), jerseys = new Set<string>()
  const players = b.players.map(p => {
    if (!p || !['home','away'].includes(p.team) || !new RegExp('^' + p.team + '-(?:[1-9]|10|11)$').test(p.id) || ids.has(p.id) || !Number.isInteger(p.number) || p.number < 1 || p.number > 99 || jerseys.has(p.team + ':' + p.number)) throw Error('Invalid or duplicate tactics player')
    ids.add(p.id); jerseys.add(p.team + ':' + p.number)
    return { id: p.id, team: p.team, number: p.number, label: text(p.label, 24, true), ...point(p) }
  }).sort((a, b) => a.team === b.team ? Number(a.id.split('-')[1]) - Number(b.id.split('-')[1]) : a.team === 'home' ? -1 : 1)
  const arrowIds = new Set<string>()
  const arrows = b.arrows.map(a => {
    if (!a || typeof a.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(a.id) || arrowIds.has(a.id) || !ids.has(a.from) || !['pass','run'].includes(a.kind)) throw Error('Invalid tactics arrow')
    arrowIds.add(a.id); return { id: a.id, from: a.from, to: point(a.to), kind: a.kind }
  })
  return { schemaVersion: 1, title: text(b.title, 60, true), language: b.language, home: text(b.home, 40, true), away: text(b.away, 40, true), players, ball: point(b.ball), arrows }
}
export function createFootballTactics(language: TacticsLanguage): FootballTacticsBoard {
  const labels = tacticsLabels[language]
  const formation = [[7,50],[23,14],[23,38],[23,62],[23,86],[37,22],[37,50],[37,78],[48,14],[48,50],[48,86]]
  return parseFootballTactics({ schemaVersion: 1, title: labels.title, language, home: labels.home, away: labels.away, ball: { x: 43, y: 50 }, arrows: [],
    players: (['home','away'] as const).flatMap(team => formation.map(([x,y], index) => ({ id: team + '-' + (index + 1), team, number: index + 1, label: '', x: team === 'home' ? x : 100 - x, y: team === 'home' ? y : 100 - y }))) })
}
const escape = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')
export function footballBoardSvg(value: FootballTacticsBoard): string {
  const b = parseFootballTactics(value), p = footballPitch, labels = tacticsLabels[b.language]
  const x = (n: number) => p.x + p.width * n / 100, y = (n: number) => p.y + p.height * n / 100
  const colors = { home: '#2563eb', away: '#dc2626' }
  const stripes = Array.from({ length: 10 }, (_, i) => `<rect x="${p.x + i*p.width/10}" y="${p.y}" width="${p.width/10}" height="${p.height}" fill="${i%2 ? '#16583c' : '#1b6345'}"/>`).join('')
  const players = b.players.map(player => `<g><circle cx="${x(player.x)}" cy="${y(player.y)}" r="29" fill="${colors[player.team]}" stroke="#fff" stroke-width="4"/><text x="${x(player.x)}" y="${y(player.y)+9}" font-size="27" font-weight="700" text-anchor="middle" fill="#fff">${player.number}</text>${player.label ? `<text x="${x(player.x)}" y="${y(player.y)+55}" font-size="21" text-anchor="middle" fill="#fff" stroke="#10261d" stroke-width="5" paint-order="stroke">${escape(player.label)}</text>` : ''}</g>`).join('')
  const arrows = b.arrows.map(a => { const from = b.players.find(player => player.id === a.from)!; return `<line x1="${x(from.x)}" y1="${y(from.y)}" x2="${x(a.to.x)}" y2="${y(a.to.y)}" stroke="#fde047" stroke-width="7" ${a.kind === 'run' ? 'stroke-dasharray="18 12"' : ''} marker-end="url(#tactics-arrow)"/>` }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" font-family="Arial,sans-serif"><rect width="1920" height="1080" fill="#101820"/><defs><marker id="tactics-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#fde047"/></marker></defs><text x="80" y="58" fill="#fff" font-size="38" font-weight="700">${escape(b.title)}</text><text x="80" y="105" fill="#93c5fd" font-size="27">${escape(b.home)} →</text><text x="1840" y="105" text-anchor="end" fill="#fca5a5" font-size="27">← ${escape(b.away)}</text>${stripes}<g fill="none" stroke="#cde7d8" stroke-width="4"><rect x="80" y="145" width="1760" height="810"/><line x1="960" y1="145" x2="960" y2="955"/><circle cx="960" cy="550" r="105"/><rect x="80" y="307" width="260" height="486"/><rect x="1580" y="307" width="260" height="486"/><rect x="80" y="418" width="88" height="264"/><rect x="1752" y="418" width="88" height="264"/><rect x="58" y="477" width="22" height="146"/><rect x="1840" y="477" width="22" height="146"/></g><circle cx="960" cy="550" r="6" fill="#cde7d8"/>${arrows}${players}<circle cx="${x(b.ball.x)}" cy="${y(b.ball.y)}" r="17" fill="#fff" stroke="#101820" stroke-width="5"/><circle cx="${x(b.ball.x)}" cy="${y(b.ball.y)}" r="5" fill="#101820"/><text x="80" y="1002" fill="#fde047" font-size="24">→ ${escape(labels.pass)}   ·   - - → ${escape(labels.run)}</text><text x="80" y="1050" fill="#c4ccd5" font-size="25">${escape(labels.notice)}</text></svg>`
}
/** No external media/font/network references. The browser rasterizes this exact authored SVG. */
export async function rasterizeFootballTactics(value: FootballTacticsBoard): Promise<File> {
  const svg = footballBoardSvg(value), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), image = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { image.onload = null; image.onerror = null; reject(Error('Tactics image preparation timed out')) }, 15000)
      image.onload = () => { clearTimeout(timer); resolve() }; image.onerror = () => { clearTimeout(timer); reject(Error('Tactics image could not be prepared')) }; image.src = url
    })
    const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080
    const context = canvas.getContext('2d'); if (!context) throw Error('Canvas image export unavailable')
    context.drawImage(image, 0, 0)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error('PNG export failed')), 'image/png'))
    if (blob.type !== 'image/png' || !blob.size || blob.size > 20 * 1024 ** 2) throw Error('Invalid tactics PNG')
    return new File([blob], 'football-tactics-' + crypto.randomUUID() + '.png', { type: 'image/png' })
  } finally { image.onload = null; image.onerror = null; URL.revokeObjectURL(url) }
}
