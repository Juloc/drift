// The sliders of the environment editor (lab-look.html): one row per value of the look that the owner may want to tune. `path` is where the value lives in the look file
// (data/looks/academy-sunset.json); `t`: 'num' (min, max, step), 'colour' ('#rrggbb') or 'az' / 'el' (the two angles of a direction vector, the path is the vector);
// `apply`: how a change reaches the picture: 'light' (the lights, the fog and the exposure at once), 'grade' (the after-pass at once), 'place' (the place is built again),
// 'stage' (the whole stage is built again: sky, smoke, ...), joined with '+'. Labels are [German, English]. Pure data and arithmetic: tested without a browser.
export const GROUPS = [
  { id: 'sun', label: ['Sonne und Licht', 'Sun and light'] },
  { id: 'grade', label: ['Belichtung und Farbe', 'Exposure and colour'] },
  { id: 'fog', label: ['Nebel', 'Fog'] },
  { id: 'sky', label: ['Himmel', 'Sky'] },
  { id: 'place', label: ['Der Platz', 'The place'] },
  { id: 'smoke', label: ['Rauch', 'Smoke'] },
];

const N = (g, path, de, en, min, max, step, apply) => ({ g, path, t: 'num', label: [de, en], min, max, step, apply });
const C = (g, path, de, en, apply) => ({ g, path, t: 'colour', label: [de, en], apply });
const D = (g, path, de, en, apply) => [{ g, path, t: 'az', label: [de + ': Richtung', en + ': direction'], min: -180, max: 180, step: 1, apply }, { g, path, t: 'el', label: [de + ': Höhe', en + ': height'], min: 0, max: 90, step: 1, apply }];

export const SLIDERS = [
  ...D('sun', 'sun.dir', 'Sonne', 'Sun', 'light+stage'), C('sun', 'sun.colour', 'Sonne: Farbe', 'Sun: colour', 'light'), N('sun', 'sun.intensity', 'Sonne: Stärke', 'Sun: strength', 0, 10, 0.05, 'light'),
  C('sun', 'fill.sky', 'Füll-Licht: Himmel', 'Fill: sky colour', 'light'), C('sun', 'fill.ground', 'Füll-Licht: Boden', 'Fill: ground colour', 'light'), N('sun', 'fill.intensity', 'Füll-Licht: Stärke', 'Fill: strength', 0, 6, 0.05, 'light'),
  ...D('sun', 'key2.dir', 'Zweites Licht', 'Second light', 'light'), C('sun', 'key2.colour', 'Zweites Licht: Farbe', 'Second light: colour', 'light'), N('sun', 'key2.intensity', 'Zweites Licht: Stärke', 'Second light: strength', 0, 4, 0.05, 'light'),
  N('grade', 'grade.exposure', 'Belichtung', 'Exposure', 0.3, 2.5, 0.01, 'light'), N('grade', 'grade.saturation', 'Sättigung', 'Saturation', 0, 2, 0.01, 'grade'), N('grade', 'grade.contrast', 'Kontrast', 'Contrast', 0.6, 1.6, 0.01, 'grade'),
  N('grade', 'grade.warmth', 'Wärme', 'Warmth', 0, 1.5, 0.01, 'grade'), C('grade', 'grade.lift', 'Schatten-Farbe', 'Shadow lift colour', 'grade'),
  N('grade', 'grade.bloom', 'Bloom: Stärke', 'Bloom: strength', 0, 2, 0.01, 'grade'), N('grade', 'grade.threshold', 'Bloom: Schwelle', 'Bloom: threshold', 0.3, 4, 0.05, 'grade'),
  C('fog', 'fog.colour', 'Nebel: Farbe', 'Fog: colour', 'light'), N('fog', 'fog.near', 'Nebel: Beginn', 'Fog: near', 0, 1500, 10, 'light'), N('fog', 'fog.far', 'Nebel: Ende', 'Fog: far', 500, 9000, 50, 'light'),
  C('sky', 'sky.top', 'Himmel: oben', 'Sky: top', 'stage'), C('sky', 'sky.mid', 'Himmel: Mitte', 'Sky: middle', 'stage'), C('sky', 'sky.horizon', 'Himmel: Horizont', 'Sky: horizon', 'stage'), C('sky', 'sky.below', 'Himmel: unten', 'Sky: below', 'stage'),
  N('sky', 'sky.sunGlow', 'Sonnenglanz', 'Sun glow', 0, 3, 0.05, 'stage'), C('sky', 'sky.glow', 'Sonnenglanz: Farbe', 'Sun glow: colour', 'stage'),
  C('sky', 'sky.clouds.lit', 'Wolken: hell', 'Clouds: lit side', 'stage'), C('sky', 'sky.clouds.shade', 'Wolken: Schatten', 'Clouds: shade', 'stage'), N('sky', 'sky.clouds.amount', 'Wolken: Menge', 'Clouds: amount', 0, 1.5, 0.01, 'stage'),
  C('place', 'place.asphalt', 'Asphalt: Farbe', 'Asphalt: colour', 'place'), N('place', 'place.damp', 'Asphalt: feucht', 'Asphalt: damp', 0, 1, 0.01, 'place'), N('place', 'place.mirror', 'Nasse Fläche: Spiegel', 'Wet pad: mirror', 0, 1, 0.01, 'place'),
  C('place', 'place.patch', 'Flicken: Farbe', 'Patches: colour', 'place'), C('place', 'place.rubber', 'Gummi: Farbe', 'Rubber: colour', 'place'), C('place', 'place.sea', 'Meer: Farbe', 'Sea: colour', 'place'),
  C('place', 'place.barrierRed', 'Barriere: rot', 'Barrier: red', 'place'), C('place', 'place.barrierWhite', 'Barriere: weiß', 'Barrier: white', 'place'),
  C('place', 'place.palmTrunk', 'Palme: Stamm', 'Palm: trunk', 'place'), C('place', 'place.palm', 'Palme: Wedel', 'Palm: fronds', 'place'), C('place', 'place.palmTip', 'Palme: Spitzen', 'Palm: tips', 'place'),
  C('place', 'place.grass', 'Gras: hell', 'Grass: light', 'place'), C('place', 'place.grassDark', 'Gras: dunkel', 'Grass: dark', 'place'),
  C('smoke', 'smoke.colour', 'Rauch: Farbe', 'Smoke: colour', 'stage'), C('smoke', 'smoke.shade', 'Rauch: Schatten', 'Smoke: shade', 'stage'), N('smoke', 'smoke.opacity', 'Rauch: Deckkraft', 'Smoke: opacity', 0, 1, 0.01, 'stage'),
  N('smoke', 'smoke.size', 'Rauch: Größe', 'Smoke: size', 0.2, 4, 0.05, 'stage'), N('smoke', 'smoke.maxSize', 'Rauch: größte Größe', 'Smoke: largest size', 0.5, 8, 0.1, 'stage'),
  N('smoke', 'smoke.life', 'Rauch: Lebensdauer', 'Smoke: life', 0.2, 4, 0.05, 'stage'), N('smoke', 'smoke.near', 'Rauch: Ausblenden nah an der Kamera', 'Smoke: near fade', 0, 8, 0.1, 'stage'),
  N('smoke', 'smoke.carDim', 'Rauch: Abdunkeln vor dem Auto', 'Smoke: dimming in front of the car', 0, 1, 0.01, 'stage'),
];

export const getPath = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
export function setPath(o, path, v) { const ks = path.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; }

const DEG = Math.PI / 180;
/** The look's direction vector [x, y, z] (x to the sun's right, z toward -z where the sea is) as azimuth (degrees, 0 = +z, + towards +x) and height (degrees). */
export const anglesOf = ([x, y, z]) => ({ az: Math.atan2(x, z) / DEG, el: Math.atan2(y, Math.hypot(x, z)) / DEG });
/** The vector for two angles (unit length). */
export const dirOf = (az, el) => [Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), Math.cos(az * DEG) * Math.cos(el * DEG)].map((v) => Math.round(v * 1000) / 1000);
