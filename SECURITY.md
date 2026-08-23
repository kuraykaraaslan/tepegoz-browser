# Security policy

Tepegöz is an **agentic browser**: it renders untrusted web content, and it lets a language model take
real actions on the pages you are logged into. That combination means a vulnerability here can cost a
user money, credentials, or data — not just a crash. Security reports are the most valuable
contribution this project can receive, and they are treated accordingly.

The design this policy defends is written down in [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md). Read
it before reporting: it states what is already known to be untrusted, what is deliberately fail-closed,
and what is a documented gap rather than a discovery.

## Supported versions

**None yet.** Tepegöz is pre-release: there is no tagged stable version, no published installer, and no
update channel. Only the `main` branch is supported, and fixes land there.

Builds you produce yourself are **unsigned** — code signing is not configured (tracked in
[`docs/known-issues.md`](docs/known-issues.md) as blocking for release). Treat any binary you build as a
development artifact.

## Reporting a vulnerability

**Do not open a public issue for a security problem.** Use one of:

1. **GitHub private vulnerability reporting** — the _Security_ tab → _Report a vulnerability_ on
   https://github.com/kuraykaraaslan/tepegoz-browser. This is the preferred channel; it keeps the
   report, the discussion, and the fix in one private place.
2. **Email** — <kuraykaraaslan@gmail.com>, subject line starting with `[tepegoz-security]`.

Please include: the version or commit SHA, your OS, what an attacker gains, and the smallest
reproduction you can manage — a page fixture, a scripted agent goal, or a sequence of IPC calls is far
more useful than a description. If a proof-of-concept page is easier to attach than to describe, note
that this repository already carries hostile fixtures under [`test-fixtures/sites/`](test-fixtures/sites/)
and yours can follow the same shape.

### What to expect

This is a **single-maintainer project**, so the honest commitments are modest and real rather than
generous and unmet:

| Stage                          | Target                                                       |
| ------------------------------ | ------------------------------------------------------------ |
| Acknowledgement of your report | within **5 days**                                            |
| Initial assessment             | within **14 days** — severity, whether it reproduces, a plan |
| Fix on `main`                  | best effort, tracked publicly once a fix exists              |

There is **no bug bounty** and no monetary reward. Credit is given in the release notes and the fixing
commit unless you ask to stay anonymous.

### Disclosure

Coordinated. Please give the fix a reasonable window before publishing — **90 days** is the default, and
shorter is fine by mutual agreement for a low-severity issue or one already public elsewhere. If a
report goes unanswered past the targets above, you are free to disclose; silence is not a veto.

## Scope

### In scope — please report

- **Security-kernel bypass.** A tool call that reaches execution without the Policy Kernel classifying
  it, an autonomy level enforced only in the renderer, or a destructive/financial step that skips its
  human confirmation.
- **Egress firewall bypass.** Getting a secret, a credential, or page content out to an attacker-chosen
  destination — including via a channel the firewall does not inspect.
- **Prompt injection that becomes an action.** Page content that steers the agent into a real
  state-changing operation. Injection that only pollutes the model's _text output_ is a weaker finding
  but still worth reporting; injection that gets a form submitted or a credential filled is a serious one.
- **Electron/IPC boundary escapes.** Renderer→main privilege escalation, an IPC channel accepting
  unvalidated payloads, a missing zod boundary, `contextIsolation`/`sandbox` weakening, or a window
  created outside the single `createWindow()` factory.
- **Credential and secret exposure.** Anything that moves a stored API key or vault secret out of the
  main process, into a log, into the renderer, or into a model prompt.
- **Sensitive-site lockout bypass.** Driving automation on a site class that is supposed to be blocked
  from it (banking, crypto, health, password managers).
- **Network-scope leaks.** Traffic escaping an assigned VPN/Tor binding, or a fail-open path where the
  design promises fail-closed.
- **Supply chain.** A dependency or build step that could inject code into a produced binary.

### Out of scope — already known or not a vulnerability

- **Unsigned builds** and the absence of an update channel — known, documented, blocking for release.
- **Relaxed CSP in development mode** — known and documented in
  [`docs/known-issues.md`](docs/known-issues.md); the production path is what matters.
- **Capabilities that ship deliberately inert.** Several agent capabilities are wired but disabled on
  purpose. Their being unreachable is the intended state, not a bug.
- **Findings that require an already-compromised machine** — malware with your user account's
  privileges can read the profile directory. `safeStorage` is scoped to protect against other users and
  offline disk access, not against code running as you.
- **Missing hardening with no demonstrated impact** — a header, flag, or version number in isolation.
  Show what an attacker gets.
- **Automated scanner output** pasted without a working reproduction.
- **Anything in the roadmap that does not exist yet.** [`phases/`](phases/) describes intent; the
  absence of an unbuilt defense is a gap, not a vulnerability. If you are unsure whether something is
  built, ask — that question is welcome.

## Safe harbor

Research conducted in good faith under this policy is authorized, and this project will not pursue or
support legal action against you for it. Please stay within it: test against **your own** instance and
your own accounts, do not access, modify, or exfiltrate other people's data, do not degrade a service
you do not own, and stop at the point where you have proven the issue rather than exploiting it further.

Third-party services reached through Tepegöz (AI providers, websites you automate) are **not** covered
here — their own policies govern testing against them.
