/** @vitest-environment jsdom */
import * as Blockly from 'blockly';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DOCKED_TOOLBOX_PLUGINS } from '../../src/renderer/features/block-editor/dockedToolbox';
import { BLOCKLY_WORKSPACE_MOVE_OPTIONS } from '../../src/renderer/features/block-editor/blocklyWorkspaceMovement';

describe('docked Blockly categories', () => {
  const workspaces: Blockly.WorkspaceSvg[] = [];

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      measureText: (text: string) => ({ width: text.length * 8 }),
    } as CanvasRenderingContext2D);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    Object.defineProperty(SVGElement.prototype, 'getBBox', {
      configurable: true,
      value: () => ({ x: 0, y: 0, width: 120, height: 40 }),
    });
    Blockly.Blocks['vn_docked_test'] = {
      init(this: Blockly.BlockSvg) {
        this.appendDummyInput().appendField(new Blockly.FieldLabel('Story'), 'LABEL');
      },
    };
  });

  afterEach(() => {
    workspaces.splice(0).forEach((workspace) => workspace.dispose());
    delete Blockly.Blocks['vn_docked_test'];
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  function createWorkspace() {
    const container = document.createElement('div');
    document.body.append(container);
    const workspace = Blockly.inject(container, {
      toolbox: {
        kind: 'categoryToolbox',
        contents: ['Story', 'A much wider category block'].map((label) => ({
          kind: 'category', name: label,
          contents: [{ kind: 'block', type: 'vn_docked_test', fields: { LABEL: label } }],
        })),
      },
      plugins: DOCKED_TOOLBOX_PLUGINS,
      move: BLOCKLY_WORKSPACE_MOVE_OPTIONS,
      renderer: 'zelos',
      sounds: false,
      zoom: { controls: true, wheel: true, startScale: 0.9 },
    });
    workspaces.push(workspace);
    // jsdom has no layout engine; supply the two DOM-measured dimensions.
    vi.spyOn(workspace, 'getCachedParentSvgSize').mockImplementation(
      () => new Blockly.utils.Size(1200, 700),
    );
    vi.spyOn(workspace.getToolbox()!, 'getWidth').mockReturnValue(100);
    const block = workspace.newBlock('vn_docked_test');
    block.initSvg();
    block.render();
    block.moveBy(40, 80);
    workspace.resize();
    workspace.scroll(0, 0);
    return { workspace, block, toolbox: workspace.getToolbox()!, flyout: workspace.getFlyout()! };
  }

  function canvasX(workspace: Blockly.WorkspaceSvg): number {
    return Number(/translate\(([-\d.e+]+)/.exec(workspace.getCanvas().getAttribute('transform')!)![1]);
  }

  it('pushes the canvas by the opened panel width and restores it on close, without moving blocks', async () => {
    const { workspace, block, toolbox, flyout } = createWorkspace();
    const initial = workspace.getMetrics();
    const initialX = canvasX(workspace);
    const blockPosition = block.getRelativeToSurfaceXY().clone();

    toolbox.selectItemByPosition(0);
    await Promise.resolve();
    const expanded = workspace.getMetrics();
    expect(flyout.isVisible()).toBe(true);
    expect(expanded.absoluteLeft).toBeCloseTo(initial.absoluteLeft + flyout.getWidth());
    expect(expanded.viewWidth).toBeCloseTo(initial.viewWidth - flyout.getWidth());
    expect(canvasX(workspace)).toBeCloseTo(initialX + flyout.getWidth());
    expect(block.getRelativeToSurfaceXY()).toEqual(blockPosition);

    // Clicking the same category again closes it.
    toolbox.selectItemByPosition(0);
    await Promise.resolve();
    expect(flyout.isVisible()).toBe(false);
    expect(workspace.getMetrics().viewWidth).toBeCloseTo(initial.viewWidth);
    expect(canvasX(workspace)).toBeCloseTo(initialX);
    expect(block.getRelativeToSurfaceXY()).toEqual(blockPosition);
  });

  it('adjusts to different category widths without accumulating canvas offsets', async () => {
    const { workspace, toolbox, flyout } = createWorkspace();
    const initialX = canvasX(workspace);
    toolbox.selectItemByPosition(0);
    await Promise.resolve();
    const narrowWidth = flyout.getWidth();
    toolbox.selectItemByPosition(1);
    await Promise.resolve();
    expect(flyout.getWidth()).toBeGreaterThan(narrowWidth);
    expect(canvasX(workspace)).toBeCloseTo(initialX + flyout.getWidth());
    toolbox.selectItemByPosition(0);
    await Promise.resolve();
    expect(canvasX(workspace)).toBeCloseTo(initialX + narrowWidth);
    workspace.hideChaff(false);
    await Promise.resolve();
    expect(canvasX(workspace)).toBeCloseTo(initialX);
    expect(workspace.getAllBlocks(false)).toHaveLength(1);
  });

  it('keeps the visible canvas and scroll coordinates consistent after zoom and resize', async () => {
    const { workspace, toolbox, flyout } = createWorkspace();
    toolbox.selectItemByPosition(1);
    await Promise.resolve();
    workspace.setScale(1.3);
    await Promise.resolve();
    // Blockly normally closes categories on zoom. Reopening must measure
    // the panel at its new scale, without leaving the old reserved width.
    expect(flyout.isVisible()).toBe(false);
    expect(workspace.getMetrics().absoluteLeft).toBe(100);
    toolbox.selectItemByPosition(1);
    await Promise.resolve();
    workspace.scroll(-75, -30);
    vi.mocked(workspace.getCachedParentSvgSize).mockImplementation(
      () => new Blockly.utils.Size(900, 650),
    );
    workspace.resize();
    const metrics = workspace.getMetrics();
    expect(metrics.absoluteLeft).toBeCloseTo(100 + flyout.getWidth());
    expect(metrics.viewWidth + metrics.absoluteLeft).toBeCloseTo(900);
    expect(metrics.viewHeight).toBe(650);
    expect(canvasX(workspace)).toBeCloseTo(workspace.scrollX + metrics.absoluteLeft);
    expect(workspace.getMetricsManager().getViewMetrics(true).width).toBeCloseTo(metrics.viewWidth / 1.3);
    toolbox.clearSelection();
    await Promise.resolve();
    expect(canvasX(workspace)).toBeCloseTo(workspace.scrollX + 100);
    expect(workspace.getScale()).toBe(1.3);
  });

  it('does not shift another editor workspace', async () => {
    const first = createWorkspace();
    const second = createWorkspace();
    const secondX = canvasX(second.workspace);
    first.toolbox.selectItemByPosition(0);
    await Promise.resolve();
    expect(first.flyout.isVisible()).toBe(true);
    expect(second.flyout.isVisible()).toBe(false);
    expect(canvasX(second.workspace)).toBe(secondX);
    expect(second.workspace.getMetrics().absoluteLeft).toBe(100);
  });

  it('cancels pending layout when switching away from the graphical editor', async () => {
    const { workspace, toolbox } = createWorkspace();
    const resize = vi.spyOn(workspace, 'resize');
    toolbox.selectItemByPosition(0);
    workspace.dispose();
    workspaces.splice(workspaces.indexOf(workspace), 1);
    resize.mockClear();
    await Promise.resolve();
    expect(resize).not.toHaveBeenCalled();
  });
});
