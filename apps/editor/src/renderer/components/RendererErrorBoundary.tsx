import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';

type RendererErrorBoundaryProps = {
  children: ReactNode;
};

type RendererErrorBoundaryState = {
  failed: boolean;
};

export class RendererErrorBoundary extends Component<
  RendererErrorBoundaryProps,
  RendererErrorBoundaryState
> {
  state: RendererErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): RendererErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[editor-renderer] uncaught render error', error, {
      componentStack: info.componentStack,
    });
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <main className="engine-startup" role="alert">
          <strong>编辑器界面加载失败</strong>
          <p>
            界面模块可能刚刚更新。请完全退出并重新启动编辑器；当前项目文件不会因此被修改。
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            重新加载界面
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
