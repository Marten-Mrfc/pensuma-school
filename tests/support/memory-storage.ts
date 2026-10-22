/**
 * In-memory Web Storage for client-logic tests (bun has no localStorage).
 *
 *   const storage = installMemoryStorage();
 *   afterEach(() => storage.restore());
 */
export class MemoryStorage implements Storage {
  #data = new Map<string, string>();

  get length(): number {
    return this.#data.size;
  }

  clear(): void {
    this.#data.clear();
  }

  getItem(key: string): string | null {
    return this.#data.has(key) ? (this.#data.get(key) as string) : null;
  }

  key(index: number): string | null {
    return [...this.#data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#data.set(key, String(value));
  }

  /** All keys (test convenience). */
  keys(): string[] {
    return [...this.#data.keys()];
  }
}

export type InstalledStorage = {
  localStorage: MemoryStorage;
  sessionStorage: MemoryStorage;
  restore: () => void;
};

/** Install fresh localStorage/sessionStorage on globalThis. */
export function installMemoryStorage(): InstalledStorage {
  const g = globalThis as Record<string, unknown>;
  const previous = {
    localStorage: Object.getOwnPropertyDescriptor(g, "localStorage"),
    sessionStorage: Object.getOwnPropertyDescriptor(g, "sessionStorage"),
  };
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  Object.defineProperty(g, "localStorage", {
    value: localStorage,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(g, "sessionStorage", {
    value: sessionStorage,
    configurable: true,
    writable: true,
  });
  return {
    localStorage,
    sessionStorage,
    restore() {
      for (const name of ["localStorage", "sessionStorage"] as const) {
        const descriptor = previous[name];
        if (descriptor) Object.defineProperty(g, name, descriptor);
        else delete g[name];
      }
    },
  };
}
