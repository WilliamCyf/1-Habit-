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

## D13. Budget locked from the real iPhone test

**Result:** 15 looks per second, 19 ms average think time (22 ms for the
slowest 5%), zero slowdown over 5 minutes, on iOS 26.7 with the GPU engine.

**Choice:** keep the lite model, GPU, 640 x 480 and 15 looks per second. No
background worker is needed (D7 stands): one stutter in 5 minutes, and that
one was the warm-up.

A 1-minute run from the Home Screen icon gave the same numbers, with the
camera and the screen-awake lock both working there.

**New rule from the tests:** the first look can take up to 6 seconds while
the graphics chip sets itself up (6 s in Chrome, 0.3 s from the Home Screen).
So the tracker is warmed up behind a loading screen and reused for the whole
session, never restarted between sets.

## D14. Save data lives in localStorage, with a spare copy

**Choice:** one small JSON text in the browser's `localStorage`, plus a spare
copy of the last save that loaded cleanly.

**Why:** our data is tiny (about 500 bytes now, perhaps a few hundred KB after
years of workouts). localStorage is the simplest storage there is and reads
instantly at start-up. The alternative (IndexedDB) is built for large data and
is much more complicated, with no benefit at this size.

**Safety nets:** a version number with step-by-step upgrades, a check-and-
repair pass on every load, the spare copy, a request to iOS to protect the
data, and export/import of a backup file.

## D15. Offline support: pages fresh from the network, files from the phone

**Choice:** the service worker serves hashed files (code, styles, pictures)
from the phone's cache, but always asks the network for the page itself
first and falls back to the saved copy when offline.

**Why:** the classic bug with offline apps is getting stuck on an old
version. Asking for the page first means an online phone always sees the
newest version, and an offline phone still opens. When a new version is
found, the app reloads itself once. I simulated a deploy with a robot browser:
the new version took over about 2.5 seconds after opening.

The 17 MB tracking engine is downloaded in the background after onboarding,
so the first workout does not wait for it and it works offline afterwards.

## D16. Calorie maths: Mifflin-St Jeor and METs, kept gentle

**Choice:**

- Resting energy: Mifflin-St Jeor formula (the one dietitians most often use).
- Daily need: resting energy times the standard activity multipliers
  (1.2, 1.375, 1.55, 1.725).
- One workout: MET x weight x hours, with session METs of 3.8, 5.0 and 6.5
  for the three experience levels (from the Compendium of Physical Activities:
  moderate calisthenics is 3.8, vigorous is 8.0, and sessions include rests).

**Safety limits built into the code and tested:** a fat-loss target is at
most 15% or 500 kcal below need, never below resting energy, and never a
deficit for anyone under 18. Numbers are rounded to the nearest 10 so they do
not pretend to be exact. No BMI is shown, to avoid body-shaming.

## D17. A "yes" on the health check advises, it does not lock the door

**Choice:** any "yes" shows "please check with a doctor first" and needs a
tick to continue. The plan then starts one level gentler.

**Why:** this is how the standard gym screening form (PAR-Q) works. Blocking
people entirely would push them to lie on the form, which is less safe.

## D18. Pip is the coach

**Choice:** the mascot from the icon is named Pip and guides the app with
speech bubbles and four expressions. Pets in the garden world (M4) will be
separate creatures.

## D19. Light and dark themes, following the phone by default

**Choice:** three settings: Auto, Light, Dark. Colours are defined once as
named variables, so a theme is just a second set of values.

## D20. No tabs for features that do not exist yet

**Choice:** the tab bar shows only Today and Me. World and Progress appear
when they are real. An honest "In the workshop" card shows what is coming.

## D21. The coach speaks, and shares the speakers with your music

**Why:** the phone sits on the floor about 2 m away, so the screen cannot be
read mid-set. You also want your own music (Spotify, Musi) to keep playing,
with the coach talking over it, the way a sat-nav talks over the car radio.
Lowering the music while something else speaks is called "audio ducking".

**Choice:**

- Voice coaching is a core feature from Milestone 2, not late polish. The
  coach counts reps aloud and speaks every cue that also appears on screen.
- The voice uses the phone's built-in speech (no audio files, works offline).
  On iPhone, built-in speech is reported to dip other apps' music by itself.
- Beeps and chimes are made with the Web Audio API and ask iOS for "mix"
  mode, so they play alongside the music without stopping it.
- Everything is optional: voice on/off, beeps on/off.

**What is not certain yet:** how iOS 26 really behaves. Web sources disagree,
and Apple has had bugs here, including an old one where speech interrupted
the camera. So the camera-check page has a guided Sound check that tests
each combination with your music playing and records whether the camera was
disturbed. The app's defaults will be adjusted from that result.

**Known limit:** in "mix" mode iOS silences web sound when the ring switch is
on silent. The app will remind you to switch silent mode off.

## D22. How a push-up is judged (the numbers)

The counter measures joint angles from a side view. All thresholds live in
one place, `PUSHUP` in `src/detectors/pushup.ts`, so they are easy to tune
once we have data from your real push-ups.

| Rule | Number | Why |
| --- | --- | --- |
| Arms count as straight | elbow at 150° or more | Full lockout is about 165°. 150° allows for camera error. |
| A rep has started | elbow below 140° | |
| Deep enough to count | elbow at 100° or less | A right angle is 90°. 100° allows for camera error. |
| Gap between the two | 50° | This gap ("hysteresis") is what stops jitter double-counting. |
| Fastest allowed | 0.5 s from bend to straight | About 0.7 s per rep. Faster is bouncing. |
| Body line, coach comments | below 163° | Shoulder, hip and ankle should be near 180°. |
| Body line, not counted | below 152° | A clear sag or pike. |
| Body tilt allowed | 42° from flat (52° on knees) | Rules out "push-ups" done standing against a wall. |
| Shoulder must drop | 5.5% of body length | The body must travel, not just the elbow bend. |
| Hands and feet may drift | 14% of body length | More means the phone or the person slid. |

**Form score (0 to 100):** depth 40%, body line 35%, lockout at the top 15%,
tempo 10%. The weakest part decides what the coach says.

**Knee or toes** is detected automatically: on toes the ankle sits clearly
below the knee, on knees the shin lies flat. So nobody can claim the harder
version while doing the easier one. Wide and diamond push-ups look the same
from the side, so those are taken on trust.

## D23. Anti-cheat, version 1: what is built and what the tests prove

Built in M2: live camera only (no upload, no +1 button), a start-position
gate held for 0.8 s, full range of motion, body line, tempo, real body
travel, planted hands and feet, a "teleport" check for a second person,
throwing a rep away if the body is unseen for half a second, and re-checking
the start position after any pause.

`tests/pushup.test.ts` replays fake recordings and proves each is rejected:
half reps, fast bouncing, badly sagging or piked hips, standing still with
jitter, a plank with jitter, standing and waving an arm, lying down and
bending one arm, shaking or sliding the phone, the body vanishing mid-rep, a
sudden jump to another body, hidden arms, and random noise.

**Known gap (honest):** pointing the phone at a video of someone else doing
push-ups would fool version 1. The planned answer is the random coach
check-in between sets ("wave your left hand"), which a recording cannot
answer, plus the daily points cap. Those arrive with sessions and points.

## D24. A push-up simulator that exists only in development

To test the workout screen without a person, development mode can feed the
counter a pretend athlete (`?sim` in the address). The published app does not
contain this code at all: the build removes it, and I check the built files
for it. A cheat switch must never ship.

## D25. Save version 2: workout history

Every finished set is stored (date, reps, form scores, rejections, time) for
progress charts and personal records later. The list is capped at 3,000 sets.
Old saves are upgraded automatically, and the upgrade is tested.

## D26. The heat governor

If looks take longer than 45 ms on average for 3 seconds, tracking steps down
from 15 to 12 to 10 looks per second. It steps back up only after 20
comfortable seconds, and never changes more than once every 6 seconds, so it
cannot flap. Your phone measured 19 ms, so it should never trigger for you,
but it protects older phones and hot days.

## D27. The coach never falls behind

Saying "seven, go lower" takes about a second, which is as long as a rep. So
the voice keeps at most one line waiting, lets a newer count replace an older
one, and drops any line that has gone stale. Tips are not repeated more than
once every three reps.

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
