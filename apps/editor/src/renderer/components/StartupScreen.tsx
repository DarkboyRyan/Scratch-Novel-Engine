import type { EditorLanguage } from '../../shared/editorSettingsProtocol';
import { getEditorLabels, normalizeEditorLanguage } from '../i18n/editorLocalization';

type StartupPhase = 'settings' | 'project' | 'session';
const progressByPhase: Record<StartupPhase, number> = {
  settings: 25,
  project: 50,
  session: 85,
};

export function StartupScreen({
  phase,
  language = normalizeEditorLanguage(document.documentElement.lang),
  error,
  onRetry = () => window.location.reload(),
}: {
  phase: StartupPhase;
  language?: EditorLanguage;
  error?: string;
  onRetry?: () => void;
}) {
  const labels = getEditorLabels(language);
  const progress = progressByPhase[phase];
  const failed = Boolean(error);
  const stage = labels.startup[phase];

  return (
    <main className="engine-startup editor-startup" data-failed={failed}>
      <section className="editor-startup-content">
        <div className="editor-startup-mark" aria-hidden="true">S<span>N</span></div>
        <h1>Scratch Novel Engine</h1>
        <p className="editor-startup-title">{failed ? labels.startup.failed : labels.app.starting}</p>
        <div className="editor-startup-status">
          <span role="status">{failed ? labels.startup.interrupted : stage}</span>
          <span className="editor-startup-percent" aria-hidden="true">{progress}%</span>
        </div>
        <div
          className="editor-startup-progress"
          role="progressbar"
          aria-busy={!failed}
          aria-label={labels.startup.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-valuetext={failed ? labels.startup.interrupted : stage}
        >
          <div className="editor-startup-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        {failed ? (
          <>
            <p className="editor-startup-error" role="alert">{error}</p>
            <button type="button" onClick={onRetry}>{labels.app.reconnect}</button>
          </>
        ) : (
          <p className="editor-startup-hint">{labels.startup.hint}</p>
        )}
      </section>
    </main>
  );
}
