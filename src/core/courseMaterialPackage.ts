import { projectCourse } from './course'
import { formatCourseExercises } from './courseExercises'
import { courseInstructorReviewState, courseInstructorSignature, projectCourseInstructorReviews } from './courseInstructorReview'
import { courseOutputIndexLimits, projectCourseOutputIndex, projectExportHistory } from './exportHistory'
import { parseProject, type KinaouProject } from './project'
import { createTextZip, type TextZipEntry } from './textZip'

export type CoursePackageAudience = 'learner' | 'instructor'
const notices = {
  de: {
    title: 'KINAOU – Kursmaterialien', draft: 'ENTWURF – vor Weitergabe fachlich prüfen.',
    learner: 'Lernendenpaket: ausgewählte Lernmaterialien und Arbeitsblätter. Keine Lösungsfelder, internen Materialien, Skripte oder Prüfnotizen. Prüfe selbst, ob Aufgaben/Hinweise oder Materialtexte Antworten enthalten.',
    instructor: 'PRIVATES DOZENTENPAKET: enthält auch Lösungen, interne Materialien, Quellen-/Prüfnotizen und Skripte. Nicht unverändert an Lernende weitergeben.',
    limits: 'Nur gespeicherte Texte. Keine Videos, Audios, Bilder oder externen Dateien enthalten; keine URLs abgerufen. Exportverweise sind weder Dateikopien noch Verfügbarkeits- oder Integritätsnachweise. Kein vollständiges Projektbackup, keine Plattformfreigabe. ZIP ist nicht verschlüsselt.'
  },
  en: {
    title: 'KINAOU – Course materials', draft: 'DRAFT – expert review required before sharing.',
    learner: 'Learner package: selected learner materials and worksheets. No answer fields, internal materials, scripts or review notes. Check tasks/hints and authored materials for answer disclosure yourself.',
    instructor: 'PRIVATE INSTRUCTOR PACKAGE: also includes answers, internal materials, source/review notes and scripts. Do not share unchanged with learners.',
    limits: 'Saved text only. No video, audio, images or external files included; no URLs fetched. Export references are not file copies or availability/integrity checks. Not a full project backup or platform approval. ZIP is not encrypted.'
  },
  fr: {
    title: 'KINAOU – Ressources du cours', draft: 'BROUILLON – vérification experte nécessaire avant diffusion.',
    learner: 'Dossier apprenant : ressources destinées aux apprenants et fiches d’exercices. Aucun champ de réponse, document interne, script ou note de vérification. Vérifiez vous-même si les énoncés/indices ou ressources révèlent des réponses.',
    instructor: 'DOSSIER FORMATEUR PRIVÉ : contient aussi réponses, ressources internes, notes de sources/vérification et scripts. Ne pas diffuser tel quel aux apprenants.',
    limits: 'Textes enregistrés uniquement. Aucune vidéo, piste audio, image ou fichier externe inclus ; aucune URL consultée. Les références d’export ne sont ni copies de fichiers ni contrôles de présence/intégrité. Ni sauvegarde complète du projet ni approbation de plateforme. ZIP non chiffré.'
  }
} as const

export async function createCourseMaterialPackage(value: KinaouProject, audience: CoursePackageAudience) {
  if (audience !== 'learner' && audience !== 'instructor') throw new Error('Unknown course package audience')
  const project = parseProject(structuredClone(value)), course = projectCourse(project)
  if (!course) throw new Error('No saved course')
  const text = notices[course.language]
  const entries: TextZipEntry[] = []
  const modules = course.modules.map(module => ({
    id: module.id, title: module.title, lessons: module.lessons.map(lesson => {
      const paths: string[] = []
      const prefix = `lessons/lesson-${lesson.id}/`
      function add(path: string, body: string) { const full = prefix + path; paths.push(full); entries.push({ path: full, text: body }) }
      for (const material of lesson.materials ?? []) {
        if (audience === 'learner' && material.audience !== 'learner') continue
        if (!material.body.trim()) throw new Error(`Empty material: ${module.title} / ${lesson.title} / ${material.title}`)
        add(`material-${material.id}.txt`, [text.draft, material.title, material.body].join('\n\n') + '\n')
      }
      if (lesson.exercises?.length) {
        add('worksheet.txt', formatCourseExercises(course, lesson.id, 'worksheet').text)
        if (audience === 'instructor') add('answer-key.txt', formatCourseExercises(course, lesson.id, 'answer-key').text)
      }
      if (audience === 'instructor' && lesson.script?.trim()) add('script.txt', lesson.script)
      return { id: lesson.id, title: lesson.title, files: paths }
    })
  }))
  if (!entries.length) throw new Error('No saved text materials available for this audience')
  if (audience === 'instructor') {
    const signature = await courseInstructorSignature(project)
    const reviews = projectCourseInstructorReviews(project).filter(record => record.courseId === course.id).map(record => ({
      ...record, stateAtPackaging: courseInstructorReviewState(project, record.lessonId, signature), selfReportedOnly: true, mediaBytesChecked: false
    }))
    entries.push({ path: 'private/course-outline.json', text: JSON.stringify(course, null, 2) })
    entries.push({ path: 'private/review-records.json', text: JSON.stringify(reviews, null, 2) })
    entries.push({ path: 'private/video-references.json', text: JSON.stringify({
      mediaIncluded: false, filePresenceChecked: false, fullArchive: false, retainedReceiptLimit: 50,
      receipts: projectExportHistory(project).filter(receipt => receipt.courseLesson?.courseId === course.id)
    }, null, 2) })
    entries.push({ path: 'private/retained-lesson-outputs.json', text: JSON.stringify({
      mediaIncluded: false, filePresenceChecked: false, integrityChecked: false, fullArchive: false,
      referenceLimit: courseOutputIndexLimits.entries,
      references: projectCourseOutputIndex(project).filter(receipt => receipt.courseLesson?.courseId === course.id)
    }, null, 2) })
  }
  const manifest = {
    schemaVersion: 1, kind: 'course-text-materials', audience, draft: true, mediaIncluded: false,
    urlsFetched: false, fullProjectBackup: false, platformApproval: false,
    course: { id: course.id, title: course.title, language: course.language, revision: course.revision }, modules
  }
  entries.unshift({ path: 'manifest.json', text: JSON.stringify(manifest, null, 2) },
    { path: 'README.txt', text: [text.title, text.draft, text[audience], text.limits].join('\n\n') + '\n' })
  return { filename: `course-${course.id}-${audience}-r${course.revision}.zip`, mimeType: 'application/zip', bytes: createTextZip(entries), entryCount: entries.length }
}
