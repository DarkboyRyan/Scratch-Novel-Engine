/**
 * 主要作用：渲染背景、人物立绘、对白和人物动画特效。
 * 关键函数与实现：`DEFAULT_CHARACTER_SLOT_POSITIONS`、`PreviewCharacter`、`VisualStageProps`、`VisualStage`；基于统一锚点、React Hooks 与受控状态实现。
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { CharacterEffect } from '@vnengine/runtime';

import type { PlayerUiLocalizationProps } from './localization';
import { usePlayerUiLabels } from './PlayerUiProvider';

export type PreviewCharacter = {
  id: string;
  url: string | null;
  name: string;
  slot: 'left' | 'center' | 'right';
  layer: number;
  position: { x: number; y: number } | null;
  opacity: 0 | 1;
  effect: CharacterEffect | null;
  effectSequence: number;
};

export const DEFAULT_CHARACTER_SLOT_POSITIONS = {
  left: { x: 20, y: 100 },
  center: { x: 50, y: 100 },
  right: { x: 80, y: 100 },
} as const satisfies Readonly<
  Record<PreviewCharacter['slot'], Readonly<{ x: number; y: number }>>
>;

export type VisualStageProps = PlayerUiLocalizationProps & {
  speaker: string;
  text: string;
  backgroundUrl: string | null;
  backgroundName: string | null;
  showDialogue?: boolean;
  characters?: PreviewCharacter[];
  animateCharacters?: boolean;
  animationsPaused?: boolean;
  className?: string;
  placeholder?: string;
  children?: ReactNode;
};

type CharacterEffectStyle = CSSProperties & {
  '--character-effect-duration'?: string;
  '--character-effect-distance'?: string;
  '--character-effect-negative-distance'?: string;
  '--character-effect-scale'?: string;
  '--character-flash-opacity'?: string;
  '--character-slide-x'?: string;
  '--character-slide-y'?: string;
};

const INTENSITY_STYLE = {
  subtle: {
    distance: '3%',
    slideDistance: '7.5%',
    scale: '1.025',
    flashOpacity: '0.65',
  },
  normal: {
    distance: '6%',
    slideDistance: '15%',
    scale: '1.055',
    flashOpacity: '0.35',
  },
  strong: {
    distance: '10%',
    slideDistance: '25%',
    scale: '1.1',
    flashOpacity: '0.08',
  },
} as const;

function effectStyle(effect: CharacterEffect | null): CharacterEffectStyle {
  if (effect === null) {
    return {};
  }
  const style: CharacterEffectStyle = {
    '--character-effect-duration': `${effect.durationMs}ms`,
  };
  if ('intensity' in effect) {
    const intensity = INTENSITY_STYLE[effect.intensity];
    style['--character-effect-distance'] = intensity.distance;
    style['--character-effect-negative-distance'] = `-${intensity.distance}`;
    style['--character-effect-scale'] = intensity.scale;
    style['--character-flash-opacity'] = intensity.flashOpacity;
  }
  if (effect.type === 'slideIn') {
    const distance = INTENSITY_STYLE[effect.intensity].slideDistance;
    style['--character-slide-x'] = effect.direction === 'left'
      ? `-${distance}`
      : effect.direction === 'right' ? distance : '0%';
    style['--character-slide-y'] = effect.direction === 'up'
      ? `-${distance}`
      : effect.direction === 'down' ? distance : '0%';
  }
  return style;
}

function CharacterPortrait({
  character,
  animate,
}: {
  character: PreviewCharacter;
  animate: boolean;
}) {
  const renderKey = `${character.id}:${character.effectSequence}:${character.url ?? ''}`;
  const activeRenderKey = useRef(renderKey);
  activeRenderKey.current = renderKey;
  // A cached image can fire load before passive effects run. Start active and
  // use a layout cleanup so decode completion is accepted on the first commit
  // but still cannot update an unmounted portrait.
  const mounted = useRef(true);
  const imageElement = useRef<HTMLImageElement | null>(null);
  const decodeStartedKey = useRef<string | null>(null);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const ready = readyKey === renderKey;
  const failed = failedKey === renderKey;

  const revealAfterDecode = useCallback((image: HTMLImageElement) => {
    const keyAtLoad = renderKey;
    if (decodeStartedKey.current === keyAtLoad) {
      return;
    }
    decodeStartedKey.current = keyAtLoad;
    let decoded: Promise<void>;
    try {
      decoded = typeof image.decode === 'function'
        ? image.decode()
        : Promise.resolve();
    } catch {
      decoded = Promise.reject(new Error('Character image decode failed'));
    }
    void decoded.then(() => {
      if (mounted.current && activeRenderKey.current === keyAtLoad) {
        setReadyKey(keyAtLoad);
      }
    }, () => {
      if (mounted.current && activeRenderKey.current === keyAtLoad) {
        setFailedKey(keyAtLoad);
      }
    });
  }, [renderKey]);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    setReadyKey((current) => current === renderKey ? current : null);
    setFailedKey((current) => current === renderKey ? current : null);
    const image = imageElement.current;
    if (image?.complete && image.naturalWidth > 0) {
      revealAfterDecode(image);
    }
  }, [renderKey, revealAfterDecode]);

  if (!character.url || failed) {
    return null;
  }

  const position =
    character.position ?? DEFAULT_CHARACTER_SLOT_POSITIONS[character.slot];
  const anchorStyle: CSSProperties = {
    zIndex: 10 + character.layer,
    left: `${position.x}%`,
    top: `${position.y}%`,
    right: 'auto',
    bottom: 'auto',
    transform: 'translate(-50%, -100%)',
  };

  return (
    <div
      className={`preview-character-anchor preview-character-${character.slot}`}
      style={anchorStyle}
      data-character-layer={character.layer}
    >
      <img
        ref={imageElement}
        key={renderKey}
        className={`preview-character-image${
          ready && animate && character.effect !== null
            ? ` preview-character-effect preview-character-effect-${character.effect.type}`
            : ''
        }`}
        style={{
          ...effectStyle(ready && animate ? character.effect : null),
          opacity: character.opacity,
          visibility: ready ? undefined : 'hidden',
        }}
        src={character.url}
        alt={character.name}
        data-effect-sequence={character.effectSequence}
        data-character-image-status={ready ? 'ready' : 'loading'}
        onLoad={(event) => revealAfterDecode(event.currentTarget)}
        onError={() => setFailedKey(renderKey)}
      />
    </div>
  );
}

export function VisualStage({
  language,
  labels: labelsOverride,
  speaker,
  text,
  backgroundUrl,
  backgroundName,
  showDialogue = true,
  characters = [],
  animateCharacters = false,
  animationsPaused = false,
  className = '',
  placeholder,
  children,
}: VisualStageProps) {
  const labels = usePlayerUiLabels(language, labelsOverride).visualStage;
  const [backgroundFailed, setBackgroundFailed] = useState(false);

  useEffect(() => {
    setBackgroundFailed(false);
  }, [backgroundUrl]);

  const showBackground = Boolean(backgroundUrl) && !backgroundFailed;

  return (
    <div
      className={`preview-stage ${className}`.trim()}
      data-character-animations-paused={animationsPaused || undefined}
    >
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
            ? labels.backgroundLoadFailed(
                backgroundName ?? labels.unknownImage,
              )
            : placeholder ?? labels.previewPlaceholder}
        </p>
      )}

      <div className="preview-character-layer" aria-hidden="true">
        {characters.map((character) => (
          <CharacterPortrait
            key={`${character.layer}:${character.id}`}
            character={character}
            animate={animateCharacters}
          />
        ))}
      </div>

      {showDialogue ? (
        <div className="dialogue-box">
          {speaker ? <strong>{speaker}</strong> : null}
          <p>{text}</p>
        </div>
      ) : null}

      {children}
    </div>
  );
}
