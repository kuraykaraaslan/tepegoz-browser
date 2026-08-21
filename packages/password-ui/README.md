# @tepegoz/password-ui

Presentational leaf: the password-manager feature-page UI — three independent pieces rather than
one shell, each owning its own local UI state (search/form/import-export) but no persistence logic
of its own. `CredentialsSettings` is the saved-credentials list (search, add/edit form, delete);
`ImportExportPanel` is the CSV drag-and-drop import + Google-CSV export control; `AutofillSuggestion`
is the in-page autofill dropdown shown over a matched login field. Data reads/writes are injected as
async callbacks and typed against `@tepegoz/desktop-ipc`'s `LoginCredentialMeta`/`LoginImportResult`,
so the package has no direct dependency on the Electron bridge itself. It owns its own i18n
dictionary (`useT(passwordUiDict)`) and does not depend on `@tepegoz/ui` — its inputs/buttons use
local Tailwind token classes that mirror the shared atoms rather than importing them.

## Exports

- **`CredentialsSettings`** — the saved-credentials list + add/edit form + delete, for the settings
  page.
- **`ImportExportPanel`** — CSV import (drag-drop or file picker) and Google-CSV export.
- **`AutofillSuggestion`** — the autofill match dropdown shown near a detected login field.
- **`CredentialsSettingsProps`**, **`ImportExportPanelProps`**, **`AutofillSuggestionProps`** — each
  component's injected-props contract.
- **`passwordUiDict`** — the package's own i18n dictionary.

## Usage

```tsx
<CredentialsSettings
  credentials={credentials}
  onAdd={(c) => window.tepegoz.passwords.add(c)}
  onRemove={(id) => window.tepegoz.passwords.remove(id)}
/>

<ImportExportPanel
  onImport={(data, format) => window.tepegoz.passwords.import(data, format)}
  onExport={(format) => window.tepegoz.passwords.export(format)}
/>

<AutofillSuggestion
  url={activeTab.url}
  matches={matches}
  onFill={(id) => fillCredential(id)}
  onDismiss={() => dismissSuggestion()}
/>
```

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
