# Recording and labelling sessions (Part A, 28 Oct – 12 Nov 2026)

The rules are in `docs/preregistration.md` (sections 3, 4 and 6, and the Deviations entry of 28 Oct). This page is
the practical checklist.

## The plan

- **6 to 8 sessions**, on **at least 4 different days**, all before the end of 12 Nov. Stop at 8 included sessions.
- **Lighting:** about half the sessions in normal room light, the rest split between bright and dim light. Write
  the condition in the setup notes every time (`normal`, `bright` or `dim`, plus what the light is).
- **Same laptop and camera**, about **50–70 cm** from the screen (session 1 was at 45 cm; sit a little further back).
- **Label each session the same day** you record it. Labelling is the bottleneck: plan about 45–60 minutes per
  session.

A schedule that fits: two sessions a day on 29 Oct, 31 Oct, 2 Nov and 4 Nov (8 sessions, 4 days), with 5–8 Nov
spare for anything that fails the exclusion rules.

## Before each session

1. **Light your face from the front.** In session 1 the camera dropped to 10 fps when the light fell; a session
   whose median is under 12 fps is excluded. For the "dim" sessions this is expected and is reported.
2. Plug the laptop in, close other camera apps, and use the same browser each time.
3. Open `morseye.pages.dev/study/` and fill in the setup screen:
   - Participant ID **P01**; **session number 2, 3, 4, …** (one higher each time; never reuse a number);
   - Study **A**; **tick "Counterbalance"**; **tick "Record a video"** (needed for labelling);
   - setup notes: lighting condition, distance, anything unusual.

## During the session

- Follow the cues the same way as in session 1: make each short or long closure the way you would when typing.
  (Do not aim for a particular length; changing how you do it between sessions would bias the results.)
- In the reading blocks, just read; blink normally.

## After the session

1. Download both files (`P01_A_sN_<date>.jsonl` and `.webm`).
2. Put the `.jsonl` in `data/raw/` and the `.webm` in `data/video/` (both stay out of git).

## Labelling (in `/labeler`)

Every closure in the session is labelled by you: the cued ones **and every natural blink** in all blocks.

**Where a closure starts and ends (use the same rule every time):**

- **Onset:** the first frame where the upper lid has started to move down.
- **Offset:** the first frame where the eye is fully open again.

**Steps:**

1. Load the `.jsonl` and the `.webm`, and type your initials as labeller. Cues show on the timeline as dashed
   boxes with their name; they are only hints.
2. **First pass (hold mode):** set the speed to 0.5×, press **Space** to play, and **hold H** whenever the eye is
   closed, releasing when it opens. Do this for the whole session, cued closures and natural blinks alike. After
   each release, press the type: **1** spontaneous, **2** short, **3** long, **4** wink-L, **5** wink-R (what you
   actually did, not what the cue asked for). Each hold makes a *rough* event.
3. **Second pass:** press **D** to go to each rough event. Step frame by frame with **← →**, then set the exact
   onset and offset with **[** and **]**, or press **Enter** if the edges are already right. Fix any wrong type
   with 1–5, delete mistakes with **Del**, and add any closure you missed with **[** **]** and a type.
4. Export. It only works when no rough event is left. Put `P01_A_sN_labels.csv` in `data/raw/`.

("Import cues as drafts" still exists, but with hold mode it would only create a duplicate of every cued closure.)

## Self-agreement (after all sessions are labelled)

Two sessions, chosen at random with seed 2026, are labelled again **at least one week later**, without looking at
the first labels. Export them as `P01_A_sN_labels_relabel.csv`. This can happen after 12 Nov.

## Then

`python -m analysis.run --data data/raw` runs the preregistered analysis (H1, H2, H3a; Study B too if it is run) on every
labelled session. Write the results and discussion yourself from its output.
