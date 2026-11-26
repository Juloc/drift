// Drift, milestone 1: driving alone. Fixed-step simulation (sim/), drawn with three.js (view/).
// Address options: ?debug=1 numbers, ?tier=low|medium|high fixes the quality, ?touch=1 shows the touch buttons,
// ?demo=orbit lets a bot drive a drift circle, ?t=6 runs that many seconds of simulation before the first frame.
import * as THREE from '../vendor/three/three.module.js';
import { step, makeCar, bodySlip, bodyVelocity, speedOf, turnedAngle, DT } from './sim/physics.js';
import { prepareMap, surfaceAt, collide } from './sim/map.js';
import { surfaceAt as trackSurface } from './sim/track.js';
import { collideBody, collideCars, damageStep, damaged, REF_MASS } from './sim/collision.js';
import { newScore, scoreStep } from './sim/score.js';
import { applyTuning, NAMES as TUNE_NAMES, valid as tuneValid } from './sim/tuning.js';
import { applyFeel, feelOf, PRO } from './sim/feel.js';
import { FixedLoop } from './sim/loop.js';
import { orbitBot } from './sim/bot.js';
import { lineBot } from './sim/linebot.js';
import { trackBot } from './sim/trackbot.js';
import { lobbyStart } from './sim/spawn.js';
import { newZones, zoneStep } from './sim/zones.js';
import { createStage, loadLook } from './view/look/stage.js';
import { sceneFromMap } from './view/look/mapscene.js';
import { Fleet } from './view/look/fleet.js';
import { carFx } from './view/carfx.js';
import { readDevice, startTier, TierPicker } from './view/look/autotier.js';
import { WheelPool } from './view/wheels.js';
import { CameraRig, PRESET_NAMES } from './view/camera.js';
import { Input } from './view/input.js';
import { ProbeHud } from './view/probehud.js';
import { SoundSystem } from './view/sound.js';
import { newRun, runStep, resultOf } from './sim/challenge.js';
import { TandemHud } from './view/tandemhud.js';
import { icon, setIcon, EMOTE_ICONS } from './view/icons.js';
import { newCones, coneStep, CONE_R, PENALTY } from './sim/cones.js';
import { GhostRecorder, GhostPlayer } from './sim/ghost.js';
import { PracticeBot, TandemPractice, MEETING_PRACTICE_START } from './sim/practice.js';
import { angDiff } from './core/rng.js';
import { X, HEAD } from './view/space.js';
import { WorldClient } from './net/world.js';
import { Remotes, hueColour } from './view/remotes.js';
import { makePose, settle, wheelPoints, heightSurface } from './sim/carpose.js';
import { GlowPool } from './view/wheels.js';

const params = new URLSearchParams(location.search);
const de = params.get('lang') ? params.get('lang') === 'de' : navigator.language?.startsWith('de');
const T = {
  en: { drift: 'DRIFT', score: 'Score', lost: 'Lost!', hand: 'HAND', brake: 'BRAKE', gas: 'GAS', rotate: 'Turn your phone to landscape', tip: 'Hold GAS, steer with the arrows, tap HAND to throw the tail out',
    online: 'driving here', solo: 'Time trial', newDrift: 'new best drift', reset: 'Restart', tunedMark: 'tuned', paint: 'Paint', cones: 'Cones', practiceGround: 'Practice ground', mapWinter: 'Winter pass', mapAutumn: 'Autumn drift course', toLobby: 'Back to the lobby', physNew: 'Hills: on', physOld: 'Hills: off', physKey: 'Physics that feels slopes (new) or the flat one (tap to switch)', camPreset_near: 'View: close', camPreset_follow: 'View: behind', camPreset_far: 'View: far', camPreset_top: 'View: from above', camFollowOn: 'Camera comes back by itself', camFollowOff: 'Camera stays where you put it', camDrag: 'Drag to turn the view, wheel to zoom', ctlTouch: 'Controls: touch (tap for keyboard)', ctlPc: 'Controls: keyboard (tap for touch)', modeTraining: 'Training', ghostBest: 'Ghost (your best run)', ghostDiff: 'Difference', newGhost: 'New ghost saved', ghostNone: 'No ghost yet: this run becomes it', modeTandem: 'Tandem', tandemNone: 'Nobody near you: drive up to another car first', tandemSent: 'Invitation sent to {to}', tandemInvite: '{by} asks you for a tandem in two runs', tandemNo_gone: 'That driver is not here any more', tandemNo_busy: 'That driver is busy', tandemNo_declined: 'Declined', tandemNo_timeout: 'No answer', tandemEnd_left: 'Your partner left', tandemEnd_cancelled: 'Tandem ended', tandemSoon: 'Tandem starts in {s}', tandemRound: 'Round {r} of 2', tandemLead: 'You lead', tandemChase: 'You chase', tandemSwap: 'Swap! Next round: {role}', tandemPts: '{n} points', tandemPair: 'Pair', tandemWith: 'With {name}', tandemYou: 'you', tandemThem: 'partner', deviceBest: 'Best on this device', withAccount: 'With an account you get on the board.', nameAsk: 'Your name (shown as "Name (Guest)")', modeDrift: 'Drift attack', modeTime: 'Time attack', again: 'Again', board: 'Best runs', privateSession: 'Private session', run: 'Run finished', sumTime: 'Time', sumPoints: 'Points', sumClips: 'Clipping points', sumBest: 'Best drift', clip: 'CLIP', zone: 'Zone', slip: 'Angle', best: 'Best drift', you: 'You are', race: 'Start a race', invite: '{by} starts a race on {map} ({laps} laps).', join: 'Join', no: 'No', waiting: 'Invitation sent: the race starts in a few seconds.', joined: 'You are in. Get ready.', busy: 'A race is on right now.', pause: 'The next race can start in {s} s.', getReady: 'Get ready', waitOthers: 'Waiting for the others', go: 'GO!', lap: 'Lap', finished: 'Finished', result: 'Result', dnf: 'DNF', newBest: 'new best', leave: 'Leave', backLobby: 'Back to the lobby', dropped: 'You were dropped. Tap to rejoin.', full: 'The world is full right now. Tap to try again.',
    keysSoft: 'Keyboard: soft (gas and steering build up)', keysDirect: 'Keyboard: direct (all or nothing)', leverOn: 'Mouse throttle lever on (L): wheel or drag up and down; the brake resets it', leverOff: 'Mouse throttle lever off (L)', volume: 'Volume', musicVolume: 'Music volume', nowPlaying: 'Music: {t} by {a} ({l})', quality: 'Graphics', camChase: 'Chase camera', camBonnet: 'Bonnet camera', camCockpit: 'Cockpit camera', padOn: 'Controller: stick steers, right trigger gas, left trigger brake, A handbrake, Y camera, X restart', padOff: 'Controller unplugged: paused', creativeOn: 'Creative mode on (K): no scores count, no damage', creativeOff: 'Creative mode off (K)', creativeBanner: 'CREATIVE: scores do not count', creativeChip: 'Creative', damageLabel: 'Damage', damageOn: 'Damage on (V)', damageOff: 'Damage off (V)', soundOn: 'Sound on (M)', soundOff: 'Sound off (M)', musicOff: 'Music: off', musicOn: 'Music: on', chLap: 'Set a clean lap in a race or time trial', chDone: 'Challenge finished', chConfirmed: 'confirmed', chFailed: 'ended by a hit', chTitle: 'Challenge',
    feelArcade: 'Arcade', feelPro: 'Pro (fewer aids)', feelKey: 'Feel of driving (X)', tandem: 'Tandem', lead: 'Lead', chase: 'Chase', side: 'Side by side', tandemBank: 'Tandem bonus', practiceBot: 'Practice bot (B)',
    hintKeys: 'Arrows or WASD to drive, Space = handbrake, Shift = brake, R = restart, F = fullscreen' },
  de: { drift: 'DRIFT', score: 'Punkte', lost: 'Verloren!', hand: 'HAND', brake: 'BREMSE', gas: 'GAS', rotate: 'Dreh das Handy ins Querformat', tip: 'GAS halten, mit den Pfeilen lenken, HAND wirft das Heck raus',
    online: 'fahren hier', solo: 'Zeitfahren', newDrift: 'neuer bester Drift', reset: 'Neu starten', tunedMark: 'getunt', paint: 'Lack', cones: 'Kegel', practiceGround: 'Übungsplatz', mapWinter: 'Winterpass', mapAutumn: 'Herbst-Driftkurs', toLobby: 'Zur Lobby', physNew: 'Gefälle: an', physOld: 'Gefälle: aus', physKey: 'Physik, die Gefälle spürt (neu), oder die flache (tippen zum Wechseln)', camPreset_near: 'Ansicht: nah', camPreset_follow: 'Ansicht: hinten', camPreset_far: 'Ansicht: weit', camPreset_top: 'Ansicht: von oben', camFollowOn: 'Kamera kehrt von selbst zurück', camFollowOff: 'Kamera bleibt, wo du sie hinstellst', camDrag: 'Ziehen dreht die Ansicht, Rad zoomt', ctlTouch: 'Steuerung: Touch (tippen für Tastatur)', ctlPc: 'Steuerung: Tastatur (tippen für Touch)', modeTraining: 'Training', ghostBest: 'Geist (deine beste Fahrt)', ghostDiff: 'Unterschied', newGhost: 'Neuer Geist gespeichert', ghostNone: 'Noch kein Geist: diese Fahrt wird er', modeTandem: 'Tandem', tandemNone: 'Niemand in der Nähe: fahr erst zu einem anderen Auto', tandemSent: 'Einladung an {to} geschickt', tandemInvite: '{by} lädt dich zum Tandem in zwei Durchgängen ein', tandemNo_gone: 'Der Fahrer ist nicht mehr da', tandemNo_busy: 'Der Fahrer ist beschäftigt', tandemNo_declined: 'Abgelehnt', tandemNo_timeout: 'Keine Antwort', tandemEnd_left: 'Dein Partner ist gegangen', tandemEnd_cancelled: 'Tandem beendet', tandemSoon: 'Tandem startet in {s}', tandemRound: 'Runde {r} von 2', tandemLead: 'Du fährst vorn', tandemChase: 'Du folgst', tandemSwap: 'Tausch! Nächste Runde: {role}', tandemPts: '{n} Punkte', tandemPair: 'Paar', tandemWith: 'Mit {name}', tandemYou: 'du', tandemThem: 'Partner', deviceBest: 'Bestwert auf diesem Gerät', withAccount: 'Mit Konto kommst du auf die Bestenliste.', nameAsk: 'Dein Name (wird als "Name (Gast)" gezeigt)', modeDrift: 'Drift-Attacke', modeTime: 'Zeitjagd', again: 'Nochmal', board: 'Beste Läufe', privateSession: 'Private Runde', run: 'Lauf beendet', sumTime: 'Zeit', sumPoints: 'Punkte', sumClips: 'Clipping-Punkte', sumBest: 'Bester Drift', clip: 'CLIP', zone: 'Zone', slip: 'Winkel', best: 'Bester Drift', you: 'Du bist', race: 'Rennen starten', invite: '{by} startet ein Rennen auf {map} ({laps} Runden).', join: 'Mitfahren', no: 'Nein', waiting: 'Einladung verschickt: das Rennen startet in ein paar Sekunden.', joined: 'Du bist dabei. Mach dich bereit.', busy: 'Gerade läuft ein Rennen.', pause: 'Das nächste Rennen geht in {s} s.', getReady: 'Mach dich bereit', waitOthers: 'Warte auf die anderen', go: 'LOS!', lap: 'Runde', finished: 'Im Ziel', result: 'Ergebnis', dnf: 'Ausgeschieden', newBest: 'neue Bestzeit', leave: 'Verlassen', backLobby: 'Zurück zur Lobby', dropped: 'Du wurdest getrennt. Tippen zum Zurückkehren.', full: 'Die Welt ist gerade voll. Tippen zum Erneut-Versuchen.',
    keysSoft: 'Tastatur: weich (Gas und Lenken bauen sich auf)', keysDirect: 'Tastatur: direkt (alles oder nichts)', leverOn: 'Maus-Gashebel an (L): Rad oder Ziehen nach oben und unten; die Bremse setzt ihn zur\u00fcck', leverOff: 'Maus-Gashebel aus (L)', volume: 'Lautstärke', musicVolume: 'Musik-Lautstärke', nowPlaying: 'Musik: {t} von {a} ({l})', quality: 'Grafik', camChase: 'Verfolgerkamera', camBonnet: 'Hauben-Kamera', camCockpit: 'Cockpit-Kamera', padOn: 'Controller: Stick lenkt, rechter Trigger Gas, linker Trigger Bremse, A Handbremse, Y Kamera, X Neustart', padOff: 'Controller getrennt: Pause', creativeOn: 'Kreativ-Modus an (K): keine Wertung, kein Schaden', creativeOff: 'Kreativ-Modus aus (K)', creativeBanner: 'KREATIV: nichts davon z\u00e4hlt', creativeChip: 'Kreativ', damageLabel: 'Schaden', damageOn: 'Schaden an (V)', damageOff: 'Schaden aus (V)', soundOn: 'Ton an (M)', soundOff: 'Ton aus (M)', musicOff: 'Musik: aus', musicOn: 'Musik: an', chLap: 'Fahr im Rennen oder Zeitfahren eine saubere Runde', chDone: 'Herausforderung beendet', chConfirmed: 'bestätigt', chFailed: 'durch einen Treffer beendet', chTitle: 'Herausforderung',
    feelArcade: 'Arcade', feelPro: 'Pro (weniger Hilfen)', feelKey: 'Fahrgef\u00fchl (X)', tandem: 'Tandem', lead: 'Vorne', chase: 'Hinterher', side: 'Nebeneinander', tandemBank: 'Tandem-Bonus', practiceBot: '\u00dcbungs-Bot (B)',
    hintKeys: 'Pfeile oder WASD fahren, Leertaste = Handbremse, Shift = Bremse, R = neu starten, F = Vollbild' },
}[de ? 'de' : 'en'];
document.documentElement.lang = de ? 'de' : 'en';
for (const e of document.querySelectorAll('[data-t]')) e.textContent = T[e.dataset.t];

const $ = (id) => document.getElementById(id);
// the 2.5D physics on the road's surface (slope force, wheel load, hill hold, crest and dip), to compare with the flat one: ?phys=1 or 0, else what the menu's switch kept on
// this device; flat until the owner has driven both
let storedPhys = null; try { storedPhys = localStorage.getItem('drift.phys'); } catch { /* no storage */ }
const phys25 = params.has('phys') ? params.get('phys') === '1' : params.has('shot') ? true : storedPhys === '1';   // (the fixed shots for pictures and checks are made with the model on the surface: tools/make-shots.mjs)
const deviceTouch = matchMedia('(pointer: coarse)').matches || params.has('touch');
let storedControls = null; try { storedControls = localStorage.getItem('drift.controls'); } catch { /* no storage */ }
const coarse = storedControls === 'touch' ? true : storedControls === 'pc' ? false : deviceTouch;   // the controls: chosen on this device, else what the device is (the menu switches them)
if (coarse) $('hint').hidden = true;
if (params.has('debug') || params.has('demo') || params.has('shot') || params.has('pose')) $('hint').hidden = true;

const [cars, mapList] = await Promise.all([
  fetch('data/cars.json').then((r) => r.json()).then((j) => j.cars),
  fetch('data/maps.json').then((r) => r.json()).then((j) => j.maps),
]);
const online = document.documentElement.dataset.mode === 'online';
const carIndex = params.has('car') ? Math.min(cars.length - 1, +params.get('car') || 0) : online ? Math.floor(Math.random() * cars.length) : 1;   // (one car for now, docs/FOCUS.md: the AE86 is car 1; the signed-in page is told 1 by the server)
// ?tune=steer,balance,power,handbrake (each -3..3, at most 10 points together): the garage's tuning of this car, seen by this page only
const tuneParts = (params.get('tune') ?? '').split(',').map(Number);
const tune = Object.fromEntries(TUNE_NAMES.map((k, i) => [k, tuneParts[i] ?? 0]));
const car0 = applyTuning(cars[carIndex], tuneValid(tune) ? tune : Object.fromEntries(TUNE_NAMES.map((k) => [k, 0])));
// the feel of driving: Arcade (the default) or Pro (fewer aids); ?feel=pro, the key X or the chip; kept on the device, told to the lobby (the boards keep the feel a time was set with)
let feel = feelOf(params.get('feel') ?? (() => { try { return localStorage.getItem('drift.feel'); } catch { return null; } })());
let car = applyFeel(car0, feel);
const wantMap = params.get('map'), startId = mapList.find((m) => String(m.id) === wantMap || m.scene === wantMap)?.id ?? 0;   // ?map=N or the theme's name (pass, harbour, desert, winter, meeting)   // ?map=N: start on that map (for looking at it)
// a map's assets: the physics (data/maps/*.json, also read by the server), the theme (data/scenes/*.json: how the land around the road looks) and the look (data/looks/*.json: colours, light, density)
const assetCache = new Map();
async function assets(id) {
  if (!assetCache.has(id)) {
    const m = mapList.find((x) => x.id === id);
    const [json, theme] = await Promise.all([fetch('data/maps/' + m.file).then((r) => r.json()), fetch(`data/scenes/${m.scene}.json`).then((r) => r.json())]);
    const look = await loadLook(theme.look);
    assetCache.set(id, { json, theme, look, scene: sceneFromMap(json, theme), id });
  }
  return assetCache.get(id);
}
const first = await assets(startId);
const lobbyJson = (await assets(0)).json;
let map = prepareMap(first.json);
let mapId = startId, look = first.look;

// ----- view: the stage of the look (renderer, light, sky, the world of the map, mist, halos, tyre marks, smoke: view/look/stage.js), the cars and the camera
const forced = params.get('tier');
let tierName = ['high', 'medium', 'low'].includes(forced) ? forced : deviceTouch ? 'low' : 'high';
let lite = tierName === 'low';
document.body.classList.toggle('touch', coarse);
document.body.classList.toggle('lite', lite);
const stage = createStage({ canvas: $('view'), look: first.look, scene0: first.scene, tierName });
const { renderer, scene, camera } = stage;
// quality: ?tier= wins, then the setting kept on the device (drift.quality = auto|high|medium|low), then a guess from the device; in auto the first seconds are measured (TierPicker)
let qualitySetting = 'auto'; try { qualitySetting = localStorage.getItem('drift.quality') ?? 'auto'; } catch { /* no storage */ }
const picked = forced ? { tier: tierName, auto: false } : startTier(qualitySetting, readDevice(renderer));
let picker = picked.auto ? new TierPicker(picked.tier) : null;
if (picked.tier !== tierName) { stage.setTier(picked.tier); tierName = picked.tier; lite = tierName === 'low'; document.body.classList.toggle('lite', lite); }
const carModel = /^[a-z0-9-]{1,24}$/.test(params.get('model') ?? '') ? params.get('model') : cars[carIndex]?.model ?? 'rx7';   // ?model=ae86 shows another file (game/assets/cars/)
let fleet = await new Fleet(stage, { model: carModel, fx: cars[carIndex]?.fx }).load();   // the RX-7 for everybody unless the car or the address names a model (the code S15 where the file cannot be used)
const ownHue = (car.colour % 360) / 360;
let ownColour = new THREE.Color().setHSL(ownHue, 0.62, 0.42);
if (params.has('paint')) ownColour = hueColour(+params.get('paint') || 0);   // ?paint=0..26 for pictures (24 white, 25 black, 26 silver)
if (/^[0-9a-f]{6}$/i.test(params.get('paint') ?? '')) ownColour = new THREE.Color('#' + params.get('paint'));   // ?paint=ffffff: any colour for pictures
let mine = fleet.spawn(ownColour);
// the road's surface in the simulation's axes ((x, z, out) -> out.y, gx, gz): the track's own when the map brings one (sim/track.js), else the drawn height field's.
// The car's pose, the tyre marks and the smoke ask here, the other drivers' cars too (sim/carpose.js puts the car on its four wheel points)
const fieldSurface = heightSurface((x, z) => stage.field.groundY(x, z));
const roadSurface = (x, z, o = {}) => (map?.surface ? trackSurface(map.surface, x, z, o) : fieldSurface(x, z, o));   // (`map.surface`: the map's road, loaded by prepareMap from the packed `track` of the file)
const minePose = makePose(), ghostPose = makePose(), botPose = makePose(), _ws = { y: 0, gx: 0, gz: 0 };
const fxFor = (c) => (fleet.file ? carFx(c, cars[carIndex]?.fx, { lite }) : null);   // brake lights, exhaust flames (on the event car.pop that the throttle code below fires), underglow on the road
let mineFx = fxFor(mine);
const carGroup = new THREE.Group();
carGroup.add(mine.group);
const pool = new WheelPool(16);   // (only its shadow blobs are used: the cars bring their own wheels)
scene.add(carGroup, pool.blobs);
const groundAt = (x, z) => stage.field.groundY(x, z);
const cam = new CameraRig(camera, { look: look.camera, ground: groundAt });
if (['chase', 'bonnet', 'cockpit'].includes(params.get('cam'))) cam.set(params.get('cam'));   // ?cam=bonnet|cockpit for pictures; the key C cycles
const input = new Input($('touch'));
// the HUD (view/probehud.js): free driving in the lobby, laps and position in a race; the minimap shows the road of the map
const HT = { en: { lap: 'Lap', time: 'Time', best: 'Best', score: 'Drift score', position: 'Position', angle: 'Drift angle', gear: 'Gear', gas: 'Throttle', brake: 'Brake', hand: 'Handbrake', lost: 'Lost!', online: 'Online', bestDrift: 'Best drift' },
  de: { lap: 'Runde', time: 'Zeit', best: 'Beste', score: 'Drift-Score', position: 'Position', angle: 'Driftwinkel', gear: 'Gang', gas: 'Gas', brake: 'Bremse', hand: 'Handbremse', lost: 'Verloren!', online: 'Online', bestDrift: 'Bester Drift' } }[de ? 'de' : 'en'];
const shapesOf = (a) => ({ road: a.json.centre.map(([x, z]) => [X(x), z]), plaza: a.theme.mode === 'road' && a.scene.plaza ? a.scene.plaza.pts.map(([x, z]) => [X(x), z]) : [], closed: true });
const hud = new ProbeHud($('phud'), HT, de ? 'de' : 'en', shapesOf(first));
const tandemHud = new TandemHud(T);
// underglow (?glow=0..23 here, or from the garage): one glowing patch under a lit car, one draw call for all
const glowHue = params.has('glow') && +params.get('glow') >= 0 && +params.get('glow') < 24 ? Math.floor(+params.get('glow')) : null;
const glowPool = new GlowPool(16);
scene.add(glowPool.mesh);
const glowBoost = () => (look.lamp?.glowBoost ?? 1);
const remotes = online ? new Remotes({ scene, stage, fleet, pool, camera, tagsEl: $('tags'), glowPool, glowOf: (id) => net?.glow.get(id), glowBoost, maxNear: lite ? 3 : 6, surface: roadSurface }) : null;
// the state, declared before anything can call back (a socket may welcome us while the module still waits for a file)
let cur, prev, score, spin = 0, simSteps = 0, paused = false;
let lastInp = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };   // what the car was told in the last step (for the HUD)
let net = null, spawned = false, locked = false;
let zones = null, zoneNote = null;   // the zone scoring of a map with clipping points (sim/zones.js)
let dRunStart = -1, runDone = 0;   // a descent (the touge): the run is timed from the first gate to the end of the road, then the car goes back to the top
let onlineCount = 0, meName = '', ownHueIdx = -1, bestDrift = 0, bestLap = 0, lastEvent = null, freeMs = 0;
const raceInfo = { lap: 1, laps: 1, ms: 0, pos: 1, of: 1 };   // what the server says in a race (the HUD's cards)
// races, time trials, invitations and challenges are paused (docs/FOCUS.md): the code stays, the UI is hidden unless the address has ?races=1
const isPrivate = online && (params.has('world') || document.documentElement.dataset.guest === '1');   // a private world (a guest link): the HUD says so
// the modes (Drift attack, Time attack) run as a race of one on the server (a descent: from the grid to the last gate); the race bar of the old races stays hidden unless ?races=1
const raceMode = online && document.documentElement.dataset.race === '1';
if (params.get('races') === '1') document.body.classList.add('races');
let runMode = null, pendingMode = null;   // 'drift' | 'time' | null: the mode of the run that is on or about to start   // the signed-in app: races (the public demo has none)
const lobbyUrl = params.get('ws') || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?car=${carIndex}${glowHue !== null ? '&glow=' + glowHue : ''}`;
const fmt = (ms) => { const t = Math.max(0, Math.round(ms)); return `${Math.floor(t / 60000)}:${String(Math.floor(t / 1000) % 60).padStart(2, '0')}.${String(Math.floor((t % 1000) / 10)).padStart(2, '0')}`; };
const show = (id, on) => { const el = $(id); if (el) el.hidden = !on; };
let noteTimer = 0;
const note = (text) => { const el = $('note'); if (!el) return; el.textContent = text; el.hidden = false; clearTimeout(noteTimer); noteTimer = setTimeout(() => (el.hidden = true), 3500); };

/** Another quality tier while playing: the world is built again, the cars too when their materials depend on it. */
async function changeTier(name) {
  const carTierBefore = stage.carTier;
  carGroup.remove(mine.group);
  stage.setTier(name); tierName = name; lite = name === 'low';
  document.body.classList.toggle('lite', lite);
  if (stage.carTier !== carTierBefore) {
    fleet.dispose(); fleet = await new Fleet(stage, { model: carModel, fx: cars[carIndex]?.fx }).load();
    if (remotes) { remotes.fleet = fleet; remotes.clear(); remotes.maxNear = lite ? 3 : 6; }
    mine = fleet.spawn(ownColour);
    mineFx = fxFor(mine);
    if (practice) togglePractice(false);
  }
  carGroup.add(mine.group);
}

/** Makes the map with this id the one that is drawn and driven on (loads its files the first time). Races are on any of the maps; the lobby is map 0. */
let mapLoading = null;
async function ensureMap(id) {
  if (id === mapId) return;
  if (mapLoading) await mapLoading;
  mapLoading = (async () => {
    const a = await assets(id);
    map = prepareMap(a.json); mapId = id;
    const newLook = a.look !== look;
    carGroup.remove(mine.group);
    stage.load(a.look, a.scene);   // takes the old world down and builds the new one (the renderer and the camera stay)
    conesBuild();
    look = a.look;
    if (newLook || true) {   // the cars are made for the look they are seen in (the sun's strength is in the painted style)
      fleet.dispose();
      fleet = await new Fleet(stage, { model: carModel, fx: cars[carIndex]?.fx }).load();
      if (remotes) { remotes.fleet = fleet; remotes.clear(); }
      mine = fleet.spawn(ownColour);
      mineFx = fxFor(mine);
      if (practice) togglePractice(false);
    }
    carGroup.add(mine.group);
    cam.setLook(look.camera); cam.setGround(groundAt);
    hud.setMap(shapesOf(a));
    stage.skids.clear();
  })();
  await mapLoading; mapLoading = null;
}

function openNet(url, inRace) {
  const droppedBtn = $('dropped');
  const n = new WorldClient({
    url,
    onWelcome(me) {
      if (!inRace && !spawned) {
        const ls = lobbyJson.lobbySpawn;   // the lobby is map 0, whichever map is drawn at this moment
        const g = lobbyStart(me.id, ls);   // spread over the plaza by id (six a row, three rows)
        cur = prev = makeCar(g.x, g.z, g.h); score = newScore(); cam.snap(cur); spawned = true;
      }
      droppedBtn.hidden = true;
    },
    onRoster(roster) {
      $('online-n').textContent = onlineCount = roster.size;
      const me = n.me && roster.get(n.me.id);
      if (me) {
        meName = `${T.you} ${me.name}`;
        if (ownHueIdx !== me.hue) { ownHueIdx = me.hue; ownColour = hueColour(me.hue); Fleet.colour(mine, ownColour, dmg); }
      }
    },
    onFix(f) { cur = prev = { ...cur, x: f.x, z: f.z, h: f.h, vx: 0, vz: 0, w: 0 }; },
    onBye(reason) { if (n === net && !racing) { droppedBtn.textContent = reason === 5 ? T.full : T.dropped; droppedBtn.hidden = false; } },
    onState(st) { if (st === 'open' && !inRace && pendingMode) { const m = pendingMode; pendingMode = null; setTimeout(() => startMode(m), 800); } if (st === 'open' && !inRace) { n.sendJson({ t: 'hello', road: lobbyJson.track?.version ?? 1 }); n.sendJson({ t: 'phys', v: phys25 ? 1 : 0 }); n.sendJson({ t: 'feel', v: feel }); if (creative) n.sendJson({ t: 'mode', v: 'creative' }); if (chStarted && chRun && !chRun.done) n.sendJson({ t: 'challenge.start', id: chDef.id }); } if (st === 'closed' && n === net && !racing) { $('online-n').textContent = onlineCount = 0; meName = ''; spawned = false; } },
    onJson: (j) => (inRace ? raceMessage(j) : lobbyMessage(j)),
  });
  n.connect();
  return n;
}

// ----- races (signed-in app only): invitation, grid, countdown, laps, result, back to the lobby
let racing = false;
let inviteKind = 'race';
/** The tandem in two runs: one banner at the top (countdown, round, your role, your points) while a match runs; the result card when it is over. */
function tandemRunShow(j) {
  let el = $('tandem-run');
  if (!el) { el = Object.assign(document.createElement('div'), { id: 'tandem-run', hidden: true }); el.setAttribute('role', 'status'); ($('hud') ?? document.body).append(el); }
  if (!j) { el.hidden = true; el.replaceChildren(); return; }
  const role = (r) => (r === 'lead' ? T.tandemLead : T.tandemChase);
  const line1 = j.phase === 'countdown' ? T.tandemSoon.replace('{s}', Math.ceil(j.left)) : j.phase === 'swap' ? T.tandemSwap.replace('{role}', role(j.role)) : `${T.tandemRound.replace('{r}', j.round)} \u00b7 ${role(j.role)} \u00b7 ${Math.ceil(j.left)} s`;
  const line2 = j.phase === 'countdown' ? T.tandemWith.replace('{name}', j.partner) : `${T.tandemPts.replace('{n}', j.mine)} \u00b7 ${T.tandemPair} ${j.total}`;
  el.replaceChildren(Object.assign(document.createElement('b'), { textContent: line1 }), Object.assign(document.createElement('span'), { textContent: line2 }));
  el.className = j.phase; el.hidden = false;
}
/** Ask the nearest other car (within 80 m) for a tandem in two runs. */
function tandemInvite() {
  if (!net?.connected || racing) return;
  let best = null, bd = 80;
  for (const o of net.sample(performance.now())) { const d = Math.hypot(o.x - cur.x, o.z - cur.z); if (d < bd) { bd = d; best = o; } }
  if (!best) { note(T.tandemNone); return; }
  net.sendJson({ t: 'tandem.invite', with: best.id });
}
function showTandemResult(j) {
  $('res-title').textContent = T.modeTandem;
  $('res-table').hidden = true;
  let box = $('res-mode'); if (!box) { box = Object.assign(document.createElement('div'), { id: 'res-mode' }); $('res-table').after(box); }
  const row = (k, v, cls) => { const r = document.createElement('div'); r.className = cls ?? ''; const a = document.createElement('span'), b = document.createElement('b'); a.textContent = k; b.textContent = v; r.append(a, b); return r; };
  const nf = (n) => Number(n).toLocaleString(de ? 'de-DE' : 'en-GB');
  box.replaceChildren(row(T.tandemPair, nf(j.total), 'main'), row(T.tandemWith.replace('{name}', j.partner), ''), row(`${T.tandemRound.replace('{r}', 1)}`, `${T.tandemYou} ${nf(j.mine[0])} \u00b7 ${T.tandemThem} ${nf(j.theirs[0])}`), row(`${T.tandemRound.replace('{r}', 2)}`, `${T.tandemYou} ${nf(j.mine[1])} \u00b7 ${T.tandemThem} ${nf(j.theirs[1])}`));
  if (params.get('open') === '1') {   // without an account: the best pair score stays on this device
    let kept = 0; try { kept = Number(localStorage.getItem('drift.best.tandem')) || 0; } catch { /* no storage */ }
    if (j.total > kept) { kept = j.total; try { localStorage.setItem('drift.best.tandem', String(kept)); } catch { /* not kept */ } box.append(Object.assign(document.createElement('p'), { className: 'new-best', textContent: T.newBest })); }
    box.append(row(T.deviceBest, nf(kept)), Object.assign(document.createElement('p'), { className: 'hint-account', textContent: T.withAccount }));
  }
  if ($('res-again')) $('res-again').hidden = true;
  show('result', true);
}
function lobbyMessage(j) {
  if (j.t === 'race.invite') {
    inviteKind = 'race';
    $('invite-text').textContent = T.invite.replace('{by}', j.by).replace('{laps}', j.laps).replace('{map}', j.mapName ?? '') + (j.tuned ? ` (${T.tunedMark})` : '');
    show('invite', true);
    clearTimeout(lobbyMessage.timer); lobbyMessage.timer = setTimeout(() => show('invite', false), j.ms);
  } else if (j.t === 'race.wait') note(T.waiting);
  else if (j.t === 'race.joined') { show('invite', false); note(T.joined); }
  else if (j.t === 'race.busy') note(j.wait ? T.pause.replace('{s}', j.wait) : T.busy);
  else if (j.t === 'race.go') { show('invite', false); startRace(); }
  else if (j.t === 'reload') {   // the server drives another road than this page (a new version went out while the page was open): load the page again, once
    let again = false; try { again = Date.now() - Number(sessionStorage.getItem('drift.reloaded') || 0) < 60000; if (!again) sessionStorage.setItem('drift.reloaded', String(Date.now())); } catch { /* no storage: reload anyway */ }
    if (!again) location.reload();
  } else if (j.t === 'emote') remotes?.emote(j.id, EMOTES[j.e]);
  else if (j.t === 'tandem') { if (!practice) tandemHud.set(j); }
  else if (j.t === 'tandem.bank') tandemHud.bank(j.points);
  else if (j.t === 'tandem.invite') {
    inviteKind = 'tandem';
    $('invite-text').textContent = T.tandemInvite.replace('{by}', j.by);
    show('invite', true);
    clearTimeout(lobbyMessage.timer); lobbyMessage.timer = setTimeout(() => show('invite', false), j.ms);
  } else if (j.t === 'tandem.sent') note(T.tandemSent.replace('{to}', j.to));
  else if (j.t === 'tandem.no') note(T['tandemNo_' + j.why] ?? T.tandemNo_gone);
  else if (j.t === 'tandem.run') { show('invite', false); tandemRunShow(j); }
  else if (j.t === 'tandem.result') { tandemRunShow(null); showTandemResult(j); }
  else if (j.t === 'tandem.end') { tandemRunShow(null); note(T['tandemEnd_' + j.why] ?? T.tandemEnd_cancelled); }
  else if (j.t === 'challenge') lobbyChallenge(j);
}

const chips = Object.assign(document.createElement('div'), { id: 'chips' });   // the small switches (sound, music, feel, creative, emotes, HUD): in a column on a big screen, behind one button on a phone
const chipsToggle = Object.assign(document.createElement('button'), { id: 'chips-toggle', type: 'button', ariaLabel: 'Menu' });
setIcon(chipsToggle, 'gear');
chipsToggle.addEventListener('click', () => chips.classList.toggle('open'));
const hudChip = Object.assign(document.createElement('button'), { id: 'hud-chip', type: 'button', textContent: 'HUD', title: 'HUD (H)' });
hudChip.addEventListener('click', () => hud.cycle());
document.body.append(chips, chipsToggle);
// everything a key can do can be done by touch (game/view/touchmap.js lists the keys and where their buttons are; a test keeps the list true): the reset is a small button of its own, the rest is in the menu
const resetBtn = Object.assign(document.createElement('button'), { id: 'reset', type: 'button', title: 'R', ariaLabel: T.reset });
setIcon(resetBtn, 'reset');
resetBtn.addEventListener('click', () => reset());
document.body.append(resetBtn);
const menuBtn = (id, label, title, fn) => { const b = Object.assign(document.createElement('button'), { id, type: 'button', title, ariaLabel: title }); setIcon(b, label); b.addEventListener('click', fn); chips.append(b); return b; };
menuBtn('cam-chip', 'camera', T.camChase, () => cycleCamera());
menuBtn('dmg-chip', 'wrench', T.damageLabel, () => toggleDamage());
menuBtn('bot-chip', 'bot', T.practiceBot, () => togglePractice());
// the camera: the view presets, auto-follow, drag to turn and wheel or two fingers to zoom; the settings stay on this device
const chase = cam.cams.chase;
if (chase.user) {
  try { const k = JSON.parse(localStorage.getItem('drift.cam') ?? 'null'); if (k) { if (PRESET_NAMES.includes(k.preset)) chase.user.preset = k.preset; chase.user.auto = k.auto !== false; if (Number.isFinite(k.zoom)) chase.user.zoom = Math.max(0.55, Math.min(2.4, k.zoom)); } } catch { /* nothing kept */ }
  const saveCam = () => { try { localStorage.setItem('drift.cam', JSON.stringify({ preset: chase.user.preset, auto: chase.user.auto, zoom: +chase.user.zoom.toFixed(2) })); } catch { /* not kept */ } };
  menuBtn('view-chip', 'view', T.camPreset_follow, () => { const u = chase.user; u.preset = PRESET_NAMES[(PRESET_NAMES.indexOf(u.preset) + 1) % PRESET_NAMES.length]; u.yaw = 0; u.lift = 0; u.zoom = 1; saveCam(); const t = T['camPreset_' + u.preset]; note(t); $('view-chip').title = t; });
  $('view-chip').title = T['camPreset_' + chase.user.preset];
  const followChip = menuBtn('follow-chip', 'follow', T.camFollowOn, () => { chase.user.auto = !chase.user.auto; saveCam(); showFollow(); note(chase.user.auto ? T.camFollowOn : T.camFollowOff); });
  const showFollow = () => { followChip.setAttribute('aria-pressed', chase.user.auto); followChip.title = chase.user.auto ? T.camFollowOn : T.camFollowOff; };
  showFollow();
  const c = renderer.domElement, ptr = new Map();
  c.addEventListener('contextmenu', (e) => e.preventDefault());
  c.addEventListener('pointerdown', (e) => { if (cam.mode !== 'chase') return; ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.pointerType }); try { c.setPointerCapture(e.pointerId); } catch { /* not capturable */ } });
  c.addEventListener('pointermove', (e) => {
    const p = ptr.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y, two = [...ptr.values()].filter((q) => q.t === 'touch');
    if (p.t === 'mouse') chase.nudge(dx * 0.006, -dy * 0.025);
    else if (two.length === 2) {   // two fingers: the angle between them turns the view, the distance zooms
      const o = two.find((q) => q !== p), a0 = Math.atan2(p.y - o.y, p.x - o.x), a1 = Math.atan2(e.clientY - o.y, e.clientX - o.x), d0 = Math.hypot(p.x - o.x, p.y - o.y), d1 = Math.hypot(e.clientX - o.x, e.clientY - o.y);
      let da = a1 - a0; da = Math.atan2(Math.sin(da), Math.cos(da)); chase.nudge(da, 0); if (d0 > 20) chase.zoomBy(d0 / d1);
    }
    p.x = e.clientX; p.y = e.clientY;
  });
  const up = (e) => { if (ptr.delete(e.pointerId)) saveCam(); };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  c.addEventListener('wheel', (e) => { if (cam.mode !== 'chase') return; e.preventDefault(); chase.zoomBy(Math.exp(e.deltaY * 0.0012)); chase.idle = 0; saveCam(); }, { passive: false });
}
{ const b = Object.assign(document.createElement('button'), { id: 'phys-chip', type: 'button', textContent: phys25 ? T.physNew : T.physOld, title: T.physKey }); b.setAttribute('aria-pressed', phys25); b.addEventListener('click', () => { try { localStorage.setItem('drift.phys', phys25 ? '0' : '1'); } catch { /* not kept */ } const u = new URL(location.href); u.searchParams.delete('phys'); location.href = u; }); chips.append(b); }
// the practice ground (drift circles, a figure eight, slalom, a short course): driven alone, with or without an account; from there back to the lobby
{ const names = { practice: T.practiceGround, winter: T.mapWinter, autumn: T.mapAutumn }, go = (scene) => { const u = new URL(location.href); for (const k of ['ws', 'rws', 'open', 'world', 'mode', 'shot', 'demo']) u.searchParams.delete(k); if (scene) u.searchParams.set('map', scene); else u.searchParams.delete('map'); location.href = u; };
  const add = (id, text, scene) => { const b = Object.assign(document.createElement('button'), { id, type: 'button', className: 'map-chip', textContent: text }); b.addEventListener('click', () => go(scene)); chips.append(b); };
  if (startId !== 0) add('lobby-chip', T.toLobby, null);
  for (const m of mapList) if (names[m.scene] && m.id !== startId) add(`${m.scene}-chip`, names[m.scene], m.scene); }
menuBtn('controls-chip', coarse ? 'phone' : 'monitor', coarse ? T.ctlTouch : T.ctlPc, () => { try { localStorage.setItem('drift.controls', coarse ? 'pc' : 'touch'); } catch { /* not kept */ } location.reload(); });
menuBtn('pause-chip', 'pause', 'P', () => { paused = !paused; });
for (const id of ['racebar', 'invite', 'racehud']) { const el = $(id); if (el) $('hud').append(el); }   // the race bar, the invitation and the race's leave button stand in one column under the score card
chips.append(hudChip);

// ----- emotes: ten fixed symbols (keys 1 to 0, or the little button), shown over the sender's car for three seconds; there is no free text anywhere
let emoteSend = null;
const EMOTES = EMOTE_ICONS;   // names of our own icons (the ten symbols the server relays by number)
if (online && raceMode) {
  const bar = Object.assign(document.createElement('div'), { id: 'emotes', hidden: true });
  const open = Object.assign(document.createElement('button'), { id: 'emote-open', type: 'button', ariaLabel: 'Emotes' });
  setIcon(open, EMOTES[0]);
  emoteSend = (e) => send(e);
  const send = (e) => {
    if (racing || !net) return;
    net.sendJson({ t: 'emote', e });
    const own = $('own-emote') ?? Object.assign(document.createElement('div'), { id: 'own-emote' }); document.body.append(own);
    own.replaceChildren(icon(EMOTES[e], 2)); own.hidden = false; clearTimeout(own.timer); own.timer = setTimeout(() => { own.hidden = true; }, 1800);
  };
  EMOTES.forEach((s, i) => { const b = Object.assign(document.createElement('button'), { type: 'button', ariaLabel: s, onclick: () => { send(i); bar.hidden = true; } }); b.append(icon(s, 1.4)); bar.append(b); });
  open.addEventListener('click', () => { bar.hidden = !bar.hidden; });
  document.body.append(bar); chips.append(open);
  addEventListener('keydown', (ev) => { if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey || !/^[0-9]$/.test(ev.key)) return; send((+ev.key + 9) % 10); });
}
function startRace() {
  racing = true; locked = true;
  net.close();
  remotes.clear();
  show('racebar', false);
  $('count').textContent = T.getReady; show('count', true); show('result', false);
  net = openNet(params.get('rws') || lobbyUrl.replace('/play/ws', '/play/race/ws'), true);
  window.__net = net;
}
// ----- the ghost: every run of the time modes is recorded; the best one is kept on this device. In training it drives again, see-through, and the time ahead or behind it is shown.
const GHOST_KEY = 'drift.ghost.2';   // (2: the touge of the track system; a ghost of the old road does not fit)
let ghostRec = null, ghostPlay = null, ghostCar = null, ghostRun = false, ghostT = 0, ghostPrevMs = null, ghostNew = false;
const ghostLoad = () => { try { const d = JSON.parse(localStorage.getItem(GHOST_KEY)); if (d && Array.isArray(d.v) && d.v.length > 30 && d.ms > 0) return d; } catch { /* nothing kept, or broken */ } return null; };
function ghostStart() {
  ghostEnd(); ghostNew = false; ghostPrevMs = null;
  if (!['time', 'training'].includes(runMode)) return;
  ghostRec = new GhostRecorder(); ghostT = 0;
  if (runMode !== 'training') return;
  const d = ghostLoad();
  if (!d) { note(T.ghostNone); return; }
  ghostPrevMs = d.ms; ghostPlay = new GhostPlayer(d);
  ghostCar = fleet.spawn(new THREE.Color().setHSL(0.58, 0.2, 0.75));
  ghostCar.group.traverse((o) => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone(); for (const m of [].concat(o.material)) { m.transparent = true; m.opacity = 0.42; m.depthWrite = false; m.color?.set('#bfe6ff'); m.emissive?.set('#3a6a8a'); m.map = null; m.needsUpdate = true; } } });
  scene.add(ghostCar.group);
}
function ghostEnd() {
  if (ghostCar) { scene.remove(ghostCar.group); ghostCar = null; }
  ghostPlay = null; ghostRun = false; if ($('ghost-delta')) $('ghost-delta').hidden = true;
}
function ghostFinish(ms) {
  ghostRun = false;
  if (!ghostRec || !ms) return;
  const kept = ghostLoad();
  if (!kept || ms < kept.ms) { try { localStorage.setItem(GHOST_KEY, JSON.stringify(ghostRec.data(ms))); ghostNew = true; } catch { /* not kept */ } }
}
function raceMessage(j) {
  if (j.t === 'grid') {
    locked = true;
    ensureMap(j.map ?? 0).then(() => { cur = prev = makeCar(j.x, j.z, j.h); score = newScore(); cam.snap(cur); stage.skids.clear(); raceInfo.ms = 0; });
    Object.assign(raceInfo, { pos: j.slot + 1, of: j.n, lap: 1, laps: j.laps, ms: 0 }); bestLap = 0;
    ghostStart();
    $('rh-pos').textContent = `P${j.slot + 1}/${j.n}`; $('rh-lap').textContent = `${T.lap} 1/${j.laps}`; $('rh-time').textContent = fmt(0); $('rh-drift').textContent = '';
    show('racehud', true); $('count').textContent = T.waitOthers;
  } else if (j.t === 'count') $('count').textContent = j.n;
  else if (j.t === 'go') { ghostRun = ghostRec !== null; locked = false; $('count').textContent = T.go; setTimeout(() => show('count', false), 900); }
  else if (j.t === 'prog') {
    Object.assign(raceInfo, { pos: j.pos, of: j.of, lap: j.lap, laps: j.laps, ms: j.ms });
    $('rh-pos').textContent = `P${j.pos}/${j.of}`; $('rh-lap').textContent = `${T.lap} ${j.lap}/${j.laps}`; $('rh-time').textContent = fmt(j.ms);
    $('rh-drift').textContent = j.drift ? `${j.drift} x${j.mult}` : '';
  } else if (j.t === 'lap') { bestLap = bestLap ? Math.min(bestLap, j.ms) : j.ms; note(`${T.lap} ${j.lap}/${j.of}: ${fmt(j.ms)}`); }
  else if (j.t === 'finish') { note(`${T.finished} P${j.pos}: ${fmt(j.ms)}`); ghostFinish(j.ms); }
  else if (j.t === 'result') showResult(j);
  else if (j.t === 'back') endRace();
}
/** Starts a mode on the touge: a run of one on the server (the same machinery as a race: grid, countdown, gates, the result and the boards). */
function startMode(kind) {
  if (kind === 'tandem') { tandemInvite(); return; }
  if (!raceMode || racing || !net || !net.connected) return;
  runMode = kind;
  net.sendJson({ t: 'race.start', map: 0, laps: 1, solo: true, ...(kind === 'training' ? { train: true } : {}) });
}
/** The result of a mode: the numbers of the run and the board of this mode (best run times, or the points of a whole run). */
async function showModeResult(j, kind = runMode) {
  const me = net?.roster.get(net.me?.id)?.name, mine = j.rows.find((r) => r.name === me) ?? j.rows[0];
  const time = kind === 'time' || kind === 'training', train = kind === 'training';
  $('res-title').textContent = train ? T.modeTraining : time ? T.modeTime : T.modeDrift;
  $('res-table').hidden = true;
  let box = $('res-mode'); if (!box) { box = Object.assign(document.createElement('div'), { id: 'res-mode' }); $('res-table').after(box); }
  const row = (k, v, cls) => { const r = document.createElement('div'); r.className = cls ?? ''; const a = document.createElement('span'), b = document.createElement('b'); a.textContent = k; b.textContent = v; r.append(a, b); return r; };
  const nf = (n) => Number(n).toLocaleString(de ? 'de-DE' : 'en-GB');
  const isNew = time ? mine.newLap || mine.newRace : mine.newAttack;
  box.replaceChildren(row(T.sumTime, mine.ms == null ? T.dnf : fmt(mine.ms), time ? 'main' : ''), row(T.sumPoints, nf(mine.drift), time ? '' : 'main'), row(T.sumBest, nf(mine.bestDrift)));
  if (train) {
    const diff = ghostPrevMs && mine.ms ? (mine.ms - ghostPrevMs) / 1000 : null;
    box.replaceChildren(row(T.sumTime, mine.ms == null ? T.dnf : fmt(mine.ms), 'main'), row(T.ghostBest, ghostPrevMs ? fmt(ghostPrevMs) : '-'), ...(diff === null ? [] : [row(T.ghostDiff, (diff >= 0 ? '+' : '\u2212') + Math.abs(diff).toFixed(2).replace('.', de ? ',' : '.') + ' s', diff < 0 ? 'ahead' : 'behind')]));
    if (ghostNew) box.append(Object.assign(document.createElement('p'), { className: 'new-best', textContent: T.newGhost }));
  }
  if (isNew && !train) box.append(Object.assign(document.createElement('p'), { className: 'new-best', textContent: T.newBest }));
  if (!train && params.get('open') === '1') {   // without an account: the best value stays on this device, and a hint about the board
    const key = time ? 'drift.best.time' : 'drift.best.attack', value = time ? mine.ms : mine.drift;
    let kept = null; try { kept = Number(localStorage.getItem(key)) || null; } catch { /* no storage */ }
    const better = value != null && (kept === null || (time ? value < kept : value > kept));
    if (better) { try { localStorage.setItem(key, String(value)); } catch { /* not kept */ } kept = value; }
    box.append(row(T.deviceBest, kept == null ? '-' : time ? fmt(kept) : nf(kept)), Object.assign(document.createElement('p'), { className: 'hint-account', textContent: T.withAccount }));
  }
  show('count', false); show('racehud', false); show('result', true);
  if (!train) try {   // the board of this mode: the five best, and your line
    const b = await fetch((params.get('open') === '1' ? '/api/open/times?map=0' : document.documentElement.dataset.guest === '1' ? '/api/guest/times?map=0' : '/api/times?map=0') + `&feel=${feel === PRO ? 1 : 0}&phys=${phys25 ? 1 : 0}`).then((r) => r.json());   // the board of what this run was driven with (the feel, the physics)
    const one = time ? b.lap : b.attack, list = Object.assign(document.createElement('ol'), { className: 'board' });
    for (const [i, r] of (one?.top ?? []).slice(0, 5).entries()) { const li = document.createElement('li'); if (r.mine) li.className = 'mine'; li.textContent = `${i + 1}. ${r.name} \u00b7 ${time ? fmt(r.value) : nf(r.value)}`; list.append(li); }
    if (one?.mine && !(one.top ?? []).slice(0, 5).some((r) => r.mine)) { const li = Object.assign(document.createElement('li'), { className: 'mine', textContent: `${one.mine.place}. ${T.you.replace(/ ?$/, '')} \u00b7 ${time ? fmt(one.mine.value) : nf(one.mine.value)}` }); list.append(li); }
    if (list.children.length) box.append(Object.assign(document.createElement('h4'), { textContent: T.board }), list);
  } catch { /* no board: the numbers above are the result */ }
  let again = $('res-again'); if (!again) { again = Object.assign(document.createElement('button'), { id: 'res-again', type: 'button' }); $('res-back').before(again); again.addEventListener('click', () => { pendingMode = runMode; endRace(); }); }
  again.textContent = T.again; again.hidden = false;
}
function showResult(j) {
  if (runMode) { showModeResult(j); return; }
  $('res-table').hidden = false; if ($('res-again')) $('res-again').hidden = true; if ($('res-mode')) $('res-mode').replaceChildren();
  $('res-title').textContent = T.result;
  const body = $('res-table').querySelector('tbody');
  body.replaceChildren();
  for (const r of j.rows) {
    const tr = document.createElement('tr');
    const cells = [r.dnf ? '-' : r.pos, r.tuned ? `${r.name} (${T.tunedMark})` : r.name, r.ms == null ? T.dnf : fmt(r.ms), r.bestLap == null ? '' : fmt(r.bestLap), r.drift, r.points];
    for (const c of cells) { const td = document.createElement('td'); td.textContent = c; tr.append(td); }
    if (r.newRace || r.newLap || r.newDrift) { const td = document.createElement('td'); td.textContent = r.newDrift && !(r.newRace || r.newLap) ? T.newDrift : T.newBest; tr.append(td); }
    body.append(tr);
  }
  show('count', false); show('racehud', false); show('result', true);
}
function endRace() {
  if (!racing) return;
  ghostEnd(); ghostRec = null;
  if (!pendingMode) runMode = null;
  racing = false; locked = false;
  net.close(); remotes.clear();
  show('result', false); show('racehud', false); show('count', false);
  spawned = false;
  ensureMap(0).then(() => { reset(); });
  net = openNet(lobbyUrl, false); window.__net = net;
  show('racebar', true);
}

if (online) {
  net = openNet(lobbyUrl, false);
  window.__net = net;
  $('dropped').addEventListener('click', () => { $('dropped').hidden = true; net.connect(); });
  if (raceMode) {
    show('racebar', true);
    for (const [kind, label] of [['drift', T.modeDrift], ['time', T.modeTime], ['tandem', T.modeTandem], ['training', T.modeTraining]]) { const b = Object.assign(document.createElement('button'), { id: 'mode-' + kind, type: 'button', textContent: label, title: label }); b.addEventListener('click', () => startMode(kind)); chips.append(b); }
    if (['drift', 'time', 'tandem', 'training'].includes(params.get('mode'))) pendingMode = params.get('mode');   // ?mode=drift|time starts that mode as soon as the lobby socket is open
    mapList ??= (await fetch('data/maps.json').then((r) => r.json())).maps;
    const sel = $('mapSel');
    for (const m of mapList) sel.append(Object.assign(document.createElement('option'), { value: m.id, textContent: m.name }));
    $('raceBtn').addEventListener('click', () => { const m = mapList.find((x) => x.id === +sel.value); net.sendJson({ t: 'race.start', map: m.id, laps: m.laps }); });
    $('soloBtn').addEventListener('click', () => { const m = mapList.find((x) => x.id === +sel.value); net.sendJson({ t: 'race.start', map: m.id, laps: m.laps, solo: true }); });   // a time trial is a race of one
    $('invite-yes').addEventListener('click', () => { net.sendJson({ t: inviteKind === 'tandem' ? 'tandem.accept' : 'race.join' }); show('invite', false); });
    $('invite-no').addEventListener('click', () => { net.sendJson({ t: inviteKind === 'tandem' ? 'tandem.decline' : 'race.decline' }); show('invite', false); });
    $('rh-leave').addEventListener('click', () => { net.sendJson({ t: 'leave' }); endRace(); });
    $('res-back').addEventListener('click', () => { if (racing) endRace(); else show('result', false); });
  }
}

// ----- state
const loop = new FixedLoop();
// ----- contact and damage: your car is a rectangle that bounces off walls, poles and the other cars (sim/collision.js); hard hits damage it (a dent in the look, smoke, and a little less
// power). The other cars are what the network says about them (the latest poses, carried forward by the interpolation delay); each game moves only its own car, so both agree.
// Damage can be switched off (key V, ?damage=0): the creative mode will do that by itself.
let dmg = 0, sinceHit = 99, damageOn = params.get('damage') === '0' ? false : (() => { try { return localStorage.getItem('drift.damage') !== '0'; } catch { return true; } })();
let carNow = car, remoteBodies = [];
const massOf = (id) => (cars[id]?.mass ?? REF_MASS) / REF_MASS;   // relative to a 1200 kg car; the weights are in data/cars.json
const myMass = massOf(carIndex);
// the creative mode: a switch of this session (K, the chip, ?mode=creative): everything is free, there is no damage, and nothing counts for the boards, the stars or the stats
// (the server is told, and it keeps nothing from a creative session). It is shown all the time, so nobody mistakes a free run for a score.
let creative = params.get('mode') === 'creative';
const creativeBanner = Object.assign(document.createElement('div'), { id: 'creative-banner', hidden: !creative });
const creativeChip = Object.assign(document.createElement('button'), { id: 'creative', type: 'button' });
(document.getElementById('hud') ?? document.body).append(creativeBanner); chips.append(creativeChip);
const showCreative = () => { creativeBanner.hidden = !creative; creativeBanner.textContent = T.creativeBanner; creativeChip.textContent = T.creativeChip; creativeChip.setAttribute('aria-pressed', creative); creativeChip.title = T.creativeOn; };
function toggleCreative() {
  if (racing) return;   // not in the middle of a race: the race's times would count half
  creative = !creative;
  if (creative) { dmg = 0; carNow = car; }
  net?.sendJson({ t: 'mode', v: creative ? 'creative' : 'normal' });
  showCreative(); note(creative ? T.creativeOn : T.creativeOff);
}
creativeChip.addEventListener('click', toggleCreative);
const damageEl = Object.assign(document.createElement('div'), { id: 'damage', hidden: true });
document.body.append(damageEl);   // (fixed in game.css, outside the stack)
function toggleDamage() {
  damageOn = !damageOn;
  try { localStorage.setItem('drift.damage', damageOn ? '1' : '0'); } catch { /* not kept */ }
  if (!damageOn) { dmg = 0; carNow = car; }
  note(damageOn ? T.damageOn : T.damageOff);
}
/** What a remote car is for the contact test: a body with a velocity from its pose (nose direction plus slip angle), carried forward by the interpolation delay. */
function bodyOf(o) {
  const dir = o.h + o.beta, sp = o.vf / Math.max(0.3, Math.cos(o.beta)), vx = Math.sin(dir) * sp, vz = Math.cos(dir) * sp, d = 0.14;
  return { x: o.x + vx * d, z: o.z + vz * d, h: o.h, vx, vz, w: 0 };
}

// ----- sound: made here, starts only after a click or a key, mute and the music switch are kept on the device
const musicList = await fetch('data/music.json').then((r) => r.json()).then((j) => j.tracks).catch(() => []);
const startScene = mapList.find((m) => m.id === startId)?.scene;
const sound = new SoundSystem({
  recorded: Object.fromEntries(cars.filter((c) => c.sound).map((c) => [c.id, `assets/sound/${c.sound}-engine.json`])),   // a car with `sound` in cars.json plays loops cut from a recording
  // the music: a map's own track first (the winter pass: the snowy one); each new track is named with its author and licence (CC BY asks for it)
  music: musicList.length ? { tracks: musicList, first: musicList.find((t) => t.maps?.includes(startScene))?.id ?? null, onTrack: (t) => note(T.nowPlaying.replace('{t}', t.title).replace('{a}', t.author).replace('{l}', t.licence)) } : null,
});
const soundChip = Object.assign(document.createElement('button'), { id: 'sound', type: 'button' });
const musicChip = Object.assign(document.createElement('button'), { id: 'music', type: 'button' });
const showSound = () => { const on = sound.unlocked && !sound.muted; setIcon(soundChip, on ? 'speaker' : 'speakerOff'); soundChip.title = on ? T.soundOn : T.soundOff; soundChip.setAttribute('aria-pressed', on); setIcon(musicChip, 'music'); musicChip.title = sound.music ? T.musicOn : T.musicOff; musicChip.setAttribute('aria-pressed', sound.music); };
const unlockSound = () => { sound.unlock(); showSound(); };
function toggleSound() { if (!sound.unlocked) { unlockSound(); sound.setMuted(false); showSound(); return; } sound.setMuted(!sound.muted); showSound(); }
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, unlockSound, { once: true, capture: true });
soundChip.addEventListener('click', toggleSound);
musicChip.addEventListener('click', () => { if (!sound.unlocked) unlockSound(); sound.setMusic(!sound.music); showSound(); });
showSound(); chips.append(soundChip, musicChip);
const volume = Object.assign(document.createElement('input'), { id: 'volume', type: 'range', min: 0, max: 1, step: 0.05, value: sound.volume, ariaLabel: T.volume, title: T.volume });
volume.addEventListener('input', () => { if (!sound.unlocked) unlockSound(); if (sound.muted) sound.setMuted(false); sound.setVolume(+volume.value); showSound(); });
chips.append(volume);
const musicVolume = Object.assign(document.createElement('input'), { id: 'musicVolume', type: 'range', min: 0, max: 1, step: 0.05, value: sound.musicVolume, ariaLabel: T.musicVolume, title: T.musicVolume });
musicVolume.addEventListener('input', () => { if (!sound.unlocked) unlockSound(); sound.setMusicVolume(+musicVolume.value); });
chips.append(musicVolume);
// graphics quality: auto / high / medium / low (kept on the device; a change applies after a reload, the automatic one measures the first seconds)
const qualityChip = Object.assign(document.createElement('button'), { id: 'quality', type: 'button', title: T.quality });
const QUALITY = ['auto', 'high', 'medium', 'low'], showQuality = () => { qualityChip.textContent = qualitySetting === 'auto' ? 'Auto' : qualitySetting[0].toUpperCase() + qualitySetting.slice(1, 3); };
qualityChip.addEventListener('click', () => { qualitySetting = QUALITY[(QUALITY.indexOf(qualitySetting) + 1) % 4]; try { localStorage.setItem('drift.quality', qualitySetting); } catch { /* not kept */ } showQuality(); if (qualitySetting !== 'auto') changeTier(qualitySetting); else { picker = new TierPicker(tierName); } note(`${T.quality}: ${qualitySetting}`); });
showQuality(); chips.append(qualityChip);
// without an account (the open lobby): the paint is chosen here and kept on this device; the socket joins with it, so a change reloads the page
if (params.get('open') === '1') {
  const paintChip = Object.assign(document.createElement('button'), { id: 'paint', type: 'button', title: T.paint, ariaLabel: T.paint });
  const dot = () => { try { paintChip.style.background = '#' + hueColour(Number(localStorage.getItem('drift.paint')) || 0).getHexString(); } catch { /* no storage */ } };
  dot();
  paintChip.addEventListener('click', () => { try { const n = ((Number(localStorage.getItem('drift.paint')) || 0) + 1) % 27; localStorage.setItem('drift.paint', String(n)); } catch { /* not kept */ } location.reload(); });
  chips.append(paintChip);
  const nameChip = Object.assign(document.createElement('button'), { id: 'name-chip', type: 'button', textContent: 'Aa', title: T.nameAsk, ariaLabel: T.nameAsk });
  nameChip.addEventListener('click', () => { const n = prompt(T.nameAsk, (() => { try { return localStorage.getItem('drift.name') ?? ''; } catch { return ''; } })()); if (n === null) return; try { localStorage.setItem('drift.name', n.trim().slice(0, 20)); } catch { /* not kept */ } location.reload(); });
  chips.append(nameChip);
  try { bestDrift = Number(localStorage.getItem('drift.best')) || 0; } catch { /* no storage */ }   // best values only on this device
}

// ----- a challenge (?challenge=<id>, from the garage's list): judged here at once with the same functions as the server, which judges it again from the poses and keeps the stars
let chDef = null, chRun = null, chStarted = false, chServer = null;
const chEl = Object.assign(document.createElement('div'), { id: 'challenge', hidden: true });
(document.getElementById('hud') ?? document.body).append(chEl);
if (params.get('challenge')) {
  try { chDef = (await fetch('data/challenges.json').then((r) => r.json())).challenges.find((c) => c.id === params.get('challenge')) ?? null; } catch { /* no list: no challenge */ }
  if (chDef && chDef.type !== 'lap') chRun = newRun(chDef);
}
const chStars = (n) => '\u2605'.repeat(n) + '\u2606'.repeat(3 - n);
function chShow() {
  if (!chDef) return;
  const title = (chDef.title[de ? 'de' : 'en']);
  let text;
  if (chDef.type === 'lap') text = `${title} \u00b7 ${T.chLap}`;
  else {
    const r = resultOf(chRun);
    const v = Number.isInteger(r.value) ? r.value : r.value.toFixed(1);
    text = `${title} ${chStars(chServer?.done ? chServer.stars : r.stars)} \u00b7 ${v} \u00b7 ${Math.ceil(r.left)} s`;
    if (r.done) text += r.failed ? ` \u00b7 ${T.chFailed}` : ` \u00b7 ${T.chDone}`;
    if (chServer?.done) text += ` \u00b7 ${T.chConfirmed}`;
    if (creative) text += ` \u00b7 ${T.creativeBanner}`;
  }
  if (chEl.textContent !== text) { chEl.textContent = text; chEl.hidden = false; chEl.classList.toggle('done', !!chRun?.done); }
}
function chStart() {
  chStarted = true;
  net?.sendJson({ t: 'challenge.start', id: chDef.id });
}
function lobbyChallenge(j) { chServer = j; if (j.done && !j.failed && chRun) note(`${T.chDone} ${chStars(j.stars)} (${T.chConfirmed})`); }

// the summary at the end of a run (the touge): time, points, clipping points taken and the best drift, for a few seconds before the car goes back to the top
const summaryEl = Object.assign(document.createElement('div'), { id: 'summary', hidden: true, role: 'status' });
document.body.append(summaryEl);
function showSummary({ ms, points, clips, of, best }) {
  const row = (k, v) => { const r = document.createElement('div'); const a = document.createElement('span'), b = document.createElement('b'); a.textContent = k; b.textContent = v; r.append(a, b); return r; };
  const h = Object.assign(document.createElement('h3'), { textContent: T.run });
  summaryEl.replaceChildren(h, row(T.sumTime, fmt(ms)), row(T.sumPoints, points.toLocaleString(de ? 'de-DE' : 'en-GB')), ...(of ? [row(T.sumClips, `${clips} / ${of}`)] : []), row(T.sumBest, best.toLocaleString(de ? 'de-DE' : 'en-GB')));
  summaryEl.hidden = false;
}
// ----- soft cones (a map's `cones`, the practice ground): drawn as little cones, knocked over when the car touches them, each costs points; the count shows beside the score
let coneMesh = null, coneState = null, coneEl = null;
const coneDummy = new THREE.Object3D();
function conesBuild() {
  if (coneMesh) { scene.remove(coneMesh); coneMesh.geometry.dispose(); coneMesh.material.dispose(); coneMesh = null; }
  coneState = null; if (coneEl) coneEl.hidden = true;
  const list = map?.cones ?? []; if (!list.length) return;
  coneMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(CONE_R, 0.75, 10), new THREE.MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.7, emissive: '#331100' }), list.length);
  scene.add(coneMesh); conesReset();
}
function conesPlace(i, down) {
  const c = map.cones[i], y = stage.field.groundY(c.x, c.z);
  if (!down) { coneDummy.position.set(X(c.x), y + 0.375, c.z); coneDummy.rotation.set(0, 0, 0); }
  else { const d = coneState.down[i], run = 1 + 3 * d.v; coneDummy.position.set(X(c.x + d.dx * run), y + CONE_R * 0.6, c.z + d.dz * run); coneDummy.rotation.set(Math.PI / 2, Math.atan2(-d.dx, d.dz), 0, 'YXZ'); }
  coneDummy.updateMatrix(); coneMesh.setMatrixAt(i, coneDummy.matrix);
}
function conesReset() {
  if (!coneMesh) return;
  coneState = newCones(map.cones);
  for (let i = 0; i < map.cones.length; i++) conesPlace(i, false);
  coneMesh.instanceMatrix.needsUpdate = true; conesShow();
}
function conesShow() {
  if (!coneEl) { coneEl = Object.assign(document.createElement('div'), { id: 'cones', role: 'status' }); ($('hud') ?? document.body).append(coneEl); }
  coneEl.hidden = !coneMesh; coneEl.textContent = `${T.cones} ${coneState?.hits ?? 0}` + (coneState?.hits ? ` (\u2212${coneState.hits * PENALTY})` : '');
}
function conesStep() {
  if (!coneState) return;
  const next = coneStep(coneState, map.cones, cur.x, cur.z, cur.vx, cur.vz);
  if (next === coneState) return;
  coneState = next;
  for (const i of next.event) conesPlace(i, true);
  coneMesh.instanceMatrix.needsUpdate = true; conesShow(); sound.bump?.(1.5);
}
function reset() {
  conesReset();
  summaryEl.hidden = true;
  if (net && !racing) net.sendRespawn();   // the relay knows this jump (back to the plaza)
  const s = map.lobbySpawn ?? map.grid[0];
  cur = prev = makeCar(s.x, s.z, s.h);
  score = newScore();
  dmg = 0; sinceHit = 99; carNow = car;   // R repairs the car
  if (chDef && chDef.type !== 'lap') { chRun = newRun(chDef); chStarted = false; chServer = null; net?.sendJson({ t: 'challenge.stop' }); }
  spin = 0; freeMs = 0; dRunStart = -1; runDone = 0;
  zones = map.clips ? newZones(map.clips) : null;
  stage.skids.clear();
  cam.snap(cur);
}
reset();
// fixed shots for pictures (data/shots.json, made by tools/make-shots.mjs): ?shot=kehre (the middle of a hairpin of the upper half, about 41 degrees of drift at 72 km/h, no wall touched), ?shot=tal
// (the same on a hairpin from where the guardrail looks out over forest, crater lake and volcanoes); the run-up is replayed with the unchanged simulation, so smoke and tyre marks are real.
// ?pose=x,z,h,slipDeg,kmh puts the car anywhere (nose heading h in radians, drifting with that slip at that speed), ?t=seconds of run-up with the line bot in front of it.
let lineDriver = null;
const shotDef = params.has('shot') ? (await fetch('data/shots.json').then((r) => r.json()))[params.get('shot')] ?? null : null;
if (shotDef) { const s = shotDef.start; cur = prev = { ...makeCar(s.x, s.z, s.h), vx: Math.sin(s.h) * s.v, vz: Math.cos(s.h) * s.v }; cam.snap(cur); lineDriver = shotDef.driver === 'track' && map.surface ? trackBot(map.surface, { car, ...shotDef.bot }) : lineBot(stage.field.road, shotDef.bot); damageOn = false; }
if (params.has('pose')) { const [px, pz, ph, pslip, pkmh] = params.get('pose').split(',').map(Number), v = pkmh / 3.6, dir = ph - (pslip * Math.PI) / 180; cur = prev = { ...makeCar(px, pz, ph), vx: Math.sin(dir) * v, vz: Math.cos(dir) * v }; cam.snap(cur); if (params.has('t')) lineDriver = lineBot(stage.field.road, { closed: map.closed !== false, speed: 30, corner: 11, kick: 0.25, look: 14, hold: 0.55 }); }
const demo = params.get('demo') === 'orbit', demoLine = params.get('demo') === 'line';   // ?demo=orbit|line: a bot drives (a circle, or the map's loop) for pictures
const freecam = params.has('freecam') ? params.get('freecam').split(',').map(Number) : null;
if (demoLine) { const o = map.grid[0]; cur = prev = makeCar(o.x, o.z, o.h); cam.snap(cur); lineDriver = phys25 && map.surface ? trackBot(map.surface, { car }) : lineBot(stage.field.road, map.closed === false ? { closed: false, speed: 30, corner: 11, kick: 0.25, look: 14, hold: 0.55 } : { closed: true, speed: 22, corner: 15 }); }   // (the touge numbers: a clean run of about 118 s with 30 to 40 degree drifts in the hairpins, no wall touched)
if (demo) { const o = mapId === 0 ? { x: -30, z: 8, h: Math.PI / 2 } : map.grid[0]; cur = prev = makeCar(o.x, o.z, o.h); cam.snap(cur); }

// ----- the practice partner (?bot=1 or the key B): a bot drives a drift circle next to you; the tandem bonus is judged here, nothing is sent
let practice = null;
let botCar = null;
function togglePractice(on = !practice) {
  if (botCar) { scene.remove(botCar.group); botCar = null; }
  if (!on) { practice = null; tandemHud.set(null); return; }
  if (!practice) {
    const start = params.get('bot') === 'near' ? { x: cur.x + 6, z: cur.z, h: cur.h } : mapId === 0 ? MEETING_PRACTICE_START : map.grid[0];   // ?bot=near: right beside you (for pictures and tests)   // a clear run and an open circle; the bot waits there for you to find it
    practice = { bot: new PracticeBot(map, car, start, 1, phys25 && map.surface ? roadSurface : null), scorer: new TandemPractice(), spin: 0 };
  }
  botCar = fleet.spawn(new THREE.Color().setHSL(((car.colour + 180) % 360) / 360, 0.62, 0.42));
  scene.add(botCar.group);
}

function simStep(i) {
  prev = cur;
  const inp = locked ? { steer: 0, throttle: 0, brake: 0, handbrake: 1 } : demo ? orbitBot(i * DT, cur, { start: 1.5 }) : lineDriver ? lineDriver(i * DT, cur) : input.read();
  lastInp = inp;
  const mu = surfaceAt(map, cur.x, cur.z).mu;
  conesStep();
  cur = collideBody(map, step(cur, inp, carNow, mu, DT, phys25 && map.surface ? roadSurface : null));   // the walls and poles (?phys=1: on the road's surface, the slope pulls and loads the wheels)
  for (const o of remoteBodies) {   // the other cars
    const r = collideCars(cur, o, { applyB: false, ma: myMass, mb: o.m });
    if (r.hit > 0) cur = { ...r.a, hit: Math.max(cur.hit, r.hit) };
  }
  if (ghostRun && !locked) { ghostT += DT; ghostRec.add(DT, cur.x, cur.z, cur.h); }
  if (cur.hit > 0) { sound.bump(cur.hit); }
  if (damageOn && !creative) {
    const before = dmg;
    dmg = damageStep(dmg, cur.hit, sinceHit, DT);
    sinceHit = cur.hit > 0 ? 0 : sinceHit + DT;
    if (dmg !== before) carNow = damaged(car, dmg);
  }
  score = scoreStep(score, { slip: bodySlip(cur), speed: speedOf(cur), hit: cur.hit, turned: turnedAngle(cur) }, DT);
  if (zones && !creative) {   // a drift through a clipping point adds its bonus to the pending points of the chain
    const z = zoneStep(zones, { x: cur.x, z: cur.z, slip: bodySlip(cur), speed: speedOf(cur) });
    zones = z.state;
    if (z.bonus && score.pending > 0) { score = { ...score, pending: score.pending + z.bonus }; zoneNote = z.event; }
  }
  if (score.event) { lastEvent = score.event; if (score.event.type === 'bank' && !creative) { bestDrift = Math.max(bestDrift, score.event.points); if (params.get('open') === '1') { try { localStorage.setItem('drift.best', String(bestDrift)); } catch { /* not kept */ } } } }
  if (chRun && !chRun.done) {   // the challenge runs from the first movement
    if (!chStarted && speedOf(cur) > 1) chStart();
    if (chStarted) chRun = runStep(chRun, { slip: bodySlip(cur), speed: speedOf(cur), hit: cur.hit, turned: turnedAngle(cur), tandem: practice ? practice.scorer.tandem.banked + practice.scorer.tandem.pending : 0 }, DT);
    if (chRun.done) note(`${T.chDone} ${chStars(resultOf(chRun).stars)}`);
  }
  if (practice) {   // the practice partner drives on, and you are judged against it with the server's own functions
    practice.bot.step();
    const st = practice.scorer.update(cur, practice.bot.state, DT);
    if (st.event) tandemHud.bank(st.event.points);
  }
  // smoke from the rear wheels, 40 times a second, as in the probe: it drifts off to the left of the way the car goes (not into the camera behind it) and starts a little outside the wheel
  if (simSteps % 3 === 0 && !paused) {
    const slid = (Math.abs(bodySlip(cur)) > 0.2 || inp.handbrake > 0) && speedOf(cur) > 3, S = look.smoke, t = Math.atan2(cur.vx, cur.vz), push = S.drift ?? 0, out = S.offset ?? 0;
    const W = wheelPoints(fleet.dims), sh = Math.sin(cur.h), ch = Math.cos(cur.h);
    for (const sx of [-1, 1]) {
      // at the model's own rear tyre (right: sx -1), on the road's surface under that tyre; the mark lies in the surface's plane (its gradient, in drawing axes)
      const [lx, lz] = W[sx < 0 ? 3 : 2], px = cur.x + lz * sh - lx * ch, wz = cur.z + lz * ch + lx * sh, wx = X(px), sf = roadSurface(px, wz, _ws), wy = sf.y;
      stage.skids.mark(sx < 0 ? 0 : 1, wx, wz, 0, 0, slid && speedOf(cur) > 3, wy, -sf.gx, sf.gz);
      if (slid) stage.smoke.emit(wx + X(-Math.cos(t)) * out, 0.35 + wy, wz + Math.sin(t) * out, X(cur.vx * 0.06 - Math.cos(t) * push), cur.vz * 0.06 + Math.sin(t) * push, Math.min(1, Math.abs(bodySlip(cur)) + 0.2));
    }
  }
  if (map.kind === 'descent' && !locked && !racing) {
    const g0 = map.gates[0], end = map.centre.at(-1);
    if (dRunStart < 0 && Math.hypot(cur.x - (g0.a[0] + g0.b[0]) / 2, cur.z - (g0.a[1] + g0.b[1]) / 2) < 10 && speedOf(cur) > 2) dRunStart = simSteps;
    if (dRunStart >= 0 && !runDone && Math.hypot(cur.x - end[0], cur.z - end[1]) < 14) { runDone = simSteps; showSummary({ ms: (simSteps - dRunStart) * DT * 1000, points: Math.round(score.banked + score.pending), clips: zones ? zones.paid.filter(Boolean).length : 0, of: map.clips?.length ?? 0, best: Math.round(Math.max(bestDrift, score.pending)) }); setTimeout(() => { if (runDone) reset(); }, 6000); }
  }
  stage.smoke.update(DT);   // (in the step, as in the probe: a run-up before the first frame has its smoke)
  simSteps++;
}
// optional: simulate N seconds before the first frame (for pictures taken after a fixed time)
const preRoll = shotDef ? shotDef.t : +params.get('t') || 0;
for (let i = 0, n = Math.round(preRoll / DT); i < n; i++) { loop.advance(DT, simStep); if (i % 2 === 0) cam.update(cur, car.top, 1 / 60); }   // (the camera follows the run-up, so it has swung in when the picture is taken)
if (shotDef && params.get('run') !== '1') paused = true;   // a named shot freezes where the run-up ends (?run=1 lets it go on)

input.onkey.KeyR = reset;
input.onkey.KeyB = () => togglePractice();
input.onkey.KeyJ = () => note(input.setKeyMode(input.kb.mode === 'soft' ? 'direct' : 'soft') === 'soft' ? T.keysSoft : T.keysDirect);
input.onkey.KeyL = () => note(input.setMouseLever(!input.mouseOn) ? T.leverOn : T.leverOff);
input.onkey.KeyM = toggleSound;
input.onkey.KeyV = toggleDamage;
input.onkey.KeyK = toggleCreative;
showCreative();
// cameras: chase, bonnet, cockpit (the key C, or Y and RB on a pad); in the cockpit the car's body is hidden
function cycleCamera() { const m = cam.cycle(cur); note(m === 'bonnet' ? T.camBonnet : m === 'cockpit' ? T.camCockpit : T.camChase); }
input.onkey.KeyC = cycleCamera;
// the controller (docs/CONTROLS.md): the pad's buttons that do something once
Object.assign(input.padAction, { reset, camera: cycleCamera, pause: () => (paused = !paused), bot: () => togglePractice(), feel: () => toggleFeel(),
  emote0: () => emoteSend?.(0), emote1: () => emoteSend?.(1), emote2: () => emoteSend?.(2), emote3: () => emoteSend?.(3) });
input.onPad = (connected) => { if (connected) note(T.padOn); else { paused = true; note(T.padOff); } };
// the feel chip: Arcade or Pro; not changed during a race (the times of that race are kept under the feel it began with)
const feelChip = Object.assign(document.createElement('button'), { id: 'feel', type: 'button' });
const showFeel = () => { feelChip.textContent = feel === PRO ? T.feelPro : T.feelArcade; feelChip.title = T.feelKey; feelChip.setAttribute('aria-pressed', feel === PRO); };
function toggleFeel() {
  if (racing) return;
  feel = feel === PRO ? 0 : PRO; car = applyFeel(car0, feel); carNow = damaged(car, dmg);
  try { localStorage.setItem('drift.feel', feel === PRO ? 'pro' : 'arcade'); } catch { /* no storage: the choice lasts for this page */ }
  net?.sendJson({ t: 'feel', v: feel });
  showFeel();
}
feelChip.addEventListener('click', toggleFeel); input.onkey.KeyX = toggleFeel;
showFeel(); chips.append(feelChip);
if (params.has('bot')) togglePractice(true);
input.onkey.KeyP = () => (paused = !paused);
input.onkey.KeyF = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
input.onkey.KeyH = () => hud.cycle();
input.onkey.KeyG = () => ($('debug').hidden = !$('debug').hidden);
addEventListener('keydown', () => { $('hint').hidden = true; }, { once: true });
// Esc goes back to the garage (the same tab; leaving the page closes the lobby socket)
addEventListener('keydown', (e) => { if (e.code === 'Escape' && !document.fullscreenElement && $('back')) location.href = $('back').href; });
document.addEventListener('visibilitychange', () => { if (document.hidden) input.clear(); });
const showTouch = () => {
  $('touch').hidden = false;
  if (document.fullscreenEnabled) $('fs').hidden = false;
};
$('fs').addEventListener('click', async () => {
  if (document.fullscreenElement) return document.exitFullscreen();
  try { await document.documentElement.requestFullscreen(); await screen.orientation?.lock?.('landscape'); } catch {}
});
// a first-time tip over the buttons until the first gas
const tip = $('tip');
if (coarse) { tip.hidden = false; const iv = setInterval(() => { if (input.has('gas') || cur.vx || cur.vz) { tip.hidden = true; clearInterval(iv); } }, 200); }
if (coarse) showTouch();
addEventListener('touchstart', showTouch, { once: true, passive: true });
const checkRotate = () => ($('rotate').hidden = !(coarse && innerHeight > innerWidth));
checkRotate();
// a new size (turning the phone, the browser bar sliding in or out, full screen, a resized window): the renderer's buffer, the pixel ratio, the camera's aspect and the targets of the
// after-pass are set again (stage.resize), once per frame at most; and the frame loop looks at the window's size every frame, so a missed event heals itself. The canvas is never
// stretched by CSS to another shape than its buffer (the buffer has the window's shape).
let fitW = 0, fitH = 0, fitQueued = false;
const refit = () => { checkRotate(); if (fitQueued) return; fitQueued = true; requestAnimationFrame(() => { fitQueued = false; fitW = innerWidth; fitH = innerHeight; stage.resize(); }); };
for (const ev of ['resize', 'orientationchange', 'fullscreenchange']) addEventListener(ev, refit);
visualViewport?.addEventListener('resize', refit);
// a phone turns itself into landscape: the first tap into the game asks for full screen and locks the orientation (where the browser cannot, the turn hint stays)
if (coarse) addEventListener('pointerup', async () => { try { if (document.fullscreenEnabled && !document.fullscreenElement) await document.documentElement.requestFullscreen(); await screen.orientation?.lock?.('landscape'); } catch { /* not possible here: the hint stays */ } }, { once: true });

// ----- drawing
const dbg = $('debug');
dbg.hidden = !params.has('debug');
let popThrottle = 0, popAt = 0;
let last = performance.now(), avg = 16, jsAvg = 0, fpsFrames = 0, shown = 0, shownDmg = 0;
const WHEEL_R = 0.358, BLOB = [1.15, 2.3];
const drawn = { x: 0, z: 0, h: 0, vx: 0, vz: 0, w: 0 };
const info = { frames: 0 };

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t0 = performance.now();
  let alpha = 0;
  input.pollPad();   // the controller: the numbers for the next steps, and the buttons that act once
  if (!paused) alpha = loop.advance(dt, simStep);
  else alpha = loop.acc / loop.dt;
  // interpolate between the last two simulation states
  drawn.x = prev.x + (cur.x - prev.x) * alpha; drawn.z = prev.z + (cur.z - prev.z) * alpha;
  drawn.h = prev.h + angDiff(prev.h, cur.h) * alpha;
  drawn.vx = cur.vx; drawn.vz = cur.vz; drawn.w = cur.w;
  const { vf } = bodyVelocity(cur);
  const kmh = speedOf(cur) * 3.6;

  if (innerWidth !== fitW || innerHeight !== fitH) { fitW = innerWidth; fitH = innerHeight; stage.resize(); checkRotate(); }
  // the chassis on its four wheel points on the road's surface (sim/carpose.js: pitch and roll from the surface, softly), the body's dive and lean from the forces on
  // its own group (the wheels stay on the road); only drawn: the physics is flat
  settle(minePose, roadSurface, drawn.x, drawn.z, drawn.h, wheelPoints(fleet.dims), paused ? 0 : dt, { ax: cur.ax, side: cur.w * vf });
  const gy = minePose.y;
  carGroup.visible = !cam.hidesCar;   // in the cockpit the body is not drawn
  Fleet.place(mine, minePose);
  mine.uniforms.uBase.value = gy;
  stage.smoke.car.value.set(X(drawn.x), gy, drawn.z);
  spin += (vf * dt) / WHEEL_R;
  glowPool.begin();
  if (mineFx) { mineFx.setGlow(glowHue); mineFx.update(paused ? 0 : dt, { brake: lastInp.brake, groundAt: (wx, wz) => roadSurface(X(wx), wz, _ws).y }); }   // a model car: its own underglow lying on the road (X: the view's x is the physics' x mirrored)
  else if (glowHue !== null) glowPool.add(X(drawn.x), drawn.z, HEAD(drawn.h), glowHue, (0.85 + 0.15 * Math.sin(now / 400)) * glowBoost(), gy, -minePose.pitch);
  pool.begin();
  mine.setWheels(cur.steer, spin);
  if (!fleet.file) pool.blob(X(drawn.x), drawn.z, BLOB[0], BLOB[1], HEAD(drawn.h), gy);   // a model car brings its own contact shadow
  if (net) {
    const moving = speedOf(cur) > 0.3 || input.read().throttle > 0;
    net.sendPose({ x: cur.x, z: cur.z, h: cur.h, vf, steer: cur.steer }, bodySlip(cur), (input.has('hand') ? 1 : 0) | (cur.slide > 0.3 ? 2 : 0) | (cur.hit > 0 ? 4 : 0), moving, now);
    const list = net.sample(now);
    remotes.update(list, net.roster, dt);
    remoteBodies = list.filter((o) => !o.far).map((o) => ({ ...bodyOf(o), m: massOf(net.roster.get(o.id)?.car ?? 0) }));
  }
  if (ghostCar && ghostPlay) {   // the ghost of your best run, and how far ahead or behind it you are
    const g = ghostPlay.at(ghostT);
    Fleet.place(ghostCar, settle(ghostPose, roadSurface, g.x, g.z, g.h, wheelPoints(fleet.dims), paused ? 0 : dt));   // on its four wheels on the road like every car
    if (ghostRun) {
      let el = $('ghost-delta'); if (!el) { el = Object.assign(document.createElement('div'), { id: 'ghost-delta' }); ($('hud') ?? document.body).append(el); }
      const d = ghostPlay.delta(ghostT, cur.x, cur.z), txt = (d >= 0 ? '+' : '\u2212') + Math.abs(d).toFixed(1).replace('.', de ? ',' : '.') + ' s';
      if (el.textContent !== txt) el.textContent = txt;
      el.className = d > 0.05 ? 'behind' : d < -0.05 ? 'ahead' : ''; el.hidden = false;
    }
  }
  if (practice && botCar) {   // the practice bot, drawn like the other cars, and the chip from the local judgement
    const b = practice.bot.state, { vf: bvf } = bodyVelocity(b);
    Fleet.place(botCar, settle(botPose, roadSurface, b.x, b.z, b.h, wheelPoints(fleet.dims), paused ? 0 : dt, { ax: b.ax, side: b.w * bvf }));
    const bg = botPose.y;
    practice.spin += (bvf * dt) / WHEEL_R;
    botCar.setWheels(b.steer, practice.spin);
    pool.blob(X(b.x), b.z, BLOB[0], BLOB[1], HEAD(b.h), bg);
    const tt = practice.scorer.tandem;
    tandemHud.set({ on: tt.active, mult: tt.mult, role: tt.role }, now);
  }
  pool.end();
  glowPool.end();

  // smoke and skid marks from the rear wheels (on the road's drawn height)
  const sliding = (cur.slide > 0.25 || (input.has('hand') && speedOf(cur) > 4)) && speedOf(cur) > 3 && !paused;
  const { smoke } = stage;   // (the tyre marks are made in the simulation step, so a run-up before the first frame has them too)
  // damage: the paint darkens with it, smoke comes from the nose over half, and a small readout
  if (dmg !== shownDmg) { shownDmg = dmg; Fleet.colour(mine, ownColour, dmg); }
  if (dmg > 0.5 && !paused && info.frames % 3 === 0) { const np = new THREE.Vector3(0, 0.7, 2.2).applyMatrix4(mine.group.matrix); smoke.emit(np.x, 0.5 + gy, np.z, 0, 0, 0.35 * dmg); }
  const dmgText = dmg > 0.02 ? `${T.damageLabel} ${Math.round(dmg * 100)} %` : '';
  if (damageEl.textContent !== dmgText) { damageEl.textContent = dmgText; damageEl.hidden = dmgText === ''; }
  camera.updateMatrixWorld(); smoke.aim?.(camera);   // smoke that would hide the car on the picture fades out (billows.js)
  smoke.sync();

  cam.update(drawn, car.top, dt);
  if (freecam) { camera.position.set(X(freecam[0]), freecam[1], freecam[2]); camera.lookAt(X(freecam[3]), freecam[4], freecam[5]); camera.fov = freecam[6] ?? 50; camera.updateProjectionMatrix(); }   // ?freecam=x,y,z,lookX,lookY,lookZ[,fov] (simulation axes): a camera anywhere, for pictures
  stage.aimSun(X(drawn.x), gy, drawn.z);
  stage.halos.resize(renderer.domElement.height, camera.fov);
  const next = picker?.sample(dt * 1000);
  if (next && next !== tierName) changeTier(next);
  if (sound.unlocked) {   // the engine and the tyres of your car, and the four nearest others
    const others = net ? net.sample(now).map((o) => ({ id: o.id, x: o.x, z: o.z, speed: o.vf, throttle: (o.flags & 2) ? 0.9 : Math.abs(o.vf) > 1 ? 0.6 : 0, slide: (o.flags & 3) ? 0.8 : 0, car: net.roster.get(o.id)?.car ?? 0, top: cars[net.roster.get(o.id)?.car ?? 0]?.top ?? 33 })) : [];
    sound.update({ speed: speedOf(cur), throttle: lastInp.throttle, slide: paused ? 0 : cur.slide, car: carIndex, top: car.top }, others, { x: drawn.x, z: drawn.z, heading: drawn.h });
  }
  // exhaust pops: lifting off the throttle at speed; the same event goes to the car's flames (window event 'car.pop', detail.strength 0..1)
  if (lastInp.throttle < 0.2 && popThrottle > 0.7 && speedOf(cur) > 8 && now - popAt > 400) { popAt = now; const strength = Math.min(1, speedOf(cur) / 30); sound.pop(strength); dispatchEvent(new CustomEvent('car.pop', { detail: { strength } })); }
  popThrottle = lastInp.throttle;
  chShow();
  // the HUD: cards for free driving or the race
  if (!paused) freeMs += dt * 1000;
  const raceCard = racing ? { ...raceInfo, best: bestLap } : { free: true, online: onlineCount, ms: freeMs, bestDrift, name: meName ? (isPrivate ? `${meName} \u00b7 ${T.privateSession}` : meName) : (isPrivate ? T.privateSession : '') };
  hud.update(raceCard, { kmh, forward: Math.sign(vf) || 1, slip: bodySlip(cur), x: X(drawn.x), z: drawn.z, h: drawn.h }, lastInp, { ...score, event: lastEvent },
    net ? net.sample(now).filter((o) => !o.far).map((o) => [X(o.x), o.z]) : [], paused ? 0 : dt);
  lastEvent = null;
  if (zoneNote) { hud.toast(`${zoneNote.clean ? T.clip : T.zone} +${zoneNote.points}`, 'bank'); zoneNote = null; }
  const t1 = performance.now();
  stage.render();
  const t2 = performance.now();

  // frame statistics
  avg += (Math.min(250, dt * 1000) - avg) * 0.05;
  jsAvg += (t2 - t0 - jsAvg) * 0.05;
  info.frames++;
  if (!dbg.hidden && now - shown > 400) {
    shown = now;
    const r = renderer.info.render;
    dbg.textContent = `frame ${avg.toFixed(1)} ms (${(1000 / avg).toFixed(0)} fps), js+submit ${jsAvg.toFixed(2)} ms\n${r.triangles} triangles, ${r.calls} draw calls, tier ${tierName} (${renderer.domElement.width}x${renderer.domElement.height}), map ${mapId}, world ${Math.round(stage.world.triangles)} triangles\nsim steps ${simSteps}, speed ${kmh.toFixed(0)} km/h, slip ${(bodySlip(cur) * 57.3).toFixed(0)} deg`;
  }
  requestAnimationFrame(frame);
}
/** The height of the drawn ground under a point (the highest surface of the world below 60 m: land, plaza, road), by a ray down: for the play check (tools/playcheck.mjs). */
const floorRay = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
function floorAt(x, z) {
  floorRay.set(new THREE.Vector3(X(x), 60, z), down);
  const hits = floorRay.intersectObjects(stage.world.group.children.filter((o) => o.isMesh && !o.material?.transparent), false);
  floorRay.by = hits.length ? (hits[0].object.name || hits[0].object.geometry?.attributes?.position?.count + ' vertices') : null;
  return hits.length ? hits[0].point.y : null;
}
/** Every place a car is put: the spawns of the first 18 ids, the restart (and so the ride back up), the start slots of the modes; with the height the car stands at and the drawn ground's. */
function startSpots() {
  const spots = [{ what: 'restart and ride back up', ...lobbyJson.lobbySpawn }];
  for (let id = 0; id < 18; id++) spots.push({ what: `spawn of id ${id}`, ...lobbyStart(id, lobbyJson.lobbySpawn) });
  for (const [i, g] of (map.grid ?? []).entries()) spots.push({ what: `grid slot ${i}`, x: g.x, z: g.z });
  // samples along the road's centre line, about every 100 m: the drawn terrain must never rise above the driving floor, and the drawn ground must be where the physics is
  let run = 0, next = 0;
  for (let i = 1; i < (map.centre?.length ?? 0); i++) {
    const [x0, z0] = map.centre[i - 1], [x1, z1] = map.centre[i], len = Math.hypot(x1 - x0, z1 - z0);
    for (; next <= run + len; next += 100) { const t = len ? (next - run) / len : 0; spots.push({ what: `road at ${Math.round(next)} m`, x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t }); }
    run += len;
  }
  return spots.map((p) => { const car = stage.field.groundY(p.x, p.z), floor = floorAt(p.x, p.z); return { what: p.what, x: +p.x.toFixed(1), z: +p.z.toFixed(1), car: +car.toFixed(3), floor: floor === null ? null : +floor.toFixed(3), by: floorRay.by }; });
}
/** The road sampled along its centre every `step` metres, at the centre and near both edges: the height the car stands at (the physics' ground) and the drawn road's (a ray down onto the drawn meshes), for the play check. */
function roadProbe(step = 5) {
  const out = [], c = map.centre ?? [], hw = map.halfWidth ?? 4;
  let run = 0, next = 0;
  for (let i = 1; i < c.length; i++) {
    const [x0, z0] = c[i - 1], [x1, z1] = c[i], len = Math.hypot(x1 - x0, z1 - z0);
    for (; next <= run + len && len > 0; next += step) {
      const t = (next - run) / len, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      for (const off of [0, hw * 0.8, -hw * 0.8]) { const px = x + nx * off, pz = z + nz * off, car = stage.field.groundY(px, pz), floor = floorAt(px, pz); out.push({ s: Math.round(next), off: +off.toFixed(1), x: +px.toFixed(1), z: +pz.toFixed(1), car: +car.toFixed(3), floor: floor === null ? null : +floor.toFixed(3) }); }
    }
    run += len;
  }
  return out;
}
conesBuild();   // (the map the page starts on; ensureMap does it for the others)
window.__drift = { roadProbe, get ghost() { return ghostCar; }, floorAt, startSpots, showSummary, modeResult(kind, j) { runMode = kind; return showModeResult(j, kind); }, get carGroup() { return mine.group; }, get sound() { return sound; }, get cones() { return coneState; }, get camera() { return camera; }, get state() { return cur; }, get score() { return score; }, stage, renderer, info, car, get map() { return map; }, get mapId() { return mapId; }, ensureMap, reset, input, get fleet() { return fleet; }, get fx() { return mineFx; }, get pose() { return minePose; }, roadSurface };
requestAnimationFrame(frame);
