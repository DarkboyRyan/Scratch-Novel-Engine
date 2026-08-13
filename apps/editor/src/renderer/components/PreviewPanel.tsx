import { useEffect, useState } from 'react';

type PreviewPanelProps = {
  speaker: string;
  text: string;
  backgroundUrl: string | null;
  backgroundName: string | null;
  showDialogue?: boolean;
  characters?: PreviewCharacter[];
};

export type PreviewCharacter = {
  id: string;
  url: string | null;
  name: string;
  slot: 'left' | 'center' | 'right';
  layer: number;
};

function CharacterPortrait({ character }: { character: PreviewCharacter }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [character.url]);

  if (!character.url || failed) {
    return null;
  }

  return (
    <img
      className={`preview-character preview-character-${character.slot}`}
      style={{ zIndex: 10 + character.layer }}
      src={character.url}
      alt={character.name}
      onError={() => setFailed(true)}
    />
  );
}

export function PreviewPanel({
  speaker,
  text,
  backgroundUrl,
  backgroundName,
  showDialogue = true,
  characters = [],
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

        <div className="preview-character-layer" aria-hidden="true">
          {characters.map((character) => (
            <CharacterPortrait key={character.id} character={character} />
          ))}
        </div>

        {showDialogue ? (
          <div className="dialogue-box">
            <strong>{speaker}</strong>
            <p>{text}</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
