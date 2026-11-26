// The feel of driving: a switch between Arcade (the default: the counter-steer aid and the yaw damping as the game has always had them) and Pro (fewer aids: a third of
// the counter-steer and a little over half of the yaw damping, so the nose swings and a slide has to be caught by the driver). It changes the car's numbers only
// (like a tuning), never the physics rules. Boards keep the feel a time was set with (`feel` 0 = arcade, 1 = pro).
export const ARCADE = 0, PRO = 1;
export const FEELS = ['arcade', 'pro'];
export const ASSIST_PRO = 0.35, DAMP_PRO = 0.6;

/** The car's numbers for a feel (a new object; arcade changes nothing). */
export function applyFeel(car, feel = ARCADE) {
  return feel === PRO ? { ...car, assistScale: (car.assistScale ?? 1) * ASSIST_PRO, yawDampScale: (car.yawDampScale ?? 1) * DAMP_PRO, spinScale: 1.2 } : car;   // (spinScale: on a surface the rear wheels spin up quicker in Pro, physics.js K2)
}

/** 0 or 1 from a setting (a name, a number or nothing: arcade). */
export const feelOf = (v) => (v === PRO || v === 'pro' || v === '1' ? PRO : ARCADE);
