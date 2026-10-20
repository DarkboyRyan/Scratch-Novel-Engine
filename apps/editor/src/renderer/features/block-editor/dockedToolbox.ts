import * as Blockly from 'blockly';

// Category flyouts normally overlay the canvas. Include an open left flyout
// in the viewport instead, so Blockly's own scroll/zoom/drag coordinates all
// agree on where the usable canvas begins. Block positions stay unchanged.
class DockedToolboxMetrics extends Blockly.MetricsManager {
  private getDockedWidth(): number {
    const flyout = this.workspace_.getFlyout();
    if (
      !this.workspace_.getToolbox() ||
      this.workspace_.toolboxPosition !== Blockly.utils.toolbox.Position.LEFT ||
      !flyout?.autoClose ||
      !flyout.isVisible()
    ) {
      return 0;
    }
    return flyout.getWidth();
  }

  override getAbsoluteMetrics() {
    const metrics = super.getAbsoluteMetrics();
    return { ...metrics, left: metrics.left + this.getDockedWidth() };
  }

  override getViewMetrics(inWorkspaceCoordinates = false) {
    const metrics = super.getViewMetrics(inWorkspaceCoordinates);
    const scale = inWorkspaceCoordinates ? this.workspace_.scale : 1;
    return {
      ...metrics,
      width: Math.max(0, metrics.width - this.getDockedWidth() / scale),
    };
  }
}

class DockedToolbox extends Blockly.Toolbox {
  private layoutQueued = false;
  private disposed = false;

  override setSelectedItem(item: Parameters<Blockly.Toolbox['setSelectedItem']>[0]) {
    super.setSelectedItem(item);
    // Closing a category does not resize Blockly's default overlay flyout.
    // Let the current gesture finish before resizing: setScale also closes
    // the flyout, while its scroll coordinates are still being calculated.
    // A microtask updates the canvas/controls before the next browser paint.
    if (this.layoutQueued || this.disposed) return;
    this.layoutQueued = true;
    queueMicrotask(() => {
      this.layoutQueued = false;
      if (!this.disposed) this.workspace_.resize();
    });
  }

  override dispose() {
    this.disposed = true;
    super.dispose();
  }
}

export const DOCKED_TOOLBOX_PLUGINS = {
  toolbox: DockedToolbox,
  metricsManager: DockedToolboxMetrics,
} satisfies NonNullable<Blockly.BlocklyOptions['plugins']>;
