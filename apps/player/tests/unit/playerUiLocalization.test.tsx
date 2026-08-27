/** @vitest-environment jsdom */
/**
 * 主要作用：验证中英文组件文本、ARIA、错误消息和交互切换。
 * 关键函数与实现：测试套件“Player UI localization”、`setSelectValue`、`referencedIds`、`referencedText`；使用 Vitest、测试夹具与必要的 DOM/文件系统模拟覆盖公开行为。
 */

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  CgGallery,
  GameActionBar,
  OptionsDialog,
  PlayerUiProvider,
  PreviewVideo,
  SaveSlotDialog,
  TitleScreen,
  VisualStage,
  formatSaveTimestamp,
  getPlayerUiLabels,
  type OptionsSettingsValue,
  type PlayerLanguage,
} from '@vnengine/player-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENGLISH_SETTINGS: OptionsSettingsValue = {
  settingsVersion: 2,
  language: 'en-US',
  masterVolume: 1,
  bgmVolume: 1,
  voiceVolume: 1,
  videoVolume: 1,
  windowMode: 'windowed',
  windowSizePreset: 'medium',
};

function setSelectValue(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    'value',
  )?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function referencedIds(element: Element, attribute: string): string[] {
  return element.getAttribute(attribute)?.split(/\s+/).filter(Boolean) ?? [];
}

function referencedText(element: Element, attribute: string): string {
  return referencedIds(element, attribute)
    .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? '')
    .join(' ');
}

describe('Player UI localization', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    vi.spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load')
      .mockImplementation(() => {});
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('defaults to Chinese and exposes a complete English typed catalog', () => {
    expect(getPlayerUiLabels().title.startGame).toBe('开始游戏');
    expect(getPlayerUiLabels('en-US').title.startGame).toBe('Start Game');
    expect(getPlayerUiLabels('en-US').shell.savedToSlot(2)).toBe(
      'Saved to Slot 2',
    );
    expect(getPlayerUiLabels('en-US').errors['save-incompatible']).toContain(
      'incompatible',
    );
    expect(
      getPlayerUiLabels('zh-CN').saves.dialogueSummary('作者', '原文'),
    ).toBe('作者：原文');
    expect(
      getPlayerUiLabels('en-US').saves.dialogueSummary('作者', '原文'),
    ).toBe('作者: 原文');
    expect(getPlayerUiLabels('en-US').saves.playingVideoSummary).toBe(
      'Playing a Cutscene',
    );
    expect(formatSaveTimestamp(null)).toBe('空存档');
    expect(formatSaveTimestamp(null, 'en-US')).toBe('Empty Slot');
  });

  it('localizes title and action controls through the provider', async () => {
    const resolveMediaUrl = vi.fn(async () => null);
    await act(async () => root.render(
      <PlayerUiProvider language="en-US">
        <TitleScreen
          startScreen={{
            title: '',
            eyebrow: '作者自定义标语',
            backgroundAssetId: null,
            musicAssetId: null,
          }}
          resolveMediaUrl={resolveMediaUrl}
          onStart={vi.fn()}
          onLoadGame={vi.fn()}
          onExit={vi.fn()}
        />
      </PlayerUiProvider>,
    ));

    expect(container.querySelector('h1')?.textContent).toBe('Untitled Game');
    expect(container.querySelector('.player-eyebrow')?.textContent).toBe(
      '作者自定义标语',
    );
    expect(container.textContent).toContain('Start Game');
    expect(container.textContent).toContain('Load Game');
    expect(container.textContent).toContain('CG Gallery');
    expect(container.textContent).toContain('Quit Game');

    await act(async () => root.render(
      <PlayerUiProvider language="en-US">
        <TitleScreen
          startScreen={{
            title: 'No eyebrow',
            eyebrow: '',
            backgroundAssetId: null,
            musicAssetId: null,
          }}
          resolveMediaUrl={resolveMediaUrl}
          onStart={vi.fn()}
          onExit={vi.fn()}
        />
      </PlayerUiProvider>,
    ));
    expect(container.querySelector('.player-eyebrow')).toBeNull();

    await act(async () => root.render(
      <PlayerUiProvider language="en-US">
        <GameActionBar
          onSave={vi.fn()}
          onLoad={vi.fn()}
          onQuickSave={vi.fn()}
          onQuickLoad={vi.fn()}
          onToggleFastForward={vi.fn()}
          onOptions={vi.fn()}
          onReturnToTitle={vi.fn()}
        />
      </PlayerUiProvider>,
    ));
    expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe(
      'Game controls',
    );
    expect(container.textContent).toContain('Quick Save');
    expect(container.textContent).toContain('Fast Forward');
    expect(container.textContent).toContain('Return to Title');
  });

  it('offers Chinese and English and commits a strict v2 language setting', async () => {
    const commit = vi.fn();

    function Harness() {
      const [settings, setSettings] = useState<OptionsSettingsValue>({
        ...ENGLISH_SETTINGS,
        language: 'zh-CN',
      });
      return (
        <PlayerUiProvider language={settings.language}>
          <OptionsDialog
            settings={settings}
            onPreviewSettingsChange={setSettings}
            onCommitSettings={commit}
            onReset={vi.fn()}
            onClose={vi.fn()}
          />
        </PlayerUiProvider>
      );
    }

    await act(async () => root.render(<Harness />));
    const languageSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="界面语言"]',
    );
    expect(languageSelect).not.toBeNull();
    expect([...languageSelect!.options].map((option) => option.textContent))
      .toEqual(['中文', 'English']);

    await act(async () => setSelectValue(languageSelect!, 'en-US'));

    expect(container.querySelector('[aria-label="Options"]')).not.toBeNull();
    expect(container.textContent).toContain('Master Volume');
    expect(container.textContent).toContain('Window Mode');
    expect(commit).toHaveBeenLastCalledWith(expect.objectContaining({
      settingsVersion: 2,
      language: 'en-US',
    }));
  });

  it('gives Chinese save slots complete, unique accessible names and descriptions', async () => {
    await act(async () => root.render(
      <PlayerUiProvider language="zh-CN">
        <SaveSlotDialog
          mode="load"
          slots={[
            {
              slotId: 1,
              savedAt: '2026-08-24T08:00:00.000Z',
              sceneName: '作者场景',
              summary: '作者摘要',
            },
            {
              slotId: 'quick',
              savedAt: '2026-08-24T08:30:00.000Z',
              sceneName: '快速场景',
              summary: '快速摘要',
            },
          ]}
          onSelectSlot={vi.fn()}
          onClose={vi.fn()}
        />
      </PlayerUiProvider>,
    ));

    const slots = [...container.querySelectorAll<HTMLButtonElement>(
      '.player-save-slot',
    )];
    expect(slots).toHaveLength(4);
    expect(slots.every((slot) => slot.getAttribute('aria-label') === null))
      .toBe(true);
    const allReferencedIds = slots.flatMap((slot) => [
      ...referencedIds(slot, 'aria-labelledby'),
      ...referencedIds(slot, 'aria-describedby'),
    ]);
    expect(new Set(allReferencedIds).size).toBe(16);
    expect(allReferencedIds.every((id) => document.getElementById(id) !== null))
      .toBe(true);

    const manual = container.querySelector('[data-save-slot-id="1"]')!;
    expect(referencedText(manual, 'aria-labelledby')).toBe('读取存档 1');
    expect(referencedText(manual, 'aria-describedby')).toContain('作者场景');
    expect(referencedText(manual, 'aria-describedby')).toContain('作者摘要');
    expect(referencedIds(manual, 'aria-describedby')).toHaveLength(3);

    const emptyManual = container.querySelector('[data-save-slot-id="2"]')!;
    expect(referencedText(emptyManual, 'aria-describedby')).toContain('空存档');
    expect(referencedText(emptyManual, 'aria-describedby')).toContain('未保存');
    expect(referencedText(emptyManual, 'aria-describedby')).toContain(
      '此槽位尚无存档',
    );

    const quick = container.querySelector('[data-save-slot-id="quick"]')!;
    expect(referencedText(quick, 'aria-labelledby')).toBe('读取快速存档');
    expect(referencedText(quick, 'aria-describedby')).toContain('快速场景');
    expect(referencedText(quick, 'aria-describedby')).toContain('快速摘要');
  });

  it('keeps save-slot ARIA ids stable while relocalizing them to English', async () => {
    const slots = [{
      slotId: 1 as const,
      savedAt: '2026-08-24T08:00:00.000Z',
      sceneName: 'Author Scene',
      summary: 'Author Summary',
    }];
    const renderDialog = (language: PlayerLanguage) => (
      <PlayerUiProvider language={language}>
        <SaveSlotDialog
          mode="load"
          slots={slots}
          onSelectSlot={vi.fn()}
          onClose={vi.fn()}
        />
      </PlayerUiProvider>
    );
    await act(async () => root.render(renderDialog('zh-CN')));
    const initialManual = container.querySelector('[data-save-slot-id="1"]')!;
    const initialLabelId = initialManual.getAttribute('aria-labelledby');
    const initialDescriptionIds = initialManual.getAttribute('aria-describedby');

    await act(async () => root.render(renderDialog('en-US')));

    const manual = container.querySelector('[data-save-slot-id="1"]')!;
    expect(manual.getAttribute('aria-labelledby')).toBe(initialLabelId);
    expect(manual.getAttribute('aria-describedby')).toBe(initialDescriptionIds);
    expect(referencedText(manual, 'aria-labelledby')).toBe('Load Slot 1');
    expect(referencedText(manual, 'aria-describedby')).toContain('Author Scene');
    expect(referencedText(manual, 'aria-describedby')).toContain('Author Summary');

    const emptyManual = container.querySelector('[data-save-slot-id="2"]')!;
    expect(referencedText(emptyManual, 'aria-describedby')).toContain(
      'Empty Slot',
    );
    expect(referencedText(emptyManual, 'aria-describedby')).toContain(
      'Not Saved',
    );
    expect(referencedText(emptyManual, 'aria-describedby')).toContain(
      'This slot has no saved game',
    );
    expect(referencedText(
      container.querySelector('[data-save-slot-id="quick"]')!,
      'aria-labelledby',
    )).toBe('Load Quick Save');
  });

  it('localizes save slots, CG pagination and stage fallbacks', async () => {
    await act(async () => root.render(
      <PlayerUiProvider language="en-US">
        <SaveSlotDialog
          mode="load"
          slots={[]}
          onSelectSlot={vi.fn()}
          onClose={vi.fn()}
        />
      </PlayerUiProvider>,
    ));
    expect(container.querySelector('[aria-label="Load Game"]')).not.toBeNull();
    expect(container.textContent).toContain('Quick Save');
    expect(container.textContent).toContain('Empty Slot');
    expect(container.textContent).toContain('This slot has no saved game');

    await act(async () => root.render(
      <PlayerUiProvider language="en-US">
        <CgGallery
          pages={[]}
          resolveMediaUrl={vi.fn(async () => null)}
          onClose={vi.fn()}
        />
      </PlayerUiProvider>,
    ));
    expect(container.querySelector('[aria-label="CG Gallery"]')).not.toBeNull();
    expect(container.textContent).toContain('Empty');
    expect(container.textContent).toContain('Previous');
    expect(container.textContent).toContain('Next');

    await act(async () => root.render(
      <PlayerUiProvider language="en-US">
        <VisualStage
          speaker=""
          text=""
          backgroundUrl={null}
          backgroundName={null}
        />
      </PlayerUiProvider>,
    ));
    expect(container.textContent).toContain('Preview');
  });

  it('retranslates an existing asynchronous video error without remounting', async () => {
    const resolveMediaUrl = vi.fn(async () => null);
    const renderVideo = (language: PlayerLanguage) => (
      <PlayerUiProvider language={language}>
        <PreviewVideo
          assetId="missing-video"
          sequence={1}
          resolveMediaUrl={resolveMediaUrl}
          onComplete={vi.fn()}
        />
      </PlayerUiProvider>
    );

    await act(async () => {
      root.render(renderVideo('zh-CN'));
      await Promise.resolve();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      '按 Enter 跳过',
    );

    await act(async () => root.render(renderVideo('en-US')));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Press Enter to skip',
    );
    expect(resolveMediaUrl).toHaveBeenCalledOnce();
  });
});
