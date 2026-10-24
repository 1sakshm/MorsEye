import { describe, expect, it } from 'vitest';
import { ear, eyePoints, headPose, pickBlinks, type Point } from '../src/vision/features';

/** An eye 30 px wide with the given lid opening (p2/p3 above, p6/p5 below). */
function eye(opening: number): [Point, Point, Point, Point, Point, Point] {
  const h = opening / 2;
  return [
    { x: 0, y: 0 },
    { x: 10, y: -h },
    { x: 20, y: -h },
    { x: 30, y: 0 },
    { x: 20, y: h },
    { x: 10, y: h },
  ];
}

describe('features', () => {
  it('EAR of an open eye is about 0.3', () => {
    expect(ear(eye(9))).toBeCloseTo(0.3, 5);
  });

  it('EAR of a closed eye is about 0.05', () => {
    expect(ear(eye(1.5))).toBeCloseTo(0.05, 5);
  });

  it('EAR is 0 for a degenerate eye', () => {
    const p = { x: 1, y: 1 };
    expect(ear([p, p, p, p, p, p])).toBe(0);
  });

  it('scales normalised landmarks to pixels before computing EAR', () => {
    const lms = eye(9).map((p) => ({ x: (p.x + 100) / 640, y: (p.y + 100) / 480 }));
    expect(ear(eyePoints(lms, [0, 1, 2, 3, 4, 5], 640, 480))).toBeCloseTo(0.3, 5);
  });

  it('picks the eye blink blendshapes', () => {
    expect(
      pickBlinks([
        { categoryName: 'browDownLeft', score: 0.2 },
        { categoryName: 'eyeBlinkLeft', score: 0.7 },
        { categoryName: 'eyeBlinkRight', score: 0.6 },
      ]),
    ).toEqual({ blinkL: 0.7, blinkR: 0.6 });
  });

  it('head pose of the identity matrix is zero', () => {
    const p = headPose([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(p.yaw).toBeCloseTo(0);
    expect(p.pitch).toBeCloseTo(0);
    expect(p.roll).toBeCloseTo(0);
  });

  it('head pose recovers a 30° yaw', () => {
    const a = (30 * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // Ry(a), column-major.
    const m = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
    expect(headPose(m).yaw).toBeCloseTo(30);
  });
});
