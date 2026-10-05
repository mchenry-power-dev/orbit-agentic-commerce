import type { AppState } from "../domain";
import type { StudioState } from "../domain/studio";

export interface StudioPersistence {
  load(): Promise<StudioState | undefined>;
  save(state: StudioState): Promise<void>;
  legacy(): Promise<AppState | undefined>;
}
export class StudioMemoryPersistence implements StudioPersistence {
  constructor(
    private value?: StudioState,
    private legacyValue?: AppState,
  ) {}
  async load() {
    return this.value && structuredClone(this.value);
  }
  async save(state: StudioState) {
    this.value = structuredClone(state);
  }
  async legacy() {
    return this.legacyValue && structuredClone(this.legacyValue);
  }
}
/** V2 uses a new record in the original database; the V1 app record is retained verbatim. */
export class StudioIndexedDbPersistence implements StudioPersistence {
  private database?: Promise<IDBDatabase>;
  private temporary?: StudioMemoryPersistence;
  /** Explicit opt-in only; leaves every existing IndexedDB record untouched. */
  useTemporaryWorkspace() {
    this.temporary = new StudioMemoryPersistence();
  }
  constructor(private name = "orbit-studio-public-v1") {}
  private open() {
    return (this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("state"))
          request.result.createObjectStore("state");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(new Error("Unable to open local storage."));
    }));
  }
  private async read<T>(key: string): Promise<T | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db
        .transaction("state", "readonly")
        .objectStore("state")
        .get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("Unable to read local work."));
    });
  }
  load() {
    if (this.temporary) return this.temporary.load();
    return this.read<StudioState>("studio-v2");
  }
  legacy() {
    if (this.temporary) return this.temporary.legacy();
    return this.read<AppState>("app");
  }
  async save(state: StudioState) {
    if (this.temporary) return this.temporary.save(state);
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction("state", "readwrite");
      tx.objectStore("state").put(structuredClone(state), "studio-v2");
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(new Error("Local save failed. Keep this tab open and retry."));
      tx.onabort = () => reject(new Error("Local save was interrupted."));
    });
  }
}
