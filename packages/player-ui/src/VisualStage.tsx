import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

export type PreviewCharacter = {
  id: string;
  url: string | null;
  name: string;
  slot: 'left' | 'center' | 'right';
  layer: number;
  position: { x: number; y: number } | null;
};

export type VisualStageProps = {
  speaker: string;
  text: string;
  backgroundUrl: string | null;
  backgroundName: string | null;
  showDialogue?: boolean;
  characters?: PreviewCharacter[];
  className?: string;
  placeholder?: string;
  children?: ReactNode;
};

function CharacterPortrait({ character }: { character: PreviewCharacter }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [character.url]);

  if (!character.url || failed) {
    return null;
  }

  const style: CSSProperties = character.position
    ? {
        zIndex: 10 + character.layer,
        left: `${character.position.x}%`,
        top: `${character.position.y}%`,
        right: 'auto',
        bottom: 'auto',
        transform: 'translate(-50%, -100%)',
      }
    : { zIndex: 10 + character.layer };

  return (
    <img
      className={`preview-character preview-character-${character.slot}`}
      style={style}
      src={character.url}
      alt={character.name}
      onError={() => setFailed(true)}
    />
  );
}

export function VisualStage({
  speaker,
  text,
  backgroundUrl,
  backgroundName,
  showDialogue = true,
  characters = [],
  className = '',
  placeholder = '预览界面',
  children,
}: VisualStageProps) {
  const [backgroundFailed, setBackgroundFailed] = useState(false);

  useEffect(() => {
    setBackgroundFailed(false);
  }, [backgroundUrl]);

  const showBackground = Boolean(backgroundUrl) && !backgroundFailed;

  return (
    <div className={`preview-stage ${className}`.trim()}>
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
            : placeholder}
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

      {children}
    </div>
  );
}
