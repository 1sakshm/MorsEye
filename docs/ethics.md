# Ethics

## Record (fill in when you have the answer)

- **Asked:** _name of the BITS faculty member, date asked_
- **Their answer (exact words if possible):** _is an ethics review needed?_
- **If a review is needed:** committee, reference number, approval date. **No sessions run before approval.**
- **Conditions attached:** _e.g. no video, data retention period, wording changes to the consent form_

Consent text status: `docs/consent.md` drafted by the AI agent on 24 Oct 2026 (see `AI_USE.md`); approved by
Saksham on: _date_. The app shows that file word for word on the consent screen.

## Draft email to a faculty member

Drafted by the AI agent for Saksham to edit and send.

> **Subject:** Does a webcam blink study on myself need ethics review?
>
> Dear Prof. ____,
>
> I am a student at BITS Pilani working on MorsEye, a browser-based system that types Morse code from deliberate
> eye closures detected by an ordinary laptop webcam. I would be grateful for your advice on whether my
> evaluation needs an ethics review, and if so, from which committee.
>
> The evaluation has two parts:
>
> - **Myself as the only participant.** About 8 short sessions (12 minutes each) in which I close my eyes or wink
>   on cue and read a neutral text, and 5 typing sessions of 20 minutes. All processing runs on my laptop. The
>   recorded data are numbers per video frame (eye openness, 12 points around the eyes, head angle). Video is kept
>   on my laptop only, for labelling blink timing, and deleted afterwards.
> - **A public blink dataset** (Eyeblink8, released by its authors under GPL-3.0), from which I compute the same
>   eye features. I may also request a second public dataset (Researcher's Night) from its authors.
>
> I would publish the eye-feature numbers from my own sessions (no video, no images) and aggregate results from
> the public data in a short paper. If a few classmates later volunteer, I would use the attached consent form
> (adults only, unpaid, free to stop at any time, data stored under a code, optional video deleted after labelling).
>
> I have not recorded any sessions yet and would make any changes you suggest.
>
> Thank you,
> Saksham Sharma
> ____ (ID, programme, email)

## Data handling commitments (from the PRD, for reference)

- Participant files hold only codes (P01…). Any code-to-name list stays on paper, offline.
- Video is recorded only with the separate opt-in, kept locally under `data/video/` (gitignored), and deleted after
  labelling unless the consent says otherwise.
- The public dataset (`data/public/`) holds per-frame features and labels only: no images, no video, no landmarks
  beyond the 12 eye points.
