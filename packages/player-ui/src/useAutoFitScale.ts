/**
 * 主要作用：测量容器并计算、应用界面等比缩放 CSS 变量。
 * 关键函数与实现：`calculateAutoFitScale`、`AutoFitScaleRefs`、`useAutoFitScale`；以 TypeScript 类型边界和可组合函数实现。
 */
import { useCallback, useLayoutEffect, useRef } from 'react';

const AUTO_FIT_SCALE_PROPERTY = '--auto-fit-scale';

export function calculateAutoFitScale(
  availableWidth: number,
  availableHeight: number,
  contentWidth: number,
  contentHeight: number,
): number {
  const dimensions = [
    availableWidth,
    availableHeight,
    contentWidth,
    contentHeight,
  ];
  if (
    dimensions.some(
      (dimension) => !Number.isFinite(dimension) || dimension <= 0,
    )
  ) {
    return 1;
  }

  return Math.min(
    1,
    availableWidth / contentWidth,
    availableHeight / contentHeight,
  );
}

export type AutoFitScaleRefs<
  TContainer extends HTMLElement,
  TContent extends HTMLElement,
> = {
  containerRef: React.RefObject<TContainer | null>;
  contentRef: React.RefObject<TContent | null>;
};

/**
 * Keeps a fixed-layout child fully visible by scaling it uniformly inside its
 * container. Transforms do not affect offset/scroll sizes, so observing both
 * elements is stable and also reacts to title wrapping or font changes.
 */
export function useAutoFitScale<
  TContainer extends HTMLElement,
  TContent extends HTMLElement,
>(): AutoFitScaleRefs<TContainer, TContent> {
  const containerRef = useRef<TContainer>(null);
  const contentRef = useRef<TContent>(null);

  const fit = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (container === null || content === null) {
      return;
    }

    const scale = calculateAutoFitScale(
      container.clientWidth,
      container.clientHeight,
      Math.max(content.offsetWidth, content.scrollWidth),
      Math.max(content.offsetHeight, content.scrollHeight),
    );
    content.style.setProperty(AUTO_FIT_SCALE_PROPERTY, String(scale));
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (container === null || content === null) {
      return;
    }

    fit();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', fit);
      return () => window.removeEventListener('resize', fit);
    }

    const observer = new ResizeObserver(fit);
    observer.observe(container);
    observer.observe(content);
    window.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [fit]);

  return { containerRef, contentRef };
}
