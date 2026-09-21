import type { UiLanguage } from './uiLanguage'
import { uiSettingsMessages } from './uiSettingsMessages'
import { uiHistoryMessages } from './uiHistoryMessages'
import { uiBackupMessages } from './uiBackupMessages'
import { uiCaptionMessages } from './uiCaptionMessages'
import { uiScriptCaptionMessages } from './uiScriptCaptionMessages'
import { uiTimelineMessages } from './uiTimelineMessages'
import { uiPreviewMessages } from './uiPreviewMessages'
import { uiStoryboardMessages } from './uiStoryboardMessages'
import { uiNarrationMessages } from './uiNarrationMessages'
import { uiExportMessages } from './uiExportMessages'
import { uiExportHistoryMessages } from './uiExportHistoryMessages'
import { uiCourseExportMessages } from './uiCourseExportMessages'
import { uiShortSelectionMessages } from './uiShortSelectionMessages'
import { uiShortPreviewMessages } from './uiShortPreviewMessages'
import { uiShortArchiveMessages } from './uiShortArchiveMessages'
import { uiShortBatchMessages } from './uiShortBatchMessages'
import { uiPresenterMessages } from './uiPresenterMessages'
import { uiAiEditorMessages } from './uiAiEditorMessages'
import { uiDirectorMessages } from './uiDirectorMessages'
import { uiMediaPlanMessages } from './uiMediaPlanMessages'
import { uiAudioMessages } from './uiAudioMessages'
import { uiImageMessages } from './uiImageMessages'
import { uiVideoMessages } from './uiVideoMessages'
import { uiImportMessages } from './uiImportMessages'
import { uiAvailabilityMessages } from './uiAvailabilityMessages'
import { uiManagedMediaMessages } from './uiManagedMediaMessages'
import { uiSttMessages } from './uiSttMessages'
import { uiMediaCacheMessages } from './uiMediaCacheMessages'
import { uiAssetListMessages } from './uiAssetListMessages'

// Ordered de/en/fr tuples make missing language entries a compile-time error.
export const uiMessages = {
  ...uiSettingsMessages,
  ...uiHistoryMessages,
  ...uiBackupMessages,
  ...uiCaptionMessages,
  ...uiScriptCaptionMessages,
  ...uiTimelineMessages,
  ...uiPreviewMessages,
  ...uiStoryboardMessages,
  ...uiNarrationMessages,
  ...uiExportMessages,
  ...uiExportHistoryMessages,
  ...uiCourseExportMessages,
  ...uiShortSelectionMessages,
  ...uiShortPreviewMessages,
  ...uiShortArchiveMessages,
  ...uiShortBatchMessages,
  ...uiPresenterMessages,
  ...uiAiEditorMessages,
  ...uiDirectorMessages,
  ...uiMediaPlanMessages,
  ...uiAudioMessages,
  ...uiImageMessages,
  ...uiVideoMessages,
  ...uiImportMessages,
  ...uiAvailabilityMessages,
  ...uiManagedMediaMessages,
  ...uiSttMessages,
  ...uiMediaCacheMessages,
  ...uiAssetListMessages,
  'nav.Projects': ['Projekte', 'Projects', 'Projets'],
  'nav.Create': ['Erstellen', 'Create', 'Créer'],
  'nav.Director': ['Regie', 'Director', 'Réalisation'],
  'nav.Studio': ['Studio', 'Studio', 'Studio'],
  'nav.Course': ['Kurs', 'Course', 'Cours'],
  'nav.Assets': ['Medien', 'Assets', 'Médias'],
  'nav.Avatar': ['Avatar', 'Avatar', 'Avatar'],
  'nav.Audio': ['Audio', 'Audio', 'Audio'],
  'nav.Images': ['Bilder', 'Images', 'Images'],
  'nav.Video': ['Video', 'Video', 'Vidéo'],
  'nav.Capture': ['Aufnehmen', 'Capture', 'Capture'],
  'nav.Publish': ['Veröffentlichen', 'Publish', 'Publication'],
  'nav.Analytics': ['Auswertung', 'Analytics', 'Statistiques'],
  'nav.Settings': ['Einstellungen', 'Settings', 'Paramètres'],
  'ui.language': ['App-Sprache', 'App language', 'Langue de l’application'],
  'ui.independent': ['Die App-Sprache ändert keine Skripte, Stimmen oder Kurse.', 'App language does not change scripts, voices or courses.', 'La langue de l’application ne modifie ni les scripts, ni les voix, ni les cours.'],
  'ui.partial': ['Übersetzung im Ausbau: Navigation, Projektstart, Kursformular, Einstellungen, Versionshistorie, Projektsicherung und Fehlerhilfe sind übersetzt. Weitere Fachbereiche und technische Fehlermeldungen erscheinen noch auf Englisch.', 'Translation in progress: navigation, project creation, the course form, Settings, Version History, project backups and error recovery are translated. Other specialist panels and technical error details remain in English.', 'Traduction en cours : la navigation, la création de projets, le formulaire de cours, les paramètres, l’historique des versions, les sauvegardes de projets et la récupération après erreur sont traduits. Les autres modules et détails d’erreurs techniques restent en anglais.'],
  'ui.unsaved': ['Die Sprachwahl gilt für diese Sitzung, konnte aber nicht gespeichert werden.', 'Language changed for this session, but the preference could not be saved.', 'La langue a changé pour cette session, mais ce choix n’a pas pu être enregistré.'],
  'shell.tagline': ['Die KI arbeitet. Du behältst die Kontrolle.', 'AI does the work. You stay in control.', 'L’IA travaille. Vous gardez le contrôle.'],
  'shell.status': ['LOKAL · STUDIO-KERN', 'LOCAL-FIRST · STUDIO CORE', 'LOCAL · CŒUR DU STUDIO'],
  'shell.openProject': ['Erstelle oder öffne zuerst ein Projekt.', 'Create or open a project first.', 'Créez ou ouvrez d’abord un projet.'],
  'shell.reserved': ['Funktion noch nicht verfügbar', 'Engine slot reserved', 'Fonction pas encore disponible'],
  'shell.reservedHelp': ['Dieser Bereich wird erst als nutzbar angeboten, wenn die zugrunde liegende Funktion existiert.', 'This area is intentionally not presented as functional until its underlying engine exists.', 'Cette section ne sera proposée comme fonctionnelle que lorsque son moteur sera disponible.'],
  'projects.library': ['PROJEKTBIBLIOTHEK', 'PROJECT LIBRARY', 'BIBLIOTHÈQUE DE PROJETS'],
  'projects.heading': ['Deine Projekte bleiben gespeichert', 'Your work survives reloads', 'Vos projets restent enregistrés'],
  'projects.new': ['Neues Projekt', 'New project', 'Nouveau projet'],
  'projects.empty': ['Noch keine gespeicherten Projekte.', 'No saved projects yet.', 'Aucun projet enregistré.'],
  'projects.summary': ['{tracks} Spuren · {assets} Medien', '{tracks} tracks · {assets} assets', '{tracks} pistes · {assets} médias'],
  'projects.updated': ['Aktualisiert {date}', 'Updated {date}', 'Modifié le {date}'],
  'create.heading': ['Was möchtest du erstellen?', 'What do you want to make?', 'Que souhaitez-vous créer ?'],
  'create.help': ['Erstelle ein gespeichertes KINAOU-Projekt mit einer nicht-destruktiven Timeline.', 'Create a persistent KINAOU project with a non-destructive timeline foundation.', 'Créez un projet KINAOU enregistré avec une timeline non destructive.'],
  'create.title': ['Projekttitel', 'Project title', 'Titre du projet'],
  'create.titleHint': ['z. B. Dokumentation über Sansibar', 'e.g. Zanzibar documentary', 'Par exemple : documentaire sur Zanzibar'],
  'create.kind': ['Ausgangspunkt', 'Starting point', 'Point de départ'],
  'kind.idea': ['Idee', 'Idea', 'Idée'],
  'kind.document': ['Dokument', 'Document', 'Document'],
  'kind.url': ['URL', 'URL', 'URL'],
  'kind.image': ['Bild', 'Image', 'Image'],
  'kind.audio': ['Audio', 'Audio', 'Audio'],
  'kind.video': ['Video', 'Video', 'Vidéo'],
  'create.brief': ['Quelle / Beschreibung', 'Source / brief', 'Source / description'],
  'create.briefHint': ['Beschreibe dein Vorhaben, füge eine URL ein oder notiere deine Quelle.', 'Describe the work, paste a URL, or note the source you want to use.', 'Décrivez votre projet, collez une URL ou indiquez la source à utiliser.'],
  'create.submit': ['Projekt erstellen und speichern', 'Create persistent project', 'Créer et enregistrer le projet'],
  'course.eyebrow': ['KURSPRODUKTION · GLIEDERUNG', 'COURSE PRODUCTION · OUTLINE', 'PRODUCTION DE COURS · PLAN'],
  'course.heading': ['Baue deinen Kurs Lektion für Lektion auf', 'Build your course, one lesson at a time', 'Construisez votre cours, leçon par leçon'],
  'course.help': ['Gliedere die Timeline dieses Projekts in Module und Lektionen. Speichere die Gliederung und exportiere jede Lektion einzeln im Studio.', "Organize this project's timeline into modules and named lessons. Save your outline, then export each lesson independently in Studio.", 'Organisez la timeline de ce projet en modules et leçons. Enregistrez le plan, puis exportez chaque leçon séparément dans le Studio.'],
  'course.unsaved': ['UNGESPEICHERTER ENTWURF', 'UNSAVED DRAFT', 'BROUILLON NON ENREGISTRÉ'],
  'course.revision': ['GESPEICHERT · REVISION {revision}', 'SAVED · REVISION {revision}', 'ENREGISTRÉ · RÉVISION {revision}'],
  'course.title': ['Kurstitel', 'Course title', 'Titre du cours'],
  'course.language': ['Sprache des Kursinhalts', 'Course language', 'Langue du contenu du cours'],
  'course.languageHelp': ['Diese Sprache beschreibt den Kurs. Vorhandene Skripte und Aufnahmen werden nicht übersetzt.', 'Language describes this course; it does not translate existing scripts or recordings.', 'Cette langue décrit le cours ; elle ne traduit pas les scripts ni les enregistrements existants.'],
  'course.audience': ['Zielgruppe', 'Intended learners', 'Public visé'],
  'course.prerequisites': ['Voraussetzungen', 'Prerequisites', 'Prérequis'],
  'course.outcomes': ['Lernziele', 'Learning outcomes', 'Objectifs d’apprentissage'],
  'course.rangeHelp': ['Start und Ende einer Lektion sind absolute Timeline-Zeiten in Sekunden, keine automatischen Szenenverknüpfungen. Prüfe sie nach Schnittänderungen. Überlappungen sind erlaubt. Leere Module und spätere Zeitbereiche dürfen zur Planung gespeichert werden; ungültige Exportbereiche werden gesperrt.', 'Lesson In/Out values are absolute timeline seconds, not automatic scene links. After timeline edits, review them again. Overlaps are allowed for shared introductions. Empty modules and ranges beyond the current timeline may be saved for planning, but invalid export ranges are blocked.', 'Le début et la fin des leçons sont des temps absolus de la timeline en secondes, sans lien automatique aux scènes. Vérifiez-les après le montage. Les chevauchements sont permis. Les modules vides et les plages futures peuvent être enregistrés pour la planification, mais les exports invalides sont bloqués.'],
  'course.module': ['Modul', 'Module', 'Module'],
  'course.moduleTitle': ['Modultitel', 'Module title', 'Titre du module'],
  'course.lesson': ['Lektion', 'Lesson', 'Leçon'],
  'course.lessonTitle': ['Lektionstitel', 'Lesson title', 'Titre de la leçon'],
  'course.objective': ['Ziel dieser Lektion', 'Lesson objective', 'Objectif de la leçon'],
  'course.in': ['Start (Sekunden)', 'In (seconds)', 'Début (secondes)'],
  'course.out': ['Ende (Sekunden)', 'Out (seconds)', 'Fin (secondes)'],
  'course.removeLesson': ['Lektion aus Entwurf entfernen (Medien behalten)', 'Remove lesson from draft (keep media)', 'Retirer la leçon du brouillon (conserver les médias)'],
  'course.removeModule': ['Modul aus Entwurf entfernen (Medien behalten)', 'Remove module from draft (keep media)', 'Retirer le module du brouillon (conserver les médias)'],
  'course.addLesson': ['Lektion hinzufügen', 'Add lesson', 'Ajouter une leçon'],
  'course.addModule': ['Modul hinzufügen', 'Add module', 'Ajouter un module'],
  'course.save': ['Kursgliederung speichern', 'Save course outline', 'Enregistrer le plan du cours'],
  'course.discard': ['Entwurfsänderungen verwerfen', 'Discard draft edits', 'Abandonner les modifications du brouillon'],
  'course.studio': ['Studio zum Lektionsexport öffnen', 'Open Studio to export lessons', 'Ouvrir le Studio pour exporter les leçons'],
  'course.history': ['Studio / Versionshistorie öffnen', 'Open Studio / Version History', 'Ouvrir le Studio / historique des versions'],
  'course.saveFirst': ['Speichere vor dem Verlassen dieser Ansicht.', 'Save before navigating away.', 'Enregistrez avant de quitter cette vue.'],
  'course.restoreHelp': ['Über die Versionshistorie kannst du eine frühere Gliederung wiederherstellen. Das Entfernen einer Lektion löscht keine Medien oder exportierten Videos.', 'Version History can restore a previous saved outline; removing a lesson never deletes its media or exported videos.', 'L’historique des versions permet de restaurer un ancien plan ; retirer une leçon ne supprime jamais ses médias ni les vidéos exportées.'],
  'course.saved': ['Kursgliederung gespeichert. Wähle im Studio unter Rendern eine Lektion und starte ihren Export ausdrücklich. Durch das Speichern wurden keine Dateien erstellt oder gelöscht.', 'Course outline saved. In Studio → Render, choose one saved lesson and explicitly start its export. No files have been generated or deleted by saving this outline.', 'Plan du cours enregistré. Dans Studio → Rendu, choisissez une leçon puis lancez explicitement son export. L’enregistrement du plan n’a créé ni supprimé aucun fichier.'],
  'course.discarded': ['Entwurfsänderungen verworfen; gespeicherter Kurs und Medien unverändert.', 'Draft changes discarded; saved course and media unchanged.', 'Modifications du brouillon abandonnées ; le cours enregistré et les médias restent inchangés.'],
  'course.invalid': ['Prüfe Titel und Zeitbereiche: Titel dürfen nicht leer sein und das Ende muss nach dem Start liegen. Der Entwurf wurde nicht gespeichert.', 'Check titles and ranges: titles must not be empty and Out must be later than In. The draft was not saved.', 'Vérifiez les titres et les plages : les titres ne doivent pas être vides et la fin doit suivre le début. Le brouillon n’a pas été enregistré.'],
  'course.failed': ['Die Kursgliederung konnte nicht gespeichert werden. Deine Änderungen bleiben im Entwurf.', 'The course outline could not be saved. Your edits remain in the draft.', 'Le plan du cours n’a pas pu être enregistré. Vos modifications restent dans le brouillon.'],
  'course.corrupt': ['Die gespeicherte Gliederung ist ungültig und wurde nicht ersetzt. Stelle eine gültige Version wieder her.', 'The saved outline is invalid and was not replaced. Restore a valid version.', 'Le plan enregistré est invalide et n’a pas été remplacé. Restaurez une version valide.'],
  'course.boundary': ['Dies ist die Grundlage für Kursgliederung und einzelne Videoexporte, kein vollständiger Kursgenerator und keine Plattformfreigabe. Skripte, Demonstrationen, Übungen, Lösungen und Materialien müssen noch vorbereitet und fachlich geprüft werden. Für Udemy bleiben die fachliche Beteiligung des Dozenten und die KI-Offenlegung erforderlich. Hier wird nichts veröffentlicht.', 'This is the outline and individual-video-export foundation, not a complete course generator or platform approval check. Scripts, demonstrations, exercises, solutions and materials still need preparation and expert review. Meaningful instructor involvement and AI-use disclosure remain required for Udemy preparation; nothing is published here.', 'Il s’agit de la base du plan de cours et des exports vidéo individuels, pas d’un générateur de cours complet ni d’une validation par une plateforme. Scripts, démonstrations, exercices, solutions et ressources nécessitent encore préparation et examen expert. Pour Udemy, l’implication réelle du formateur et la déclaration de l’usage de l’IA restent nécessaires. Rien n’est publié ici.'],
  'common.details': ['Technische Details', 'Technical details', 'Détails techniques']
} satisfies Record<string, readonly [string, string, string]>

export type UiMessageKey = keyof typeof uiMessages
export function translateUi(language: UiLanguage, key: UiMessageKey, values: Record<string, string | number> = {}): string {
  const index = { de: 0, en: 1, fr: 2 }[language]
  return uiMessages[key][index].replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`))
}
