# Repling

A no-equipment home workout coach for iPhone. The camera counts every rep, so
reps cannot be faked. Verified reps earn points, and points keep a little pet
and garden alive.

**Status:** Milestone 3 of 6. See [PLAN.md](PLAN.md) for the road ahead.

What works today:

- Friendly setup with Pip the coach: health check, profile, calorie estimates
- Installs to the Home Screen and opens without internet
- Light and dark themes, metric and imperial units
- Backup export and import
- Twelve camera-counted exercises, each with beginner, standard and advanced versions
- A 4-week plan that adapts to how you actually perform, with warm-ups and cool-downs
- Hands-free sessions: tap Start once and the voice coach leads the rest
- A 2-minute fitness test to place you at the right level
- The camera check (tracking and sound diagnostics)

Not built yet: points, the pet and garden, progress charts.

**Live link:** https://williamcyf.github.io/1-Habit-/

---

## Your privacy

- The camera picture is analysed on the phone and then thrown away.
- Nothing is recorded, saved or uploaded. There is no server.
- Every page is locked so it can only talk to its own site. Safari enforces this.

---

## One-time setup: switch on the free hosting

Already done for this repository. Kept here in case it is ever needed again.

1. Open the repository, then **Settings** → **Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Go to **Settings** → **Environments** → **github-pages**.
4. Under **Deployment branches and tags**, choose **No restriction** and save.
   (By default GitHub only lets the `main` branch publish, and our work is on
   a different branch for now.)
5. Go to the **Actions** tab, open the newest "Deploy to GitHub Pages" run,
   and press **Re-run all jobs**. After about a minute it shows a green tick.

The site is now live at the link above.

## Open it on your iPhone

1. Open **Safari** (not Chrome) and go to https://williamcyf.github.io/1-Habit-/
2. Follow Pip through the setup.

Use Safari because it is the only iPhone browser that gets every feature,
and it is the one that installs apps to the Home Screen properly.

## Add it to your Home Screen

1. In Safari, tap the **Share** button (a square with an arrow pointing up).
2. Scroll down and tap **Add to Home Screen**, then **Add**.
3. Open Repling from the new icon. It runs full-screen like an app.

---

## How to update and redeploy

Publishing is automatic. Whenever new code is pushed to GitHub, a robot runs
the tests, builds the site and publishes it. In about a minute the live link
shows the new version. If a test fails, nothing is published, so a broken
version cannot go live by accident.

You can watch each publish in the **Actions** tab of the repository.

An installed copy updates itself: the next time you open it with internet, it
notices the new version within a few seconds and reloads once.

## Your data and backups

Everything is saved on your phone only. In the app, go to **Me** → **Your
data** to export a backup file (save it to Files or iCloud Drive) or import
one. If you ever get a new phone, export on the old one and import on the new.

## Run it on a computer (optional)

You need [Node.js](https://nodejs.org) version 22 or newer.

```bash
npm install
```

```bash
npm run dev
```

Then open the address it prints. The camera works on `localhost` without https.

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts a local preview that updates as you edit |
| `npm test` | Runs the automated tests |
| `npm run build` | Builds the final site into the `dist` folder |
| `npm run icons` | Redraws the app icon PNG files from `icon.svg` |

---

## Honest limits of the anti-cheat

Repling has no server. Everything, including the points, lives on your phone.

**What is built and tested so far (push-ups):** there is no way to type in
reps. A set only starts from a held start position. Half reps, bouncing,
sagging or piked hips, standing and waving an arm, lying down and bending one
arm, shaking or sliding the phone, and a second person walking in are all
rejected. Each of these is replayed as a fake recording in the automated tests.

**Coach check-ins:** about one set in three starts with "raise a hand above
your head". A video of someone else exercising cannot answer that, which
closes most of the "point the phone at a video" trick. A cheat who pauses the
video and raises their own hand each time could still get through.

**Taken on trust:** hand width in push-ups (wide, diamond) cannot be seen
from the side.

**Still to come:** a tamper-evident points record and a daily points cap.

**What it cannot stop:** a determined programmer who rewrites the app's code
on their own device, or someone who builds a custom rig to fool the camera.
No app without a server can stop that.

The aim is simple: make cheating harder than doing the push-ups.

(This section is updated as each layer is built.)

---

## Not medical advice

Repling is a fitness tool, not a doctor. If you have chest pain, dizziness, an
injury, or a doctor has advised you against exercise, talk to a medical
professional first. Stop if something hurts.

---

## More reading

- [PLAN.md](PLAN.md): architecture, milestones, risks
- [DECISIONS.md](DECISIONS.md): every big choice and the reason
- [LEARNING.md](LEARNING.md): glossary and "how the app is put together"

## Credits

- Body tracking: [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) by Google, Apache 2.0 licence.
- All artwork is original and drawn for this project.
