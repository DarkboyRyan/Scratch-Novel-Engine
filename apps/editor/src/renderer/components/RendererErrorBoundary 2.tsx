import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';

import {
  getEditorLabels,
  normalizeEditorLanguage,
} from '../i18n/editorLocalization';
import type { EditorLanguage } from '../../shared/editorSettingsProtocol';

type RendererErrorBoundaryProps = {
  children: ReactNode;
  language?: EditorLanguage;
};

type RendererErrorBoundaryState = {
  failed: boolean;
};

class RendererErrorBoundaryImpl extends Component<
  RendererErrorBoundaryProps,
  RendererErrorBoundaryState
> {
  state: RendererErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): RendererErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[editor-renderer] uncaught render error', error, {
      componentStack: info.componentStack,
    });
  }

  render(): ReactNode {
    if (this.state.failed) {
      const labels = getEditorLabels(
        normalizeEditorLanguage(
          this.props.language ?? document.documentElement.lang,
        ),
      );
      return (
        <main className="engine-startup" role="alert">
          <strong>{labels.dialogs.rendererFailed}</strong>
          <p>{labels.dialogs.rendererFailedHelp}</p>
          <button type="button" onClick={() => window.location.reload()}>
            {labels.dialogs.reloadRenderer}
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}

export function RendererErrorBoundary({
  children,
  language,
}: RendererErrorBoundaryProps) {
  return (
    <RendererErrorBoundaryImpl language={language}>
      {children}
    </RendererErrorBoundaryImpl>
  );
}
