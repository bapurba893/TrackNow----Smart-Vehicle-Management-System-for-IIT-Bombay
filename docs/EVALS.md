# Evals

Three layers of evals, from "does the logic hold" up to "does the OCR actually read plates".

| Layer | What | Command | Result |
|---|---|---|---|
| 1 | API + real-time behaviour (18 cases) | `cd backend && npm test` | **18 / 18 pass** |
| 2 | Plate text parser (17 cases) | `cd frontend && CI=true npm test` | **17 / 17 pass** |
| 3 | End-to-end OCR accuracy (150 images) | `cd frontend && node evals/ocr/ocr-eval.mjs --n 150` | **98% / 86% / 56%** (easy / medium / hard) |
| 4 | Manual checks on real phones | checklist below | _to be filled in_ |

Layers 1 to 3 are automated, reproducible (seeded), and need no external services: the backend tests spin up a throwaway in-memory MongoDB.

---

## 1. API and real-time evals

Each eval is written as a user story with a pass/fail check ([`backend/tests/`](../backend/tests/)).

| ID | Scenario | Expected |
|---|---|---|
| E01 | Student signs up and logs in | 201 / 200; password stored hashed; hash never returned |
| E02 | Wrong password / unknown user | 401, **server keeps running** |
| E03 | Same ID signs up twice | 409, not a crash |
| E04 | Two users pick the same password | both allowed |
| E05 | Security signup without / with wrong / with correct code | 403 / 403 / 201 |
| E06 | Student token calls guard-only endpoints | 403 (and 401 with no token) |
| E07 | User A tries to change user B's password | 403; own password change works |
| E08 | Token signed with a different secret | rejected |
| E09 | Guard issues pass → visitor redeems → timer → QR reused | 200 → ~30 min left → **409 on reuse** |
| E10 | Bad plate / unknown vehicle type / 0 or >24 h duration | 400 |
| E11 | Raw QR token used as a login session | 403 |
| E12 | Second pass for a vehicle that's still inside | 409 |
| E13 | Pass expires → cron job | status `red`, overstay count = 1, red-list check says `isRed: true` |
| E14 | Red-listed vehicle comes back, guard lets it in, it overstays again | allowed in; count becomes 2 |
| E15 | Guard removes a visitor | visitor's session immediately returns 401 |
| E16 | Socket connects with an invalid token | refused |
| E17 | Driver sends location (with a fake plate in the message) | students receive it under the **driver's real plate**; a student can't broadcast as a bus |
| E18 | Visitor shares location | guard receives it; a student who connects to the security channel is disconnected |

Several of these were real bugs in the earlier version, and the evals now guard against them coming back:

- **E02**: a wrong password crashed the request (`401` sent, then code carried on and tried to read the missing user).
- **E04**: the `password` field was marked `unique`, a hidden constraint on the users table.
- **E05**: anyone could create a security account and watch every visitor.
- **E06 / E07**: guard-only routes accepted any logged-in token, and any user could change any other user's password.
- **E09**: the "delivery" vehicle type was spelled `delivary` in the database schema, so passes for delivery vans failed.
- **E14**: once a plate was red-listed it could **never** get a new pass (stuck on "QR already used").
- **E17 / E18**: sockets had no authentication. Anyone could post a fake vehicle, and any browser could receive every visitor's live location.

A full boot of the real server (`server.js` against an in-memory MongoDB) was also smoke-tested over HTTP: signup → issue pass → redeem → reuse blocked → after 1 minute the cron job red-listed the plate.

## 2. Plate parser evals

[`frontend/src/ocr/plateParser.test.js`](../frontend/src/ocr/plateParser.test.js): raw OCR strings → expected plate.

Covers: clean text, spaces/dashes, lowercase, `O`→`0` and `0`→`O` by position, `I/1`, `S/5`, `B/8` both ways, single-letter series (`KA05M9876`), HSRP plates with "IND", two-row plates, surrounding noise, `N`→`M` state-code misread, garbage → no plate, empty → no plate, and a known unsupported format (Delhi `DL3C…`) → no plate rather than a wrong guess.

**What this eval caught:** `KA05M01234` was first parsed as `KA05M0123`, a valid-looking plate that quietly dropped the last digit. The parser now prefers readings that use every character on the line, and returns `KA05MO1234`.

## 3. OCR accuracy (end-to-end)

[`frontend/evals/ocr/ocr-eval.mjs`](../frontend/evals/ocr/ocr-eval.mjs) generates random valid Indian plates and renders them as photos at three difficulty levels, then runs the **same pipeline code the app uses**.

| Tier | Conditions |
|---|---|
| easy | ≤2° tilt, light noise, good contrast |
| medium | ≤6° tilt, noise, slight blur, 65–90% contrast, 25% two-row plates |
| hard | ≤10° tilt, heavy noise, blur, 45–70% contrast, 35% two-row plates |

All tiers mix white and yellow (commercial) plates, four fonts, and varied car-body backgrounds. The seed is fixed, so every run uses the same images. Sample images are in [`frontend/evals/ocr/samples/`](../frontend/evals/ocr/samples/).

**Results (n = 150, 50 per tier, default seed 20251):**

| Tier | Raw Tesseract | + plate parser | **Full pipeline** | No plate found | Wrong but "high" confidence |
|---|---|---|---|---|---|
| easy | 70% | 74% | **98%** | 0% | 2% |
| medium | 42% | 48% | **86%** | 2% | 4% |
| hard | 30% | 42% | **56%** | 6% | 16% |

A second image set (`--seed 7`) gave: full pipeline easy 94% / medium 84% / hard 54%, raw Tesseract 62% / 52% / 28%. A third set during development gave 100% / 78% / 60%. With 50 images per tier, a swing of ±8 points between image sets is normal, so read the numbers as approximate.

How to read it:
- **Plate localization is the biggest win.** Cropping to the plate before OCR added 25 to 45 points over raw Tesseract. The parser alone helps a little, because most raw failures are blank reads, not character swaps.
- **"No plate found" is the safe failure.** The guard just types the plate.
- **"Wrong but high confidence" is the dangerous one** (up to 16% on hard images). This is why the UI never auto-submits. The guard always sees and confirms the plate, and the red-list check runs on the confirmed value.

**How the eval changed the design:**
1. The first run (60 images) showed ~5% accuracy. Looking at the failures showed the **eval generator** had a bug (the label's state code didn't match the drawn one). After fixing that, the true baseline for the first pipeline version was easy 90% / medium 60% / hard 60%.
2. Debug images showed that on a dark car the binarizer flipped the plate to white-on-black, and Tesseract returned nothing. Deciding threshold and polarity from the **centre of the frame** and **cropping to the plate** brought the same 60 images to 100% / 85% / 75%.

**Limits of this eval (honest):** these are synthetic images. Real gate photos add glare, dirt, headlights at night, motion blur and odd fonts, so real-world accuracy will be lower. To measure it, drop real photos into `frontend/evals/ocr/real/` named after the plate (e.g. `MH01AB1234.jpg`). The script scores them as a separate `real` row.

## 4. Manual checks (real devices)

Not automatable here: these need real phones and GPS. Fill in when you run them.

| # | Check | Result |
|---|---|---|
| M1 | Guard phone: "Scan number plate" opens the rear camera; a real plate is read | |
| M2 | Visitor phone scans the QR from the guard's screen and sees the countdown | |
| M3 | Visitor walks/drives; marker moves on the guard's map within a few seconds | |
| M4 | Issue a 1-minute pass; within ~1–2 min the guard sees the red-list alert | |
| M5 | Driver phone shares location; student phone sees the vehicle move | |
| M6 | Student taps "I'm here"; driver sees the marker; logout removes it | |
| M7 | Second scan of the same QR shows "already used" | |
