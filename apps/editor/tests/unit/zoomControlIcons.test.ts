/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';

import { installInlineZoomControlIcons } from '../../src/renderer/features/block-editor/zoomControlIcons';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function createBlocklyControls(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');

  for (const className of [
    'blocklyZoom blocklyZoomReset',
    'blocklyZoom blocklyZoomIn',
    'blocklyZoom blocklyZoomOut',
  ]) {
    const group = document.createElementNS(SVG_NAMESPACE, 'g');
    group.setAttribute('class', className);
    group.innerHTML = '<clipPath><rect /></clipPath><image href="remote-sprites.svg" />';
    svg.appendChild(group);
  }

  const unrelatedImage = document.createElementNS(
    SVG_NAMESPACE,
    'image',
  );
  unrelatedImage.setAttribute('class', 'unrelated-image');
  svg.appendChild(unrelatedImage);

  return svg;
}

describe('inline Blockly zoom control icons', () => {
  it('replaces only remote zoom sprites with visible inline controls', () => {
    const svg = createBlocklyControls();

    expect(installInlineZoomControlIcons(svg)).toBe(3);
    expect(svg.querySelectorAll('.blocklyZoom image')).toHaveLength(0);
    expect(svg.querySelectorAll('.blocklyZoom clipPath')).toHaveLength(0);
    expect(
      svg.querySelectorAll('.vn-blockly-zoom-button'),
    ).toHaveLength(3);
    expect(
      svg.querySelectorAll('.vn-blockly-zoom-symbol-reset'),
    ).toHaveLength(1);
    expect(
      svg.querySelectorAll('.vn-blockly-zoom-symbol-in'),
    ).toHaveLength(1);
    expect(
      svg.querySelectorAll('.vn-blockly-zoom-symbol-out'),
    ).toHaveLength(1);
    expect(svg.querySelector('.unrelated-image')).not.toBeNull();
  });

  it('does not duplicate icons when installation runs twice', () => {
    const svg = createBlocklyControls();

    installInlineZoomControlIcons(svg);

    expect(installInlineZoomControlIcons(svg)).toBe(0);
    expect(
      svg.querySelectorAll('.vn-blockly-zoom-button'),
    ).toHaveLength(3);
  });
});
