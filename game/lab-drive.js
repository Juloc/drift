// Drive in the training place's harbour. `?scene=quay` (the default): the ring of track on the quay (lab-drive-quay.js, view/look/quay.js); `?scene=harbour`: the older Kenney corner
// (lab-drive-harbour.js, view/look/harbour.js), kept until the owner has seen the new one. Both pages use the test page's driving (lab-drive-core.js).
const scene = new URLSearchParams(location.search).get('scene') === 'harbour' ? 'harbour' : 'quay';
await import(scene === 'harbour' ? './lab-drive-harbour.js' : './lab-drive-quay.js');
