# Decisions and reasons

Every big choice, written down so future-you knows why. Newest at the bottom.

---

## D1. Body tracking: MediaPipe Pose Landmarker, "lite" model

**Choice:** Google's MediaPipe Pose Landmarker, lite model (5.8 MB), on the
phone's graphics chip (GPU) with an automatic fallback to the main processor (CPU).

**The options, like choosing a car:**

| Option | Pros | Cons |
| --- | --- | --- |
| **MediaPipe Pose Landmarker (chosen)** | Still maintained (a release in the same week I checked). 33 body dots including heels and toes. Has a confidence score per joint. Has built-in smoothing between frames. One self-contained engine. | Engine file is large (about 11 MB, downloaded once, then cached). |
| TensorFlow.js MoveNet Lightning | Small and fast model. | The library has had no update since 2023. Only 17 body dots and no feet, which hurts squat, lunge and plank checks. Needs several separate libraries. |
| Larger MediaPipe models (full, heavy) | A little more accurate. | 9 MB and 30 MB, slower, hotter. |

**Why lite:** you told me smoothness and heat beat everything else. Lite is the
smallest model that still gives all the joints the rep counters need. The
camera-check page can also run the "full" model, so if lite turns out to be
shaky on your phone we can compare with real numbers instead of guessing.

## D2. Use MediaPipe version 0.10.35, not the newest 1.x

**Choice:** pin (lock) the library to version 0.10.35.

**Why:** your rule is "everything runs on the phone". I opened the code of the
newest version (1.2.3) and found it sends usage statistics to a Google server
(`odml.pa.googleapis.com`). Its own README says app makers must get user
consent for this. Version 0.10.35 contains no such code. The pose features we
need are the same in both.

**Trade-off:** we miss future fixes in 1.x. If we ever need one, we revisit.

## D3. A browser lock that blocks all outside connections (CSP)

**Choice:** every page carries a Content-Security-Policy with
`connect-src 'self'`.

**Why:** it is a promise enforced by the browser, not just by my good
behaviour. Even if a library tried to contact another server, Safari would
refuse. It also means the privacy line on the camera screen is literally true.
My browser test confirms zero requests leave the site.

## D4. Tools: Vite + plain TypeScript, no framework

**Choice:** Vite (build tool), TypeScript (JavaScript with spell-check for
logic), Vitest (test runner). No React, no game engine.

**Why:** frameworks add download size and work the phone must do. This app is
mostly a camera screen plus some menus, which plain code handles well. Less
magic also makes it easier for you to read. Current app code is about 12 KB
compressed, against a 300 KB budget.

## D5. Hosting: GitHub Pages, published by GitHub Actions

**Choice:** GitHub Pages.

**Why:** your code already lives on GitHub, so there is no new account to
create, it is free, and it gives the https address the camera requires. A
small robot script (GitHub Actions) tests and publishes on every push, so
"redeploy" just means "push".

**Trade-off:** a one-time setup of two settings (see README), because GitHub
by default only lets the `main` branch publish.

## D6. The model is stored in this repository. The engine is copied at build time.

**Choice:** the two model files live in `public/models/`. The 11 MB engine
file is copied from the installed library by `scripts/copy-wasm.mjs` whenever
the site is built.

**Why:** the app must not depend on anyone else's server while running. The
model files are not in the library package, so we keep our own copy. The
engine is in the package, so copying it avoids storing 11 MB twice.

Model fingerprints (SHA-256), so we can prove the files were not altered:

| File | SHA-256 |
| --- | --- |
| `pose_landmarker_lite.task` | `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` |
| `pose_landmarker_full.task` | `4eaa5eb7a98365221087693fcc286334cf0858e2eb6e15b506aa4a7ecdcec4ad` |

## D7. Tracking runs on the main thread for now

**Choice:** no background worker yet.

**Why:** a worker (a second lane for code) adds real complexity on iOS. If the
think time per look is around 20 ms, 15 looks per second uses only about a
third of each second, and the camera picture itself stays smooth because
Safari plays it separately. The camera check measures "screen stutters", so
we will know from your results whether a worker is needed.

## D8. Analyse 15 of the camera's 30 pictures per second

**Choice:** the camera runs at 30 pictures per second. A "pacer" lets every
second one through to the tracker.

**Why:** a push-up takes more than a second. Fifteen looks is plenty to catch
the top and bottom, and half the looks means roughly half the heat from tracking.

## D9. Front camera by default

**Why:** you need to see the screen (rep count, coach cues, your pet cheering)
while the phone is propped against the wall. The picture is mirrored so it
behaves like a mirror. The back camera stays available as an option.

## D10. Name and mascot: "Repling"

**Choice:** Repling = "rep" + "-ling" (as in sapling and duckling: a small
growing thing). The mascot is a sprout creature in a sweatband, drawn by me
in SVG. I searched and found no existing fitness or pet app with this name.

## D11. Offline support (service worker) waits for Milestone 1

**Why:** a service worker caches the app so it works offline. Done carelessly,
it also serves you stale versions, which would confuse our test rounds. Step 0
changes fast, so I add it in M1 with proper versioning.

## D12. The first look is reported separately

**Why:** the very first pose check includes one-off warm-up work and can take
10 times longer than normal. Mixing it into the average would make a healthy
phone look slow.

---

## Points economy table

Coming in Milestone 4, once we know your real workout volume from M2 and M3.

---

## Sources (checked November 2026)

- MediaPipe package history and code: npm `@mediapipe/tasks-vision` (versions 0.10.35 and 1.2.3 inspected directly)
- MediaPipe usage statistics in 1.x: https://github.com/johnnyrobot/discuss-it-recorder/pull/4
- iOS web app support by version: https://firt.dev/notes/pwa-ios/
- Safari 27 features: https://webkit.org/blog/18325/webkit-features-for-safari-27-0/
- iOS 27 beta camera crash (fixed): https://bugs.webkit.org/show_bug.cgi?id=321693
- Wake lock in Home Screen apps: https://bugs.webkit.org/show_bug.cgi?id=254545
- Camera permission in Home Screen apps: https://bugs.webkit.org/show_bug.cgi?id=215884
- GitHub Pages branch rule: https://github.com/orgs/community/discussions/39054
- TensorFlow blog on pose models: https://blog.tensorflow.org/2021/05/high-fidelity-pose-tracking-with-mediapipe-blazepose-and-tfjs.html
