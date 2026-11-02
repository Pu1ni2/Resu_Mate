/* Whether the candidate's face is in the picture, and the interview's record
 * of it, as the video room reports them.
 *
 * The room compared where the face sat in the camera's own picture (1280
 * wide) with half the width of the smaller picture on screen, so a centred
 * face read as far off to the side: "face in view" came out near 0%, and a
 * "look away" was counted at every check, every 0.6 seconds (236 in 2:23). */

// How far the face's centre may sit from the middle of the picture, as a
// share of half its width, and still be in view.
const IN_VIEW_OFFSET = 0.3;

// box and width in the same picture's units: the on-screen one's.
export function faceInView(box, width) {
  if (!box || !width) return false;
  const centre = box.x + box.width / 2;
  return Math.abs(centre - width / 2) / (width / 2) < IN_VIEW_OFFSET;
}

export const NO_CHECKS = { checks: 0, inView: 0, left: 0, wasInView: true };

// The record after one more check: how many checks found the face in view,
// and how many times it left the picture, once each time however long it
// stayed out. No face found is out of view.
export function recordCheck(record, inView) {
  return {
    checks: record.checks + 1,
    inView: record.inView + (inView ? 1 : 0),
    left: record.left + (record.wasInView && !inView ? 1 : 0),
    wasInView: inView,
  };
}

// The share of checks that found the face in view, or null when none was
// made (the detector didn't load): that's not 0%.
export function shareInView(record) {
  return record.checks ? Math.round((record.inView / record.checks) * 100) : null;
}
