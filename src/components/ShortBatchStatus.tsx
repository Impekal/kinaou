import type { Dispatch, SetStateAction } from 'react'
import type { PersistedShortBatchItem } from '../core/shortExportBatch'
import { shortBatchTerminalStates } from '../core/shortExportBatch'
import type { ShortBatchNotice } from '../core/shortBatchCommit'
import { useUiLanguage } from './UiLanguageProvider'

export function ShortBatchReceiptRecovery({ detail, onRetry }: { detail: string; onRetry: () => void }) {
  const { t } = useUiLanguage()
  return <div className="errorBox" role="alert">
    <p>{t('shortBatch.receiptFailed')}</p>
    <details><summary>{t('common.details')}</summary>{detail}</details>
    <button onClick={onRetry}>{t('shortBatch.retryReceipt')}</button>
  </div>
}

export interface ShortBatchStatusProps {
  items: PersistedShortBatchItem[]; notice: ShortBatchNotice | null; resumeError: string
  retryableIds: Set<string>; retrySelectedIds: string[]; setRetrySelectedIds: Dispatch<SetStateAction<string[]>>
  retryDisabled: boolean; busy: boolean; retryReframingBlocked: boolean
  canCancel: boolean; canDiscard: boolean; archiveOnDiscard: boolean; cancelling?: boolean; cancelRequested?: boolean
  onRetry: () => void; onCancel: () => void; onDiscard: () => void
}
export function ShortBatchStatus(props: ShortBatchStatusProps) {
  const { language, t } = useUiLanguage()
  const retryable = props.items.filter(item => props.retryableIds.has(item.id))
  const error = props.resumeError && <div className="errorBox" role="alert">{t('shortBatch.blocked')}<details><summary>{t('common.details')}</summary>{props.resumeError}</details></div>
  if (!props.items.length) return props.resumeError ? <div className="renderJob">{error}<button onClick={props.onDiscard}>{t('shortBatch.discardMalformed')}</button></div> : null
  return <div className="renderJob">
    <div className="renderJobHead"><strong>{t('shortBatch.heading')}</strong><span>{t('shortBatch.finished', { done: props.items.filter(item => shortBatchTerminalStates.has(item.state)).length, count: props.items.length })}</span></div>
    <p className="cardBody">{t('shortBatch.help')}</p>
    {props.cancelRequested && <p className="note" role="status">{t('shortBatch.cancelSaved')}</p>}
    {props.notice && <div className="note" role="status">{t(`shortBatch.${props.notice.kind}`, props.notice.kind === 'restored' ? { date: new Date(props.notice.date).toLocaleString(language) } : props.notice.kind === 'retrySaved' ? { count: props.notice.count } : {})}</div>}
    {error}
    {props.items.map(item => <div className="renderJob" key={item.id}>
      <div className="renderJobHead"><strong>{item.title}</strong><span>{t(`export.${item.format}`)} · {t('shortArchive.attempt', { count: item.attempt ?? 1 })} · {t(`shortBatch.${item.state}`)} · {Math.round(item.progress * 100).toLocaleString(language)}%</span></div>
      <div className="progressTrack" aria-label={t('shortBatch.progress', { title: item.title, percent: Math.round(item.progress * 100) })}><div className="progressFill" style={{ width: `${Math.round(item.progress * 100)}%` }} /></div>
      <div className="renderMeta"><code>{item.renderedPath ?? item.outputPath}</code>
        {item.sizeBytes !== undefined && <span>{(item.sizeBytes / 1024 / 1024).toLocaleString(language, { maximumFractionDigits: 1 })} MB</span>}
        {props.retryableIds.has(item.id) && <label className="checkRow"><input type="checkbox" checked={props.retrySelectedIds.includes(item.id)} disabled={props.busy} onChange={event => props.setRetrySelectedIds(ids => event.target.checked ? [...ids, item.id] : ids.filter(id => id !== item.id))} />{t('shortBatch.retryItem')}</label>}
      </div>
      {item.error && <div className="errorBox" role="alert">{t('shortBatch.itemError')}<details><summary>{t('common.details')}</summary>{item.error}</details></div>}
    </div>)}
    {retryable.length > 0 && <>
      <p className="cardBody">{t('shortBatch.retryHelp')}</p>
      <div className="renderActions">
        <button disabled={props.busy} onClick={() => props.setRetrySelectedIds(props.retrySelectedIds.length === retryable.length ? [] : retryable.map(item => item.id))}>{t(props.retrySelectedIds.length === retryable.length ? 'shortBatch.retryClear' : 'shortBatch.retryAll')}</button>
        <button className="primary" disabled={props.retryDisabled} onClick={props.onRetry}>{t('shortBatch.retry', { count: props.retrySelectedIds.length })}</button>
      </div>
      {props.retryReframingBlocked && <div className="warning">{t('preview.restart')}</div>}
    </>}
    <div className="renderActions">
      {props.canCancel && <button className="dangerButton" disabled={props.cancelling} onClick={props.onCancel}>{t(props.cancelling ? 'shortBatch.cancelling' : 'shortBatch.cancel')}</button>}
      {props.canDiscard && <button className="secondaryButton" onClick={props.onDiscard}>{t(props.archiveOnDiscard ? 'shortBatch.archive' : 'shortBatch.discard')}</button>}
    </div>
  </div>
}
