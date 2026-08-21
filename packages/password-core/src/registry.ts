import type { LoginCredential, LoginCredentialMeta, PasswordProvider } from './types';
import { normalizeOrigin } from './origin';

/**
 * Central registry for password providers. Register providers at startup; the registry aggregates
 * `findByUrl` across all of them so autofill and UI never need to know which provider owns a
 * credential. Adding a new provider (Bitwarden, 1Password…) is a single `register()` call.
 */
export class PasswordProviderRegistry {
  private static providers = new Map<string, PasswordProvider>();

  static register(provider: PasswordProvider): void {
    PasswordProviderRegistry.providers.set(provider.id, provider);
  }

  static get(id: string): PasswordProvider | undefined {
    return PasswordProviderRegistry.providers.get(id);
  }

  static list(): PasswordProvider[] {
    return [...PasswordProviderRegistry.providers.values()];
  }

  /** Aggregate credentials matching the URL across all registered providers. */
  static async findByUrl(url: string): Promise<LoginCredential[]> {
    const origin = normalizeOrigin(url);
    const results = await Promise.all(
      [...PasswordProviderRegistry.providers.values()].map((p) => p.findByUrl(origin)),
    );
    return results.flat();
  }

  /** Aggregate metadata list across all registered providers. */
  static async list_all(): Promise<LoginCredentialMeta[]> {
    const results = await Promise.all(
      [...PasswordProviderRegistry.providers.values()].map((p) => p.list()),
    );
    return results.flat();
  }

  /** Test seam. */
  static reset(): void {
    PasswordProviderRegistry.providers.clear();
  }
}
