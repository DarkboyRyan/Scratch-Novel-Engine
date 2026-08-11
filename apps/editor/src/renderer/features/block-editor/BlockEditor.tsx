import type { ProjectDocument } from '../../../shared/projectTypes';
import { BlocklyWorkspace } from './BlocklyWorkspace';

type BlockEditorProps = {
  project: ProjectDocument;
};

export function BlockEditor({ project }: BlockEditorProps) {
  return (
    <main className="block-editor" aria-labelledby="block-editor-title">
      <header className="block-editor-heading">
        <div>
          <h1 id="block-editor-title">图形化编辑器</h1>
          <p>当前项目：{project.name}</p>
        </div>
        <span>{project.scenes.length} 个场景</span>
      </header>

      <section
        className="block-editor-workspace"
        aria-label="图形化积木工作区"
        >
        <BlocklyWorkspace />
      </section>
    </main>
  );
}
