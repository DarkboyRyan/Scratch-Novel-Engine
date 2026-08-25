import {
  createDefaultEditorSettings,
  isEditorSettings,
  isEditorSettingsPatch,
  type EditorSettings,
  type EditorSettingsPatch,
  type EditorSettingsReadResult,
  type EditorSettingsWriteResult,
} from '../../shared/editorSettingsProtocol';
type EditorSettingsStorage = {
  load(): Promise<EditorSettings>;
  write(settings: EditorSettings): Promise<EditorSettings>;
};

type EditorSettingsListener = (settings: EditorSettings) => void;

function cloneSettings(settings: EditorSettings): EditorSettings {
  return { ...settings };
}

export class EditorSettingsManager {
  private current = createDefaultEditorSettings();
  private initialization: Promise<void> | null = null;
  private initialized = false;
  private operationQueue: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<EditorSettingsListener>();

  constructor(
    private readonly store: EditorSettingsStorage,
    private readonly reportError: (
      operation: 'load' | 'write' | 'notify',
      error: unknown,
    ) => void = () => {},
  ) {}

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialization ??= (async () => {
      try {
        this.current = await this.store.load();
      } catch (error) {
        this.reportError('load', error);
        this.current = createDefaultEditorSettings();
      }
      this.initialized = true;
    })();
    await this.initialization;
  }

  get language(): EditorSettings['language'] {
    return this.current.language;
  }

  subscribe(listener: EditorSettingsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async getSettings(): Promise<EditorSettingsReadResult> {
    await this.initialize();
    return this.runExclusive(async () => ({
      status: 'ready',
      settings: cloneSettings(this.current),
    }));
  }

  async updateSettings(
    patch: EditorSettingsPatch,
  ): Promise<EditorSettingsWriteResult> {
    await this.initialize();
    return this.runExclusive(async () => {
      if (!isEditorSettingsPatch(patch)) {
        return { status: 'rejected', error: 'settings-invalid' };
      }
      const candidate: EditorSettings = { ...this.current, ...patch };
      if (!isEditorSettings(candidate)) {
        return { status: 'rejected', error: 'settings-invalid' };
      }
      let persisted: EditorSettings;
      try {
        persisted = await this.store.write(candidate);
      } catch (error) {
        this.reportError('write', error);
        return { status: 'rejected', error: 'settings-storage-unavailable' };
      }
      this.current = persisted;
      const snapshot = cloneSettings(this.current);
      for (const listener of this.listeners) {
        try {
          listener(cloneSettings(snapshot));
        } catch (error) {
          this.reportError('notify', error);
        }
      }
      return { status: 'updated', settings: snapshot };
    });
  }

  private runExclusive<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
