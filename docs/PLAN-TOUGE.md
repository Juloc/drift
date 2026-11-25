# Plan: the touge map and the zone scoring

Goal (docs/FOCUS.md): one map, the touge at dusk, played with the keyboard, 90 s down, hard walls, a camera that swings with the drift, scoring by angle, speed and zones. Each slice is playable and ends with the owner able to try it; "done means" is what is checked.

| # | Slice | Done means |
|---|---|---|
| 0 | **Now:** the game wears the look (stage, HUD, RX-7, height profile), sound off by default with limiter and volume, races/challenges hidden | the real game loads the stage on every map; sound starts muted, never peaks; no race bar, no challenge card; node + .NET tests green |
| 1 | **The touge, geometry** (tools/make-touge.mjs, physics map + theme): plaza at the crater lake (open, 70 x 50 m, lamps, torii, lanterns), a narrow road (halfWidth 4.5) of ~1.9 km with 8 to 10 hairpins running down 150 m of drawn height, a turn at the bottom and a way back (the "restart at the top" key and a teleport), guardrails as physics walls, bounds | a steady line bot drives plaza to bottom without touching a wall in 85 to 100 s; grid, spawn and lobby on the plaza; the server loads it (lobby bounds, walls); picture from the drive view |
| 2 | **The touge, look**: theme in data (dusk blue-violet, last orange, moon, crater lake in the valley, cedars on steep slopes, volcano silhouettes, warm lamps), same scene density as the probe, smoke rules of billows.js with the car free | side by side with the mockup: wide and phone picture; phone budget numbers in STATE |
| 3 | **Hard walls and the camera**: a wall hit costs about half the speed (collision restitution and slide loss in sim/map.js, sim tests), the chase camera swings with the drift angle (look at the exit, not the nose), tested against the probe's camera options (`turn`, `travel`) | numbers in a sim test (speed after a 20 m/s hit); picture of the swing at 45 degrees |
| 4 | **Zone scoring**: zones as data in the map (clipping points, inside/outside zones along the line); points for slip angle times speed inside a zone, a multiplier for staying on the line; a short run-end summary; server keeps the best | pure functions with tests (sim/zones.js); HUD shows zone state; drift points still match between client and server |
| 5 | **Lobby 16+ and links**: MaxPerWorld 16 and more, private session link, interest areas for a 2 km map | relay test with 16 bots on the touge; a link joins a private world |
| 6 | **Feel**: Arcade / Sim switch kept (X), tuned on the keyboard on this map | the owner's yes |

Order: 0 (now), 1, 2 (the picture the owner compares), 3, 4, 5, 6. Races, challenges, other maps and cars stay in the code and are hidden (`?races=1` shows the race UI again).
