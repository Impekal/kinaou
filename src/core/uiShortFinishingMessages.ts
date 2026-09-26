export const uiShortFinishingMessages = {
  'shortFinish.eyebrow': [
    'SHORT · FINISHING',
    'SHORT · FINISHING',
    'SHORT · FINITION'
  ],

  'shortFinish.heading': [
    'Reframing Assistant',
    'Reframing Assistant',
    'Assistant de recadrage'
  ],

  'shortFinish.help': [
    'Erzeuge segmentweise Fokusvorschläge für dieses Short-Projekt. Die KI ändert nichts automatisch.',
    'Generate per-segment focus suggestions for this Short project. AI changes nothing automatically.',
    'Générez des suggestions de cadrage par segment pour ce projet Short. L’IA ne modifie rien automatiquement.'
  ],

  'shortFinish.boundary': [
    'Das lokale Sprachmodell sieht keine Videopixel. Vorschläge dürfen sich nur auf deine Anweisung und ausdrücklich beschriebene räumliche Hinweise stützen.',
    'The local language model cannot see video pixels. Suggestions may rely only on your instruction and explicitly written spatial cues.',
    'Le modèle linguistique local ne voit pas les pixels de la vidéo. Les suggestions ne peuvent s’appuyer que sur votre instruction et les indications spatiales explicitement écrites.'
  ],

  'shortFinish.notReady': [
    'Finishing noch nicht bereit',
    'Finishing not ready yet',
    'Finition pas encore prête'
  ],

  'shortFinish.ready': [
    'Bereit für Review',
    'Ready for review',
    'Prêt pour la vérification'
  ],

  'shortFinish.instruction': [
    'Reframing-Anweisung',
    'Reframing instruction',
    'Instruction de recadrage'
  ],

  'shortFinish.instructionHint': [
    'z. B. Szene 1 links fokussieren, Szene 2 rechts. Nur dort ändern, wo die Beschreibung dies ausdrücklich stützt.',
    'e.g. focus scene 1 left and scene 2 right. Change only where the description explicitly supports it.',
    'p. ex. cadrer la scène 1 à gauche et la scène 2 à droite. Modifier uniquement lorsque la description le justifie explicitement.'
  ],

  'shortFinish.model': [
    'Lokales Modell',
    'Local model',
    'Modèle local'
  ],

  'shortFinish.chooseModel': [
    'Modell wählen …',
    'Choose model…',
    'Choisir un modèle…'
  ],

  'shortFinish.detect': [
    'Lokale Modelle erkennen',
    'Detect local models',
    'Détecter les modèles locaux'
  ],

  'shortFinish.generate': [
    'Reframing vorschlagen',
    'Suggest reframing',
    'Proposer un recadrage'
  ],

  'shortFinish.busy': [
    'Wird verarbeitet …',
    'Working…',
    'Traitement…'
  ],

  'shortFinish.models': [
    'Lokale Modelle erkannt.',
    'Local models detected.',
    'Modèles locaux détectés.'
  ],

  'shortFinish.noModels': [
    'Kein lokales Ollama-Modell erkannt.',
    'No local Ollama model detected.',
    'Aucun modèle Ollama local détecté.'
  ],

  'shortFinish.valid': [
    'Vorschlag geprüft. Wähle die Änderungen aus, die du übernehmen möchtest.',
    'Proposal reviewed. Select the changes you want to apply.',
    'Proposition vérifiée. Sélectionnez les modifications que vous souhaitez appliquer.'
  ],

  'shortFinish.applied': [
    '{count} Reframing-Änderung(en) angewendet. Eine Sicherheitsversion wurde vorher gespeichert.',
    'Applied {count} reframing change(s). A safety version was saved first.',
    '{count} modification(s) de recadrage appliquée(s). Une version de sécurité a été enregistrée auparavant.'
  ],

  'shortFinish.stale': [
    'Das Projekt hat sich seit dem Review geändert. Erzeuge oder prüfe den Vorschlag erneut.',
    'The project changed after review. Generate or review the proposal again.',
    'Le projet a changé depuis la vérification. Générez ou vérifiez à nouveau la proposition.'
  ],

  'shortFinish.failed': [
    'Reframing konnte nicht abgeschlossen werden.',
    'Reframing could not be completed.',
    'Le recadrage n’a pas pu être terminé.'
  ],

  'shortFinish.before': [
    'Aktuell',
    'Current',
    'Actuel'
  ],

  'shortFinish.after': [
    'Vorgeschlagen',
    'Proposed',
    'Proposé'
  ],

  'shortFinish.focus': [
    'X {x}% · Y {y}%',
    'X {x}% · Y {y}%',
    'X {x}% · Y {y}%'
  ],

  'shortFinish.include': [
    'Diese Änderung übernehmen',
    'Apply this change',
    'Appliquer cette modification'
  ],

  'shortFinish.apply': [
    '{count} ausgewählte Änderung(en) anwenden',
    'Apply {count} selected change(s)',
    'Appliquer {count} modification(s) sélectionnée(s)'
  ],

  'shortFinish.provenance': [
    'Vorschlag: {adapter} · {model}',
    'Proposal: {adapter} · {model}',
    'Proposition : {adapter} · {model}'
  ],

  'shortFinish.noPixel': [
    'Keine Bildanalyse · nur Textkontext',
    'No visual analysis · text context only',
    'Aucune analyse visuelle · contexte textuel uniquement'
  ],

  'shortFinish.issue': [
    'Hinweis: {message}',
    'Note: {message}',
    'Remarque : {message}'
  ]
} satisfies Record<
  string,
  readonly [
    string,
    string,
    string
  ]
>
