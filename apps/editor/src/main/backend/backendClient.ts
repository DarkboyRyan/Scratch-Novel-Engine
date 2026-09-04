// 主要作用：管理 Editor 到 C++ JSONL 后端的单窗口请求会话。
// 关键实现：BackendClient 启停子进程、关联请求响应并处理超时和崩溃。
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { createInterface, type Interface } from 'node:readline';

import type {
  BackendInvocation,
  BackendRequest,
  BackendResponse,
  EngineMutationResult,
} from '../../shared/engineProtocol';
import {
  assertBackendIsExecutable,
  resolveBackendPath,
} from './backendPath';
import {
  formatBackendError,
  parseBackendResponse,
} from './backendResponse';

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export function backendRequestTimeoutMs(
  invocation: BackendInvocation,
): number | null {
  // These operations may still finish in C++ after an application-level
  // timeout and mutate authoritative project or disk state. Keep the request
  // pending until C++ answers (or the window closes and shuts the process
  // down), so Main never reports failure while a hidden commit is still able
  // to arrive later.
  if (
    invocation.method === 'asset.import' ||
    invocation.method === 'asset.rename' ||
    invocation.method === 'asset.deleteMany' ||
    invocation.method === 'project.open' ||
    invocation.method === 'project.save' ||
    invocation.method === 'scene.content.replace'
  ) {
    return null;
  }

  return DEFAULT_REQUEST_TIMEOUT_MS;
}

type PendingRequest = {
  resolve: (result: EngineMutationResult) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout> | null;
};

function clearRequestTimeout(
  timeout: PendingRequest['timeout'],
): void {
  if (timeout !== null) {
    clearTimeout(timeout);
  }
}

function responseIdFromMalformedLine(line: string): number | null {
  try {
    const value = JSON.parse(line) as unknown;
    if (
      typeof value === 'object' &&
      value !== null &&
      Number.isInteger((value as { id?: unknown }).id)
    ) {
      return (value as { id: number }).id;
    }
  } catch {
    // parseBackendResponse reports the detailed protocol error. This helper
    // only tries to associate that malformed response with a pending request.
  }

  return null;
}

export class BackendClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private lineReader: Interface | null = null;
  private starting: Promise<ChildProcessWithoutNullStreams> | null = null;
  private nextRequestId = 1;
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private disposed = false;

  async request(
    invocation: BackendInvocation,
  ): Promise<EngineMutationResult> {
    const child = await this.ensureProcess();
    const id = this.nextRequestId;
    this.nextRequestId += 1;

    const request: BackendRequest = {
      ...invocation,
      id,
    };

    return new Promise<EngineMutationResult>((resolve, reject) => {
      const timeoutMs = backendRequestTimeoutMs(invocation);
      const timeout =
        timeoutMs === null
          ? null
          : setTimeout(() => {
              this.pendingRequests.delete(id);
              reject(
                new Error(
                  `C++ 后端请求超时：${invocation.method} (${id})`,
                ),
              );
            }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      child.stdin.write(`${JSON.stringify(request)}\n`, (error) => {
        if (!error) {
          return;
        }

        const pendingRequest = this.pendingRequests.get(id);

        if (!pendingRequest) {
          return;
        }

        clearRequestTimeout(pendingRequest.timeout);
        this.pendingRequests.delete(id);
        pendingRequest.reject(
          new Error(`无法向 C++ 后端发送请求：${error.message}`),
        );
      });
    });
  }

  shutdown(): void {
    this.disposed = true;
    this.rejectAllPending(new Error('编辑器正在关闭，后端请求已取消'));
    this.lineReader?.close();
    this.lineReader = null;

    if (this.child && !this.child.killed) {
      this.child.kill();
    }

    this.child = null;
  }

  private ensureProcess(): Promise<ChildProcessWithoutNullStreams> {
    if (this.disposed) {
      return Promise.reject(new Error('C++ 后端客户端已经关闭'));
    }

    if (this.child && !this.child.killed) {
      return Promise.resolve(this.child);
    }

    if (this.starting) {
      return this.starting;
    }

    const backendPath = resolveBackendPath();
    assertBackendIsExecutable(backendPath);

    this.starting = new Promise<ChildProcessWithoutNullStreams>(
      (resolve, reject) => {
        const child = spawn(backendPath, [], {
          cwd: path.dirname(backendPath),
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });
        let didSpawn = false;

        this.child = child;
        this.lineReader = createInterface({ input: child.stdout });
        this.lineReader.on('line', (line) => {
          this.handleLine(line);
        });

        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk: string) => {
          const message = chunk.trimEnd();

          if (message) {
            console.error(`[vn-engine] ${message}`);
          }
        });

        child.once('spawn', () => {
          didSpawn = true;
          resolve(child);
        });

        child.on('error', (error) => {
          if (!didSpawn) {
            reject(
              new Error(
                `无法启动 C++ 后端 ${backendPath}：${error.message}`,
              ),
            );
          }

          this.handleProcessEnd(child, error);
        });

        child.on('exit', (code, signal) => {
          const reason = signal
            ? `收到信号 ${signal}`
            : `退出码 ${code ?? '未知'}`;
          this.handleProcessEnd(
            child,
            new Error(`C++ 后端已退出（${reason}）`),
          );
        });
      },
    ).finally(() => {
      this.starting = null;
    });

    return this.starting;
  }

  private handleLine(line: string): void {
    if (!line.trim()) {
      return;
    }

    let response: BackendResponse;

    try {
      response = parseBackendResponse(line);
    } catch (error) {
      console.error(error);

      const responseId = responseIdFromMalformedLine(line);
      if (responseId === null) {
        this.rejectAllPending(
          new Error('C++ 后端输出无法关联到请求，协议连接已失去同步'),
        );
        return;
      }

      const pendingRequest =
        this.pendingRequests.get(responseId);
      if (pendingRequest) {
        clearRequestTimeout(pendingRequest.timeout);
        this.pendingRequests.delete(responseId);
        pendingRequest.reject(
          new Error(`C++ 后端响应格式不正确（请求 ${responseId}）`),
        );
      }
      return;
    }

    const pendingRequest = this.pendingRequests.get(response.id);

    if (!pendingRequest) {
      console.warn(`收到未知请求 ID 的 C++ 响应：${response.id}`);
      return;
    }

    clearRequestTimeout(pendingRequest.timeout);
    this.pendingRequests.delete(response.id);

    if (response.ok === true) {
      pendingRequest.resolve(response.result);
    } else {
      pendingRequest.reject(formatBackendError(response));
    }
  }

  private handleProcessEnd(
    child: ChildProcessWithoutNullStreams,
    error: Error,
  ): void {
    if (this.child !== child) {
      return;
    }

    this.lineReader?.close();
    this.lineReader = null;
    this.child = null;
    this.rejectAllPending(error);
  }

  private rejectAllPending(error: Error): void {
    for (const pendingRequest of this.pendingRequests.values()) {
      clearRequestTimeout(pendingRequest.timeout);
      pendingRequest.reject(error);
    }

    this.pendingRequests.clear();
  }
}
