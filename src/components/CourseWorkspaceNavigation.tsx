import { useUiLanguage } from './UiLanguageProvider'
export const courseWorkspaceStages = ['outline', 'production', 'review', 'delivery'] as const
export type CourseWorkspaceStage = typeof courseWorkspaceStages[number]
/** View state only. Native buttons preserve keyboard access; no persistence or jobs. */
export function CourseWorkspaceNavigation({ stage, onSelect }: { stage: CourseWorkspaceStage; onSelect: (stage: CourseWorkspaceStage) => void }) {
  const { t } = useUiLanguage()
  return <nav className="courseWorkflowNav" aria-label={t('course.workspace.navigation')}>
    {courseWorkspaceStages.map((item, index) => <button key={item} type="button" className={`courseWorkflowStep${stage === item ? ' active' : ''}`} aria-label={t(`course.workspace.${item}.title`)} aria-current={stage === item ? 'step' : undefined} aria-controls="course-workspace-content" onClick={() => onSelect(item)}>
      <span className="courseWorkflowNumber" aria-hidden="true">{index + 1}</span><span><strong>{t(`course.workspace.${item}.title`)}</strong><small>{t(`course.workspace.${item}.short`)}</small></span>
    </button>)}
  </nav>
}
