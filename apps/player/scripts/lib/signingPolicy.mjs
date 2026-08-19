export function macSignOptions({ app, identity, keychain }) {
  return {
    app,
    identity,
    keychain,
    platform: 'darwin',
    type: 'distribution',
    identityValidation: true,
    // @electron/osx-sign 1.3.3 applies hardenedRuntime through the per-file
    // options callback. A top-level hardenedRuntime property is ignored.
    optionsForFile: () => ({ hardenedRuntime: true }),
  };
}

export function windowsSignOptions({
  appDirectory,
  certificateFile,
  certificatePassword,
}) {
  return {
    appDirectory,
    certificateFile,
    certificatePassword,
    hashes: ['sha256'],
    description: 'VN Engine Player',
  };
}
