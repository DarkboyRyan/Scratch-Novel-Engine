import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  advanceGame,
  selectChoice,
  startGame,
  type GameRuntime,
} from '@vnengine/runtime';

import { GameScreen } from './GameScreen';
import {
  preloadPlayerGateway,
  type PlayerGameView,
  type PlayerGateway,
} from './playerGateway';
import type { PlayerMode } from '../shared/playerProtocol';

type PlayerShellState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'title'; game: PlayerGameView }
  | {
      kind: 'game';
      game: PlayerGameView;
      runtime: GameRuntime;
      paused: boolean;
    };

export type AppProps = {
  gateway?: PlayerGateway;
};

export function App({ gateway = preloadPlayerGateway }: AppProps) {
  const [state, setState] = useState<PlayerShellState>({ kind: 'loading' });
  // Keep opening disabled until Main declares the mode. If load-game itself
  // fails, an embedded application must not accidentally reveal a picker.
  const [mode, setMode] = useState<PlayerMode | null>(null);
  const [openingGame, setOpeningGame] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const openingRef = useRef(false);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const result = await gateway.loadGame();
      setMode(result.mode);
      if (result.status === 'loaded') {
        setState({ kind: 'title', game: result.game });
      } else if (result.status === 'empty') {
        setState(result.mode === 'generic'
          ? { kind: 'empty' }
          : {
              kind: 'error',
              message: '内嵌游戏内容缺失，请重新安装游戏。',
            });
      } else {
        setState({ kind: 'error', message: result.error });
      }
    } catch {
      setState({
        kind: 'error',
        message: '无法读取游戏内容包，请重新安装或联系游戏作者。',
      });
    }
  }, [gateway]);

  useEffect(() => {
    void load();
  }, [load]);

  const openGame = useCallback(async () => {
    if (mode !== 'generic' || openingRef.current) {
      return;
    }
    openingRef.current = true;
    setOpeningGame(true);
    setOpenError(null);
    try {
      const result = await gateway.openGame();
      if (result.status === 'opened') {
        setState({ kind: 'title', game: result.game });
      } else if (result.status === 'rejected') {
        setOpenError(result.error);
      }
    } catch {
      setOpenError('无法打开游戏内容包，请重试。');
    } finally {
      openingRef.current = false;
      setOpeningGame(false);
    }
  }, [gateway, mode]);

  const canOpenGame = mode === 'generic';

  const start = useCallback((game: PlayerGameView) => {
    const runtime = startGame(game.project);
    if (!runtime) {
      setState({
        kind: 'error',
        message: '游戏入口场景不存在，内容包可能已经损坏。',
      });
      return;
    }
    setState({ kind: 'game', game, runtime, paused: false });
  }, []);

  let content: ReactNode;
  if (state.kind === 'loading') {
    content = (
      <main className="player-shell player-loading" aria-live="polite">
        <span className="player-loading-mark" aria-hidden="true" />
        <p>正在载入游戏…</p>
      </main>
    );
  } else if (state.kind === 'empty') {
    content = (
      <main className="player-shell player-empty-page">
        <section className="player-shell-card">
          <p className="player-eyebrow">VN ENGINE PLAYER</p>
          <h1>打开游戏</h1>
          <p>请选择一个名称以 .vngame 结尾的游戏目录包。</p>
          {canOpenGame ? <div className="player-shell-actions">
            <button
              type="button"
              disabled={openingGame}
              onClick={() => void openGame()}
            >
              {openingGame ? '正在打开…' : '选择游戏包'}
            </button>
          </div> : null}
        </section>
      </main>
    );
  } else if (state.kind === 'error') {
    content = (
      <main className="player-shell player-error-page">
        <section className="player-shell-card" role="alert">
          <p className="player-eyebrow">LOAD ERROR</p>
          <h1>游戏无法载入</h1>
          <p>{state.message}</p>
          <div className="player-shell-actions">
            {canOpenGame ? (
              <button
                type="button"
                disabled={openingGame}
                onClick={() => void openGame()}
              >
                {openingGame ? '正在打开…' : '选择其他游戏包'}
              </button>
            ) : null}
            <button
              type="button"
              className="secondary"
              onClick={gateway.close}
            >
              退出游戏
            </button>
          </div>
        </section>
      </main>
    );
  } else if (state.kind === 'title') {
    content = (
      <main className="player-shell player-title-page">
        <section className="player-title-card">
          <p className="player-eyebrow">A VN ENGINE STORY</p>
          <h1>{state.game.project.name || '未命名游戏'}</h1>
          <div className="player-title-actions">
            <button
              type="button"
              className="player-start-button"
              onClick={() => start(state.game)}
            >
              <span aria-hidden="true">▶</span>
              开始游戏
            </button>
            {canOpenGame ? (
              <button
                type="button"
                className="secondary"
                disabled={openingGame}
                onClick={() => void openGame()}
              >
                {openingGame ? '正在打开…' : '打开其他游戏'}
              </button>
            ) : null}
          </div>
        </section>
      </main>
    );
  } else {
    content = (
      <GameScreen
        project={state.game.project}
        assets={state.game.assets}
        runtime={state.runtime}
        paused={state.paused}
        canOpenGame={canOpenGame}
        openingGame={openingGame}
        resolveMediaUrl={gateway.resolveMediaUrl}
        onAdvance={() => {
          setState((current) => current.kind === 'game' && !current.paused &&
              current.runtime.status === 'playing'
            ? {
                ...current,
                runtime: advanceGame(current.game.project, current.runtime),
              }
            : current);
        }}
        onCompleteVideo={() => {
          setState((current) => current.kind === 'game' && !current.paused &&
              current.runtime.status === 'playingVideo'
            ? {
                ...current,
                runtime: advanceGame(current.game.project, current.runtime),
              }
            : current);
        }}
        onSelectChoice={(optionId) => {
          setState((current) => current.kind === 'game' && !current.paused &&
              current.runtime.status === 'choosing'
            ? {
                ...current,
                runtime: selectChoice(
                  current.game.project,
                  current.runtime,
                  optionId,
                ),
              }
            : current);
        }}
        onPause={() => {
          setState((current) => current.kind === 'game'
            ? { ...current, paused: true }
            : current);
        }}
        onResume={() => {
          setState((current) => current.kind === 'game'
            ? { ...current, paused: false }
            : current);
        }}
        onRestart={() => start(state.game)}
        onOpenGame={() => void openGame()}
        onExit={gateway.close}
      />
    );
  }

  return (
    <>
      {content}
      {canOpenGame && openError !== null ? (
        <div className="player-open-error-layer" role="alertdialog" aria-modal="true">
          <section className="player-menu-card player-error-card">
            <p className="player-eyebrow">OPEN ERROR</p>
            <h2>内容包未打开</h2>
            <p>{openError}</p>
            <button type="button" onClick={() => setOpenError(null)}>
              返回
            </button>
            <button
              type="button"
              className="secondary"
              disabled={openingGame}
              onClick={() => void openGame()}
            >
              {openingGame ? '正在打开…' : '选择其他游戏包'}
            </button>
          </section>
        </div>
      ) : null}
    </>
  );
}
