// 主要作用：补充 filenamify/browser 入口缺失的 TypeScript 模块声明。
// 关键实现：声明浏览器安全默认函数及 replacement、maxLength 选项。
declare module 'filenamify/browser' {
  type FilenamifyOptions = {
    readonly replacement?: string;
    readonly maxLength?: number;
  };

  const filenamify: (
    value: string,
    options?: FilenamifyOptions,
  ) => string;

  export default filenamify;
}
