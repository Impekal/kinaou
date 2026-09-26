export const uiPublishMessages = {
  'publish.eyebrow': ['LOKALE VERÖFFENTLICHUNGSÜBERGABE', 'LOCAL PUBLISH HANDOFF', 'REMISE LOCALE POUR PUBLICATION'],
  'publish.heading': ['Fertigen Export vorbereiten', 'Prepare a finished export', 'Préparer un export finalisé'],
  'publish.status.ready': ['GEPRÜFTE ÜBERGABE BEREIT', 'VERIFIED HANDOFF READY', 'REMISE VÉRIFIÉE PRÊTE'],
  'publish.status.restart': ['FFPROBE / NEUSTART NÖTIG', 'FFPROBE / RESTART NEEDED', 'FFPROBE / REDÉMARRAGE REQUIS'],
  'publish.status.offline': ['WORKER OFFLINE', 'WORKER OFFLINE', 'WORKER HORS LIGNE'],

  'publish.card.heading': ['MP4 plus nachvollziehbare Metadaten', 'MP4 plus attributable metadata', 'MP4 avec métadonnées traçables'],
  'publish.card.help': [
    'Wähle einen erfolgreichen KINAOU-Export. Der Worker liest die MP4-Datei mit ffprobe, prüft ihre Medieneigenschaften und berechnet per Streaming einen SHA-256-Fingerabdruck, bevor er eine JSON-Sidecar-Datei daneben in KINAOU/Renders schreibt. Das Video wird niemals hochgeladen, veröffentlicht, verändert oder gelöscht.',
    'Select a successful KINAOU export. The worker reads the MP4 with ffprobe, validates its media facts and streams a SHA-256 fingerprint before it writes a JSON sidecar beside it in KINAOU/Renders. It never uploads, publishes, changes or deletes the video.',
    'Sélectionnez un export KINAOU réussi. Le worker lit le MP4 avec ffprobe, vérifie ses caractéristiques média et calcule en flux une empreinte SHA-256 avant d’écrire un fichier JSON associé à côté dans KINAOU/Renders. Il ne téléverse, ne publie, ne modifie et ne supprime jamais la vidéo.'
  ],

  'publish.export': ['Erfolgreicher Export', 'Successful export', 'Export réussi'],
  'publish.export.empty': ['Keine erfolgreichen Exporte erfasst', 'No successful exports recorded', 'Aucun export réussi enregistré'],
  'publish.destination': ['Plattform', 'Platform', 'Plateforme'],

  'publish.placement': [
    'Veröffentlichungsformat',
    'Publishing placement',
    'Type de publication'
  ],

  'publish.placement.help': [
    'Das konkrete Placement wird für den ausgewählten Export geprüft. Projektstandards speichern derzeit Plattform und Metadaten; das Placement wird pro Export neu geprüft.',
    'The concrete placement is reviewed for the selected export. Project defaults currently store platform and metadata; placement is reviewed again for each export.',
    'Le type de publication concret est vérifié pour l’export sélectionné. Les valeurs par défaut du projet enregistrent actuellement la plateforme et les métadonnées ; le type est revérifié pour chaque export.'
  ],

  'publish.placement.review.eyebrow': [
    'PLATTFORM-READINESS',
    'PLATFORM READINESS',
    'COMPATIBILITÉ PLATEFORME'
  ],

  'publish.placement.review.ready': [
    'Dieses Exportprofil passt zum gewählten Veröffentlichungsformat.',
    'This export profile matches the selected publishing placement.',
    'Ce profil d’export correspond au type de publication sélectionné.'
  ],

  'publish.placement.review.blocked': [
    'Dieses Exportprofil passt noch nicht zum gewählten Veröffentlichungsformat.',
    'This export profile does not yet match the selected publishing placement.',
    'Ce profil d’export ne correspond pas encore au type de publication sélectionné.'
  ],

  'publish.placement.review.preferred': [
    'Bevorzugtes KINAOU-Format: {format}',
    'Preferred KINAOU format: {format}',
    'Format KINAOU recommandé : {format}'
  ],

  'publish.placement.review.metadataInvalid': [
    'Die Veröffentlichungsmetadaten sind noch nicht gültig: {message}',
    'Publish metadata is not valid yet: {message}',
    'Les métadonnées de publication ne sont pas encore valides : {message}'
  ],

  'publish.placement.issue.format': [
    'Das ausgewählte KINAOU-Ausgabeformat wird für dieses Placement nicht unterstützt.',
    'The selected KINAOU output format is not supported for this placement.',
    'Le format de sortie KINAOU sélectionné n’est pas pris en charge pour ce type de publication.'
  ],

  'publish.placement.issue.duration-minimum': [
    'Das Video ist für dieses Placement zu kurz.',
    'The video is too short for this placement.',
    'La vidéo est trop courte pour ce type de publication.'
  ],

  'publish.placement.issue.duration-maximum': [
    'Das Video überschreitet die konfigurierte Dauer dieses Placements.',
    'The video exceeds the configured duration for this placement.',
    'La vidéo dépasse la durée configurée pour ce type de publication.'
  ],

  'publish.placement.issue.title-required': [
    'Für dieses Placement fehlt ein Titel.',
    'This placement requires a title.',
    'Un titre est requis pour ce type de publication.'
  ],

  'publish.placement.issue.title-length': [
    'Der Titel ist für dieses Placement zu lang.',
    'The title is too long for this placement.',
    'Le titre est trop long pour ce type de publication.'
  ],

  'publish.placement.issue.description-length': [
    'Die Beschreibung ist für dieses Placement zu lang.',
    'The description is too long for this placement.',
    'La description est trop longue pour ce type de publication.'
  ],

  'publish.placement.issue.tag-count': [
    'Es sind zu viele Tags für dieses Placement angegeben.',
    'There are too many tags for this placement.',
    'Il y a trop de tags pour ce type de publication.'
  ],

  'publish.placement.issue.tag-length': [
    'Mindestens ein Tag ist für dieses Placement zu lang.',
    'At least one tag is too long for this placement.',
    'Au moins un tag est trop long pour ce type de publication.'
  ],

  'publish.placement.youtube-video': [
    'YouTube Video',
    'YouTube Video',
    'Vidéo YouTube'
  ],

  'publish.placement.youtube-short': [
    'YouTube Short',
    'YouTube Short',
    'YouTube Short'
  ],

  'publish.placement.instagram-reel': [
    'Instagram Reel',
    'Instagram Reel',
    'Reel Instagram'
  ],

  'publish.placement.instagram-feed': [
    'Instagram Feed-Video',
    'Instagram Feed Video',
    'Vidéo du fil Instagram'
  ],

  'publish.placement.tiktok-video': [
    'TikTok Video',
    'TikTok Video',
    'Vidéo TikTok'
  ],

  'publish.placement.generic': [
    'Allgemeine Übergabe',
    'Generic handoff',
    'Remise générique'
  ],
  'publish.title': ['Titel', 'Title', 'Titre'],
  'publish.description': ['Beschreibung', 'Description', 'Description'],
  'publish.tags': ['Tags, durch Komma oder Zeilenumbruch getrennt', 'Tags, comma or line separated', 'Tags, séparés par des virgules ou des retours à la ligne'],
  'publish.tags.placeholder': ['tutorial, lokale KI, schnitt', 'tutorial, local AI, editing', 'tutoriel, IA locale, montage'],

  'publish.defaults.save': ['Als Projektstandard speichern', 'Save as project defaults', 'Enregistrer comme valeurs par défaut du projet'],
  'publish.defaults.use': ['Gespeicherte Standards verwenden', 'Use saved defaults', 'Utiliser les valeurs enregistrées'],
  'publish.defaults.clear': ['Gespeicherte Standards löschen', 'Clear saved defaults', 'Effacer les valeurs enregistrées'],
  'publish.defaults.summary': ['Für dieses Projekt gespeichert · {placement} · aktualisiert {date}', 'Saved for this project · {placement} · updated {date}', 'Enregistré pour ce projet · {placement} · mis à jour {date}'],
  'publish.defaults.loaded': ['Gespeicherte Projektstandards wurden in das Formular geladen.', 'Saved project defaults loaded into the form.', 'Les valeurs enregistrées du projet ont été chargées dans le formulaire.'],
  'publish.defaults.already': ['Diese Werte sind bereits als Projektstandard gespeichert.', 'These values are already the saved project defaults.', 'Ces valeurs sont déjà les valeurs enregistrées du projet.'],
  'publish.defaults.saved': ['Die aktuellen Veröffentlichungsmetadaten wurden mit diesem Projekt gespeichert.', 'Current publish metadata saved with this project.', 'Les métadonnées de publication actuelles ont été enregistrées avec ce projet.'],
  'publish.defaults.cleared': ['Gespeicherte Projektstandards wurden gelöscht. Das aktuelle Formular blieb erhalten.', 'Saved project defaults cleared. The current form was kept.', 'Les valeurs enregistrées du projet ont été effacées. Le formulaire actuel a été conservé.'],

  'publish.preflight.inspecting': ['MP4 wird geprüft…', 'Inspecting MP4…', 'Analyse du MP4…'],
  'publish.preflight.refresh': ['Export-Vorprüfung aktualisieren', 'Refresh export preflight', 'Actualiser la pré-vérification de l’export'],
  'publish.preflight.check': ['Exportdatei prüfen', 'Check export file', 'Vérifier le fichier exporté'],
  'publish.package.writing': ['Erneute Prüfung, Fingerabdruck und Schreiben…', 'Rechecking, fingerprinting and writing…', 'Nouvelle vérification, empreinte et écriture…'],
  'publish.package.create': ['Lokales Veröffentlichungspaket erstellen', 'Create local publish package', 'Créer le paquet local de publication'],
  'publish.connect': ['Verbinde zuerst den lokalen Worker unter Einstellungen.', 'Connect the local worker in Settings first.', 'Connectez d’abord le worker local dans les paramètres.'],
  'publish.capability': [
    'Für die geprüfte Übergabe werden ffprobe und der Worker dieses KINAOU-Builds benötigt. Installiere ffprobe, falls es fehlt, starte den Worker neu und verbinde ihn erneut.',
    'Verified publish handoff needs ffprobe and the worker from this KINAOU build. Install ffprobe if missing, restart the worker and reconnect.',
    'La remise vérifiée nécessite ffprobe et le worker de cette version de KINAOU. Installez ffprobe s’il manque, redémarrez le worker puis reconnectez-le.'
  ],
  'publish.noExports': ['Schließe zuerst einen Render-Export ab; Vorschauen können bewusst nicht veröffentlicht werden.', 'Complete a render export first; previews are intentionally not publishable.', 'Terminez d’abord un export de rendu ; les aperçus ne sont volontairement pas publiables.'],

  'publish.preflight.eyebrow': ['EXPORT-VORPRÜFUNG', 'EXPORT PREFLIGHT', 'PRÉ-VÉRIFICATION DE L’EXPORT'],
  'publish.preflight.match': ['MP4 entspricht ihrem Exportbeleg', 'MP4 matches its export receipt', 'Le MP4 correspond à son reçu d’export'],
  'publish.preflight.mismatch': ['MP4 entspricht ihrem Exportbeleg nicht', 'MP4 does not match its export receipt', 'Le MP4 ne correspond pas à son reçu d’export'],
  'publish.preflight.ready': ['BEREIT ZUR ÜBERGABE', 'READY FOR HANDOFF', 'PRÊT POUR LA REMISE'],
  'publish.preflight.blocked': ['ÜBERGABE GESPERRT', 'HANDOFF BLOCKED', 'REMISE BLOQUÉE'],
  'publish.preflight.summary': ['Erwartet {expectedWidth}×{expectedHeight} · {expectedDuration} s. Gefunden {actualDimensions} · {actualDuration} · {videoCodec} · {audioCodec}.', 'Expected {expectedWidth}×{expectedHeight} · {expectedDuration} s. Found {actualDimensions} · {actualDuration} · {videoCodec} · {audioCodec}.', 'Attendu : {expectedWidth}×{expectedHeight} · {expectedDuration} s. Trouvé : {actualDimensions} · {actualDuration} · {videoCodec} · {audioCodec}.'],
  'publish.preflight.noDimensions': ['keine nutzbaren Videomaße', 'no usable video dimensions', 'aucune dimension vidéo exploitable'],
  'publish.preflight.unknownDuration': ['unbekannte Dauer', 'unknown duration', 'durée inconnue'],
  'publish.preflight.noVideo': ['kein Videostream', 'no video stream', 'aucun flux vidéo'],
  'publish.preflight.audio': ['{codec}-Audio', '{codec} audio', 'audio {codec}'],
  'publish.preflight.noAudio': ['kein Audiostream (zulässig)', 'no audio stream (allowed)', 'aucun flux audio (autorisé)'],
  'publish.preflight.check.size': ['Dateigröße', 'File size', 'Taille du fichier'],
  'publish.preflight.check.video': ['Videostream', 'Video stream', 'Flux vidéo'],
  'publish.preflight.check.dimensions': ['Ausgabemaße', 'Output dimensions', 'Dimensions de sortie'],
  'publish.preflight.check.duration': ['Dauer (±{tolerance} ms)', 'Duration (±{tolerance} ms)', 'Durée (±{tolerance} ms)'],
  'publish.preflight.pass': ['BESTANDEN', 'PASS', 'OK'],
  'publish.preflight.fail': ['NICHT BESTANDEN', 'FAIL', 'ÉCHEC'],
  'publish.preflight.checked': ['Geprüft {date} · {size} MB · der Worker prüft unmittelbar vor dem Schreiben eines Pakets erneut.', 'Checked {date} · {size} MB · the worker checks again immediately before writing a package.', 'Vérifié {date} · {size} Mo · le worker vérifie de nouveau juste avant l’écriture d’un paquet.'],

  'publish.result.eyebrow': ['PAKET ERSTELLT', 'PACKAGE CREATED', 'PAQUET CRÉÉ'],
  'publish.result.heading': ['{platform}-Übergabe ist bereit', '{platform} handoff is ready', 'La remise {platform} est prête'],
  'publish.result.help': ['Die neue Sidecar-Datei hält die Identität des geprüften Exports, seine Medieneigenschaften und einen per Streaming berechneten SHA-256-Fingerabdruck zusammen mit Bereich, Szenen, Format und Metadaten fest.', 'The new sidecar captures the reviewed export identity, media facts and a streaming SHA-256 fingerprint, alongside its range, scenes, format and metadata.', 'Le nouveau fichier associé conserve l’identité de l’export vérifié, ses caractéristiques média et une empreinte SHA-256 calculée en flux, avec sa plage, ses scènes, son format et ses métadonnées.'],
  'publish.result.meta': ['{bytes} Bytes · SHA-256 {sha}… · {date}', '{bytes} bytes · SHA-256 {sha}… · {date}', '{bytes} octets · SHA-256 {sha}… · {date}'],

  'publish.library.eyebrow': ['LOKALE PAKETBIBLIOTHEK', 'LOCAL PACKAGE LIBRARY', 'BIBLIOTHÈQUE LOCALE DES PAQUETS'],
  'publish.library.heading': ['Frühere Übergaben erneut öffnen', 'Reopen earlier handoffs', 'Rouvrir des remises précédentes'],
  'publish.library.checking': ['Laufwerk wird geprüft…', 'Checking drive…', 'Vérification du disque…'],
  'publish.library.refresh': ['Pakete aktualisieren', 'Refresh packages', 'Actualiser les paquets'],
  'publish.library.help': ['Es werden nur validierte *.publish.json-Dateien dieses Projekts aus KINAOU/Renders gelesen. Beim Öffnen werden die geprüften Metadaten wiederhergestellt. Integritätsprüfungen streamen nur die ausgewählte MP4-Datei bei Bedarf; beim Aktualisieren wird niemals die gesamte Bibliothek gehasht.', 'This reads only validated *.publish.json files for this project from KINAOU/Renders. Opening one restores its reviewed metadata. Integrity checks stream only the selected MP4 on demand; refresh never hashes the whole library.', 'Seuls les fichiers *.publish.json validés de ce projet dans KINAOU/Renders sont lus. L’ouverture restaure les métadonnées vérifiées. Les contrôles d’intégrité ne lisent en flux que le MP4 sélectionné à la demande ; l’actualisation ne calcule jamais le hash de toute la bibliothèque.'],
  'publish.library.restart': ['Starte den lokalen Worker dieses KINAOU-Builds neu und verbinde ihn erneut, um die Paketbibliothek zu aktivieren.', 'Restart the local worker from this KINAOU build and reconnect to enable the package library.', 'Redémarrez le worker local de cette version de KINAOU puis reconnectez-le pour activer la bibliothèque de paquets.'],
  'publish.library.initial': ['Aktualisiere, um die aktuelle Paketbibliothek vom verbundenen KINAOU-Laufwerk zu lesen.', 'Refresh to read the current package library from the connected KINAOU drive.', 'Actualisez pour lire la bibliothèque actuelle de paquets depuis le disque KINAOU connecté.'],
  'publish.library.empty': ['Für dieses Projekt wurden keine gültigen Veröffentlichungspakete gefunden.', 'No valid publish packages were found for this project.', 'Aucun paquet de publication valide n’a été trouvé pour ce projet.'],
  'publish.library.openedMatched': ['{path} wurde geöffnet. Der zugehörige Export und seine Metadaten sind oben ausgewählt.', 'Opened {path}. Its recorded export and metadata are selected above.', '{path} a été ouvert. Son export enregistré et ses métadonnées sont sélectionnés ci-dessus.'],
  'publish.library.openedUnmatched': ['Metadaten aus {path} wurden geöffnet. Der ursprüngliche Export befindet sich nicht mehr im aufgezeichneten Verlauf dieses Projekts; deshalb blieb die aktuelle Exportauswahl erhalten.', 'Opened metadata from {path}. Its original export is no longer in this project’s recorded history, so the current export selection was kept.', 'Les métadonnées de {path} ont été ouvertes. L’export d’origine ne figure plus dans l’historique enregistré de ce projet ; la sélection actuelle a donc été conservée.'],

  'publish.integrity.legacy': ['KEIN DIGEST · ALT', 'NO DIGEST · LEGACY', 'AUCUN DIGEST · ANCIEN'],
  'publish.integrity.notVerified': ['NICHT GEPRÜFT', 'NOT VERIFIED', 'NON VÉRIFIÉ'],
  'publish.integrity.unchanged': ['UNVERÄNDERT', 'UNCHANGED', 'INCHANGÉ'],
  'publish.integrity.modified': ['VERÄNDERT', 'MODIFIED', 'MODIFIÉ'],
  'publish.integrity.missing': ['FEHLT', 'MISSING', 'MANQUANT'],
  'publish.integrity.unverifiable': ['NICHT PRÜFBAR', 'UNVERIFIABLE', 'NON VÉRIFIABLE'],
  'publish.source.available': ['MP4 VERFÜGBAR', 'MP4 AVAILABLE', 'MP4 DISPONIBLE'],
  'publish.source.missing': ['MP4 FEHLT', 'MP4 MISSING', 'MP4 MANQUANT'],
  'publish.integrity.checked': ['Integrität geprüft {date}', 'Integrity checked {date}', 'Intégrité vérifiée {date}'],
  'publish.integrity.checkedSha': ['Integrität geprüft {date} · SHA-256 {sha}…', 'Integrity checked {date} · SHA-256 {sha}…', 'Intégrité vérifiée {date} · SHA-256 {sha}…'],
  'publish.integrity.hashing': ['MP4 wird gehasht…', 'Hashing MP4…', 'Calcul du hash du MP4…'],
  'publish.integrity.verify': ['Integrität prüfen', 'Verify integrity', 'Vérifier l’intégrité'],
  'publish.library.openMetadata': ['Metadaten öffnen', 'Open metadata', 'Ouvrir les métadonnées'],

  'publish.youtube.eyebrow': ['YOUTUBE · EXPLIZITE VERÖFFENTLICHUNG', 'YOUTUBE · EXPLICIT PUBLISHING', 'YOUTUBE · PUBLICATION EXPLICITE'],
  'publish.youtube.heading': ['Geprüftes Video privat zu YouTube hochladen', 'Upload a reviewed video privately to YouTube', 'Téléverser une vidéo vérifiée en privé sur YouTube'],
  'publish.youtube.help': ['Dieser Bereich veröffentlicht nur ein bereits geprüftes YouTube-V3-Paket. Verbindung, Integritätsprüfung, Bestätigung und Upload bleiben getrennte manuelle Schritte.', 'This area publishes only an already reviewed YouTube V3 package. Connection, integrity verification, confirmation and upload remain separate manual steps.', 'Cette zone publie uniquement un paquet YouTube V3 déjà vérifié. La connexion, le contrôle d’intégrité, la confirmation et le téléversement restent des étapes manuelles distinctes.'],
  'publish.youtube.private.heading': ['DERZEIT NUR PRIVAT', 'CURRENTLY PRIVATE ONLY', 'ACTUELLEMENT PRIVÉ UNIQUEMENT'],
  'publish.youtube.private.help': ['KINAOU setzt den YouTube-Upload derzeit auf „privat“ und deaktiviert Abonnenten-Benachrichtigungen. Es gibt noch keine automatische Veröffentlichung.', 'KINAOU currently uploads to YouTube as private and disables subscriber notifications. There is still no automatic publishing.', 'KINAOU téléverse actuellement sur YouTube en mode privé et désactive les notifications aux abonnés. Il n’existe toujours aucune publication automatique.'],
  'publish.youtube.connected': ['YOUTUBE VERBUNDEN', 'YOUTUBE CONNECTED', 'YOUTUBE CONNECTÉ'],
  'publish.youtube.notConnected': ['NICHT VERBUNDEN', 'NOT CONNECTED', 'NON CONNECTÉ'],
  'publish.youtube.unknown': ['VERBINDUNG UNGEPRÜFT', 'CONNECTION NOT CHECKED', 'CONNEXION NON VÉRIFIÉE'],
  'publish.youtube.workerOffline': ['Verbinde zuerst den lokalen KINAOU-Worker.', 'Connect the local KINAOU worker first.', 'Connectez d’abord le worker KINAOU local.'],
  'publish.youtube.restart': ['Starte den lokalen Worker aus diesem KINAOU-Build neu, um explizite YouTube-Veröffentlichung zu aktivieren.', 'Restart the local worker from this KINAOU build to enable explicit YouTube publishing.', 'Redémarrez le worker local de cette version de KINAOU pour activer la publication explicite sur YouTube.'],
  'publish.youtube.connection.check': ['YouTube-Verbindung prüfen', 'Check YouTube connection', 'Vérifier la connexion YouTube'],
  'publish.youtube.connection.checking': ['Verbindung wird geprüft…', 'Checking connection…', 'Vérification de la connexion…'],
  'publish.youtube.connection.summary': ['Provider: {provider} · Access Token verfügbar: {access} · Refresh Token verfügbar: {refresh}', 'Provider: {provider} · access token available: {access} · refresh token available: {refresh}', 'Fournisseur : {provider} · jeton d’accès disponible : {access} · jeton d’actualisation disponible : {refresh}'],
  'publish.youtube.yes': ['ja', 'yes', 'oui'],
  'publish.youtube.no': ['nein', 'no', 'non'],
  'publish.youtube.oauth.start': ['YouTube verbinden', 'Connect YouTube', 'Connecter YouTube'],
  'publish.youtube.oauth.starting': ['OAuth-Sitzung wird erstellt…', 'Creating OAuth session…', 'Création de la session OAuth…'],
  'publish.youtube.oauth.awaiting': ['Google-Freigabe erforderlich', 'Google authorization required', 'Autorisation Google requise'],
  'publish.youtube.oauth.openHelp': ['Öffne Google bewusst in einem neuen Tab und kehre danach zu KINAOU zurück.', 'Open Google deliberately in a new tab, then return to KINAOU.', 'Ouvrez volontairement Google dans un nouvel onglet, puis revenez dans KINAOU.'],
  'publish.youtube.oauth.open': ['Google-Freigabe öffnen', 'Open Google authorization', 'Ouvrir l’autorisation Google'],
  'publish.youtube.oauth.check': ['Verbindungsstatus aktualisieren', 'Refresh connection status', 'Actualiser l’état de connexion'],
  'publish.youtube.oauth.checking': ['Status wird geprüft…', 'Checking status…', 'Vérification de l’état…'],
  'publish.youtube.oauth.cancel': ['Verbindungsvorgang abbrechen', 'Cancel connection', 'Annuler la connexion'],
  'publish.youtube.oauth.connectedAt': ['Verbunden {date}', 'Connected {date}', 'Connecté le {date}'],
  'publish.youtube.disconnect': ['YouTube trennen', 'Disconnect YouTube', 'Déconnecter YouTube'],
  'publish.youtube.packages.load': ['YouTube-Pakete laden', 'Load YouTube packages', 'Charger les paquets YouTube'],
  'publish.youtube.packages.loading': ['YouTube-Pakete werden geladen…', 'Loading YouTube packages…', 'Chargement des paquets YouTube…'],
  'publish.youtube.packages.empty': ['Für dieses Projekt wurde kein gültiges YouTube-V3-Paket gefunden.', 'No valid YouTube V3 package was found for this project.', 'Aucun paquet YouTube V3 valide n’a été trouvé pour ce projet.'],
  'publish.youtube.package': ['Geprüftes YouTube-Paket', 'Reviewed YouTube package', 'Paquet YouTube vérifié'],
  'publish.youtube.integrity.check': ['MP4-Integrität prüfen', 'Verify MP4 integrity', 'Vérifier l’intégrité du MP4'],
  'publish.youtube.integrity.checking': ['MP4 wird geprüft…', 'Checking MP4…', 'Vérification du MP4…'],
  'publish.youtube.integrity.ready': ['MP4 ist unverändert. Der Worker prüft SHA-256 unmittelbar vor dem Google-Aufruf erneut.', 'MP4 is unchanged. The worker rechecks SHA-256 immediately before contacting Google.', 'Le MP4 est inchangé. Le worker revérifie le SHA-256 juste avant de contacter Google.'],
  'publish.youtube.integrity.blocked': ['Upload gesperrt: Integritätsstatus {status}.', 'Upload blocked: integrity status {status}.', 'Téléversement bloqué : état d’intégrité {status}.'],
  'publish.youtube.confirm': ['Ich bestätige ausdrücklich, dieses geprüfte Paket jetzt als privates YouTube-Video hochzuladen.', 'I explicitly confirm uploading this reviewed package now as a private YouTube video.', 'Je confirme explicitement le téléversement de ce paquet vérifié maintenant comme vidéo YouTube privée.'],
  'publish.youtube.upload': ['Privat zu YouTube hochladen', 'Upload privately to YouTube', 'Téléverser en privé sur YouTube'],
  'publish.youtube.uploading': ['Upload läuft…', 'Uploading…', 'Téléversement en cours…'],
  'publish.youtube.attempt.confirmed': ['UPLOAD BESTÄTIGT', 'UPLOAD CONFIRMED', 'TÉLÉVERSEMENT CONFIRMÉ'],
  'publish.youtube.attempt.submitting': ['UPLOAD LÄUFT', 'UPLOAD IN PROGRESS', 'TÉLÉVERSEMENT EN COURS'],
  'publish.youtube.attempt.succeeded': ['UPLOAD ERFOLGREICH', 'UPLOAD SUCCEEDED', 'TÉLÉVERSEMENT RÉUSSI'],
  'publish.youtube.attempt.failed': ['UPLOAD FEHLGESCHLAGEN', 'UPLOAD FAILED', 'ÉCHEC DU TÉLÉVERSEMENT'],
  'publish.youtube.attempt.cancelled': ['UPLOAD ABGEBROCHEN', 'UPLOAD CANCELLED', 'TÉLÉVERSEMENT ANNULÉ'],
  'publish.youtube.result.open': ['Video auf YouTube öffnen', 'Open video on YouTube', 'Ouvrir la vidéo sur YouTube'],
  'publish.youtube.error.credentials': ['YouTube-Verbindungsstatus konnte nicht gelesen werden.', 'Could not read YouTube connection status.', 'Impossible de lire l’état de connexion YouTube.'],
  'publish.youtube.error.oauth': ['YouTube-Verbindung konnte nicht abgeschlossen werden.', 'Could not complete the YouTube connection.', 'Impossible de terminer la connexion YouTube.'],
  'publish.youtube.error.disconnect': ['YouTube-Verbindung konnte nicht getrennt werden.', 'Could not disconnect YouTube.', 'Impossible de déconnecter YouTube.'],
  'publish.youtube.error.packages': ['YouTube-Veröffentlichungspakete konnten nicht geladen werden.', 'Could not load YouTube publish packages.', 'Impossible de charger les paquets de publication YouTube.'],
  'publish.youtube.error.integrity': ['MP4-Integrität konnte nicht geprüft werden.', 'Could not verify MP4 integrity.', 'Impossible de vérifier l’intégrité du MP4.'],
  'publish.youtube.error.upload': ['YouTube-Upload ist fehlgeschlagen.', 'YouTube upload failed.', 'Le téléversement YouTube a échoué.'],

  'publish.instagram.eyebrow': ['INSTAGRAM · EXPLIZITE VERÖFFENTLICHUNG', 'INSTAGRAM · EXPLICIT PUBLISHING', 'INSTAGRAM · PUBLICATION EXPLICITE'],
  'publish.instagram.heading': ['Geprüftes Reel auf Instagram veröffentlichen', 'Publish a reviewed Reel to Instagram', 'Publier un Reel vérifié sur Instagram'],
  'publish.instagram.help': ['Verbindung, Callback, Paketwahl, Integritätsprüfung, Bestätigung und Veröffentlichung bleiben getrennte manuelle Schritte.', 'Connection, callback, package selection, integrity verification, confirmation and publishing remain separate manual steps.', 'La connexion, le callback, le choix du paquet, le contrôle d’intégrité, la confirmation et la publication restent des étapes manuelles distinctes.'],
  'publish.instagram.delivery.heading': ['EXTERNE HTTPS-BEREITSTELLUNG ERFORDERLICH', 'EXTERNAL HTTPS DELIVERY REQUIRED', 'MISE À DISPOSITION HTTPS EXTERNE REQUISE'],
  'publish.instagram.delivery.help': ['Meta muss das Reel über eine vorab bereitgestellte HTTPS-URL abrufen können. KINAOU veröffentlicht die lokale MP4 nicht automatisch im Web. Der Worker akzeptiert die URL nur, wenn Pfad, Größe und SHA-256 exakt zum geprüften Export passen.', 'Meta must be able to retrieve the Reel from a pre-staged HTTPS URL. KINAOU does not automatically expose the local MP4 on the web. The worker accepts the URL only when path, size and SHA-256 exactly match the reviewed export.', 'Meta doit pouvoir récupérer le Reel depuis une URL HTTPS préparée à l’avance. KINAOU n’expose pas automatiquement le MP4 local sur le Web. Le worker n’accepte l’URL que si le chemin, la taille et le SHA-256 correspondent exactement à l’export vérifié.'],
  'publish.instagram.connected': ['INSTAGRAM VERBUNDEN', 'INSTAGRAM CONNECTED', 'INSTAGRAM CONNECTÉ'],
  'publish.instagram.notConnected': ['NICHT VERBUNDEN', 'NOT CONNECTED', 'NON CONNECTÉ'],
  'publish.instagram.unknown': ['VERBINDUNG UNGEPRÜFT', 'CONNECTION NOT CHECKED', 'CONNEXION NON VÉRIFIÉE'],
  'publish.instagram.workerOffline': ['Verbinde zuerst den lokalen KINAOU-Worker.', 'Connect the local KINAOU worker first.', 'Connectez d’abord le worker KINAOU local.'],
  'publish.instagram.publishUnavailable': ['Instagram-Veröffentlichung ist noch nicht vollständig konfiguriert. OAuth, Meta-Graph-Konfiguration und die externe HTTPS-Bereitstellung müssen im lokalen Worker verfügbar sein.', 'Instagram publishing is not fully configured yet. OAuth, Meta Graph configuration and external HTTPS delivery must be available in the local worker.', 'La publication Instagram n’est pas encore entièrement configurée. OAuth, la configuration Meta Graph et la mise à disposition HTTPS externe doivent être disponibles dans le worker local.'],
  'publish.instagram.connection.check': ['Instagram-Verbindung prüfen', 'Check Instagram connection', 'Vérifier la connexion Instagram'],
  'publish.instagram.connection.checking': ['Verbindung wird geprüft…', 'Checking connection…', 'Vérification de la connexion…'],
  'publish.instagram.connection.summary': ['Provider: {provider} · Konto: {account}', 'Provider: {provider} · account: {account}', 'Fournisseur : {provider} · compte : {account}'],
  'publish.instagram.account.unknown': ['unbekannt', 'unknown', 'inconnu'],
  'publish.instagram.oauth.start': ['Instagram verbinden', 'Connect Instagram', 'Connecter Instagram'],
  'publish.instagram.oauth.starting': ['OAuth-Sitzung wird erstellt…', 'Creating OAuth session…', 'Création de la session OAuth…'],
  'publish.instagram.oauth.awaiting': ['Instagram-Freigabe erforderlich', 'Instagram authorization required', 'Autorisation Instagram requise'],
  'publish.instagram.oauth.openHelp': ['Öffne Instagram bewusst in einem neuen Tab. Nach der Freigabe führt Instagram zur konfigurierten HTTPS-Callback-Seite.', 'Open Instagram deliberately in a new tab. After authorization, Instagram redirects to the configured HTTPS callback page.', 'Ouvrez volontairement Instagram dans un nouvel onglet. Après autorisation, Instagram redirige vers la page de callback HTTPS configurée.'],
  'publish.instagram.oauth.open': ['Instagram-Freigabe öffnen', 'Open Instagram authorization', 'Ouvrir l’autorisation Instagram'],
  'publish.instagram.oauth.callback': ['HTTPS-Callback-URL', 'HTTPS callback URL', 'URL de callback HTTPS'],
  'publish.instagram.oauth.callbackPlaceholder': ['https://…?code=…&state=…', 'https://…?code=…&state=…', 'https://…?code=…&state=…'],
  'publish.instagram.oauth.callbackHelp': ['Füge nach der Freigabe die vollständige Callback-URL ein. Der einmalige Code wird nur an den lokalen Worker gesendet und nach erfolgreicher Verbindung aus der Oberfläche entfernt.', 'After authorization, paste the complete callback URL. The one-time code is sent only to the local worker and removed from the interface after a successful connection.', 'Après autorisation, collez l’URL de callback complète. Le code à usage unique est envoyé uniquement au worker local puis supprimé de l’interface après connexion réussie.'],
  'publish.instagram.oauth.complete': ['Callback übernehmen', 'Complete callback', 'Valider le callback'],
  'publish.instagram.oauth.completing': ['Verbindung wird abgeschlossen…', 'Completing connection…', 'Finalisation de la connexion…'],
  'publish.instagram.oauth.check': ['OAuth-Status prüfen', 'Check OAuth status', 'Vérifier l’état OAuth'],
  'publish.instagram.oauth.checking': ['OAuth-Status wird geprüft…', 'Checking OAuth status…', 'Vérification de l’état OAuth…'],
  'publish.instagram.oauth.cancel': ['Verbindungsvorgang abbrechen', 'Cancel connection', 'Annuler la connexion'],
  'publish.instagram.oauth.connectedAt': ['Verbunden {date}', 'Connected {date}', 'Connecté le {date}'],
  'publish.instagram.disconnect': ['Instagram trennen', 'Disconnect Instagram', 'Déconnecter Instagram'],
  'publish.instagram.packages.load': ['Instagram-Reel-Pakete laden', 'Load Instagram Reel packages', 'Charger les paquets Instagram Reel'],
  'publish.instagram.packages.loading': ['Instagram-Reel-Pakete werden geladen…', 'Loading Instagram Reel packages…', 'Chargement des paquets Instagram Reel…'],
  'publish.instagram.packages.empty': ['Für dieses Projekt wurde kein gültiges Instagram-Reel-V3-Paket gefunden.', 'No valid Instagram Reel V3 package was found for this project.', 'Aucun paquet Instagram Reel V3 valide n’a été trouvé pour ce projet.'],
  'publish.instagram.package': ['Geprüftes Instagram-Reel-Paket', 'Reviewed Instagram Reel package', 'Paquet Instagram Reel vérifié'],
  'publish.instagram.integrity.check': ['MP4-Integrität prüfen', 'Verify MP4 integrity', 'Vérifier l’intégrité du MP4'],
  'publish.instagram.integrity.checking': ['MP4 wird geprüft…', 'Checking MP4…', 'Vérification du MP4…'],
  'publish.instagram.integrity.ready': ['MP4 ist unverändert. Der Worker prüft SHA-256 unmittelbar vor Credential-, Delivery- und Meta-Zugriff erneut.', 'MP4 is unchanged. The worker rechecks SHA-256 immediately before credential, delivery and Meta access.', 'Le MP4 est inchangé. Le worker revérifie le SHA-256 juste avant l’accès aux identifiants, à la mise à disposition et à Meta.'],
  'publish.instagram.integrity.blocked': ['Veröffentlichung gesperrt: Integritätsstatus {status}.', 'Publishing blocked: integrity status {status}.', 'Publication bloquée : état d’intégrité {status}.'],
  'publish.instagram.confirm': ['Ich bestätige ausdrücklich, dieses geprüfte Reel jetzt auf dem verbundenen Instagram-Konto zu veröffentlichen. Es wird nicht zusätzlich im Hauptfeed geteilt.', 'I explicitly confirm publishing this reviewed Reel now to the connected Instagram account. It will not also be shared to the main feed.', 'Je confirme explicitement la publication immédiate de ce Reel vérifié sur le compte Instagram connecté. Il ne sera pas également partagé dans le fil principal.'],
  'publish.instagram.publish': ['Reel jetzt auf Instagram veröffentlichen', 'Publish Reel to Instagram now', 'Publier le Reel sur Instagram maintenant'],
  'publish.instagram.publishing': ['Reel wird übergeben…', 'Submitting Reel…', 'Envoi du Reel…'],
  'publish.instagram.pending.heading': ['META VERARBEITET DAS REEL', 'META IS PROCESSING THE REEL', 'META TRAITE LE REEL'],
  'publish.instagram.pending.help': ['Es wird nicht automatisch geprüft. „Status erneut prüfen“ prüft genau einmal denselben Meta-Container; es wird kein neues Reel angelegt.', 'There is no automatic checking. “Check status again” checks the same Meta container exactly once; it does not create a new Reel.', 'Aucune vérification automatique n’est effectuée. « Vérifier à nouveau l’état » contrôle exactement une fois le même conteneur Meta ; aucun nouveau Reel n’est créé.'],
  'publish.instagram.pending.created': ['Fortsetzbarer Vorgang erstellt {date}', 'Resumable operation created {date}', 'Opération reprenable créée le {date}'],
  'publish.instagram.pending.check': ['Status erneut prüfen', 'Check status again', 'Vérifier à nouveau l’état'],
  'publish.instagram.pending.checking': ['Status wird einmal geprüft…', 'Checking status once…', 'Vérification unique de l’état…'],
  'publish.instagram.attempt.confirmed': ['VERÖFFENTLICHUNG BESTÄTIGT', 'PUBLISHING CONFIRMED', 'PUBLICATION CONFIRMÉE'],
  'publish.instagram.attempt.submitting': ['VERÖFFENTLICHUNG LÄUFT', 'PUBLISHING IN PROGRESS', 'PUBLICATION EN COURS'],
  'publish.instagram.attempt.succeeded': ['REEL VERÖFFENTLICHT', 'REEL PUBLISHED', 'REEL PUBLIÉ'],
  'publish.instagram.attempt.failed': ['VERÖFFENTLICHUNG FEHLGESCHLAGEN', 'PUBLISHING FAILED', 'ÉCHEC DE LA PUBLICATION'],
  'publish.instagram.attempt.cancelled': ['VERÖFFENTLICHUNG ABGEBROCHEN', 'PUBLISHING CANCELLED', 'PUBLICATION ANNULÉE'],
  'publish.instagram.result.id': ['Instagram Media-ID: {id}', 'Instagram media ID: {id}', 'ID média Instagram : {id}'],
  'publish.instagram.error.credentials': ['Instagram-Verbindungsstatus konnte nicht gelesen werden.', 'Could not read Instagram connection status.', 'Impossible de lire l’état de connexion Instagram.'],
  'publish.instagram.error.oauth': ['Instagram-Verbindung konnte nicht abgeschlossen werden.', 'Could not complete the Instagram connection.', 'Impossible de terminer la connexion Instagram.'],
  'publish.instagram.error.disconnect': ['Instagram-Verbindung konnte nicht getrennt werden.', 'Could not disconnect Instagram.', 'Impossible de déconnecter Instagram.'],
  'publish.instagram.error.packages': ['Instagram-Reel-Pakete konnten nicht geladen werden.', 'Could not load Instagram Reel packages.', 'Impossible de charger les paquets Instagram Reel.'],
  'publish.instagram.error.integrity': ['MP4-Integrität konnte nicht geprüft werden.', 'Could not verify MP4 integrity.', 'Impossible de vérifier l’intégrité du MP4.'],
  'publish.instagram.error.publish': ['Instagram-Reel konnte nicht veröffentlicht werden.', 'Could not publish the Instagram Reel.', 'Impossible de publier le Reel Instagram.'],
  'publish.instagram.error.resume': ['Der bestehende Instagram-Vorgang konnte nicht fortgesetzt werden.', 'Could not continue the existing Instagram operation.', 'Impossible de poursuivre l’opération Instagram existante.'],

  'publish.error.defaults': ['Projektstandards konnten nicht gespeichert werden.', 'Could not save publish defaults.', 'Impossible d’enregistrer les valeurs par défaut de publication.'],
  'publish.error.library': ['Lokale Veröffentlichungspakete konnten nicht geladen werden.', 'Could not load local publish packages.', 'Impossible de charger les paquets locaux de publication.'],
  'publish.error.create': ['Veröffentlichungspaket konnte nicht erstellt werden.', 'Could not create publish package.', 'Impossible de créer le paquet de publication.'],
  'publish.error.preflight': ['Exportmedium konnte nicht geprüft werden.', 'Could not inspect export media.', 'Impossible d’analyser le média exporté.'],
  'publish.error.integrity': ['Integrität des Veröffentlichungspakets konnte nicht geprüft werden.', 'Could not verify publish package integrity.', 'Impossible de vérifier l’intégrité du paquet de publication.'],

  'publish.platform.youtube': ['YouTube', 'YouTube', 'YouTube'],
  'publish.platform.instagram': ['Instagram', 'Instagram', 'Instagram'],
  'publish.platform.tiktok': ['TikTok', 'TikTok', 'TikTok'],
  'publish.platform.generic': ['Allgemeine Übergabe', 'Generic handoff', 'Remise générique'],
  'publish.format.landscape': ['Querformat', 'Landscape', 'Paysage'],
  'publish.format.vertical': ['Hochformat', 'Vertical', 'Vertical'],
  'publish.format.square': ['Quadratisch', 'Square', 'Carré']
} satisfies Record<string, readonly [string, string, string]>
