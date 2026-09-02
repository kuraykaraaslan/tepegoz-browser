# downloads — CHECKLIST

> **Reviewed against the code 2026-09-02** (was: "yalnızca README okunarak üretildi"). Each line now
> carries the symbol or file that satisfies it, or an honest note where the shipped design differs.
> Headless browser-download domain package: preload-safe public types, pure reducer/selectors, and the
> trust/risk helpers. Electron, filesystem paths, quarantine moves and IPC stay in the desktop host
> (`apps/desktop/src/main/downloads/*`).

## Kesinlikle olmalı
- [x] Paket headless olmalı — Electron, filesystem ve IPC içermemeli
      — _grep over `src/*.ts` (tests aside): no `electron`, no `node:fs`/`node:path`, no
      `ipcMain`/`ipcRenderer`. `index.ts` imports nothing at all; `schemas.ts` imports only `zod` +
      `./index`. The `net.request`-shaped transport in `segmented-transfer.ts` is an injected
      interface, not an implementation._
- [x] Preload-safe public download tiplerinin sahibi olmalı
      — _`DownloadRecord`, `DownloadProvenance`, `DownloadStatus`, `DownloadRisk`,
      `DownloadTrustVerdict`, `DownloadsState`, `DownloadCommandInput` in `index.ts`, dependency-free._
- [x] Download state için bir reducer sağlamalı
      — _`upsertDownload` / `patchDownload` / `removeDownload` / `clearInactiveDownloads` over
      `DownloadsState`. Not a single `reduce(state, action)`; the transitions are named functions,
      which is the shape the desktop store and the UI both consume._
- [x] Download state üzerinde selector'lar sağlamalı
      — _`getDownload`, `activeDownloads`, `isTerminalDownloadStatus`, plus `computeDownloadRate` /
      `downloadsToForget` as derived views._
- [x] Trust/risk yardımcıları sağlamalı — bir indirmenin riskli olup olmadığını belirlemeli
      — _`classifyDownloadRisk(filename, mimeType)` → `normal|archive|script|executable`;
      `releaseNeedsApproval`, `commandNeedsApproval`, `archiveContentsUnverified`._
- [x] Public tipler preload'da güvenle import edilebilmeli (bağımlılıksız)
      — _the `.` entry is `index.ts`; zero imports, so a preload bundle pulls in no runtime._
- [x] Reducer indirme yaşam döngüsü olaylarını işlemeli (başladı, ilerliyor, tamamlandı, hata, iptal)
      — _`DOWNLOAD_STATUSES` covers requested → in_progress → paused → quarantined →
      completed/blocked/canceled/failed; `patchDownload` applies any transition and no-ops a missing
      id. `downloads.test.ts` "upserts and patches records without mutating state"._
- [x] Filesystem path'leri, quarantine taşımaları ve IPC bu pakette değil host'ta olmalı
      — _`download-service-lifecycle.electron.ts` (quarantine dir, `sha256File`, `finishToQuarantine`)
      and `ipc-downloads.ts` in `apps/desktop`; nothing of the kind here._
- [x] Trust/risk sınıflandırması host'un quarantine kararına girdi olabilmeli
      — _the host's `DownloadTrustProvider.check()` is fed `classifyDownloadRisk`'s output and the
      record's origin; `releaseNeedsApproval` gates the HITL release._
- [x] Public tipler tek şema kaynağından türemeli / dışa aktarılmalı
      — _the enums ARE derived: `schemas.ts` does `z.enum(DOWNLOAD_STATUSES)` etc. over the const
      arrays in `index.ts`. **Caveat, stated:** `DownloadRecord` (interface) and `DownloadRecordSchema`
      (zod) are maintained side by side rather than one `z.infer`'d from the other — a deliberate split
      so the preload-safe type carries no zod, with the package owning both halves._

## Olsa iyi olur
- [x] Selector'lar aktif / tamamlanmış / başarısız indirmeleri ayırabilmeli
      — _`activeDownloads` (requested/in_progress/paused/quarantined) vs `isTerminalDownloadStatus`
      (completed/blocked/canceled/failed); `status === 'failed'` isolates the failed set._
- [x] Risk helper'ı dosya uzantısı / MIME'e göre tehlikeli türleri işaretlemeli
      — _`classifyDownloadRisk` checks the extension first, then `mimeEssence` against the
      executable/script MIME sets. `downloads.test.ts` "classifies by MIME essence when the extension
      is missing or a decoy"._
- [x] Reducer saf olmalı (yan etkisiz); aynı girdi → aynı çıktı
      — _every function returns a fresh object/array and touches no outside state; asserted "without
      mutating state"._
- [x] İlerleme yüzdesi / kalan süre selector ile türetilebilmeli
      — _`computeDownloadRate(samples, totalBytes)` → `bytesPerSecond` + `etaSeconds`; percentage is
      `receivedBytes / totalBytes` off the record._
- [x] Public tipler host'un quarantine durumunu bir alan olarak temsil edebilmeli
      — _`status: 'quarantined'` + `trustVerdict: 'safe'|'unknown'|'blocked'` + `sha256`._
- [ ] Selector sonuçları memoize edilebilir / referans-kararlı olmalı
      — _**not satisfied, and left honest.** `upsertDownload` always allocates a new array; a no-op
      patch to a missing id returns the same `state` ref but a patch that changes nothing still
      allocates. Callers (the desktop store, React surfaces) memoize downstream today; a
      reference-stable no-op path would be a real, separate change._

## Çok niş
- [x] Aynı dosya adının tekrar indirilmesi state'te çakışmadan temsil edilmeli
      — _records are keyed by a UUID `id`, never by `filename`; two downloads of `report.pdf` are two
      rows._
- [x] Bilinmeyen veya eksik alanlı indirme olayı reducer'ı çökertmemeli
      — _`patchDownload` guards `current === undefined`; `Partial<…>` patches tolerate absent fields._
- [x] Çok sayıda eşzamanlı indirme ile selector performansı makul kalmalı
      — _selectors are single-pass `filter`/`find` over an in-memory array bounded by the retention
      policy (`downloadsToForget`); no nested scans._
- [x] Risk helper'ı çift uzantı (ör. `.pdf.exe`) gibi aldatma kalıplarını yakalamalı
      — _`extensionOf` reads from the LAST dot, so `.pdf.exe` classifies on `.exe`; it also strips a
      trailing dot/space first, since Windows writes and runs `report.exe.` as `report.exe`.
      `downloads.test.ts` "sees through a trailing dot or space that Windows would strip on write"._
- [x] Reducer bilinmeyen action türünde state'i değiştirmeden döndürmeli
      — _there is no action-type dispatch to fall through; the analogue — `patchDownload` on an id not
      in state — returns the input `state` unchanged._
- [ ] İptal edilip yeniden başlatılan indirme aynı kimlik altında izlenebilmeli
      — _**deliberately not this way.** `retry` on a failed/canceled row DROPS the old record and the
      fresh attempt gets a new `id` (Chrome-style — see the phase 2c "Retry command descriptor" note),
      because the new attempt re-enters `will-download` on the current page's session and is a
      genuinely new transfer. Continuity is the URL + filename in the list, not the id._
