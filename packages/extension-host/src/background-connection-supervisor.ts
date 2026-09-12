/**
 * The `background-connection` permission (`@tepegoz/extension-sdk`) exists because an extension's
 * runtime used to be tied to a renderer surface being open — a mail/chat account needs to stay
 * connected (or on a defined reconnect/backoff schedule) with every surface closed, and drop cleanly
 * on disable, on profile switch, and on a kill-switch egress block. X-chat.1 built exactly that for
 * `com.tepegoz.chat`, but as bespoke wiring called directly from the desktop bootstrap
 * (`ChatMessenger.init/stop/reconcile/notifyEgressChange`) — a second consumer (`ext-mail`) would
 * duplicate the four call sites rather than reuse them. This is the promotion to a real shared
 * mechanism (the "background-connection supervisor" the shared prerequisite work owed).
 *
 * Deliberately thin: unlike {@link ExtensionCapabilitySupervisor}, this does not itself gate on
 * whether the extension is enabled — each provider already does that internally (`ChatService.start()`
 * checks its own extension preference before connecting any account), and duplicating that check here
 * would just be two places that could disagree. All this does is fan the four lifecycle calls out to
 * every registered provider, isolating one provider's failure from the others — a broken mail account
 * must never stop chat's from initializing, stopping, or reacting to a kill-switch flip, and vice
 * versa.
 */

export interface BackgroundConnectionProvider {
  extensionId: string;
  // Arrow-style (not method-shorthand) property signatures throughout — these are plain callbacks
  // handed in from elsewhere (e.g. `ChatMessenger`'s static methods) with no `this` of their own to
  // detach incorrectly, and method shorthand here would make every call site trip
  // `@typescript-eslint/unbound-method` for no real benefit.
  /** Build/connect this extension's enabled background connections. Idempotent — may be called
   *  again as a no-op (`ChatMessenger.init()` already is). */
  init: () => Promise<void>;
  /** Drop every connection (app quit, profile switch). Idempotent. */
  stop: () => Promise<void>;
  /** Re-read the extension's enabled state and reconcile connections to match (call after a
   *  prefs/extensions change). */
  reconcile: () => Promise<void>;
  /** The egress picture changed (a General binding came up/down, a kill switch flipped) —
   *  re-evaluate every live connection's ability to reach the network. Synchronous: no connection
   *  attempt belongs on this path, only a policy re-check. */
  notifyEgressChange: () => void;
}

export interface BackgroundConnectionSupervisorDeps {
  log?: (msg: string, meta?: Record<string, unknown>) => void;
}

export class BackgroundConnectionSupervisor {
  private readonly providers: BackgroundConnectionProvider[] = [];

  constructor(private readonly deps: BackgroundConnectionSupervisorDeps = {}) {}

  /** Register an extension's background-connection provider. Call once, at startup, before the
   *  lifecycle methods below are ever invoked. */
  provide(provider: BackgroundConnectionProvider): void {
    this.providers.push(provider);
  }

  private async fanOut(phase: 'init' | 'stop' | 'reconcile'): Promise<void> {
    await Promise.all(
      this.providers.map(async (p) => {
        try {
          await p[phase]();
        } catch (err) {
          this.deps.log?.(`background-connection ${phase} failed`, {
            ext: p.extensionId,
            err: String(err),
          });
        }
      }),
    );
  }

  init(): Promise<void> {
    return this.fanOut('init');
  }

  stop(): Promise<void> {
    return this.fanOut('stop');
  }

  reconcile(): Promise<void> {
    return this.fanOut('reconcile');
  }

  notifyEgressChange(): void {
    for (const p of this.providers) {
      try {
        p.notifyEgressChange();
      } catch (err) {
        this.deps.log?.('background-connection notifyEgressChange failed', {
          ext: p.extensionId,
          err: String(err),
        });
      }
    }
  }

  /** Registered extension ids (status / tests). */
  providerIds(): string[] {
    return this.providers.map((p) => p.extensionId);
  }
}
