export const uiShortArchiveMessages = {
  'shortArchive.heading': ['FRÜHERE KURZVIDEO-STAPEL', 'PAST SHORT BATCHES', 'LOTS DE VIDÉOS COURTES PRÉCÉDENTS'],
  'shortArchive.count': ['{count}/{limit} im Projekt gespeichert', '{count}/{limit} saved with project', '{count}/{limit} enregistrés dans le projet'],
  'shortArchive.help': ['Das Projekt behält kompakte Zusammenfassungen der letzten abgeschlossenen Stapel. Prüfe einen Stapel bei Bedarf erneut gegen den verbundenen Speicher. Das Entfernen einer Zusammenfassung löscht keine Videodatei. Die gespeicherten Namen bleiben unverändert.', 'The project retains compact summaries of recent completed batches. Recheck one batch against the connected storage when needed. Forgetting a summary deletes no video file. Saved names remain unchanged.', 'Le projet conserve des résumés des derniers lots terminés. Revérifiez un lot dans le stockage connecté si nécessaire. Retirer un résumé ne supprime aucune vidéo. Les noms enregistrés restent inchangés.'],
  'shortArchive.summary': ['Versuche: {count} · erfolgreich: {succeeded} · fehlgeschlagen: {failed} · abgebrochen: {cancelled}', 'Attempts: {count} · succeeded: {succeeded} · failed: {failed} · cancelled: {cancelled}', 'Tentatives : {count} · réussies : {succeeded} · échouées : {failed} · annulées : {cancelled}'],
  'shortArchive.dates': ['Vorbereitet: {created} · archiviert: {archived}', 'Prepared: {created} · archived: {archived}', 'Préparé : {created} · archivé : {archived}'],
  'shortArchive.attempt': ['Versuch {count}', 'Attempt {count}', 'Tentative {count}'],
  'shortArchive.succeeded': ['ERFOLGREICH', 'SUCCEEDED', 'RÉUSSI'],
  'shortArchive.failed': ['FEHLGESCHLAGEN', 'FAILED', 'ÉCHOUÉ'],
  'shortArchive.cancelled': ['ABGEBROCHEN', 'CANCELLED', 'ANNULÉ'],
  'shortArchive.review': ['Aktuelle Auswahl prüfen', 'Review current selections', 'Vérifier la sélection actuelle'],
  'shortArchive.check': ['Vermerkte Dateien prüfen', 'Check recorded files', 'Vérifier les fichiers indiqués'],
  'shortArchive.checking': ['Vermerkte Dateien werden geprüft …', 'Checking recorded files…', 'Vérification des fichiers indiqués…'],
  'shortArchive.forget': ['Zusammenfassung entfernen (alle Dateien behalten)', 'Forget summary (keep every file)', 'Retirer le résumé (garder tous les fichiers)'],
  'shortArchive.forgetFailed': ['Zusammenfassung konnte nicht entfernt werden. Die Videodateien bleiben unverändert.', 'Could not forget the summary. Video files remain unchanged.', 'Impossible de retirer le résumé. Les vidéos restent inchangées.']
} satisfies Record<string, readonly [string, string, string]>
