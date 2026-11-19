# Repling

A no-equipment home workout coach for iPhone. The camera counts every rep,
so reps cannot be typed in or faked. Verified reps are the only way to earn
points, and points keep a little pet and garden alive.

**Live link:** https://williamcyf.github.io/1-Habit-/

**Status:** all six milestones are built. What remains is tuning from
real-phone testing: see "What only your iPhone can confirm" below.

---

## What is in the app

- **Setup with Pip the coach:** a short health check, your profile, calorie
  estimates with the working shown, and a 2-minute camera fitness test.
- **Twelve camera-counted exercises:** push-up, squat, reverse lunge, glute
  bridge, sit-up, plank, mountain climber, jumping jack, high knees,
  bird-dog, good morning, burpee. Each has beginner, standard and advanced
  versions, an animated demo and form tips.
- **A coach's plan:** a weekly split, a 4-week block with an easier fourth
  week, warm-ups and cool-downs, swaps for sore wrists, knees, back or
  shoulders, and targets that adjust to how you actually perform.
- **Hands-free sessions:** tap Start once. The voice coach counts out loud
  and leads every step, so you never need to read the screen. Your own music
  can keep playing.
- **Points:** earned only from verified reps, kept in a tamper-evident
  record, with streaks, weekly quests and personal records.
- **A pet and a garden:** four original creatures that grow up as you train,
  a garden to plant and water, and a shop.
- **Progress:** charts, records, 18 badges and shareable result cards.
- **Works offline** once it has been opened, and installs to the Home Screen.

---

## Your privacy

- The camera picture is analysed on the phone and then thrown away.
- Nothing is recorded, saved or uploaded. There is no account and no server.
- Every page is locked so it can only talk to its own site. Safari enforces this.
- All your data stays on the phone. You can export a backup file yourself.

---

## Put it on your iPhone

1. Open **Safari** (not Chrome) and go to https://williamcyf.github.io/1-Habit-/
2. Tap the **Share** button (a square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**, then **Add**.
4. Open Repling from the new icon. It runs full-screen like an app.

Use Safari because it is the only iPhone browser that gets every feature,
and the installed app is where the screen stays awake properly.

Do your setup inside the installed app: iOS keeps an installed app's data
separate from Safari's.

---

## How to update and redeploy

Publishing is automatic. Whenever new code is pushed to GitHub, a robot
(GitHub Actions) does four things in order:

1. runs the 446 automated tests
2. builds the site
3. checks the app code is still under its 300 KB size budget
4. publishes it to GitHub Pages

If any step fails, nothing is published, so a broken version cannot go live
by accident. You can watch each run in the **Actions** tab of the repository.

An installed copy updates itself: the next time you open it with internet,
it notices the new version within a few seconds and reloads once.

**To change something,** edit the code (or ask Claude Code to), then commit
and push. That is the whole process.

<details>
<summary>One-time hosting setup (already done for this repository)</summary>

1. Repository **Settings** → **Pages** → **Source**: **GitHub Actions**.
2. **Settings** → **Environments** → **github-pages** → **Deployment branches
   and tags**: **No restriction** (GitHub otherwise only lets `main` publish).
3. **Actions** tab → newest "Deploy to GitHub Pages" run → **Re-run all jobs**.

</details>

## Your data and backups

Everything is saved on your phone only. In the app, go to **Me** → **Your
data** to export a backup file (save it to Files or iCloud Drive) or import
one. For a new phone: export on the old one, import on the new.

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
| `npm run size` | Checks the app code against its size budget |
| `npm run icons` | Redraws the app icon PNG files from `icon.svg` |
| `npm run og` | Redraws the link-preview picture |
| `npm run fixtures` | Re-makes the real-video test recordings (downloads the free clips listed in `scripts/fixtures/sources.json`; needs ffmpeg and Playwright) |

In development only, adding `?sim` to the address feeds the counters a
pretend athlete, so the screens can be tested without exercising. The
published app does not contain that code. Adding `?cpu` runs the tracker on the main
processor, for test browsers without a graphics chip.

---

## Honest limits of the anti-cheat

Repling has no server. Everything, including the points, lives on your phone.
A no-server app can never be 100% cheat-proof. Here is exactly what it does
and does not stop.

**What is built, and tested with replayed fake recordings and with videos of
real people (see DECISIONS.md, D44):**

| Layer | What it stops |
| --- | --- |
| No manual entry | There is no "+1" button, no typing in reps, no uploading a video or photo. |
| Start-position gate | A set only begins after the correct start position is held. It is asked for again after any pause. |
| Full range of motion | Half reps are not counted. |
| Tempo limits | Bouncing and impossible speeds are not counted. |
| Body shape checks | Sagging or piked push-ups, squats that are really lunges, and so on. |
| Real body travel | Bending one joint while the body stays still (lying down and flapping an arm). |
| Planted points | Shaking or sliding the phone, or shuffling the hands and feet. |
| Tracking loss and jumps | A rep is thrown away if the body vanishes or the tracker jumps to another person. |
| Confusion check | No counter accepts a different exercise. |
| Frozen-picture guard | A stalled camera cannot hand out free plank seconds. |
| Coach check-ins | About one set in three starts with "raise a hand above your head" (on floor exercises: "lift one hand off the floor and wave"), at an unpredictable moment. A video of someone else exercising cannot answer. |
| One door for points | Points are created in one function, called only after a verified set. |
| Tamper-evident record | Every line of the points record carries a fingerprint of the line before. Edits to the saved data are detected and the app falls back to what it can verify. |
| Daily cap | 400 workout points a day, so grinding or overtraining is not rewarded. |

**What it cannot stop:**

- A programmer who rewrites the app's code on their own device, or who reads
  the code and builds a valid fake points record.
- Someone who plays a video of exercise to the camera and also raises their
  own hand for every check-in.
- Hand position in push-ups (wide, diamond) cannot be seen from the side, so
  those styles are taken on trust.
- Facing the phone, knee push-ups and toe push-ups look the same, so the
  version is taken on trust. The straight-body check only works side-on.
- Only one person in the picture. Two people (say, a parent and child side by
  side) confuse the tracker, and their reps are not counted.
- Another person doing the exercise for you.

The aim is simple: make cheating harder than doing the push-ups.

---

## What only your iPhone can confirm

I cannot run an iPhone. The push-up and squat counters are now tested on
videos of real people (face-on and side-on), and those videos were also fed
into the real app as a pretend camera. The other exercises are still tested
on simulated bodies only. Each question below has a way to check it.

| Question | How to check | If it is wrong |
| --- | --- | --- |
| Do real reps count correctly? | Exercise library → pick one → Practise one set. For push-ups, stand the phone on the floor about 1 m in front of your head, facing you. | Tap the big number 5 times to show live numbers, and tell me the exercise, where the phone was, what you did and what it counted. Thresholds are one number each. |
| Does the voice play nicely with your music? | Camera check → Sound check, with Spotify or Musi playing. | Paste the report. It decides the final sound settings. |
| Does the phone stay cool in a 15-minute session? | Do a full session and feel the phone. | Tell me, and I lower the tracking rate or picture size. |
| Does anything sit under the notch or home bar? | Look at each screen, both ways up. | Tell me which screen. |

The exercises I am least sure of on a real body are mountain climbers and
bird-dog. Push-up, squat, plank, jumping jack and high knees are the most
standard for this kind of tracking.

Anything going wrong: **Me → About and privacy → Copy debug info** gives a
text summary to paste into a message.

---

## Not medical advice

Repling is a fitness tool, not a doctor. If you have chest pain, dizziness, an
injury, or a doctor has advised you against exercise, talk to a medical
professional first. Stop if something hurts.

---

## More reading

- [PLAN.md](PLAN.md): architecture, milestones, test results, risks
- [DECISIONS.md](DECISIONS.md): every big choice and the reason, plus the points economy table
- [LEARNING.md](LEARNING.md): glossary, "how the app is put together", and seven short lessons

## Credits

- Body tracking: [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) by Google, Apache 2.0 licence.
- All artwork (Pip, the pets, the plants, the demo figures, the icon) is original and drawn in code for this project.
