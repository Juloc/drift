// The simulation's right-hand turn (heading grows towards the car's right) is a mirror image of three.js's axes
// (facing +z with y up, the right-hand side is -x), so the drawing flips x once, here, and nowhere else.
export const X = (x) => -x;
export const HEAD = (h) => -h;
