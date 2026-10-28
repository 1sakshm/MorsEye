# MorsEye: what to do, step by step (28 Oct – 12 Nov 2026)

Goal: **at least 6, ideally 8, labelled sessions** of you (P01) by the end of **12 Nov**, then the preregistered
analysis, then you write the results and discussion. Rules: `docs/preregistration.md`. Short version of this page:
`docs/sessions.md`.

---

## 0. Once, before the first session (10 minutes)

1. Use the **same laptop, the same camera and the same browser (Arc)** for every session and for labelling. The
   labelling tool saves your work inside the browser, so switching browsers loses it.
2. Find a desk lamp you can point at your face. You need it for the "bright" sessions and it helps the camera keep
   its frame rate.
3. Decide whether to **re-label session 1** (section 6). If you do, it counts, and you need one session fewer.

## 1. The schedule

Two sessions a day, at least 30 minutes apart (rest your eyes between them), on 4 different days:

| Day | Session | Light |
|---|---|---|
| Thu 29 Oct | 2 | normal |
| Thu 29 Oct | 3 | bright |
| Sat 31 Oct | 4 | normal |
| Sat 31 Oct | 5 | dim |
| Mon 2 Nov | 6 | normal |
| Mon 2 Nov | 7 | bright |
| Wed 4 Nov | 8 | normal |
| Wed 4 Nov | 9 | dim |
| 5 – 12 Nov | spare | repeat any session that failed (section 5) |

If you re-label session 1, you can skip session 9. Never reuse a session number; if a session fails, the next one
just gets the next number.

**What the light settings mean** (write the words in the setup notes):

- **normal:** your usual room light, nothing extra.
- **bright:** the desk lamp on, in front of you and a little to one side, plus the room light.
- **dim:** room lights off; only the screen and one lamp far behind or beside the laptop. If the camera check
  (step 2.6) shows under 12 fps, add a little light until it reads 12 or more.

Each session takes about **15 minutes** to record and about **45–60 minutes** to label. Label it **the same day**.

---

## 2. Recording a session (about 15 minutes)

1. Plug the laptop in. Close Zoom, Teams, the Camera app and any other tab that uses the camera.
2. Set the light for this session (table above). Sit about **50–70 cm** from the screen (an arm's length).
3. Open Arc and go to **https://morseye.pages.dev/study/**.
4. On **New session**, fill in:
   - **Participant ID:** `P01`
   - **Session:** the number from the table (2, 3, 4, …)
   - **Study:** `A: blink detection benchmark (~12 min)`
   - **Seed:** leave it as it is (it fills itself in)
   - tick **Counterbalance the order of blocks 3–5**
   - tick **Record a video of the face on this laptop, for labelling only**
   - **Age range:** `18–24` · **Glasses:** `No`
   - **Lighting:** `normal`, `bright` or `dim`, then what the light is, e.g. `bright: desk lamp front-left + ceiling`
   - **Camera model:** `built-in 1080p` · **Distance (cm):** e.g. `60`
   - **Notes:** anything unusual (tired, eyes dry, someone walked in…)
5. Click **Continue to camera check**. Allow the camera if Arc asks.
6. On **Camera check**, wait until **Status** says the face is found and **Measured fps** is steady.
   **It must read 12 or more.** If it is lower, add light. Check that **Video recording** says `yes`.
7. Click **Start the study**. From here, each block starts with a screen; press **Enter** (or **Start block**)
   when you are ready.
8. The blocks (their order after the first one may change, because of Counterbalance):
   - **Calibration:** look at the dot; close your eyes briefly on **SHORT**, hold them closed on **LONG**; then
     keep your eyes open for 15 seconds.
   - **Reading:** read the text for 3 minutes. Just read and blink normally.
   - **Cued closures:** 40 cues: **SHORT**, **LONG**, **WINK-L** (close only the left eye), **WINK-R** (only the
     right). Respond to each one.
   - **Reading with cues:** read again; when a cue appears in the corner, respond to it, then keep reading.

   Make each closure **the way you would when typing**, the same way as in session 1. Do not aim for a particular
   length.
9. On **Session complete**, click **Download log (.jsonl)** and then **Download video (.webm)**. **Do not close the
   tab before both downloads have finished**: closing it discards anything not downloaded.
10. Check your Downloads folder: you should have `P01_A_sN_<date>.jsonl` (about 3 MB) and
    `P01_A_sN_<date>.webm` (about 80 MB), where N is the session number.

If something goes wrong mid-session (you sneeze through a block, the camera freezes), click **Abort session**, then
start again with the **next** session number and write what happened in the notes.

---

## 3. Labelling a session (about 45–60 minutes, same day)

**Where a closure starts and ends — use this rule every time:**

- **Start (onset):** the first frame where the upper lid has started to move down.
- **End (offset):** the first frame where the eye is fully open again.

1. Open **https://morseye.pages.dev/labeler/** in Arc.
2. Click **Log (.jsonl)** and pick the session's `.jsonl`; click **Video (.webm)** and pick its `.webm`.
3. Type your initials in **Labeller**.
4. **First pass, hold mode (about 20–25 minutes):**
   - set **Speed** to **0.5×**, click the timeline once, and press **Space** to play;
   - **hold H** while your eye is closed and **let go** when it opens. Do it for **every** closure: the cued ones
     and **every natural blink**, in all four blocks;
   - right after letting go, press the type: **1** natural blink, **2** short, **3** long, **4** wink-left,
     **5** wink-right. Type what you **actually did**, not what the cue asked for;
   - press **Space** to pause whenever you need to; holding H only works while the video plays.
5. **Second pass, exact times (about 25–35 minutes):**
   - press **D** to jump to the next *rough* event;
   - step frame by frame with **←** and **→** (Shift moves 10 frames), using the rule above;
   - if both edges are already on the right frames, press **Enter**;
   - otherwise put the cursor on the start frame and press **[**, then on the end frame and press **]**;
   - fix a wrong type with **1–5**; delete a mistake with **Del**; add a closure you missed with **[**, **]** and a
     type;
   - repeat **D** until the counter on the right shows no rough events left.
6. Click **Export labels**. If Arc asks whether to allow several downloads, allow it. You get
   `P01_A_sN_labels.csv` (and `P01_A_sN_labels_meta.json`).

If Export refuses, the message at the top says why (an event without a type, or rough events left).
Your work is saved in the browser as you go, so you can stop and come back later in the same browser.

---

## 4. What to hand over after each session

Leave these in your **Downloads** folder (or put them directly in the project folders shown):

| File | Goes to |
|---|---|
| `P01_A_sN_<date>.jsonl` | `data/raw/` |
| `P01_A_sN_<date>.webm` | `data/video/` |
| `P01_A_sN_labels.csv` | `data/raw/` |
| `P01_A_sN_labels_meta.json` (if it downloaded) | `data/raw/` |

And send one line, for example:

> Session 4 recorded and labelled. Light: normal. Files in Downloads. Notes: none.

They are then checked against the preregistered exclusion rules (missing frames, frame rate, calibration, all four
blocks) and filed. You hear back whether the session is included.

---

## 5. When a session does not count

A session is excluded if more than 5% of frames are missing, the median frame rate is under 12 fps, the calibration
block has fewer than 5 usable closures, or a block is missing. Excluded sessions are kept and reported; just record
another one with the next session number (use the spare days, 5–12 Nov).

---

## 6. Optional: re-label session 1

Session 1 (24 Oct) only has response types, so it does not count. To make it count, label it like any other
session (section 3) with `P01_A_2026-10-24.jsonl` and its `.webm` (both are in your Downloads folder and in
`data/raw/` and `data/video/`). The old labels in the browser for this file are the cue drafts from 25 Oct: delete
them all first (select each with **Tab** and press **Del**), or ask for a clean start. Export gives
`P01_A_labels.csv`.

---

## 7. After the last session

1. **Analysis:** `python -m analysis.run --data data/raw` runs the preregistered tests (H1, H2, H3a) on every
   included session and writes the numbers, figures and tables.
2. **Self-agreement:** two sessions, picked at random (seed 2026), are labelled again **at least a week after**
   their first labelling, without looking at the first labels. Export them as `P01_A_sN_labels_relabel.csv`. This
   can be after 12 Nov.
3. **Writing:** you write the results and discussion yourself, from the analysis output. Every number comes from
   the analysis files, never typed from memory.

---

## Quick reference

| Key (labeller) | Does |
|---|---|
| Space | play / pause |
| hold H | mark a rough closure while playing |
| 1 – 5 | type: natural, short, long, wink-L, wink-R |
| D | next rough event |
| ← → (Shift) | step 1 (10) frames |
| [ then ] | set start and end of the selected event |
| Enter | accept a rough event's edges as they are |
| Del | delete the selected event |
| + / − | zoom the timeline |
