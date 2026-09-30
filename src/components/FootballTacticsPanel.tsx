import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { createFootballTactics, footballBoardSvg, footballPitch, parseFootballTactics, rasterizeFootballTactics, validateTacticsImageProbe, type FootballTacticsBoard, type TacticsLanguage, type TacticsPoint } from '../core/footballTactics'
import { projectContentProfile } from '../core/contentProfile'
import { compatibleTracks } from '../core/timelinePlacement'
import { placeTacticsOnNewTrack } from '../core/footballTacticsPlacement'
import { AssetImportSession, type AssetImportFeedback } from '../core/assetImportSession'
import { AiEditorRequestScope } from '../core/aiEditorReview'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { WorkerClient } from '../core/workerClient'
import { AssetImportStatus } from './AssetUploadPanel'
import { AssetPlacementControl } from './AssetPlacementControl'
import { useUiLanguage } from './UiLanguageProvider'
import { FootballSequencePanel } from './FootballSequencePanel'
interface Props { project: KinaouProject; history: PersistentVersionHistory; workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; managedRoots: string[]; onProjectChange: (project: KinaouProject) => void }
export function FootballTacticsPanel({ project, history, workerUrl, workerToken, workerConnected, workerCapabilities, managedRoots, onProjectChange }: Props) {
  const { t } = useUiLanguage()
  const [edits, setEdits] = useState(() => [createFootballTactics(projectContentProfile(project).outputLanguage)]), [position, setPosition] = useState(0)
  const board = edits[position], [selected, setSelected] = useState('home-1'), [arrowId, setArrowId] = useState(''), [mode, setMode] = useState<'player'|'ball'|'arrow'>('player')
  const [ack, setAck] = useState(false), [preparing, setPreparing] = useState(false), [error, setError] = useState(''), [feedback, setFeedback] = useState<AssetImportFeedback | null>(null)
  const session = useRef<AssetImportSession | null>(null), mounted = useRef(true), flight = useRef(false), scope = useRef(new AiEditorRequestScope())
  const connection = JSON.stringify([workerUrl, workerToken, workerConnected, [...workerCapabilities].sort(), managedRoots]), environment = useRef({ project, connection }); environment.current = { project, connection }
  session.current?.observe(project, connection); scope.current.update(JSON.stringify([project, connection, board]))
  useEffect(() => { mounted.current = true; scope.current.attach(); return () => { mounted.current = false; scope.current.detach(); session.current?.detach() } }, [])
  const locked = preparing || Boolean(session.current?.unresolved), available = workerConnected && !!workerToken.trim() && workerCapabilities.includes('asset-upload')
  const player = board.players.find(p => p.id === selected)!, arrow = board.arrows.find(a => a.id === arrowId), target = mode === 'ball' ? board.ball : mode === 'arrow' ? arrow?.to : player
  const svg = footballBoardSvg(board), graphics = project.assets.filter(a => a.kind === 'image' && a.metadata.sourceKind === 'authored-football-tactics-v1')
  function playerTitle(id: string) {
    const p = board.players.find(item => item.id === id)!
    return ((p.team === 'home' ? board.home : board.away) || t(`tactics.${p.team}`)) + ' · ' + p.number
  }
  function placeNewTrack(assetId: string) {
    try { const next = placeTacticsOnNewTrack(project, assetId, t('tactics.heading')); history.snapshot(project, 'Before manual timeline edit', 'system'); onProjectChange(next); setError('') }
    catch (cause) { setError(String(cause)) }
  }
  function edit(next: FootballTacticsBoard) {
    if (locked) return
    try { const parsed = parseFootballTactics(next), nextEdits = [...edits.slice(0, position + 1), parsed].slice(-50); setEdits(nextEdits); setPosition(nextEdits.length - 1); setAck(false); setError('') }
    catch (cause) { setError(String(cause)) }
  }
  function move(point: TacticsPoint) {
    if (!target || locked) return
    if (mode === 'ball') edit({ ...board, ball: point })
    else if (mode === 'arrow') edit({ ...board, arrows: board.arrows.map(a => a.id === arrowId ? { ...a, to: point } : a) })
    else edit({ ...board, players: board.players.map(p => p.id === selected ? { ...p, ...point } : p) })
  }
  function clickPitch(event: MouseEvent<HTMLImageElement>) {
    const rect = event.currentTarget.getBoundingClientRect(), x = ((event.clientX - rect.left) * 1920 / rect.width - footballPitch.x) / footballPitch.width * 100, y = ((event.clientY - rect.top) * 1080 / rect.height - footballPitch.y) / footballPitch.height * 100
    if (x >= 0 && x <= 100 && y >= 0 && y <= 100) move({ x, y })
  }
  function addArrow(kind: 'pass' | 'run') {
    if (locked || board.arrows.length >= 12) return
    const id = crypto.randomUUID(); edit({ ...board, arrows: [...board.arrows, { id, kind, from: selected, to: { x: Math.max(0, Math.min(100, player.x + (player.team === 'home' ? 12 : -12))), y: player.y } }] }); setArrowId(id); setMode('arrow')
  }
  async function save() {
    if (!available || !ack || locked || flight.current) return
    flight.current = true; setPreparing(true); setError('')
    const current = scope.current.begin(), snapshot = parseFootballTactics(board)
    try {
      const file = await rasterizeFootballTactics(snapshot)
      if (!current() || !mounted.current) return
      const client = new WorkerClient({ baseUrl: workerUrl, token: workerToken })
      const task = new AssetImportSession(project, connection, file, 'image', {
        client: { importAsset: (blob, name) => client.importAsset(blob, name), probe: async path => validateTacticsImageProbe(await client.probe(path)) }, environment: () => environment.current,
        assetMetadata: { sourceKind: 'authored-football-tactics-v1', authored: true, illustrationOnly: true, renderer: 'svg-canvas-png-v1', board: snapshot },
        snapshot: value => { history.snapshot(value, 'Before saving imported media', 'system') },
        persist: value => { onProjectChange(value); environment.current = { project: value, connection } },
        publish: value => { if (mounted.current && session.current === task) { setFeedback(value); if (value.phase === 'succeeded') setAck(false) } }
      })
      session.current = task; setPreparing(false); await task.run()
    } catch (cause) { if (current() && mounted.current) setError(String(cause)) }
    finally { flight.current = false; if (mounted.current) setPreparing(false) }
  }
  const visibleFeedback = feedback && session.current?.wasDetached ? { ...feedback, phase: 'detached' as const } : feedback
  return <section className="card stack tacticsPanel">
    <div><h2>{t('tactics.heading')}</h2><p>{t('tactics.help')}</p><p>{t('tactics.boundary')}</p></div>
    <div className="tacticsLayout"><div className="tacticsPreview"><img src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)} alt={t('tactics.preview')} onClick={clickPitch} draggable={false} /><p>{t('tactics.draft')}</p></div>
    <div className="stack">
      <label>{t('tactics.title')}<input value={board.title} maxLength={60} disabled={locked} onChange={e => edit({ ...board, title: e.target.value })} /></label>
      <label>{t('tactics.language')}<select value={board.language} disabled={locked} onChange={e => edit({ ...board, language: e.target.value as TacticsLanguage })}><option value="de">Deutsch</option><option value="en">English</option><option value="fr">Français</option></select></label>
      <div className="formRow"><label>{t('tactics.home')}<input value={board.home} maxLength={40} disabled={locked} onChange={e => edit({ ...board, home: e.target.value })} /></label><label>{t('tactics.away')}<input value={board.away} maxLength={40} disabled={locked} onChange={e => edit({ ...board, away: e.target.value })} /></label></div>
      <label>{t('tactics.player')}<select value={selected} disabled={locked} onChange={e => { setSelected(e.target.value); setMode('player') }}>{board.players.map(p => <option key={p.id} value={p.id}>{(p.team === 'home' ? board.home : board.away) || t(`tactics.${p.team}`)} · {p.number}{p.label ? ' · ' + p.label : ''}</option>)}</select></label>
      <label>{t('tactics.label')}<input value={player.label} maxLength={24} disabled={locked} onChange={e => edit({ ...board, players: board.players.map(p => p.id === selected ? { ...p, label: e.target.value } : p) })} /></label>
      <label>{t('tactics.mode')}<select value={mode} disabled={locked} onChange={e => setMode(e.target.value as typeof mode)}><option value="player">{t('tactics.move')}</option><option value="ball">{t('tactics.ball')}</option><option value="arrow" disabled={!arrow}>{t('tactics.endpoint')}</option></select></label>
      <div className="formRow">{(['x','y'] as const).map(axis => <label key={axis}>{t(`tactics.${axis}`)}<input type="number" min={0} max={100} step={0.1} value={target?.[axis] ?? ''} disabled={locked || !target} onChange={e => target && Number.isFinite(e.target.valueAsNumber) && move({ ...target, [axis]: e.target.valueAsNumber })} /></label>)}</div>
      <div className="directorActions"><button className="secondaryButton" disabled={locked || board.arrows.length >= 12} onClick={() => addArrow('pass')}>{t('tactics.pass')}</button><button className="secondaryButton" disabled={locked || board.arrows.length >= 12} onClick={() => addArrow('run')}>{t('tactics.run')}</button></div>
      <label>{t('tactics.arrow')}<select value={arrow ? arrowId : ''} disabled={locked} onChange={e => { setArrowId(e.target.value); if (e.target.value) setMode('arrow') }}><option value="">{t('tactics.noArrow')}</option>{board.arrows.map((a,i) => <option key={a.id} value={a.id}>{i+1} · {playerTitle(a.from)} · {t(a.kind === 'pass' ? 'tactics.passKind' : 'tactics.runKind')}</option>)}</select></label>
      <button className="secondaryButton" disabled={locked || !arrow} onClick={() => { edit({ ...board, arrows: board.arrows.filter(a => a.id !== arrowId) }); setArrowId(''); setMode('player') }}>{t('tactics.remove')}</button>
    </div></div>
    <div className="directorActions"><button className="secondaryButton" disabled={locked || position === 0} onClick={() => { setPosition(position - 1); setAck(false) }}>{t('tactics.undo')}</button><button className="secondaryButton" disabled={locked || position === edits.length - 1} onClick={() => { setPosition(position + 1); setAck(false) }}>{t('tactics.redo')}</button><button className="secondaryButton" disabled={locked} onClick={() => edit(createFootballTactics(board.language))}>{t('tactics.reset')}</button></div>
    {!available && <p>{t('tactics.unavailable')}</p>}
    <label className="tacticsAck"><input type="checkbox" checked={ack} disabled={locked} onChange={e => setAck(e.target.checked)} />{t('tactics.ack')}</label>
    <button className="primary" disabled={!available || locked || !ack} onClick={() => void save()}>{t(preparing ? 'tactics.preparing' : 'tactics.save')}</button>
    {visibleFeedback && <AssetImportStatus feedback={visibleFeedback} onRetry={() => void session.current?.run()} onDetach={() => { session.current?.detach(); setFeedback(v => v ? { ...v, phase: 'detached' } : null) }} />}
    {error && <div role="alert">{t('tactics.error')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
    {graphics.length > 0 && <div className="stack"><h3>{t('tactics.saved')}</h3><p>{t('tactics.savedHelp')}</p>{graphics.map(asset => <div className="tacticsSaved" key={asset.id}><strong>{String((asset.metadata.board as FootballTacticsBoard | undefined)?.title || t('tactics.untitled'))}</strong><code>{asset.uri}</code><button className="secondaryButton" disabled={locked} onClick={() => { try { edit(parseFootballTactics(asset.metadata.board)) } catch (cause) { setError(String(cause)) } }}>{t('tactics.edit')}</button>{!compatibleTracks(project, asset).length && <button className="secondaryButton" disabled={locked} onClick={() => placeNewTrack(asset.id)}>{t('tactics.newTrack')}</button>}<AssetPlacementControl project={project} asset={asset} onProjectChange={value => { history.snapshot(project, 'Before manual timeline edit', 'system'); onProjectChange(value) }} /></div>)}</div>}
    <FootballSequencePanel key={project.id} project={project} history={history} onProjectChange={onProjectChange} />
  </section>
}
