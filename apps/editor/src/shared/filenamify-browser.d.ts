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
