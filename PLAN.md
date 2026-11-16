# Repling: the plan

**Repling** is a no-equipment home workout coach for iPhone. The camera counts
every rep, so reps cannot be typed in or faked. Verified reps are the only way
to earn points, and points keep a little pet and garden alive.

This file is the map. Read the "Where we are" box first.

> **Where we are:** Milestones 0 to 3 are built and live. You asked me to
> keep building without waiting for a test after each milestone, so I am
> continuing with Milestone 4 (points, shop, pet and garden).
>
> **Only a real iPhone can confirm these, whenever you have a moment:**
> 1. Do real push-ups count correctly? (Today → Start. Tap the big number
>    five times to see live angles if something seems off.)
> 2. Does the coach's voice play nicely with your music? (Camera check →
>    Sound check.)

---

## 1. What I checked before writing any code (November 2026)

You asked me not to assume. Here is what I verified, and what it means for us.

| Question | What I found | What we do about it |
| --- | --- | --- |
| Which iOS versions do we target? | iOS 27 is current (released September 2026). iOS 26 is the previous one. | Build and test for 27 and 26. |
| Does the camera work in a Home Screen app? | Yes. But iOS may ask for camera permission again each time the app is opened, because Apple does not let Home Screen apps "remember" it. | Design the camera screen so a repeat permission pop-up feels normal. You will test this in Step 0. |
| Is there an automatic "Install app" prompt? | No. iOS has none. Since iOS 26, any site added to the Home Screen opens as an app by default. | An in-app "Add to Home Screen" guide. |
| Can we stop the screen from sleeping mid-set? | Yes, the Screen Wake Lock works in Safari, and in Home Screen apps since iOS 18.4. | Use it, with a fallback tip about Auto-Lock. |
| Can we lock the screen to landscape? | No. iOS ignores that setting. | The app must look right in both portrait and landscape. |
| Which body-tracking library? | Google's MediaPipe Pose Landmarker is actively maintained (new release this week). The main rival (TensorFlow.js MoveNet) has had no library update since 2023. | Use MediaPipe. Details in DECISIONS.md. |
| Does the library phone home? | **Yes, the newest versions (1.x) send usage statistics to Google.** Version 0.10.35 does not. I checked the code of both. | Use 0.10.35, and add a browser lock (CSP) that blocks every outside connection. |
| Any known iOS 27 camera bugs? | An iOS 27 beta crashed when a live camera view was hidden while another video played. Apple fixed it before release. | Never hide a live camera view. Turn the camera fully off instead. |

Sources are listed at the bottom of DECISIONS.md.

---

## 2. How the app is put together

Think of the app as a small company with departments. Each folder is one
department with one job, and they pass work to each other in one direction.

```
 Camera ──▶ Pose tracker ──▶ Exercise detector ──▶ Verified reps
 (video)    (33 body dots)   (counts + scores)          │
                                                        ▼
        Plan engine ◀── results ─── Workout session ──▶ Points ledger
        (what to do today)                              (tamper-evident)
                                                        │
                                                        ▼
                                        Shop ──▶ Pet and garden world
```

| Folder | Its one job | Status |
| --- | --- | --- |
| `src/pose/` | Camera on/off, run the pose model, draw the skeleton, joint-angle maths | **Built (M0)** |
| `src/perf/` | Measure speed, pace the frames, later the heat governor | **Started (M0)** |
| `src/platform/` | iPhone quirks: Home Screen mode, wake lock, storage, sound unlock | **Started (M0, M1)** |
| `src/diag/` | The camera-check page (stays forever as the hidden debug page) | **Built (M0)** |
| `src/app/` | Start-up code and the data store | **Built (M1)** |
| `src/state/` | The save file: versions, repairs, backups | **Built (M1)** |
| `src/ui/` | Screens, navigation, animations, Pip the coach | **Built (M1)** |
| `src/profile/` | Your details, health check, calorie estimates, limits | **Built (M1)** |
| `src/sw/` | The offline helper (service worker) | **Built (M1)** |
| `src/detectors/` | One rep counter per exercise, plus anti-cheat checks | M2, M3 |
| `src/plan/` | The coach: weekly plan, progression, deload, auto-adjust | M3 |
| `src/economy/` | Points rules, the ledger, daily cap, streaks, quests | M4 |
| `src/world/` | Pet, garden, shop | M4 |
| `tests/` | Automated checks, including fake "cheater" recordings | every milestone |

Two rules keep this clean:

1. **Only one door creates points.** Points can only be made by the workout
   session code after a detector verifies a rep. No other code can add points.
2. **Thinking code is separate from screen code.** Detectors, the plan engine
   and the economy are plain maths with no screen parts, so they can be tested
   automatically on a computer in milliseconds.

---

## 3. Milestones

Each milestone ends with a live link, a short lesson, an iPhone checklist, and
then I wait for your feedback.

| # | Milestone | Done when |
| --- | --- | --- |
| M0 | Camera check | **Passed.** 15 looks per second, 19 ms think time, no heat slowdown in 5 minutes. |
| M1 | App shell, onboarding, profile, install | **Built.** Setup, health check, calorie estimates, offline, backups. |
| M2 | Push-up detector, anti-cheat v1, camera screen, voice coach | **Built.** 34 replayed recordings prove honest reps count and fakes do not. Needs a real-body check. |
| **M3** | **Plan engine and the other exercises (built)** | A 4-week plan appears, every exercise has a demo and a reliable counter. |
| M4 | Points, shop, pet and garden | Reps earn points, points feed the pet and grow the garden. |
| M5 | Polish: sound, share cards, progress, achievements | It feels like a studio-made app. |
| M6 | Speed and heat hardening | 15-minute workout: smooth, cool enough, no bugs. |

### The exercise library (built in M3)

Side-on to the phone: push-up, squat, reverse lunge, glute bridge, sit-up,
plank, mountain climber, bird-dog, good morning, burpee. Facing the phone:
jumping jack, high knees. Each has a beginner, standard and advanced version.

Left out because the camera cannot judge them reliably: superman and reverse
snow angels (the lift is too small to measure) and side plank (the body hides
itself). Bird-dog, glute bridge and good morning do the back and posture work
instead. Reasons are in DECISIONS.md, D28.

### Anti-cheat layers (built in M2 and M4)

1. Live camera only. There is no upload button and no "+1" button anywhere.
2. A "get in position" gate: the set starts only when the right start pose is seen.
3. Full range of motion, straight body line, minimum tempo, realistic rep speed.
4. Scene-motion check: if every body dot moves together, the phone is moving, not you.
5. Stillness check: jitter while standing still never crosses both thresholds.
6. Random friendly coach check-ins between sets ("wave your left hand").
7. Points ledger stored as a hash chain, so edited save data is detected.
8. Daily points cap, so grinding and overtraining are not rewarded.
9. A test harness that replays fake cheating recordings and proves they fail.

Honest limit, stated now: with no server, a determined programmer can always
cheat their own phone. The goal is to make cheating harder than doing the push-ups.

---

## 4. Speed and heat budget

### What your iPhone measured (15 November 2026, iOS 26.7, 5-minute run)

| Measurement | Result | Budget | Verdict |
| --- | --- | --- | --- |
| Looks per second | 15.0, steady in every 30-second slice | 15 | Pass |
| Think time, slowest 5% | 22 ms (average 19 ms, worst 42 ms) | under 40 ms | Pass |
| Heat slowdown, last minute vs first | +0% | under 15% | Pass |
| Screen smoothness | 59 fps, no stutters after warm-up | smooth | Pass |
| Engine | GPU worked first time | GPU | Pass |

**Locked in:** lite model, GPU engine, 640 x 480 picture, 15 looks per second.
A look takes about 19 ms out of the 67 ms available, so roughly 70% of each
slice is spare. That spare room is what keeps the phone cool.

A second run from the Home Screen icon (1 minute) matched it: 14.9 looks per
second, 20 ms think time, worst look 24 ms. The camera worked in Home Screen
mode and the screen-awake lock was active.

**Lessons from the runs, now part of the plan:**

- In Chrome, the first look after loading froze the page for about 6
  seconds (one-off graphics set-up). From the Home Screen it took 0.3
  seconds. Because it can be slow, the real app does this warm-up behind a
  "getting ready" screen and keeps the tracker alive between sets.
- The screen-awake lock is refused in Chrome but works from the Home Screen.
  Another reason the app should be used from its Home Screen icon.
- Safari reports a frozen, older iOS number in its name badge ("18_7" on an
  iOS 26 phone), so the app must never make decisions based on the iOS
  version it reads. We test for features instead.

Still open: how warm the phone felt, and whether the Home Screen app asks
for camera permission every time it is opened.

### The budget

| Item | Starting budget |
| --- | --- |
| Looks per second (pose checks) | 15, dropping to 10 if the phone struggles |
| Camera picture size | 640 x 480 or smaller |
| Think time per look | under 40 ms for 95% of looks |
| Slowdown from heat after 5 minutes | under 15% |
| Camera on | only during active sets. Off in rests, menus and the pet world |
| App code size | under 300 KB (not counting the tracking engine and model) |
| Animations | only "transform" and "opacity" (the cheap kind) |
| Background timers | none. Pet needs are calculated from the clock when you open the app |

How your results change the plan:

| If Step 0 shows... | Then we... |
| --- | --- |
| Think time around 25 ms or less, slowdown under 15%, phone just warm | Keep 15 looks per second, lite model, 640 picture. |
| Think time 25 to 45 ms, or the phone gets hot | Drop to 10 looks per second and a 480 picture. |
| The GPU engine fails and it falls back to CPU | Use the CPU numbers. Probably 10 looks per second. |
| Think time over 60 ms even on the lightest settings | Move tracking to a background worker and shrink the input. Worst case, rethink the model. |

---

## 5. Risks and what I will do about them

| Risk | How likely | Plan |
| --- | --- | --- |
| Tracking too slow or too hot on your iPhone | Unknown until you test | This is why Step 0 exists. Fallbacks are in the table above. |
| iOS asks for camera permission on every launch | Likely in Home Screen mode | Friendly pre-permission screen, and the camera opens only when a set starts. |
| I cannot run an iPhone myself | Certain | Every milestone has a checklist, and the debug page produces a copy-paste report. I test everything else in a real browser with a fake camera. |
| iOS deletes saved data (it can, for unused sites) | Low for Home Screen apps | Ask for persistent storage, versioned saves, export/import backup. |
| Side-on push-ups hide half the body | Certain | Measure the side the camera sees best. Already built in `geometry.ts`. |
| A rep counter miscounts | Certain at first | Hysteresis, smoothing, and synthetic test recordings for every counter. |
| Scope is large | Certain | Strict milestones. Nothing is left broken between them. |

---

## 6. How we work together

- I make the decisions and write each big one, with the reason, in DECISIONS.md.
- Every new technical word is explained once, and added to LEARNING.md.
- After each milestone you get: what was built, a short lesson, a test checklist.
- Bugs are fixed before new features are added.
