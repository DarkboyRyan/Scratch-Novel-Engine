import { useEffect, useState } from 'react';

type PreviewPanelProps = {
  speaker: string;
  text: string;
  backgroundUrl: string | null;
  backgroundName: string | null;
};

export function PreviewPanel({
  speaker,
  text,
  backgroundUrl,
  backgroundName,
}: PreviewPanelProps) {
  const [backgroundFailed, setBackgroundFailed] = useState(false);

  useEffect(() => {
    setBackgroundFailed(false);
  }, [backgroundUrl]);

  const showBackground = Boolean(backgroundUrl) && !backgroundFailed;

  return (
    <main className="preview-panel">
      <div className="preview-stage">
        {showBackground && backgroundUrl ? (
          <img
            className="preview-background"
            src={backgroundUrl}
            alt=""
            onError={() => setBackgroundFailed(true)}
          />
        ) : (
          <p className="preview-placeholder">
            {backgroundUrl && backgroundFailed
              ? `无法读取背景：${backgroundName ?? '未知图片'}`
              : '预览界面'}
          </p>
        )}

        <div className="dialogue-box">
          <strong>{speaker}</strong>
          <p>{text}</p>
        </div>
      </div>
    </main>
  );
}
