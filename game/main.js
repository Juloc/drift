// Drift, milestone 1: driving alone. Fixed-step simulation (sim/), drawn with three.js (view/).
// Address options: ?debug=1 numbers, ?tier=low|medium|high fixes the quality, ?touch=1 shows the touch buttons,
// ?demo=orbit lets a bot drive a drift circle, ?t=6 runs that many seconds of simulation before the first frame.
import * as THREE from '../vendor/three/three.module.js';
import { step, makeCar, bodySlip, bodyVelocity, speedOf, turnedAngle, DT } from './sim/physics.js';
import { prepareMap, surfaceAt, collide } from './sim/map.js';
import { collideBody, collideCars, damageStep, damaged, REF_MASS } from './sim/collision.js';
import { newScore, scoreStep } from './sim/score.js';
import { applyTuning, NAMES as TUNE_NAMES, valid as tuneValid } from './sim/tuning.js';
import { applyFeel, feelOf, PRO } from './sim/feel.js';
import { FixedLoop } from './sim/loop.js';
import { orbitBot } from './sim/bot.js';
import { lineBot } from './sim/linebot.js';
import { newZones, zoneStep } from './sim/zones.js';
import { createStage, loadLook } from './view/look/stage.js';
import { sceneFromMap } from './view/look/mapscene.js';
import { Fleet } from './view/look/fleet.js';
import { carFx } from './view/carfx.js';
import { readDevice, startTier, TierPicker } from './view/look/autotier.js';
import { WheelPool } from './view/wheels.js';
import { CameraRig } from './view/camera.js';
import { Input } from './view/input.js';
import { ProbeHud } from './view/probehud.js';
import { SoundSystem } from './view/sound.js';
import { newRun, runStep, resultOf } from './sim/challenge.js';
import { TandemHud } from './view/tandemhud.js';
import { PracticeBot, TandemPractice, MEETING_PRACTICE_START } from './sim/practice.js';
import { angDiff } from './core/rng.js';
import { X, HEAD } from './view/space.js';
import { WorldClient } from './net/world.js';
import { Remotes, hueColour } from './view/remotes.js';
import { CAR_DIMS } from './view/look/fleet.js';
import { GlowPool } from './view/wheels.js';

const params = new URLSearchParams(location.search);
const de = params.get('lang') ? params.get('lang') === 'de' : navigator.language?.startsWith('de');
const T = {
  en: { drift: 'DRIFT', score: 'Score', lost: 'Lost!', hand: 'HAND', brake: 'BRAKE', gas: 'GAS', rotate: 'Turn your phone to landscape', tip: 'Hold GAS, steer with the arrows, tap HAND to throw the tail out',
    online: 'driving here', solo: 'Time trial', newDrift: 'new best drift', tunedMark: 'tuned', paint: 'Paint', modeDrift: 'Drift attack', modeTime: 'Time attack', again: 'Again', board: 'Best runs', privateSession: 'Private session', run: 'Run finished', sumTime: 'Time', sumPoints: 'Points', sumClips: 'Clipping points', sumBest: 'Best drift', clip: 'CLIP', zone: 'Zone', slip: 'Angle', best: 'Best drift', you: 'You are', race: 'Start a race', invite: '{by} starts a race on {map} ({laps} laps).', join: 'Join', no: 'No', waiting: 'Invitation sent: the race starts in a few seconds.', joined: 'You are in. Get ready.', busy: 'A race is on right now.', pause: 'The next race can start in {s} s.', getReady: 'Get ready', waitOthers: 'Waiting for the others', go: 'GO!', lap: 'Lap', finished: 'Finished', result: 'Result', dnf: 'DNF', newBest: 'new best', leave: 'Leave', backLobby: 'Back to the lobby', dropped: 'You were dropped. Tap to rejoin.', full: 'The world is full right now. Tap to try again.',
    keysSoft: 'Keyboard: soft (gas and steering build up)', keysDirect: 'Keyboard: direct (all or nothing)', leverOn: 'Mouse throttle lever on (L): wheel or drag up and down; the brake resets it', leverOff: 'Mouse throttle lever off (L)', volume: 'Volume', quality: 'Graphics', camChase: 'Chase camera', camBonnet: 'Bonnet camera', camCockpit: 'Cockpit camera', padOn: 'Controller: stick steers, right trigger gas, left trigger brake, A handbrake, Y camera, X restart', padOff: 'Controller unplugged: paused', creativeOn: 'Creative mode on (K): no scores count, no damage', creativeOff: 'Creative mode off (K)', creativeBanner: 'CREATIVE: scores do not count', creativeChip: 'Creative', damageLabel: 'Damage', damageOn: 'Damage on (V)', damageOff: 'Damage off (V)', soundOn: 'Sound on (M)', soundOff: 'Sound off (M)', musicOff: 'Music: off (placeholder)', musicOn: 'Music: on (placeholder, no music yet)', chLap: 'Set a clean lap in a race or time trial', chDone: 'Challenge finished', chConfirmed: 'confirmed', chFailed: 'ended by a hit', chTitle: 'Challenge',
    feelArcade: 'Arcade', feelPro: 'Pro (fewer aids)', feelKey: 'Feel of driving (X)', tandem: 'Tandem', lead: 'Lead', chase: 'Chase', side: 'Side by side', tandemBank: 'Tandem bonus', practiceBot: 'Practice bot (B)',
    hintKeys: 'Arrows or WASD to drive, Space = handbrake, Shift = brake, R = restart, F = fullscreen' },
  de: { drift: 'DRIFT', score: 'Punkte', lost: 'Verloren!', hand: 'HAND', brake: 'BREMSE', gas: 'GAS', rotate: 'Dreh das Handy ins Querformat', tip: 'GAS halten, mit den Pfeilen lenken, HAND wirft das Heck raus',
    online: 'fahren hier', solo: 'Zeitfahren', newDrift: 'neuer bester Drift', tunedMark: 'getunt', paint: 'Lack', modeDrift: 'Drift-Attacke', modeTime: 'Zeitjagd', again: 'Nochmal', board: 'Beste Läufe', privateSession: 'Private Runde', run: 'Lauf beendet', sumTime: 'Zeit', sumPoints: 'Punkte', sumClips: 'Clipping-Punkte', sumBest: 'Bester Drift', clip: 'CLIP', zone: 'Zone', slip: 'Winkel', best: 'Bester Drift', you: 'Du bist', race: 'Rennen starten', invite: '{by} startet ein Rennen auf {map} ({laps} Runden).', join: 'Mitfahren', no: 'Nein', waiting: 'Einladung verschickt: das Rennen startet in ein paar Sekunden.', joined: 'Du bist dabei. Mach dich bereit.', busy: 'Gerade läuft ein Rennen.', pause: 'Das nächste Rennen geht in {s} s.', getReady: 'Mach dich bereit', waitOthers: 'Warte auf die anderen', go: 'LOS!', lap: 'Runde', finished: 'Im Ziel', result: 'Ergebnis', dnf: 'Ausgeschieden', newBest: 'neue Bestzeit', leave: 'Verlassen', backLobby: 'Zurück zur Lobby', dropped: 'Du wurdest getrennt. Tippen zum Zurückkehren.', full: 'Die Welt ist gerade voll. Tippen zum Erneut-Versuchen.',
    keysSoft: 'Tastatur: weich (Gas und Lenken bauen sich auf)', keysDirect: 'Tastatur: direkt (alles oder nichts)', leverOn: 'Maus-Gashebel an (L): Rad oder Ziehen nach oben und unten; die Bremse setzt ihn zur\u00fcck', leverOff: 'Maus-Gashebel aus (L)', volume: 'Lautstärke', quality: 'Grafik', camChase: 'Verfolgerkamera', camBonnet: 'Hauben-Kamera', camCockpit: 'Cockpit-Kamera', padOn: 'Controller: Stick lenkt, rechter Trigger Gas, linker Trigger Bremse, A Handbremse, Y Kamera, X Neustart', padOff: 'Controller getrennt: Pause', creativeOn: 'Kreativ-Modus an (K): keine Wertung, kein Schaden', creativeOff: 'Kreativ-Modus aus (K)', creativeBanner: 'KREATIV: nichts davon z\u00e4hlt', creativeChip: 'Kreativ', damageLabel: 'Schaden', damageOn: 'Schaden an (V)', damageOff: 'Schaden aus (V)', soundOn: 'Ton an (M)', soundOff: 'Ton aus (M)', musicOff: 'Musik: aus (Platzhalter)', musicOn: 'Musik: an (Platzhalter, noch keine Musik)', chLap: 'Fahr im Rennen oder Zeitfahren eine saubere Runde', chDone: 'Herausforderung beendet', chConfirmed: 'bestätigt', chFailed: 'durch einen Treffer beendet', chTitle: 'Herausforderung',
    feelArcade: 'Arcade', feelPro: 'Pro (weniger Hilfen)', feelKey: 'Fahrgef\u00fchl (X)', tandem: 'Tandem', lead: 'Vorne', chase: 'Hinterher', side: 'Nebeneinander', tandemBank: 'Tandem-Bonus', practiceBot: '\u00dcbungs-Bot (B)',
    hintKeys: 'Pfeile oder WASD fahren, Leertaste = Handbremse, Shift = Bremse, R = neu starten, F = Vollbild' },
}[de ? 'de' : 'en'];
document.documentElement.lang = de ? 'de' : 'en';
for (const e of document.querySelectorAll('[data-t]')) e.textContent = T[e.dataset.t];

const $ = (id) => document.getElementById(id);
const coarse = matchMedia('(pointer: coarse)').matches || params.has('touch');
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
let tierName = ['high', 'medium', 'low'].includes(forced) ? forced : coarse ? 'low' : 'high';
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
const fxFor = (c) => (fleet.file ? carFx(c, cars[carIndex]?.fx, { lite }) : null);   // brake lights, exhaust flames (on the event car.pop that the throttle code below fires), underglow strips
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
const remotes = online ? new Remotes({ scene, stage, fleet, pool, camera, tagsEl: $('tags'), glowPool, glowOf: (id) => net?.glow.get(id), glowBoost, maxNear: lite ? 3 : 6 }) : null;
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
const raceMode = online && document.documentElement.dataset.race === '1' && params.get('open') !== '1';
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
        const g = { x: ls.x + ((me.id % 6) - 2.5) * 9, z: ls.z + (Math.floor(me.id / 6) % 3) * 8 - 6, h: ls.h };   // spread over the plaza by id (six a row, three rows)
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
    onState(st) { if (st === 'open' && !inRace && pendingMode) { const m = pendingMode; pendingMode = null; setTimeout(() => startMode(m), 800); } if (st === 'open' && !inRace) { n.sendJson({ t: 'feel', v: feel }); if (creative) n.sendJson({ t: 'mode', v: 'creative' }); if (chStarted && chRun && !chRun.done) n.sendJson({ t: 'challenge.start', id: chDef.id }); } if (st === 'closed' && n === net && !racing) { $('online-n').textContent = onlineCount = 0; meName = ''; spawned = false; } },
    onJson: (j) => (inRace ? raceMessage(j) : lobbyMessage(j)),
  });
  n.connect();
  return n;
}

// ----- races (signed-in app only): invitation, grid, countdown, laps, result, back to the lobby
let racing = false;
function lobbyMessage(j) {
  if (j.t === 'race.invite') {
    $('invite-text').textContent = T.invite.replace('{by}', j.by).replace('{laps}', j.laps).replace('{map}', j.mapName ?? '') + (j.tuned ? ` (${T.tunedMark})` : '');
    show('invite', true);
    clearTimeout(lobbyMessage.timer); lobbyMessage.timer = setTimeout(() => show('invite', false), j.ms);
  } else if (j.t === 'race.wait') note(T.waiting);
  else if (j.t === 'race.joined') { show('invite', false); note(T.joined); }
  else if (j.t === 'race.busy') note(j.wait ? T.pause.replace('{s}', j.wait) : T.busy);
  else if (j.t === 'race.go') { show('invite', false); startRace(); }
  else if (j.t === 'emote') remotes?.emote(j.id, EMOTES[j.e]);
  else if (j.t === 'tandem') { if (!practice) tandemHud.set(j); }
  else if (j.t === 'tandem.bank') tandemHud.bank(j.points);
  else if (j.t === 'challenge') lobbyChallenge(j);
}

const chips = Object.assign(document.createElement('div'), { id: 'chips' });   // the small switches (sound, music, feel, creative, emotes, HUD): in a column on a big screen, behind one button on a phone
const chipsToggle = Object.assign(document.createElement('button'), { id: 'chips-toggle', type: 'button', textContent: '\u2699', ariaLabel: 'Menu' });
chipsToggle.addEventListener('click', () => chips.classList.toggle('open'));
const hudChip = Object.assign(document.createElement('button'), { id: 'hud-chip', type: 'button', textContent: 'HUD', title: 'HUD (H)' });
hudChip.addEventListener('click', () => hud.cycle());
document.body.append(chips, chipsToggle);
for (const id of ['racebar', 'invite', 'racehud']) { const el = $(id); if (el) $('hud').append(el); }   // the race bar, the invitation and the race's leave button stand in one column under the score card
chips.append(hudChip);

// ----- emotes: ten fixed symbols (keys 1 to 0, or the little button), shown over the sender's car for three seconds; there is no free text anywhere
let emoteSend = null;
const EMOTES = ['\u{1F44D}', '\u{1F602}', '\u{1F62E}', '\u{1F525}', '\u{1F3C1}', '\u{1F44B}', '\u{1F60E}', '\u{1F64F}', '\u{1F4A8}', '\u{1F422}'];
if (online && raceMode) {
  const bar = Object.assign(document.createElement('div'), { id: 'emotes', hidden: true });
  const open = Object.assign(document.createElement('button'), { id: 'emote-open', type: 'button', textContent: EMOTES[0], ariaLabel: 'Emotes' });
  emoteSend = (e) => send(e);
  const send = (e) => {
    if (racing || !net) return;
    net.sendJson({ t: 'emote', e });
    const span = Object.assign(document.createElement('span'), { className: 'emo', textContent: EMOTES[e] });
    hud.toast(EMOTES[e], 'bank');
  };
  EMOTES.forEach((s, i) => bar.append(Object.assign(document.createElement('button'), { type: 'button', textContent: s, onclick: () => { send(i); bar.hidden = true; } })));
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
function raceMessage(j) {
  if (j.t === 'grid') {
    locked = true;
    ensureMap(j.map ?? 0).then(() => { cur = prev = makeCar(j.x, j.z, j.h); score = newScore(); cam.snap(cur); stage.skids.clear(); raceInfo.ms = 0; });
    Object.assign(raceInfo, { pos: j.slot + 1, of: j.n, lap: 1, laps: j.laps, ms: 0 }); bestLap = 0;
    $('rh-pos').textContent = `P${j.slot + 1}/${j.n}`; $('rh-lap').textContent = `${T.lap} 1/${j.laps}`; $('rh-time').textContent = fmt(0); $('rh-drift').textContent = '';
    show('racehud', true); $('count').textContent = T.waitOthers;
  } else if (j.t === 'count') $('count').textContent = j.n;
  else if (j.t === 'go') { locked = false; $('count').textContent = T.go; setTimeout(() => show('count', false), 900); }
  else if (j.t === 'prog') {
    Object.assign(raceInfo, { pos: j.pos, of: j.of, lap: j.lap, laps: j.laps, ms: j.ms });
    $('rh-pos').textContent = `P${j.pos}/${j.of}`; $('rh-lap').textContent = `${T.lap} ${j.lap}/${j.laps}`; $('rh-time').textContent = fmt(j.ms);
    $('rh-drift').textContent = j.drift ? `${j.drift} x${j.mult}` : '';
  } else if (j.t === 'lap') { bestLap = bestLap ? Math.min(bestLap, j.ms) : j.ms; note(`${T.lap} ${j.lap}/${j.of}: ${fmt(j.ms)}`); }
  else if (j.t === 'finish') note(`${T.finished} P${j.pos}: ${fmt(j.ms)}`);
  else if (j.t === 'result') showResult(j);
  else if (j.t === 'back') endRace();
}
/** Starts a mode on the touge: a run of one on the server (the same machinery as a race: grid, countdown, gates, the result and the boards). */
function startMode(kind) {
  if (!raceMode || racing || !net || !net.connected) return;
  runMode = kind;
  net.sendJson({ t: 'race.start', map: 0, laps: 1, solo: true });
}
/** The result of a mode: the numbers of the run and the board of this mode (best run times, or the points of a whole run). */
async function showModeResult(j, kind = runMode) {
  const me = net?.roster.get(net.me?.id)?.name, mine = j.rows.find((r) => r.name === me) ?? j.rows[0];
  const time = kind === 'time';
  $('res-title').textContent = time ? T.modeTime : T.modeDrift;
  $('res-table').hidden = true;
  let box = $('res-mode'); if (!box) { box = Object.assign(document.createElement('div'), { id: 'res-mode' }); $('res-table').after(box); }
  const row = (k, v, cls) => { const r = document.createElement('div'); r.className = cls ?? ''; const a = document.createElement('span'), b = document.createElement('b'); a.textContent = k; b.textContent = v; r.append(a, b); return r; };
  const nf = (n) => Number(n).toLocaleString(de ? 'de-DE' : 'en-GB');
  const isNew = time ? mine.newLap || mine.newRace : mine.newAttack;
  box.replaceChildren(row(T.sumTime, mine.ms == null ? T.dnf : fmt(mine.ms), time ? 'main' : ''), row(T.sumPoints, nf(mine.drift), time ? '' : 'main'), row(T.sumBest, nf(mine.bestDrift)));
  if (isNew) box.append(Object.assign(document.createElement('p'), { className: 'new-best', textContent: T.newBest }));
  show('count', false); show('racehud', false); show('result', true);
  try {   // the board of this mode: the five best, and your line
    const b = await fetch(document.documentElement.dataset.guest === '1' ? '/api/guest/times?map=0' : '/api/times?map=0').then((r) => r.json());
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
    for (const [kind, label] of [['drift', T.modeDrift], ['time', T.modeTime]]) { const b = Object.assign(document.createElement('button'), { id: 'mode-' + kind, type: 'button', textContent: label, title: label }); b.addEventListener('click', () => startMode(kind)); chips.append(b); }
    if (['drift', 'time'].includes(params.get('mode'))) pendingMode = params.get('mode');   // ?mode=drift|time starts that mode as soon as the lobby socket is open
    mapList ??= (await fetch('data/maps.json').then((r) => r.json())).maps;
    const sel = $('mapSel');
    for (const m of mapList) sel.append(Object.assign(document.createElement('option'), { value: m.id, textContent: m.name }));
    $('raceBtn').addEventListener('click', () => { const m = mapList.find((x) => x.id === +sel.value); net.sendJson({ t: 'race.start', map: m.id, laps: m.laps }); });
    $('soloBtn').addEventListener('click', () => { const m = mapList.find((x) => x.id === +sel.value); net.sendJson({ t: 'race.start', map: m.id, laps: m.laps, solo: true }); });   // a time trial is a race of one
    $('invite-yes').addEventListener('click', () => { net.sendJson({ t: 'race.join' }); show('invite', false); });
    $('invite-no').addEventListener('click', () => { net.sendJson({ t: 'race.decline' }); show('invite', false); });
    $('rh-leave').addEventListener('click', () => { net.sendJson({ t: 'leave' }); endRace(); });
    $('res-back').addEventListener('click', endRace);
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
const sound = new SoundSystem();
const soundChip = Object.assign(document.createElement('button'), { id: 'sound', type: 'button' });
const musicChip = Object.assign(document.createElement('button'), { id: 'music', type: 'button' });
const showSound = () => { const on = sound.unlocked && !sound.muted; soundChip.textContent = on ? '\u{1F50A}' : '\u{1F507}'; soundChip.title = on ? T.soundOn : T.soundOff; soundChip.setAttribute('aria-pressed', on); musicChip.textContent = '\u266A'; musicChip.title = sound.music ? T.musicOn : T.musicOff; musicChip.setAttribute('aria-pressed', sound.music); };
const unlockSound = () => { sound.unlock(); showSound(); };
function toggleSound() { if (!sound.unlocked) { unlockSound(); sound.setMuted(false); showSound(); return; } sound.setMuted(!sound.muted); showSound(); }
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, unlockSound, { once: true, capture: true });
soundChip.addEventListener('click', toggleSound);
musicChip.addEventListener('click', () => { sound.setMusic(!sound.music); showSound(); });
showSound(); chips.append(soundChip, musicChip);
const volume = Object.assign(document.createElement('input'), { id: 'volume', type: 'range', min: 0, max: 1, step: 0.05, value: sound.volume, ariaLabel: T.volume, title: T.volume });
volume.addEventListener('input', () => { if (!sound.unlocked) unlockSound(); if (sound.muted) sound.setMuted(false); sound.setVolume(+volume.value); showSound(); });
chips.append(volume);
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
function reset() {
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
if (shotDef) { const s = shotDef.start; cur = prev = { ...makeCar(s.x, s.z, s.h), vx: Math.sin(s.h) * s.v, vz: Math.cos(s.h) * s.v }; cam.snap(cur); lineDriver = lineBot(stage.field.road, shotDef.bot); damageOn = false; }
if (params.has('pose')) { const [px, pz, ph, pslip, pkmh] = params.get('pose').split(',').map(Number), v = pkmh / 3.6, dir = ph - (pslip * Math.PI) / 180; cur = prev = { ...makeCar(px, pz, ph), vx: Math.sin(dir) * v, vz: Math.cos(dir) * v }; cam.snap(cur); if (params.has('t')) lineDriver = lineBot(stage.field.road, { closed: map.closed !== false, speed: 30, corner: 11, kick: 0.25, look: 14, hold: 0.55 }); }
const demo = params.get('demo') === 'orbit', demoLine = params.get('demo') === 'line';   // ?demo=orbit|line: a bot drives (a circle, or the map's loop) for pictures
const freecam = params.has('freecam') ? params.get('freecam').split(',').map(Number) : null;
if (demoLine) { const o = map.grid[0]; cur = prev = makeCar(o.x, o.z, o.h); cam.snap(cur); lineDriver = lineBot(stage.field.road, map.closed === false ? { closed: false, speed: 30, corner: 11, kick: 0.25, look: 14, hold: 0.55 } : { closed: true, speed: 22, corner: 15 }); }   // (the touge numbers: a clean run of about 118 s with 30 to 40 degree drifts in the hairpins, no wall touched)
if (demo) { const o = mapId === 0 ? { x: -30, z: 8, h: Math.PI / 2 } : map.grid[0]; cur = prev = makeCar(o.x, o.z, o.h); cam.snap(cur); }

// ----- the practice partner (?bot=1 or the key B): a bot drives a drift circle next to you; the tandem bonus is judged here, nothing is sent
let practice = null;
let botCar = null;
function togglePractice(on = !practice) {
  if (botCar) { scene.remove(botCar.group); botCar = null; }
  if (!on) { practice = null; tandemHud.set(null); return; }
  if (!practice) {
    const start = params.get('bot') === 'near' ? { x: cur.x + 6, z: cur.z, h: cur.h } : mapId === 0 ? MEETING_PRACTICE_START : map.grid[0];   // ?bot=near: right beside you (for pictures and tests)   // a clear run and an open circle; the bot waits there for you to find it
    practice = { bot: new PracticeBot(map, car, start, 1), scorer: new TandemPractice(), spin: 0 };
  }
  botCar = fleet.spawn(new THREE.Color().setHSL(((car.colour + 180) % 360) / 360, 0.62, 0.42));
  scene.add(botCar.group);
}

function simStep(i) {
  prev = cur;
  const inp = locked ? { steer: 0, throttle: 0, brake: 0, handbrake: 1 } : demo ? orbitBot(i * DT, cur, { start: 1.5 }) : lineDriver ? lineDriver(i * DT, cur) : input.read();
  lastInp = inp;
  const mu = surfaceAt(map, cur.x, cur.z).mu;
  cur = collideBody(map, step(cur, inp, carNow, mu));   // the walls and poles
  for (const o of remoteBodies) {   // the other cars
    const r = collideCars(cur, o, { applyB: false, ma: myMass, mb: o.m });
    if (r.hit > 0) cur = { ...r.a, hit: Math.max(cur.hit, r.hit) };
  }
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
    for (const sx of [-1, 1]) {
      const ry = HEAD(cur.h), c = Math.cos(ry), sn = Math.sin(ry), lx = sx * (fleet.dims ?? CAR_DIMS).wheelX, lz = -(fleet.dims ?? CAR_DIMS).wheelZ, wx = X(cur.x) + lx * c + lz * sn, wz = cur.z - lx * sn + lz * c;
      stage.skids.mark(sx < 0 ? 0 : 1, wx, wz, 0, 0, slid && speedOf(cur) > 3, stage.field.groundY(cur.x, cur.z));
      if (slid) stage.smoke.emit(wx + X(-Math.cos(t)) * out, 0.35 + stage.field.groundY(cur.x, cur.z), wz + Math.sin(t) * out, X(cur.vx * 0.06 - Math.cos(t) * push), cur.vz * 0.06 + Math.sin(t) * push, Math.min(1, Math.abs(bodySlip(cur)) + 0.2));
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
addEventListener('resize', checkRotate); checkRotate();

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

  // body pose: yaw, a little roll and pitch from the forces; the car stands on the road's drawn height and leans with its slope (only drawn: the physics is flat)
  const field = stage.field, gy = field.groundY(drawn.x, drawn.z), sh = Math.sin(drawn.h), ch = Math.cos(drawn.h);
  const slope = (field.groundY(drawn.x + sh * 1.3, drawn.z + ch * 1.3) - field.groundY(drawn.x - sh * 1.3, drawn.z - ch * 1.3)) / 2.6;
  const roll = Math.max(-0.08, Math.min(0.08, -cur.w * vf * 0.0035));
  const pitch = Math.max(-0.05, Math.min(0.05, -cur.ax * 0.004)) - Math.atan(slope);
  carGroup.visible = !cam.hidesCar;   // in the cockpit the body is not drawn
  carGroup.position.set(X(drawn.x), gy, drawn.z);
  carGroup.rotation.set(pitch, HEAD(drawn.h), roll, 'YXZ');
  carGroup.updateMatrix();
  mine.uniforms.uBase.value = gy;
  stage.smoke.car.value.set(X(drawn.x), gy, drawn.z);
  spin += (vf * dt) / WHEEL_R;
  glowPool.begin();
  if (mineFx) { mineFx.setGlow(glowHue); mineFx.update(paused ? 0 : dt, { brake: lastInp.brake, groundAt: (wx, wz) => stage.field.groundY(X(wx), wz) }); }   // a model car: strips along the sills, not a patch (X: the view's x is the physics' x mirrored)
  else if (glowHue !== null) glowPool.add(X(drawn.x), drawn.z, HEAD(drawn.h), glowHue, (0.85 + 0.15 * Math.sin(now / 400)) * glowBoost(), gy);
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
  if (practice && botCar) {   // the practice bot, drawn like the other cars, and the chip from the local judgement
    const b = practice.bot.state, { vf: bvf } = bodyVelocity(b), bg = field.groundY(b.x, b.z);
    botCar.group.position.set(X(b.x), bg, b.z); botCar.group.rotation.set(0, HEAD(b.h), 0, 'YXZ');
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
  if (dmg > 0.5 && !paused && info.frames % 3 === 0) { const np = new THREE.Vector3(0, 0.7, 2.2).applyMatrix4(carGroup.matrix); smoke.emit(np.x, 0.5 + gy, np.z, 0, 0, 0.35 * dmg); }
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
window.__drift = { showSummary, modeResult(kind, j) { runMode = kind; return showModeResult(j, kind); }, get carGroup() { return carGroup; }, get camera() { return camera; }, get state() { return cur; }, get score() { return score; }, stage, renderer, info, car, get map() { return map; }, get mapId() { return mapId; }, ensureMap, reset, input, get fleet() { return fleet; }, get fx() { return mineFx; } };
requestAnimationFrame(frame);
