/** Where somebody arriving in the lobby starts: spread over the plaza by the id the relay gave (six in a row, three rows), looking the way of the lobby's spawn. */
export function lobbyStart(id, spawn) {
  return { x: spawn.x + ((id % 6) - 2.5) * 9, z: spawn.z + (Math.floor(id / 6) % 3) * 8 - 6, h: spawn.h };
}
