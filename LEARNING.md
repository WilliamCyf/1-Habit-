# Learning notes

Your running glossary, plus a map of how the app is put together. Each
milestone adds to it. Words are grouped by topic, in the order you met them.

---

## How this app is put together (the map)

```
1-Habit-/
├── index.html            The app's one page (screens are swapped inside it)
├── diag.html             The camera-check page
├── src/                  All the code we write
│   ├── app/              Start-up
│   │   ├── main.ts         first code to run: load data, pick theme, show a screen
│   │   └── store.ts        the single holder of the app's data
│   ├── state/save.ts     the save file: version, repair, backup
│   ├── profile/          Facts about you, and the maths
│   │   ├── profile.ts      what a profile contains, and valid ranges
│   │   ├── health.ts       the six safety questions
│   │   ├── units.ts        cm/kg to ft/lb and back
│   │   └── energy.ts       calorie formulas and starting level
│   ├── ui/               Everything you see
│   │   ├── dom.ts          tiny helper for building page elements
│   │   ├── components.ts   buttons, chips, sheets, toasts
│   │   ├── fields.ts       the profile questions
│   │   ├── onboarding.ts   the first-run flow
│   │   ├── home.ts         Today and Me tabs
│   │   ├── mascot.ts       Pip, with four expressions
│   │   └── explain.ts, install.ts, backup.ts, icons.ts
│   ├── sw/sw.js          the offline helper (service worker)
│   ├── pose/             Camera + body tracking
│   │   ├── camera.ts       turns the camera on and off
│   │   ├── tracker.ts      loads the pose model, finds the body dots
│   │   ├── frameLoop.ts    "wake me when the camera has a new picture"
│   │   ├── landmarks.ts    names for the 33 body dots
│   │   ├── geometry.ts     joint-angle maths
│   │   └── skeleton.ts     draws the stick figure
│   ├── perf/             Speed measuring
│   │   ├── pacer.ts        the doorman: which pictures get analysed
│   │   └── stats.ts        averages, percentiles, the 30-second timeline
│   ├── platform/ios.ts   iPhone quirks (Home Screen mode, keep screen awake)
│   ├── diag/             The camera-check page's own logic and report
│   └── styles/           base.css (shared look) and app.css (app screens)
├── public/               Files served exactly as they are
│   ├── models/             the pose model (the "brain" file)
│   ├── icons/              app icon and mascot
│   └── manifest.webmanifest  the app's ID card for iOS
├── tests/                Automated checks
├── scripts/              Helper scripts (copy the engine, make the icons)
└── .github/workflows/    The robot that tests and publishes the site
```

**What happens when you tap "Start camera test":**

1. `main.ts` asks `camera.ts` for the camera and `tracker.ts` for the model, both at once.
2. `frameLoop.ts` rings a bell each time the camera has a new picture.
3. `pacer.ts` decides "analyse this one" or "skip it" to hit 15 looks per second.
4. `tracker.ts` turns the picture into 33 body dots.
5. `skeleton.ts` draws the dots, and `stats.ts` records how long step 4 took.
6. Twice a second the numbers on screen are refreshed.

---

## Glossary

### The big picture

- **PWA (Progressive Web App):** a website that behaves like an installed app.
  Like a food truck that can also park permanently and act as a restaurant.
- **HTTPS:** the padlocked, encrypted way of loading a website. Browsers only
  allow the camera on padlocked pages.
- **Standalone mode:** how a site runs after "Add to Home Screen": full-screen,
  no Safari address bar.
- **Manifest:** a small file that tells the phone the app's name, icon and
  colours. The app's ID card.
- **Repository (repo):** the project folder plus its full history, stored on GitHub.
- **Commit:** a saved snapshot of the project with a note about what changed.
- **Branch:** a parallel copy of the project where work happens without
  disturbing the main version.
- **Deploy:** publish the app to the internet so your phone can open it.

### Body tracking

- **Pose tracking:** software that finds a person's joints in a picture.
- **Landmark:** one tracked body dot (left elbow, right knee). We get 33 per picture.
- **Model (neural network):** a file of numbers that has "learned" a skill
  from many examples. Ours learned to spot joints. It is the brain; the
  engine is the body that runs it.
- **Inference:** one run of the model on one picture. On screen I call this a
  "look", and the time it takes "think time".
- **Confidence (visibility):** how sure the model is about one dot, from 0 to 1.
- **Smoothing:** averaging a dot's position over recent pictures so it does not jitter.

### Speed and heat

- **FPS (frames per second):** how many pictures are handled each second.

  ```
                     1000
  looks per sec = ────────────────────────────
                   milliseconds between looks
  ```

  Example: one look every 66.7 ms gives 1000 ÷ 66.7 = 15 looks per second.
- **Millisecond (ms):** one thousandth of a second.
- **CPU:** the phone's general-purpose processor. A clever all-rounder.
- **GPU:** the graphics chip. Does thousands of simple sums at once, which is
  exactly what a pose model needs.
- **Delegate:** MediaPipe's word for "which chip does the work", GPU or CPU.
- **Fallback:** a plan B that kicks in automatically (GPU fails, use CPU).
- **Thermal throttling:** a hot phone deliberately slows itself to cool down.
  We spot it when think time creeps up during a long test.
- **Percentile (p95):** "95% of looks were at least this fast." It reveals the
  bad moments that an average hides, the way one terrible day is invisible in
  a monthly average.
- **Ring buffer:** a fixed-size list where new values overwrite the oldest. A
  conveyor belt with a set number of slots.
- **Histogram:** tally marks per value. Lets us find percentiles for a whole
  run with a tiny amount of memory.
- **Pacer:** our doorman that lets only some camera pictures through.
- **Main thread:** the single lane where a page's code and screen updates
  both run. Long jobs in that lane make the screen stutter.
- **Worker:** a second lane for heavy jobs. Not used yet (see DECISIONS D7).

### Web building blocks

- **HTML, CSS, JavaScript:** the skeleton, the clothes and the muscles of a web page.
- **TypeScript:** JavaScript plus labels saying what kind of value each thing
  is. A spell-checker for logic that catches mistakes before the app runs.
- **DOM:** the browser's live tree of everything on the page. Changing it
  costs time, so we only touch it when a value really changed.
- **Canvas:** a blank drawing board on the page. We draw the skeleton on one.
- **SVG:** a picture described by shapes instead of pixels, so it stays sharp
  at any size. The mascot is an SVG.
- **Event listener:** "when X happens, run this code." Like a doorbell.
- **Promise / async / await:** a way to say "start this slow job, and continue
  here when it is done" without freezing the page. Like a restaurant buzzer.
- **requestAnimationFrame:** "run this just before the next screen repaint."
- **requestVideoFrameCallback:** "run this when the video has a new picture."
  Better for us, because the screen repaints more often than the camera delivers.
- **WebAssembly (wasm):** a compact, pre-compiled program format that runs in
  the browser at near-app speed. MediaPipe's engine is a wasm file.
- **WebGL:** the browser's way of using the GPU.
- **Viewport:** the visible area of the page.
- **Safe area:** the part of the screen not covered by the notch or home bar.
- **Wake lock:** asking the phone not to dim or lock the screen.
- **State:** the one situation the app is in right now (idle, starting,
  running, paused, stopped). Naming the states stops impossible combinations,
  like "camera off but still counting".

### Data and saving (Milestone 1)

- **localStorage:** a small notebook the browser keeps for each website. We
  store one piece of text in it: the save file.
- **JSON:** a plain-text way of writing down data, readable by people and
  programs. Like a neatly labelled form.
- **Save version:** a number inside the save file saying which layout it
  uses, so future versions of the app know how to read old saves.
- **Migration:** a small function that upgrades a save from one version to
  the next. Like converting last year's spreadsheet to this year's template.
- **Sanitise:** check every value that comes from outside and repair or
  discard anything wrong. Never trust a file just because we wrote it once.
- **Store:** the single place that holds the app's data while it runs.
  Screens ask the store to change things; the store saves and tells the
  screens to redraw. One door in, one door out.
- **try / catch:** "try this, and if it blows up, do that instead." Used
  around anything that can fail for reasons outside our control, like storage.
- **Pure function:** code whose answer depends only on what you hand it, with
  no screen or storage involved. Easy to test: same input, same output.

### Offline (Milestone 1)

- **Service worker:** a helper script the browser keeps beside the app. It
  sits between the app and the internet, like a shopkeeper with a stockroom.
- **Cache:** the stockroom: copies of files kept on the phone.
- **Cache-first:** look in the stockroom first, and only go to the internet
  if the item is missing. Used for files that never change.
- **Network-first:** ask the internet first, and use the stockroom copy only
  if there is no connection. Used for the page itself, so updates arrive.
- **Hashed filename:** the build names files after a fingerprint of their
  contents (`main-DHXf_lqa.js`). If the contents change, the name changes, so
  a stored copy can never be stale.

### Screens (Milestone 1)

- **Component:** a reusable screen part (a button, a chip row, a pop-up
  sheet). Screens are assembled from components like Lego.
- **CSS custom property:** a named value such as `--bg` that many style rules
  share. A theme is just a second set of values for the same names.
- **Sheet:** a panel that slides up from the bottom of the screen, the iPhone
  version of a pop-up window.
- **Toast:** a short message that appears briefly and disappears by itself.
- **ARIA:** extra labels in the page that tell screen readers what a control
  is ("this is a tab, and it is selected"). Also what our tests click on.

### Fitness maths (Milestone 1)

- **BMR (basal metabolic rate):** the energy your body uses in a day at
  complete rest. A car's fuel use while idling.
- **Activity factor:** a multiplier for how active your week is.
- **MET:** how many times harder than sitting still an activity is.

  ```
                                    minutes
  kcal = MET  x  weight in kg  x  ───────────
                                      60
  ```

  Example: 5 MET, 70 kg, 20 minutes gives 5 x 70 x (20 ÷ 60) = 117 kcal.

### Sound

- **Web Audio API:** making sound from maths instead of audio files. A beep
  is a wave at a chosen pitch, switched on for a fraction of a second.
- **Speech synthesis:** the browser reading text aloud with the phone's
  built-in voices.
- **Audio ducking:** lowering one sound while another plays, like a sat-nav
  talking over the radio.
- **Audio session:** iOS's rule for how an app shares the speakers: mix with
  other apps, dip them, or pause them.
- **Unlocking audio:** iOS only lets a page make sound after you tap
  something, so the app prepares its sound engine inside a tap.

### Counting reps (Milestone 2)

- **State machine:** a system that is always in exactly one named state and
  moves between states by fixed rules. A turnstile: locked → unlocked →
  locked. The push-up counter is top → going down → bottom → top.
- **Threshold:** a line a measurement must cross to trigger something.
- **Hysteresis:** using two different thresholds, one for going down and one
  for coming up, with a gap between. A heating thermostat does this: on below
  19°, off above 21°, so it does not click on and off around 20°.
- **Feature:** a useful number worked out from raw data. From 33 dots we work
  out a handful of features: elbow angle, body-line angle, tilt.
- **Exponential moving average:** a simple smoother. Each new value moves the
  smoothed value part of the way. A shock absorber for numbers.
- **Synthetic data:** made-up test data. We generate fake push-ups (and fake
  cheats) from a geometric model of a body, because the tests cannot film a
  real person.
- **Test harness:** the scaffolding that replays recordings into the code
  and checks the outcome.
- **Governor:** a part that automatically limits speed to stay safe. Ours
  lowers the tracking rate if the phone slows down.
- **Queue:** things waiting their turn. The coach's speech queue is unusual:
  it holds one item and throws stale ones away.
- **Callback:** a function you hand to other code, saying "call this when
  something happens". The set controller tells the screen about reps this way.

### Tools

- **npm:** the app store for code libraries. `npm install` downloads them.
- **Package / dependency:** a library someone else wrote that we rely on.
- **Pinning a version:** locking a library to one exact version so it cannot
  change under us.
- **Vite:** the build tool. It bundles our many small files into a few small,
  fast ones for the phone.
- **Build:** turning the source code we write into the optimised files that get published.
- **Dynamic import:** loading a piece of code only at the moment it is needed.
  The tracking library is not downloaded until you start the camera.
- **Unit test:** a tiny automated check of one piece of logic, such as "does
  the pacer really pick 15 of 30 frames?". We have 78 so far.
- **End-to-end test:** a robot opens the real page in a real browser and
  clicks through it. I do this with a fake camera feed.
- **GitHub Actions (CI):** a robot on GitHub that runs the tests and publishes
  the site every time code is pushed.

### Privacy and safety

- **Self-hosting:** serving every file from our own site instead of borrowing
  from someone else's server.
- **CDN:** someone else's fast file server. Convenient, but it would see every
  visitor and break offline use, so we do not use one.
- **Telemetry:** usage statistics a program silently sends to its maker.
- **CSP (Content-Security-Policy):** a rulebook the browser enforces for a
  page. Ours says "talk to no server but your own".
- **Service worker (coming in M1):** a helper that stores the app on the phone
  so it opens without internet.

---

## Lessons so far

### Lesson 0: de-risk first

The hardest, least certain part of this app is "can a phone browser track a
body at speed without overheating?". If the answer were no, everything else
would be wasted. So we built the smallest thing that answers that one
question, and we measure before we build more. Engineers call this a "spike".

Three ideas from the code worth remembering:

1. **Measure, do not guess.** `stats.ts` records the think time of every look,
   and the report shows the average, the slowest 5%, and a 30-second timeline.
2. **Do less work.** The pacer skips every second picture. The skeleton is
   drawn with 3 drawing commands instead of 30. The numbers on screen refresh
   twice a second, not 60 times.
3. **Always have a plan B.** If the GPU fails, the tracker restarts on the
   CPU. If the app goes to the background, the camera is switched off and
   comes back when you return.

### Lesson 1: keep thinking separate from showing

Milestone 1 has two kinds of code, kept strictly apart.

**Thinking code** (`profile/`, `state/`) is plain maths and rules. It never
touches the screen. That is why 38 new tests can check it in under a second,
including rules that protect you: the calorie target is tried against dozens
of body sizes to prove it never drops below a safe floor.

**Showing code** (`ui/`) builds what you see and calls the thinking code for
answers. It contains no formulas of its own.

Three ideas worth remembering:

1. **Lists beat long if-chains.** Onboarding is a list of steps. Each step
   says what to show and whether you have answered enough. A small engine
   walks the list. Adding a step is adding one entry, not rewiring a flow.
2. **Never trust saved data.** `save.ts` checks and repairs every field on
   every load, keeps a spare copy, and refuses files from a newer version
   rather than damaging them. Phones lose power mid-write; files get edited.
3. **One source of truth.** The app stores height and weight in metric only.
   Feet and pounds are just a way of displaying them. Storing both would be
   like keeping two sets of books: sooner or later they disagree.

### Lesson 2: how the push-up counter thinks

Open `src/detectors/pushup.ts`. Three ideas carry the whole thing.

**1. Turn pictures into a few numbers.** Each look gives 33 dots. The counter
only needs a handful of numbers from them, mainly the elbow angle (how bent
the arm is) and the body-line angle (how straight shoulder–hip–ankle is).

**2. A turnstile with a gap.** The counter clicks once per journey: arms
straight, down to a deep bend, back to straight. "Deep" means 100° or less
and "straight" means 150° or more. The 50° gap between them is the trick. A
shaky reading wobbling around one number cannot click twice, because it would
have to travel the whole gap.

**3. Evidence before a verdict.** While a rep is in progress, the counter
collects evidence: how deep, how long, how straight, did the shoulder really
drop, did the hands stay put. Only when the arms are straight again does it
judge, and it either counts the rep with a score or rejects it with a reason.

Speed of one rep is checked the simple way:

```
                    distance travelled (one full rep)
  time per rep  =  ────────────────────────────────────
                              your speed
```

You cannot change the distance, so a rep that finishes in under half a second
means it was not a full rep (or it was a bounce).

**Why I trust it without filming anyone:** `tests/pushup.test.ts` plays 34
recordings into the counter. Honest ones must count exactly, at 10, 15 and 30
looks per second, with jitter, facing either way. Every kind of fake must
score zero. If a future change breaks any of that, the tests fail and the
app is not published.
