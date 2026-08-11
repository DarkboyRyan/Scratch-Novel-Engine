import { useEffect, useRef } from 'react';
import * as Blockly from 'blockly';

import { starterToolbox } from './toolbox';

export function BlocklyWorkspace() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const workspace = Blockly.inject(container, {
      toolbox: starterToolbox,
      trashcan: true,
      scrollbars: true,
      sounds: false,
      zoom: {
        controls: true,
        wheel: true,
        startScale: 0.9,
        minScale: 0.5,
        maxScale: 1.4,
        scaleSpeed: 1.1,
      },
    });

    const resizeObserver = new ResizeObserver(() => {
      Blockly.svgResize(workspace);
    });

    resizeObserver.observe(container);
    Blockly.svgResize(workspace);

    return () => {
      resizeObserver.disconnect();
      workspace.dispose();
    };
  }, []);

  return <div ref={containerRef} className="blockly-workspace" />;
}