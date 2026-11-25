# Scope: what we build now

One page, to keep us on track. **This file says what we build and wins whenever a wish and this page disagree.** A new idea goes into [IDEAS.md](IDEAS.md).

Status: **agreed with the owner on 2026-11-25; direction changed 2026-11-26 (public start, PC first, real car models): the vision is [VISION.md](VISION.md), the order [ROADMAP.md](ROADMAP.md), the steps [PLAN-0.2.md](PLAN-0.2.md). Where this page and those differ, they win** (the original 1.0 table below is what was built so far) (his request in his words below, his answers at the end). Nothing is built.

## The owner's request (translated)

"Make a drift game, with an open lobby where you see each other and can do spontaneous races. Five maps and five cars to start."

## What this app is

`drift` is a small drift racing game in the browser. Everyone who opens it lands in **the open lobby**: one shared map where all present players drive around freely and see each other live. From there anyone can **start a race on the spot**: the others in the lobby get an invitation, whoever joins within a few seconds is on the grid, and after the race everyone is back in the lobby. Points come from **drifting** (angle, speed, duration, chains) and from finishing position.

## Goal

**On the phone or at the desk, I open the game, I am in the lobby with whoever else is online, I drift around with them, and within ten seconds we are racing against each other; it runs smoothly on a phone and feels good to drive.**

## Version 1.0

| # | Milestone | Done when |
|---|---|---|
| 1 | **Driving feels good, alone** | One car on one map in the browser, no server: drift physics (grip, slip angle, handbrake, counter-steer), a camera that follows smoothly, touch controls in landscape (steer left, throttle, brake, handbrake right) and keys (arrows or WASD, space for the handbrake), the drift score shown while drifting. Smooth on a phone (frame time written down). |
| 2 | **The app around it** | Start from the base: sign-in through the hub and own accounts, `/api/about`, the look of the family for menus; the game page itself is full screen. A garage to choose the car, a name and a colour per person. |
| 3 | **The open lobby** | Everyone present drives on the lobby map and sees the others live (smooth with normal home and mobile networks, written down: update rate, bytes per second per player, how many players at once). Names above the cars, nobody can push anybody off the map by cheating. |
| 4 | **Spontaneous races** | Anyone in the lobby starts a race on a chosen map; the others get an invitation; countdown, laps or a sprint, the result with drift points and positions, then back to the lobby. A short list of best times per map. |
| 5 | **Five maps, five cars, guests** | Five maps with their own character (for example a harbour at night, a mountain pass, a car park, a desert, a winter track) and five cars that feel different (light and nervous to heavy and lazy). Guests: the owner makes an invitation link, a friend without an account drives along for a few hours under a name of his choice. |

### Done for 1.0 when all of this works, on the phone and at the desk

1. I open the game and drift around the lobby with whoever is online.
2. One tap starts a race, the others join, and we race.
3. Five maps and five cars are there and each feels different.
4. A friend without an account drives along through my link.
5. It runs smoothly on a phone in landscape.

## Rules special to this app

1. **Fair enough for friends:** the server checks what clients send (speed, position jumps, lap times) and refuses the impossible; it does not run a full physics simulation per player in 1.0 unless the design shows that it is cheap.
2. **Guests are limited:** a link works for a few hours, a guest has no account, sees only the game, and the owner can end all guest links at once.
3. **Nothing private in the repository.**

## What is in and out now (changed 2026-11-26, after the interview)

**In scope, in this order** (details in the roadmap): the look probe; accounts (done); the **public open world** with a network for 32+ players; **tandem** drifting; **challenges with stars** (creative and story modes); the **driving-feel switch, controller and cameras**; **sound and music**; **collision and damage**; load test, review, legal texts, start. **Real cars** from the 3D pipeline in parallel when the owner's GPU PC runs.

**After the public start:** shaping like Forza, weather and day/night, friends, private lobbies, crews, spectating, the career, steering wheel, stickers.

**Out:** a map editor, teams and championships in the old sense, voice, free text chat (only emotes), a native app, steering by tilting the phone.

## Decisions of the owner (2026-11-25, asked one by one)

- **Where:** an app of its own, `drift`, on the base; it opens inside the hub's window and signs in through it, and works alone.
- **Who plays:** everyone with an account, plus guests through an invitation link the owner makes.
- **Look:** 3D in the miniature style of the website (three.js, own models).
- **Controls:** touch on the phone and the keyboard.
- **To start with:** five maps and five cars.

## Added 2026-11-26 (the owner, through the orchestrator)

- **Public for everyone** from the first release; **one "Juloc Games" account** for all games, provided by Drift as a separable module ([ACCOUNTS-GAMES.md](ACCOUNTS-GAMES.md)).
- **The game:** a public open world as the standard entry, in a low-poly sunset look, plus single tracks; real recognisable cars; 32+ players per world; everything on our own server. Full text: [VISION.md](VISION.md).
- **PC first** (keyboard and controller), the phone runs along. First real car: the Silvia S15.
- **Hosting:** the owner's small server through the usual deployment tool, behind the reverse proxy.
