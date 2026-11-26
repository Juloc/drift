// The lab's texts in German and English (I18N-01): every visible word of the lab goes through t(). The language comes from ?lang=de|en,
// else from what was chosen before (stored on the device), else from the browser.
const TEXT = {
  de: {
    title: 'Drift: Labor der Oberfläche',
    navGarage: 'Garage', navWorld: 'Welt', navEvents: 'Events', navWorkshop: 'Werkstatt', navSettings: 'Einstellungen',
    navDealer: 'Händler', navCareer: 'Karriere', navCommunity: 'Community', soon: 'bald', guest: 'Gast', level: 'Stufe',
    current: 'Aktuelles Fahrzeug', tagDrift: 'Drift', tagRwd: 'Heck', hp: 'PS', kg: 'kg', drive: 'Antrieb', rwd: 'Heck',
    power: 'Leistung', handling: 'Handling', drift: 'Drift', grip: 'Grip',
    myCars: 'Meine Autos', myCarsSub: '1 Fahrzeug', tuning: 'Tuning', tuningSub: 'Leistung und Teile', design: 'Design', designSub: 'Lack und Folie',
    setup: 'Setup', setupSub: 'Fahrwerk und Drift', tasks: 'Aufgaben', tasksSub: 'Belohnungen', photo: 'Fotomodus', photoSub: 'Bilder und Wiederholungen',
    daily: 'Tagesaufgaben', task1: '5.000 Driftpunkte sammeln', task2: 'Eine Drift-Attacke fahren', task3: '300 m am Stück driften',
    bests: 'Bestwerte', back: 'Zurück', settings: 'Einstellungen', track: 'Strecke', trackName: 'Touge', timeOfDay: 'Tageszeit', dusk: 'Abend',
    weather: 'Wetter', clear: 'Klar', go: 'Fahren', paint: 'Lack', prevPaint: 'Lack davor', nextPaint: 'Nächster Lack', turnHint: 'Ziehen zum Drehen',
    modesTitle: 'Spielmodus', modesSub: 'Wähle, wie du die Touge fährst.', start: 'Start', best: 'Bestwert', solo: 'Allein', two: 'Zu zweit', online: 'Online',
    free: 'Freies Fahren', freeText: 'Die offene Welt mit allen, die gerade fahren. Kein Ziel, keine Uhr.',
    attack: 'Drift-Attacke', attackText: 'Ein Lauf die Touge hinunter auf Punkte: Zonen, Linie, Kette.',
    timeAttack: 'Zeitjagd', timeAttackText: 'Derselbe Lauf auf Zeit. Harte Wände kosten.',
    tandem: 'Tandem', tandemText: 'Zu zweit: einer führt, einer jagt, dann umgekehrt.',
    training: 'Training', trainingText: 'Ein Geist fährt die Linie vor, du fährst hinterher.',
    later: 'Diese Ansicht kommt in einer der nächsten Runden des Labors.', screens: 'Ansichten',
  },
  en: {
    title: 'Drift: interface lab',
    navGarage: 'Garage', navWorld: 'World', navEvents: 'Events', navWorkshop: 'Workshop', navSettings: 'Settings',
    navDealer: 'Dealer', navCareer: 'Career', navCommunity: 'Community', soon: 'soon', guest: 'Guest', level: 'Level',
    current: 'Current car', tagDrift: 'Drift', tagRwd: 'RWD', hp: 'hp', kg: 'kg', drive: 'Drive', rwd: 'RWD',
    power: 'Power', handling: 'Handling', drift: 'Drift', grip: 'Grip',
    myCars: 'My cars', myCarsSub: '1 car', tuning: 'Tuning', tuningSub: 'Power and parts', design: 'Design', designSub: 'Paint and wrap',
    setup: 'Setup', setupSub: 'Suspension and drift', tasks: 'Tasks', tasksSub: 'Rewards', photo: 'Photo mode', photoSub: 'Shots and replays',
    daily: 'Daily tasks', task1: 'Collect 5,000 drift points', task2: 'Finish a drift attack', task3: 'Drift 300 m in one go',
    bests: 'Personal bests', back: 'Back', settings: 'Settings', track: 'Track', trackName: 'Touge', timeOfDay: 'Time of day', dusk: 'Dusk',
    weather: 'Weather', clear: 'Clear', go: 'Drive', paint: 'Paint', prevPaint: 'Previous paint', nextPaint: 'Next paint', turnHint: 'Drag to turn',
    modesTitle: 'Game mode', modesSub: 'Choose how to drive the touge.', start: 'Start', best: 'Best', solo: 'Solo', two: 'Two players', online: 'Online',
    free: 'Free roam', freeText: 'The open world with everyone driving right now. No goal, no clock.',
    attack: 'Drift attack', attackText: 'One run down the touge for points: zones, line, chain.',
    timeAttack: 'Time attack', timeAttackText: 'The same run against the clock. Hard walls cost time.',
    tandem: 'Tandem', tandemText: 'Two of you: one leads, one chases, then the other way round.',
    training: 'Training', trainingText: 'A ghost drives the line ahead of you, you follow it.',
    later: 'This view comes in one of the next rounds of the lab.', screens: 'Views',
  },
};

const pick = () => {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'de' || q === 'en') return q;
  try { const s = localStorage.getItem('drift.lab.lang'); if (s === 'de' || s === 'en') return s; } catch { /* no storage */ }
  return (navigator.language || 'de').toLowerCase().startsWith('de') ? 'de' : 'en';
};
export let lang = pick();
export const t = (key) => TEXT[lang][key] ?? TEXT.de[key] ?? key;
export function setLang(l) { lang = l; try { localStorage.setItem('drift.lab.lang', l); } catch { /* no storage */ } document.documentElement.lang = l; }
/** Numbers as people of the language write them (5.000 / 5,000). */
export const num = (n, d = 0) => n.toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
