// Existing Chinese interaction fixtures select their language explicitly.
import { createRoot, type Root } from 'react-dom/client';
import { EditorI18nProvider } from '../../src/renderer/i18n/editorLocalization';

export function createChineseTestRoot(...args: Parameters<typeof createRoot>): Root {
  const root = createRoot(...args);
  return {
    render(children) {
      root.render(<EditorI18nProvider language="zh-CN">{children}</EditorI18nProvider>);
    },
    unmount() { root.unmount(); },
  };
}
