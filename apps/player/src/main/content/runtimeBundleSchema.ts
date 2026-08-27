/**
 * 主要作用：兼容导出共享运行包严格解析器的 Main 进程入口。
 * 关键函数与实现：parseRuntimeBundleDocuments 转发；基于 Electron Main 与 Node.js 安全文件/协议边界实现。
 */
// The strict document parser is shared with the browser Player. Keep this
// compatibility export so Main-side callers and tests retain their stable path.
export * from '../../shared/runtimeBundleSchema';
