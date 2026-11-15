# Learning notes

Your running glossary, plus a map of how the app is put together. Each
milestone adds to it. Words are grouped by topic, in the order you met them.

---

## How this app is put together (the map)

```
1-Habit-/
├── index.html            The front door (home page)
├── diag.html             The camera-check page
├── src/                  All the code we write
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
│   ├── home/             The home page's logic
│   └── styles/base.css   Colours, fonts, buttons shared by every page
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
  the pacer really pick 15 of 30 frames?". We have 34 so far.
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
