/**
 * 主要作用：生成固定参数的 Windows 签名验证、归档和元数据检查命令。
 * 关键函数与实现：`windowsSignatureVerificationInvocation`、`windowsArchiveInvocation`、`windowsStandardZipArchiveInvocation`、`windowsMetadataVerificationInvocation`；基于 Node.js ESM、文件系统和受限子进程完成确定性 CLI 流程。
 */
const VERIFY_SIGNATURES_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  '$root = $env:VN_PLAYER_WINDOWS_VERIFY_ROOT',
  'if ([string]::IsNullOrWhiteSpace($root)) { throw "Missing verification root" }',
  '$files = Get-ChildItem -LiteralPath $root -Recurse -File | Where-Object { $_.Extension -in @(".exe", ".dll", ".node") }',
  'if ($files.Count -eq 0) { throw "No signable files found" }',
  '$invalid = $files | Where-Object { $signature = Get-AuthenticodeSignature -LiteralPath $_.FullName; $signature.Status -ne "Valid" -or $null -eq $signature.TimeStamperCertificate }',
  'if ($invalid.Count -ne 0) { throw ("Invalid Authenticode signatures: " + (($invalid | ForEach-Object FullName) -join ", ")) }',
].join('; ');

const ARCHIVE_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  '$source = $env:VN_PLAYER_WINDOWS_ARCHIVE_SOURCE',
  '$destination = $env:VN_PLAYER_WINDOWS_ARCHIVE_DESTINATION',
  'if ([string]::IsNullOrWhiteSpace($source) -or [string]::IsNullOrWhiteSpace($destination)) { throw "Missing archive path" }',
  'if (Test-Path -LiteralPath $destination) { throw "Archive destination already exists" }',
  'Compress-Archive -LiteralPath $source -DestinationPath $destination -CompressionLevel Optimal',
].join('; ');

const VERIFY_METADATA_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  '$root = $env:VN_PLAYER_WINDOWS_METADATA_ROOT',
  '$product = $env:VN_PLAYER_WINDOWS_METADATA_PRODUCT',
  '$version = $env:VN_PLAYER_WINDOWS_METADATA_VERSION',
  'if ([string]::IsNullOrWhiteSpace($root) -or [string]::IsNullOrWhiteSpace($product) -or [string]::IsNullOrWhiteSpace($version)) { throw "Missing packaged metadata input" }',
  '$executable = Join-Path -Path $root -ChildPath ($product + ".exe")',
  'if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw "Missing expected main executable" }',
  '$info = (Get-Item -LiteralPath $executable).VersionInfo',
  'if ($info.ProductName -cne $product) { throw "Windows ProductName mismatch" }',
  '$productVersion = $info.ProductVersion.Trim()',
  'if ($productVersion -cne $version -and $productVersion -cne ($version + ".0")) { throw "Windows ProductVersion mismatch" }',
].join('; ');

function fixedPowerShellInvocation(
  script,
  environment,
  command = 'powershell.exe',
) {
  return {
    command,
    args: [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script,
    ],
    environment,
  };
}

export function windowsSignatureVerificationInvocation(
  appRoot,
  parentEnvironment = process.env,
) {
  return fixedPowerShellInvocation(VERIFY_SIGNATURES_SCRIPT, {
    ...parentEnvironment,
    VN_PLAYER_WINDOWS_VERIFY_ROOT: appRoot,
  });
}

export function windowsArchiveInvocation(
  source,
  destination,
  parentEnvironment = process.env,
) {
  return fixedPowerShellInvocation(ARCHIVE_SCRIPT, {
    ...parentEnvironment,
    VN_PLAYER_WINDOWS_ARCHIVE_SOURCE: source,
    VN_PLAYER_WINDOWS_ARCHIVE_DESTINATION: destination,
  });
}

export function windowsStandardZipArchiveInvocation(
  source,
  destination,
  parentEnvironment = process.env,
) {
  return fixedPowerShellInvocation(
    ARCHIVE_SCRIPT,
    {
      ...parentEnvironment,
      VN_PLAYER_WINDOWS_ARCHIVE_SOURCE: source,
      VN_PLAYER_WINDOWS_ARCHIVE_DESTINATION: destination,
    },
    'pwsh.exe',
  );
}

export function windowsMetadataVerificationInvocation(
  appRoot,
  productName,
  version,
  parentEnvironment = process.env,
) {
  return fixedPowerShellInvocation(VERIFY_METADATA_SCRIPT, {
    ...parentEnvironment,
    VN_PLAYER_WINDOWS_METADATA_ROOT: appRoot,
    VN_PLAYER_WINDOWS_METADATA_PRODUCT: productName,
    VN_PLAYER_WINDOWS_METADATA_VERSION: version,
  });
}
