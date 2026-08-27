/**
 * English is the PRIMARY / SOURCE locale for the SHARED CORE dictionary (cross-cutting strings used
 * everywhere: common controls, native window captions, boundary error messages). Its shape is the
 * contract — `tr.ts` must match it exactly (enforced by the `Resources` type and the parity test).
 * Feature strings live with their owning package/extension (its own `src/i18n/`), not here.
 */
export const en = {
  common: {
    appName: 'Tepegöz',
    ok: 'OK',
    cancel: 'Cancel',
    retry: 'Retry',
    save: 'Save',
    settings: 'Settings',
    showPassword: 'Show',
    hidePassword: 'Hide',
    loading: 'Loading…',
  },
  window: {
    minimize: 'Minimize',
    maximize: 'Maximize',
    restore: 'Restore',
    close: 'Close',
  },
  /**
   * Permission Debug: what each Policy Kernel reason code MEANS, for the person it stopped.
   *
   * The codes are stable identifiers meant for the journal. Showing one to a user — `tainted_side_effect`
   * — tells them a rule fired and nothing about which rule, why, or what to do instead. Each entry
   * answers those three, in that order.
   */
  permissions: {
    trust_profile_trusted: {
      title: 'Allowed by your trust setting',
      why: "You marked this site as trusted, so ordinary changes here proceed without asking. Deleting, spending money, and anything driven by the page's own content still ask.",
      whatYouCanDo:
        "Change or remove this site's trust setting in Settings if you no longer want that.",
    },
    trust_profile_restricted: {
      title: 'Asking because you restricted this site',
      why: 'You marked this site as restricted, so you are asked about everything here — including reads that would normally go through silently.',
      whatYouCanDo:
        "Approve if you expected this. Change the site's setting in Settings to stop being asked.",
    },
    egress_possible_secret: {
      title: 'Confirm — this may contain a credential',
      why: 'Something in the request the agent is about to send off this device looks like an API key, token or private key. It may be a real secret, or page text the agent was asked to read that merely looks like one.',
      whatYouCanDo:
        'Check the flagged values below. If any of them is a real credential, decline — once sent, it is out of your control.',
    },
    read_allowed: {
      title: 'Allowed',
      why: 'This only reads the page — it changes nothing.',
      whatYouCanDo: 'No action needed.',
    },
    sensitive_site_read: {
      title: 'Confirm before reading',
      why: 'This site is treated as sensitive (banking, crypto, passwords or health), so even reading it is confirmed with you first.',
      whatYouCanDo:
        'Approve if you asked for this. If you did not, decline — the agent should not be on this site.',
    },
    sensitive_site_lockout: {
      title: 'Blocked on a sensitive site',
      why: 'The action would CHANGE something on a banking, crypto, password or health site. Those are locked to reading only, and no approval can unlock them here.',
      whatYouCanDo:
        'Do it yourself in the page. The lockout is deliberate and cannot be approved away.',
    },
    tab_egress_blocked_read: {
      title: 'Confirm — this tab cannot reach the network',
      why: "This tab's connection is currently blocked (a VPN/Tor tunnel dropped, or a network-leak check failed), so this read will not actually reach the page.",
      whatYouCanDo:
        'Approve if you want the agent to try anyway (it will simply fail), or wait for the connection to recover first.',
    },
    tab_egress_blocked: {
      title: 'Blocked — this tab cannot reach the network',
      why: "This tab's connection is currently blocked (a VPN/Tor tunnel dropped, or a network-leak check failed). The action is refused outright rather than asked about, because nothing would actually happen.",
      whatYouCanDo:
        'Check the connection in Settings → Network, or switch the tab to a working route, then try again.',
    },
    tainted_side_effect: {
      title: 'Confirm — instructions came from the page',
      why: 'The values for this action were taken from page content the agent read, so a page could have planted them. That is how prompt injection turns a read into an action.',
      whatYouCanDo:
        'Check the arguments below against what YOU asked for. If anything looks like it came from the page rather than from you, decline.',
    },
    state_change_confirm: {
      title: 'Confirm a change',
      why: 'This action changes something rather than just reading.',
      whatYouCanDo: 'Approve if it matches what you asked for.',
    },
    destructive_confirm: {
      title: 'Confirm — this deletes or overwrites',
      why: 'The action removes or replaces data, and cannot be undone by the agent.',
      whatYouCanDo: 'Read the target carefully before approving. There is no undo on this path.',
    },
    financial_confirm: {
      title: 'Confirm — this spends money',
      why: 'The action moves money or commits to a purchase.',
      whatYouCanDo: 'Check the amount and the recipient before approving.',
    },
    unknown_risk_confirm: {
      title: 'Confirm — risk not declared',
      why: 'This tool does not state how dangerous it is, so it is treated as if it were.',
      whatYouCanDo: 'Approve only if you recognise the tool and the arguments.',
    },
    code_exec_read_journaled: {
      title: 'Allowed and recorded',
      why: 'The agent ran code that only reads. It is written to the journal so you can review it afterwards.',
      whatYouCanDo: 'No action needed. The run appears in the journal.',
    },
    code_exec_write_disabled: {
      title: 'Blocked — writing code execution is off',
      why: 'Model-authored code that could write is disabled in this version, regardless of approval.',
      whatYouCanDo: 'Not available yet. Nothing you approve here will enable it.',
    },
  },
  errors: {
    translateNoLocalModel:
      'No on-device translation model is installed. Install one in Settings, or switch to a cloud provider.',
    translateNoCloudProvider:
      'No cloud AI provider key is configured. Add one in Settings → Providers.',
    localModelNotLoaded: 'That local model is not loaded. Load it and try again.',
    networkNoSuchConnection: 'That connection no longer exists.',
    networkChainLoop:
      'Those connections chain back into each other. Change one of their upstreams and try again.',
    networkSecretsUnavailable:
      'The OS keychain is unavailable, so a WireGuard profile cannot be stored safely.',
    networkBinaryNotFound:
      'That helper program was not found in the folder you picked. Pick the folder that directly contains the file.',
    networkTunnelFailed: 'The tunnel did not come up. Check the profile and try again.',
    badRequest: 'Invalid request',
    notFound: 'Not found',
    downloadNotFound: 'That download is no longer in the list.',
    downloadNotReleased: 'Open the download from the notification first — it is still quarantined.',
    downloadNotReadyToRelease: 'That download is not ready to be released yet.',
    downloadBlocked: 'That download was blocked by the trust policy.',
    downloadFileMissing: 'The downloaded file could not be found on disk.',
    downloadNoActivePage: 'Open a web page before starting a download.',
    downloadNotRetryable: 'Only a failed or canceled download can be retried.',
    uploadNotFound: 'That upload is no longer in the list.',
    uploadNoActivePage: 'Open a web page before starting an upload.',
    unsupportedCommand: 'That action is not supported here.',
    noApiKey: 'No API key configured. Add one in Settings → Providers.',
    unknownModel: 'That model is no longer available.',
    modelNotInstalled: 'That model is not installed yet.',
    modelDownloadFailed: 'The model could not be downloaded. Check your connection and try again.',
    inferenceUnavailable: 'On-device inference is not available on this machine.',
    imageTooLarge: 'That image is too large (8 MB maximum).',
    unsupportedImageType: 'That image format is not supported.',
    storageUnavailable: 'Storage is unavailable right now.',
    databaseUnavailable: 'The local database is unavailable right now.',
    extensionDisabled: 'That extension is disabled. Enable it in Extensions.',
    recordingInProgress: 'A recording is already in progress.',
    recordingSensitiveSite:
      'Recording is not allowed on sensitive sites (banking, crypto, passwords, health).',
    agentRunInProgress: 'An agent task is already running for this group.',
    dictionaryNotFound: 'That dictionary is no longer available.',
    dictionaryDownloadFailed: 'The dictionary could not be downloaded.',
    dictionaryChecksumMismatch: 'The downloaded dictionary failed its integrity check.',
    catalogEmpty: 'No built-in extensions could be loaded.',
    taskNotFound: 'That task no longer exists.',
    keyNotFound: 'That key no longer exists.',
    forbidden: 'Action blocked by policy',
    unauthorized: 'Authentication required',
    badState: 'Invalid state for this operation',
    upstreamDown: 'Service unavailable',
    renderFailure: 'Something went wrong — please restart the app',
  },
};

/** Shape contract derived from the English source (values widened to string). */
export type Resources = typeof en;
