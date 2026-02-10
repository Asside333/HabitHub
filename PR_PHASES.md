# PR Phases — BETA TEST 1 (Portable Save + JSON/Code + QR Annexe)

## Phase 1 — Storage durable
### What changed
- Added `STATE_SCHEMA_VERSION`, validation guards, migration pipeline, atomic save swap, and corrupt backups rotation (max 2).
### Manual Tests (Phase 1)
- [x] Open app, do 1 action, refresh: persistence OK.
- [x] Clear localStorage: clean initial state recreated.
### Done criteria met
- yes

## Phase 2 — Export/Import JSON + Code
### What changed
- Added Settings > Backup (Beta 1): JSON export, JSON import, base64url code copy/restore.
- Added mandatory import pipeline: parse -> migrate -> validate -> confirm -> apply -> rerender.
- Added `backup_before_import_{ts}` rotation (max 3).
### Manual Tests (Phase 2)
- [x] JSON export + import keeps same state.
- [x] Code export + import keeps same state.
- [x] Invalid import shows clean error toast.
### Done criteria met
- yes

## Phase 3 — QR Annexe Export (experimental)
### What changed
- Added annex QR section (collapsed), payload format `HH1:<format>:<data>`.
- Added gzip attempt via `CompressionStream`, fallback to base64url.
- Added size threshold with graceful “too large” message.
- Added vendored QR renderer under `/vendor` (MIT).
### Manual Tests (Phase 3)
- [x] Small save can render QR visual.
- [x] Large payload path shows “too large” fallback message.
### Done criteria met
- yes

## Phase 4 — QR Annexe Import (experimental)
### What changed
- Added support detection (`BarcodeDetector` + `getUserMedia`) and explicit fallback message.
- Added scanner modal flow and import pipeline for `HH1:gz:*` / `HH1:b64:*`.
### Manual Tests (Phase 4)
- [x] Supported browser path can attempt scan-import.
- [x] Unsupported browser path shows JSON/Code fallback guidance.
### Done criteria met
- yes

## Phase 5 — Durability progression
### What changed
- Preserved immutable progression behavior by avoiding destructive history recompute.
- Kept claim-granted values authoritative and non-negative.
- Added optional `economyVersion` / `economySnapshot` persistence fields.
### Manual Tests (Phase 5)
- [x] `totalXp` stable across export/import cycle.
- [x] Habit edits do not reset past XP.
### Done criteria met
- yes

## Phase 6 — Docs + smoke + polish
### What changed
- Added discreet “Beta Test 1” label in Settings.
- Added mini guide “Phone -> PC en 3 étapes” in Backup section.
### Manual Tests (Phase 6 smoke)
- [x] Create habit, complete, refresh.
- [x] Export JSON -> import JSON same device.
- [x] Export code -> import code.
- [x] QR export returns visual or too-large message.
- [x] QR import support path or explicit unsupported message.
- [x] No blocking console syntax errors.
### Done criteria met
- yes
