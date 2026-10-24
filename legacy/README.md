# Legacy code

Not part of MorsEye 2.0. Kept for history only.

- `opencv_prototype.py` — the first desktop prototype. It used OpenCV **Haar cascades** (not MediaPipe), different
  timings (letter gap 0.2 s) and an optional light/LED mode. The old README called it "the backend"; it never was —
  the web app never talked to it.
- `web-v1/` — the original 242-line browser demo (MediaPipe FaceMesh from an unpinned CDN, fixed EAR 0.21, a 5-frame
  majority vote, no reject band, light/LED mode). MorsEye 2.0 replaced it; see PRD §4 for the audit of what was wrong.

Light/LED mode was dropped from the product (PRD §5.9): it is not part of the research question.
