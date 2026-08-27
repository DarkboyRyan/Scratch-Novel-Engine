/**
 * 文件主要作用：创建并安装 Blockly 缩放控件 SVG 图标。
 * 包含实现：`installInlineZoomControlIcons`。
 */

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

type ZoomControlDefinition = {
  selector: string;
  kind: 'reset' | 'in' | 'out';
};

const ZOOM_CONTROLS: ZoomControlDefinition[] = [
  { selector: '.blocklyZoomReset', kind: 'reset' },
  { selector: '.blocklyZoomIn', kind: 'in' },
  { selector: '.blocklyZoomOut', kind: 'out' },
];

function createSvgElement<K extends keyof SVGElementTagNameMap>(
  parent: SVGElement,
  tagName: K,
  attributes: Record<string, string>,
): SVGElementTagNameMap[K] {
  const element = parent.ownerDocument.createElementNS(
    SVG_NAMESPACE,
    tagName,
  );

  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }

  parent.appendChild(element);
  return element;
}

function drawResetIcon(parent: SVGElement): void {
  createSvgElement(parent, 'circle', {
    cx: '16',
    cy: '16',
    r: '8',
  });
  createSvgElement(parent, 'circle', {
    class: 'vn-blockly-zoom-center-dot',
    cx: '16',
    cy: '16',
    r: '2.5',
  });

  for (const path of [
    'M16 3v4',
    'M16 25v4',
    'M3 16h4',
    'M25 16h4',
  ]) {
    createSvgElement(parent, 'path', { d: path });
  }
}

function drawZoomIcon(
  parent: SVGElement,
  kind: 'in' | 'out',
): void {
  createSvgElement(parent, 'circle', {
    cx: '16',
    cy: '16',
    r: '11',
  });
  createSvgElement(parent, 'path', { d: 'M10 16h12' });

  if (kind === 'in') {
    createSvgElement(parent, 'path', { d: 'M16 10v12' });
  }
}

/**
 * Blockly's stock zoom controls reference an external sprites.svg file. The
 * editor deliberately blocks remote images with CSP, so replace only the
 * artwork with inline SVG while preserving Blockly's own buttons and events.
 */
export function installInlineZoomControlIcons(
  root: ParentNode,
): number {
  let installedCount = 0;

  for (const control of ZOOM_CONTROLS) {
    const group = root.querySelector<SVGGElement>(control.selector);
    if (
      !group ||
      group.querySelector('.vn-blockly-zoom-button')
    ) {
      continue;
    }

    group
      .querySelectorAll('image, clipPath')
      .forEach((element) => element.remove());

    const button = group.ownerDocument.createElementNS(
      SVG_NAMESPACE,
      'rect',
    );
    for (const [name, value] of Object.entries({
      class: 'vn-blockly-zoom-button',
      x: '0',
      y: '0',
      width: '32',
      height: '32',
      rx: '6',
      ry: '6',
      'aria-hidden': 'true',
    })) {
      button.setAttribute(name, value);
    }
    group.insertBefore(button, group.firstChild);

    const icon = createSvgElement(group, 'g', {
      class: `vn-blockly-zoom-symbol vn-blockly-zoom-symbol-${control.kind}`,
      'aria-hidden': 'true',
    });
    if (control.kind === 'reset') {
      drawResetIcon(icon);
    } else {
      drawZoomIcon(icon, control.kind);
    }

    installedCount += 1;
  }

  return installedCount;
}
