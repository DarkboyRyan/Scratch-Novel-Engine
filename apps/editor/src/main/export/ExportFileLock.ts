import { execFile, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import {
  lstat,
  open,
  unlink,
  type FileHandle,
} from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_OPEN_ATTEMPTS = 4;
const LEGACY_OWNER_CHECK_ATTEMPTS = 4;
const LEGACY_OWNER_CHECK_DELAY_MS = 25;

export type ExportFileLockLease = {
  assertOwned: () => Promise<void>;
  release: () => Promise<void>;
};

type OpenedLockCarrier = {
  file: FileHandle;
  identity: Stats;
  created: boolean;
};

function errnoCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

function sameIdentity(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function ownedByCurrentUser(status: Stats): boolean {
  return typeof process.getuid !== 'function' || status.uid === process.getuid();
}

function safeCarrierStatus(status: Stats): boolean {
  return (
    status.isFile() &&
    status.nlink === 1 &&
    status.size === 0 &&
    (process.platform === 'win32' || (status.mode & 0o022) === 0) &&
    ownedByCurrentUser(status)
  );
}

async function openLockCarrier(
  lockPath: string,
  busyMessage: string,
): Promise<OpenedLockCarrier> {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  for (let attempt = 0; attempt < MAX_OPEN_ATTEMPTS; attempt += 1) {
    let file: FileHandle | null = null;
    let created = false;
    try {
      try {
        file = await open(
          lockPath,
          constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | noFollow,
          0o600,
        );
        created = true;
      } catch (error) {
        if (errnoCode(error) !== 'EEXIST') {
          throw error;
        }
        file = await open(lockPath, constants.O_RDWR | noFollow);
      }

      const opened = await file.stat();
      const current = await lstat(lockPath);
      if (
        !safeCarrierStatus(opened) ||
        !safeCarrierStatus(current) ||
        !sameIdentity(opened, current)
      ) {
        throw new Error(busyMessage);
      }
      return { file, identity: opened, created };
    } catch (error) {
      await file?.close().catch(() => undefined);
      if (errnoCode(error) === 'ENOENT' && attempt + 1 < MAX_OPEN_ATTEMPTS) {
        continue;
      }
      if (
        errnoCode(error) === 'ELOOP' ||
        errnoCode(error) === 'EISDIR' ||
        errnoCode(error) === 'EMLINK'
      ) {
        throw new Error(busyMessage);
      }
      throw error;
    }
  }
  throw new Error(busyMessage);
}

type KernelLockLease = {
  assertOwned: () => Promise<void>;
  release: () => Promise<void>;
};

function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

async function acquireWindowsNamedPipeLock(
  lockIdentity: Stats,
  busyMessage: string,
): Promise<KernelLockLease> {
  const lockId = createHash('sha256')
    .update(`${String(lockIdentity.dev)}:${String(lockIdentity.ino)}`, 'utf8')
    .digest('hex');
  const pipeName = `\\\\.\\pipe\\vn-engine-export-${lockId}`;
  const server = createServer((socket) => {
    socket.destroy();
  });
  let runtimeError = false;
  await new Promise<void>((resolve, reject) => {
    const handleError = (error: NodeJS.ErrnoException) => {
      server.removeListener('listening', handleListening);
      reject(error.code === 'EADDRINUSE' ? new Error(busyMessage) : error);
    };
    const handleListening = () => {
      server.removeListener('error', handleError);
      server.on('error', () => {
        runtimeError = true;
      });
      resolve();
    };
    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(pipeName);
  });
  server.unref();
  return {
    assertOwned: async () => {
      if (!server.listening || runtimeError) {
        throw new Error(busyMessage);
      }
    },
    release: () => closeServer(server),
  };
}

async function acquireKernelLock(
  file: FileHandle,
  busyMessage: string,
): Promise<KernelLockLease> {
  if (process.platform === 'win32') {
    return acquireWindowsNamedPipeLock(await file.stat(), busyMessage);
  }
  const command = process.platform === 'darwin'
    ? { executable: '/usr/bin/lockf', arguments: ['-s', '-t', '0', '3'], busy: 75 }
    : process.platform === 'linux'
      ? { executable: '/usr/bin/flock', arguments: ['-n', '3'], busy: 1 }
      : null;
  if (command === null) {
    throw new Error('当前平台尚未提供可安全恢复的导出进程锁');
  }
  const result = spawnSync(command.executable, command.arguments, {
    stdio: ['ignore', 'ignore', 'pipe', file.fd],
    encoding: 'utf8',
  });
  if (result.status === 0) {
    return {
      assertOwned: async () => undefined,
      release: async () => undefined,
    };
  }
  if (result.status === command.busy) {
    throw new Error(busyMessage);
  }
  if (result.error) {
    throw result.error;
  }
  throw new Error(
    `操作系统导出锁失败（status=${String(result.status)}）：${result.stderr.trim()}`,
  );
}

type OpenDescriptor = {
  pid: number;
  fd: number;
};

function parseLsofDescriptors(output: string): OpenDescriptor[] {
  const descriptors: OpenDescriptor[] = [];
  let currentPid: number | null = null;
  for (const rawField of output.split('\0')) {
    const field = rawField.replace(/^\n+/u, '');
    if (field.length === 0) {
      continue;
    }
    if (field.startsWith('p') && /^p\d+$/u.test(field)) {
      currentPid = Number(field.slice(1));
      continue;
    }
    if (field.startsWith('f') && /^f\d+/u.test(field) && currentPid !== null) {
      const match = /^f(\d+)/u.exec(field);
      if (match) {
        descriptors.push({ pid: currentPid, fd: Number(match[1]) });
      }
      continue;
    }
    throw new Error('无法确认旧版导出锁的持有进程');
  }
  return descriptors;
}

async function assertNoLegacyOwner(
  lockPath: string,
  ownFileDescriptor: number,
  busyMessage: string,
): Promise<void> {
  if (process.platform !== 'darwin') {
    return;
  }
  for (let attempt = 0; attempt < LEGACY_OWNER_CHECK_ATTEMPTS; attempt += 1) {
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync(
        '/usr/sbin/lsof',
        ['-F0pf', '--', lockPath],
        { encoding: 'utf8', maxBuffer: 64 * 1024 },
      ));
    } catch {
      throw new Error(busyMessage);
    }
    const descriptors = parseLsofDescriptors(stdout);
    const ownsExpectedDescriptor = descriptors.some(
      ({ pid, fd }) => pid === process.pid && fd === ownFileDescriptor,
    );
    const hasOtherDescriptor = descriptors.some(
      ({ pid, fd }) => pid !== process.pid || fd !== ownFileDescriptor,
    );
    if (ownsExpectedDescriptor && !hasOtherDescriptor) {
      return;
    }
    if (attempt + 1 < LEGACY_OWNER_CHECK_ATTEMPTS) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, LEGACY_OWNER_CHECK_DELAY_MS);
      });
    }
  }
  throw new Error(busyMessage);
}

export async function acquireExportFileLock(
  lockPath: string,
  busyMessage: string,
): Promise<ExportFileLockLease> {
  const opened = await openLockCarrier(lockPath, busyMessage);
  let ownsLock = false;
  let kernelLock: KernelLockLease | null = null;
  try {
    kernelLock = await acquireKernelLock(opened.file, busyMessage);
    ownsLock = true;
    const [held, current] = await Promise.all([
      opened.file.stat(),
      lstat(lockPath),
    ]);
    if (
      !safeCarrierStatus(held) ||
      !safeCarrierStatus(current) ||
      !sameIdentity(opened.identity, held) ||
      !sameIdentity(opened.identity, current)
    ) {
      throw new Error(busyMessage);
    }
    if (!opened.created) {
      await assertNoLegacyOwner(lockPath, opened.file.fd, busyMessage);
    }
  } catch (error) {
    await opened.file.close().catch(() => undefined);
    await kernelLock?.release().catch(() => undefined);
    throw error;
  }

  let released = false;
  const assertIdentityOwned = async () => {
    await kernelLock?.assertOwned();
    const [held, current] = await Promise.all([
      opened.file.stat(),
      lstat(lockPath),
    ]);
    if (
      !safeCarrierStatus(held) ||
      !safeCarrierStatus(current) ||
      !sameIdentity(opened.identity, held) ||
      !sameIdentity(opened.identity, current)
    ) {
      throw new Error(busyMessage);
    }
  };
  const assertOwned = async () => {
    if (released || !ownsLock) {
      throw new Error(busyMessage);
    }
    await assertIdentityOwned();
  };
  return {
    assertOwned,
    release: async () => {
      if (released) {
        return;
      }
      released = true;
      try {
        if (ownsLock) {
          const stillOwned = await assertIdentityOwned().then(
            () => true,
            () => false,
          );
          if (stillOwned) {
            await unlink(lockPath).catch(() => undefined);
          }
        }
      } finally {
        ownsLock = false;
        await opened.file.close().catch(() => undefined);
        await kernelLock?.release().catch(() => undefined);
        kernelLock = null;
      }
    },
  };
}
