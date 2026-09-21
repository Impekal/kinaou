export const uiRecoveryMessages = {
  'shell.buildInfoTitle': [
    'Code-Stand, der auf dieser Seite tatsächlich läuft. Nach einem git pull den Entwicklungsserver neu starten und hart neu laden, bis dies mit dem Repository übereinstimmt.',
    'Code state this page is actually running. After a git pull, restart the dev server and hard-reload until this matches the repository.',
    'État du code réellement exécuté sur cette page. Après un git pull, redémarrez le serveur de développement puis rechargez complètement jusqu’à ce que cela corresponde au dépôt.'
  ],
  'shell.build': ['Build {commit}', 'build {commit}', 'build {commit}'],
  'shell.unknown': ['unbekannt', 'unknown', 'inconnu'],
  'shell.servedSince': ['bereitgestellt seit {time}', 'served since {time}', 'servi depuis {time}'],

  'recovery.workerConnection': [
    'Verbindung zum Worker fehlgeschlagen.',
    'Worker connection failed.',
    'Échec de la connexion au worker.'
  ],
  'recovery.placement': [
    'Timeline-Einfügung fehlgeschlagen.',
    'Timeline placement failed.',
    'Échec de l’insertion dans la timeline.'
  ],
  'recovery.fulfillment': [
    'Szenenzuweisung fehlgeschlagen.',
    'Scene fulfillment failed.',
    'Échec de l’affectation à la scène.'
  ],
  'recovery.mediaPlanInvalid': [
    'Ungültiger Medienplan.',
    'Invalid media plan.',
    'Plan média invalide.'
  ],

  'recovery.rangeNumbers': [
    'Start und Ende müssen Zahlen sein.',
    'In and Out must be numbers.',
    'Le début et la fin doivent être des nombres.'
  ],
  'recovery.duckingSettings': [
    'Ungültige Einstellungen für die Musikabsenkung.',
    'Invalid music ducking settings.',
    'Réglages de réduction musicale invalides.'
  ],
  'recovery.shortMaximumNumber': [
    'Die maximale Kurzvideo-Länge muss eine Zahl sein.',
    'Short export maximum must be a number.',
    'La durée maximale de la vidéo courte doit être un nombre.'
  ],

  'recovery.shortUnconfirmed': [
    'Für eine Kurzvideo-Einreichung fehlt die gespeicherte Worker-Bestätigung. Prüfe den ursprünglichen Worker und die Ausgabe, bevor du diesen Stapel bewusst verwirfst. Es wird nichts automatisch erneut exportiert.',
    'A Short submission has no saved worker acknowledgement. Inspect the original worker and output before deliberately discarding this batch. No export will be submitted automatically.',
    'Une soumission de vidéo courte n’a pas de confirmation enregistrée du worker. Vérifiez le worker d’origine et la sortie avant de retirer volontairement ce lot. Aucun export ne sera renvoyé automatiquement.'
  ],
  'recovery.shortMalformed': [
    'Der gespeicherte Kurzvideo-Stapel ist ungültig und wurde ignoriert. Verwirf ihn, bevor du einen neuen Stapel vorbereitest.',
    'The saved Short batch is malformed and was ignored. Discard it before preparing a new batch.',
    'Le lot de vidéos courtes enregistré est invalide et a été ignoré. Retirez-le avant de préparer un nouveau lot.'
  ],
  'recovery.shortResume': [
    'Der gespeicherte Kurzvideo-Stapel konnte nicht sicher fortgesetzt werden.',
    'Could not safely resume the saved Short batch.',
    'Impossible de reprendre le lot de vidéos courtes en toute sécurité.'
  ],
  'recovery.shortPersist': [
    'Der Kurzvideo-Stapel konnte nicht mit diesem Projekt gespeichert werden.',
    'Could not save the Short batch with this project.',
    'Impossible d’enregistrer le lot de vidéos courtes avec ce projet.'
  ],
  'recovery.shortReceipt': [
    'Die Kurzvideo-Exportbelege konnten nicht gespeichert werden.',
    'Could not save Short export receipts.',
    'Impossible d’enregistrer les reçus d’export des vidéos courtes.'
  ],
  'recovery.shortArchiveReview': [
    'Die archivierte Kurzvideo-Auswahl konnte nicht zur Prüfung wiederhergestellt werden.',
    'Could not restore the archived Short selection for review.',
    'Impossible de restaurer la sélection archivée des vidéos courtes pour vérification.'
  ],
  'recovery.shortMaximumSave': [
    'Die maximale Kurzvideo-Länge konnte nicht gespeichert werden.',
    'Could not save the Short maximum.',
    'Impossible d’enregistrer la durée maximale des vidéos courtes.'
  ],
  'recovery.shortRecipeSave': [
    'Die Kurzvideo-Vorlage konnte nicht gespeichert werden.',
    'Could not save the Short recipe.',
    'Impossible d’enregistrer le préréglage de vidéo courte.'
  ],
  'recovery.shortRecipeForget': [
    'Die Kurzvideo-Vorlage konnte nicht entfernt werden.',
    'Could not forget the Short recipe.',
    'Impossible de retirer le préréglage de vidéo courte.'
  ],
  'recovery.shortPrepare': [
    'Die Kurzvideo-Exporte konnten nicht vorbereitet werden.',
    'Could not prepare Short exports.',
    'Impossible de préparer les exports de vidéos courtes.'
  ],
  'recovery.shortRetry': [
    'Die ausgewählten Kurzvideo-Varianten konnten nicht erneut vorbereitet werden.',
    'Could not retry the selected Short variants.',
    'Impossible de préparer à nouveau les variantes de vidéos courtes sélectionnées.'
  ],
  'recovery.shortCancelSave': [
    'Die Abbruchanforderung konnte nicht gespeichert werden.',
    'Could not save the cancellation request.',
    'Impossible d’enregistrer la demande d’annulation.'
  ],
  'recovery.shortCancelOriginalWorker': [
    'Verbinde den ursprünglichen lokalen Worker, bevor du versuchst, den angenommenen Kurzvideo-Auftrag abzubrechen.',
    'Connect the original local worker before cancelling the accepted Short job.',
    'Reconnectez le worker local d’origine avant d’annuler la tâche de vidéo courte déjà acceptée.'
  ],
  'recovery.shortBatchChange': [
    'Die Änderung am Kurzvideo-Stapel konnte nicht gespeichert werden.',
    'Could not save the Short batch change.',
    'Impossible d’enregistrer la modification du lot de vidéos courtes.'
  ]
} satisfies Record<string, readonly [string, string, string]>
