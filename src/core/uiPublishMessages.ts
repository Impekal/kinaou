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
  'publish.defaults.summary': ['Für dieses Projekt gespeichert · {platform} · aktualisiert {date}', 'Saved for this project · {platform} · updated {date}', 'Enregistré pour ce projet · {platform} · mis à jour {date}'],
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
