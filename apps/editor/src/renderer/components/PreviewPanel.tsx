type PreviewPanelProps = {
  speaker: string;
  text: string;
};

export function PreviewPanel({ speaker, text }: PreviewPanelProps) {
  return (
    <main className="preview-panel">
      <div className="preview-stage">
        <p className="preview-placeholder">预览界面</p>

        <div className="dialogue-box">
          <strong>{speaker}</strong>
          <p>{text}</p>
        </div>
      </div>
    </main>
  );
}
