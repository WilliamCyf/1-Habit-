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

> **Replaced by D45 (November 2026).** This first counter passed every
> simulated test but counted zero reps on real videos. Kept for the record.

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

## D28. The exercise library: twelve exercises, and three I left out

**In:** push-up, squat, reverse lunge, glute bridge, sit-up, plank, mountain
climber, jumping jack, high knees, bird-dog, good morning, burpee.

**Out, and why:** you asked me to leave out anything the camera cannot track
reliably.

| Left out | Why |
| --- | --- |
| Superman | The chest and legs lift only a few centimetres. From the side that is smaller than the camera's own wobble. |
| Reverse snow angels | Lying face-down, the arms sweep behind the body where a side camera cannot see them. |
| Side plank | Half the body hides the other half, so the "is it straight?" check is guesswork. |

**The pulling problem.** Bodyweight training with no bar and no weights has
no pulling moves (rows, pull-ups), and pulling is what balances all the
pushing and protects posture. So every session includes mat-based work for
the back of the body, chosen because the camera sees it clearly:

- **Glute bridge:** bottom and lower back. The hips rise a long way, easy to judge.
- **Bird-dog:** the muscles along the spine, and balance. A big, slow reach.
- **Good morning:** hamstrings and lower back, bowing from the hips.

A test checks that every session the plan can ever produce contains one.

## D29. How versions get harder

For most exercises: beginner = a smaller range, standard = the full range,
advanced = the full range with a pause or a slow lowering. Range, pauses and
tempo are things the camera can verify, so the harder version cannot be
claimed without doing it. A few have natural versions instead (knee push-up,
knee plank, marching). Wide or diamond hand positions cannot be seen from the
side, so they are offered as tips, not as verified versions.

## D30. One counting engine, many exercises

Most exercises are "a number leaves rest, reaches a peak, and returns". So
there is one shared engine and each exercise supplies a short description:
how to measure its number, the thresholds, and how to judge a rep. Timed
holds and fast alternating moves (high knees) have their own small engines.

A "confusion check" in the tests feeds every counter every other exercise and
requires zero reps. That is how, for example, the squat counter was caught
accepting lunges, and fixed by checking that the feet stay together.

**Honest note:** these counters are built from geometry and tested on
simulated bodies. Push-up, squat, plank, jacks and high knees are standard
for this kind of tracking and I am confident in them. Mountain climbers and
bird-dog are the two I am least sure of on a real body. Real-phone testing
will tune the thresholds.

## D31. The plan engine

| Idea | How it works here |
| --- | --- |
| Weekly split | 2 days: full body twice. 3: push, legs, full. 4: push, legs, core, full. 5: adds cardio. 6: push, legs, core, push, legs, cardio. |
| Flexible days | The plan is a list of sessions for the week, not fixed weekdays. Miss a day and nothing is "failed"; the next session is simply waiting. |
| Session length | 10 min: 3 exercises x 2 sets. 15: 4 x 2. 20: 4 x 3. 30: 5 x 3. 45: 6 x 4. Trimmed until it fits. |
| Progressive overload | Targets are x1.0, x1.1, x1.2 over three weeks. |
| Deload | Week 4 is x0.7 with one set fewer, so the body can catch up. |
| Goal | Muscle: fewer reps, 60 s rests. Fat loss and endurance: 30 s rests. Endurance: 20% more reps. General: 45 s rests. |
| Auto-adjust | Hit every target with form 75+: next time is 5% harder. Fall under 60% of a target: 5% easier. Six steps up earns the next version. Three down drops back one. |
| Sore areas | Exercises that load a protected area are swapped (squat to glute bridge for knees). All 16 combinations of limits are tested. |
| Warm-up, cool-down | Always included, camera off. Short sessions get shorter ones so they do not eat the workout. |

## D32. Sessions are hands-free

After one tap on Start, the voice leads and every step moves on by itself:
warm-up, "next exercise" with a demo, the set, the rest timer, the cool-down.
You turn your body side-on or to face the phone; the phone never moves.
The camera is on only during sets.

## D33. Coach check-ins

About one set in three (never the first) begins with "Coach check! Raise one
hand above your head" or both hands. The set starts only when the camera sees
it. A video of someone else doing push-ups cannot answer a request made at an
unpredictable moment. Miss it for 20 seconds and that set is skipped. It
happens before a set, standing up, never mid-exercise.

## D34. The fitness test

Most push-ups, then most squats, in 60 seconds each, with 40 seconds of rest.
Knee push-ups count for 0.6 of a full one. Level 3 needs a score of 20 and 30
squats; below 8 or 15 is level 1; otherwise level 2. People protecting their
knees do glute bridges instead of squats. It can be skipped, and the plan
then starts from the profile.

---

## D35. Points: one door in, and a tamper-evident record

**One door.** Points are created in exactly one function, `awardSet` in
`src/economy/award.ts`, and that function is called from exactly one place:
the end of a camera-verified set. The shop can only subtract.

**No stored balance.** The balance is never saved as a number. It is added up
from the ledger every time, so there is no single figure to edit.

**A hash chain.** Each ledger line carries a fingerprint (SHA-256) of itself
and of the line before. Change, delete, insert or reorder any line and the
fingerprints stop matching. On loading, the app keeps only the lines that
check out and tells you plainly that it had to. Tests try each kind of edit.

**Honest limit:** the code that makes the fingerprints is on your phone too.
A programmer who reads it could build a valid fake record. This stops casual
edits to the saved data, which is what was asked for. It cannot stop an
expert, and nothing without a server can.

## D36. A kind pet

- It never dies and never gets ill. The worst it gets is sleepy or sad.
- Needs are worked out from the clock when you open the app. No timers run.
- Time away is capped at two weeks, so a long holiday looks the same as a short one.
- The first workout of the day lifts its mood and energy and gives a free snack.
  One workout plus one meal brings a neglected pet back to "fine". A test proves it.
- No countdown warnings, no notifications, no "your pet misses you" guilt.
- Missing a quest costs nothing. A broken streak just starts again at 1.
- A streak "freeze" is earned every 7 days (up to 2 saved) and covers a
  missed day automatically.

## D37. Harvests feed the pet. They do not make points.

Garden produce goes into your bag as pet food. If harvests paid points, the
garden would become a way to earn without exercising, which breaks the whole
idea. Points come from verified reps only.

## D38. Badges are worked out, never stored

A badge is unlocked if your real history says so, checked every time it is
shown. The save file only remembers which badges have already been
celebrated, so editing that list cannot hand out a badge. Badges use your
best streak, so one is not lost when a streak ends.

## D39. Charts without a chart library

The bar chart, the form line and the calendar are a few lines of SVG each.
A chart library would add more download size than the rest of the app.

## D40. Share cards are made on the phone

The result card is drawn on a canvas and handed to the iPhone share sheet.
The app uploads nothing: the picture goes only where you choose to send it.
The link-preview picture (`og.png`) is a fixed image made at build time.

## D41. Celebrations are short and cheap

Confetti is about 70 pieces on one canvas for 1.6 seconds, then it is
removed. It is skipped if the phone is set to reduce motion.

## D42. The heat and battery pass

What keeps the phone cool, in order of how much it matters:

| Measure | Effect |
| --- | --- |
| Camera fully off outside sets | The biggest saving. Warm-ups, rests, cool-downs, menus and the pet world use no camera at all. |
| 15 looks per second, not 30 | Half the tracking work. Your phone measured 19 ms per look, so about 70% of every slice of time is idle. |
| The smallest model, on the graphics chip | Lite model, 640 x 480 picture. |
| Heat governor | Steps down to 12 then 10 looks per second if looks get slow, and back up when the phone recovers. |
| One tracker for the whole session | The slow first-use set-up happens once, behind a loading screen. |
| A longer break after 20 camera minutes | The session adds a minute to the next rest and says why. |
| Nothing runs when hidden | Auto-pause in the background. Animations under a workout are frozen. No polling timers anywhere: the pet and garden are worked out from the clock. |
| Cheap drawing | The skeleton is 3 drawing calls on one canvas. Animations use only transform and opacity. |
| Small code | 250 KB of app code against a 300 KB budget, checked on every publish. |

**Not verified:** actual temperature over a 15-minute session. Only your
phone can tell us. If it runs warm, the first lever is 12 looks per second,
then a 480-pixel picture. Each is a one-line change.

## D43. A size budget the robot enforces

Every publish runs `scripts/check-size.mjs`. If the app's own code passes
300 KB, the publish fails. Budgets that are only written down get ignored;
budgets that block a release get kept.

## D44. Real videos are the exam

**What went wrong.** Your first real push-ups were not counted at all. The
first counter was built and tested only on simulated bodies (D24), filmed
side-on. When I ran it on real videos of real people it counted **zero reps on
every single one**, face-on and side-on. The simulated bodies were too neat:
real trackers swap left and right, guess hidden joints, and lose the shoulders
when the phone is on the floor.

**What I do now.** 21 free stock videos from Mixkit (free licence, no
attribution needed; listed in `scripts/fixtures/sources.json`) are run
through the app's own pose model in a test browser. Only the dots are kept,
never the video, in `tests/fixtures/`. I counted the reps in each by eye. The
tests in `tests/real.test.ts` replay those dots through the counters on every
change.

| Clip | Exercise | View | Real reps | Counted |
| --- | --- | --- | --- | --- |
| 11544 Woman, three-quarter view | push-up | side | 7 | 6 |
| 11545 Woman, side view | push-up | side | 5 | 5 |
| 24273 Woman, close, front view | push-up | front | 3 | 3 |
| 24277 Man, phone on the floor in front | push-up | front | 10 | 9 |
| 24311 Woman on a step, front view | push-up | front | 2 | 2 |
| 24383 Woman, ground view from the front | push-up | front | 3 | 3 |
| 32308 Man outdoors, side view | push-up | side | 4 | 4 |
| 32320 Man outdoors, three-quarter view | push-up | side | 6 | 6 |
| 50761 Man on a balcony, phone in front | push-up | front | 5 | 5 |
| 50762 Man on a balcony, side, far away | push-up | side | 5 | 5 |
| 4525 Father and son together | push-up | side | 3 | 0 (two people: not supported) |
| 5048 Face filling the whole picture | push-up | front | ? | 0 (too close: correct) |
| 32809 Man running at the camera | none | | 0 | 0 |
| 23914 Woman with a coach beside her | squat | front | 4 | 4 |
| 52106 Woman at the gym | squat | front | 3 | 3 |
| 52116 Same, closer | squat | front | 1 | 1 |
| 52117 Same, far away | squat | front | 2 | 2 |
| 752 Woman with a ball, far away | squat | front | 2 | 2 |
| 36062 Woman in a kitchen, three-quarter | squat | side | 5 | 4 |
| 49038 Women with a ball, side view | squat | side | 3 | 1 |
| 21273 Man, legs partly out of the picture | squat | side | 2 | 1 |

Push-ups: 48 of 50 real reps counted. Squats are counted only after the
start gate (stand still first), and stock videos rarely stand still, so the
first rep or two is often before the gate; in the app the coach asks you to
stand still first.

The same videos were also played into the **real app** as a fake camera (a
test browser can pretend a video file is its camera): face-on push-ups 8 of 8
twice, side-on push-ups 8 of 8, face-on squats 12 of 12.

## D45. The push-up counter, version 2: facing the phone or side-on

You asked for it to track you facing the camera, so the counter now works
from the front **and** from the side, and works out which on its own.

**Two signals, not one.** Facing the phone, the elbow angle is unreliable
(arms point partly towards the camera). So the counter mainly watches the
**shoulder drop**: the height gap between your hands and shoulders, which
shrinks as you go down. It also watches the elbow bend, and uses whichever
says "deeper":

```
                 shoulder drop
  depth part = ─────────────────
                      0.4

                 elbow at the top − elbow now
  elbow part = ───────────────────────────────
                 elbow at the top − 95°

  progress   = the larger of the two
```

Progress 0 = top, 1 = full depth. A rep starts above 0.4, must reach 0.9,
and ends back below 0.3. The gap is the same hysteresis idea as before.

**It calibrates to you.** When you hold the top position for 0.8 s, it
measures *your* top height and *your* straight-arm angle, and which way you
face. Everything after is compared with your own numbers, so a long-armed
person close to the phone and a short-armed person far away both work.

**Which way you face** is decided from the nose: facing the phone it sits
between the shoulders (measured 0.01–0.06 arm-lengths off-centre); side-on it
sits out in front (0.10–0.42). The cut is 0.10.

| Rule | Number | Measured on real videos |
| --- | --- | --- |
| Full depth (shoulder drop) | 40% of the top height | most real reps drop 50–90%, half reps 15–20%. With the phone very close on the floor the shoulders can leave the picture (drop reads only 16–22%); then the elbow part carries the rep |
| Body must really move | 12% drop at least | stops arm-only flapping |
| Fastest rep | 0.5 s | |
| Standing guard | hips more than 0.95 arm-lengths below shoulders = upright | push-ups 0.75 at most, standing 1.1–1.4 |
| Hands may drift | 45% of top height | the steadiest hand counts: side-on the far hand is a guess |
| Body line (side-on only) | not counted below 142°, mentioned below 156° | |

**Form score:** depth 45%, body line 25%, straight arms at the top 15%,
tempo 15%. Facing the phone the body line cannot be seen, so it gets a fixed
fair mark.

**Coach tips tuned to real people.** On the real videos, people who clearly
locked out (checked by eye) read only 125–140° at the elbow, because the
tracker puts the elbow dot slightly off the line. So "straighten your arms"
is said only below about 120°, and "go lower" only when a counted rep only
just made it (progress under 0.95). People doing good push-ups now hear
"Nice rep". The two side-on videos where the hips really are raised still
hear "lower your hips".

**What it cannot judge from the front:** knees or toes look the same, so the
version is taken on trust facing the phone.

## D46. The squat counter, version 2

The first squat counter used the knee angle, which barely changes in a
face-on picture. It also scored zero on every face-on video. The new signal
is the shape of the leg:

```
                 knee height − hip height
  leg ratio = ──────────────────────────────
                 ankle height − knee height
```

Standing, the thigh is as tall as the shin, so the ratio is about 1. In a
squat the thigh tips forward and its height shrinks, so the ratio falls
towards 0.4. This works from the front and from the side.

- It follows the **straighter leg**, so a running stride (one leg bent, one
  straight) is not a squat. The running video counts 0.
- It **calibrates to you** while you stand still, like the push-up.
- Both legs must bend together; a big difference between them is rejected as
  "wrong shape" (stops lunges counting as squats).

## D47. The coach talks you into place

With the phone on the floor you cannot read the screen. So:

- Before each exercise the coach **says where to put the phone** (push-ups:
  on the floor about a metre in front of your head; standing moves: about two
  metres away).
- A ding and "I can see you" when the tracker first finds you.
- If you are not ready after 5 s, it says the first thing that is wrong
  ("I can not see your shoulders and arms yet…", "Straighten your arms and
  hold still…"), again every 8 s.
- On floor exercises the coach check-in is "lift one hand off the floor and
  wave", because nobody in push-up position can raise a hand above their head.

---

## Points economy table

**The formula for one set:**

```
points = reps (or seconds) x difficulty x version factor x form factor x 2
```

| Part | Values |
| --- | --- |
| Difficulty (per rep) | Burpee 1.5 · Push-up 1.0 · Lunge 0.8 · Squat 0.7 · Sit-up 0.6 · Bridge, bird-dog, good morning 0.5 · Climber 0.4 · Jack, high knees 0.3 · Plank 0.25 per second |
| Version factor | Beginner 0.8 · Standard 1.0 · Advanced 1.25 |
| Form factor | 0.7 at a form score of 50 or below, rising to 1.2 at 100 |

Example: 10 standard push-ups with perfect form = 10 x 1.0 x 1.0 x 1.2 x 2 = 24 points.

**Bonuses and limits:**

| Rule | Amount |
| --- | --- |
| First verified set of the day | +20 |
| Streak | +5 per day beyond the first, up to +25 |
| Beating your best set of an exercise | +15 |
| Weekly quests | +60 sessions, +40 reps, +30 variety |
| Daily cap on workout points | 400 (bonuses are on top) |

**What things cost:**

| Item | Price | Does |
| --- | --- | --- |
| Berry snack | 6 | +25 food |
| Hearty bowl | 16 | +60 food |
| Feast (level 2) | 34 | +100 food, +15 happiness |
| Fresh water | 8 | +70 water |
| Spring water (level 2) | 14 | +100 water, +5 happiness |
| Crunchy treat | 12 | +25 happiness |
| Can of water | 10 | 6 waterings |
| Seeds: carrot, sunflower, pumpkin, berry bush | 10, 18, 30, 45 | Levels 1, 2, 3, 5 |
| Toys: ball, kite, drum | 60, 110, 160 | Play for +20, +30, +40 happiness |
| Decorations: lantern, bench, pond, windmill | 50, 80, 120, 200 | Happiness fades 5% slower each |
| Extra garden plots (3rd to 6th) | 80, 150, 250, 400 | Levels 2, 3, 5, 7 |

**The balance, checked by a test that simulates real planned weeks:**

The pet's food fades by 60 a day and water by 72. Keeping both topped up
costs about 24 points a day:

```
               60 food per day                      72 water per day
  food  =  ────────────────────  x 16  =  16    water  =  ────────────────────  x 8  =  8.2
            60 food per bowl                          70 water per bowl
```

That is about 170 points a week.

| Plan | Points per week (sets + bonuses) | Pet care | Left to save |
| --- | --- | --- | --- |
| 2 days x 10 min | more than 170 | 170 | a little |
| 4 days x 20 min | roughly 600 to 750, plus up to 130 from quests | 170 | most of it |

One normal 20-minute session pays for more than four days of care. So a
planned workout comfortably covers the pet and leaves points for seeds, toys
and the garden, which is what you asked for.

**Levels:** level 2 at 120 lifetime points, level 3 at 480, level 4 at 1,080,
level 5 at 1,920. Each level needs more than the last. Levels unlock seeds,
decorations and garden plots.

**Pet growth:** youngster at 300 verified reps, grown-up at 1,500.

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
