/**
 * 文件主要作用：创建 React 根节点并挂载编辑器应用与国际化上下文。
 * 包含实现：模块内部类型与实现。
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { RendererErrorBoundary } from './components/RendererErrorBoundary';
import './styles/base.css';
import './styles/editor.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Cannot find the React root element.');
}

createRoot(rootElement).render(
  <StrictMode>
    <RendererErrorBoundary>
      <App />
    </RendererErrorBoundary>
  </StrictMode>,
);
