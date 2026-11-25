# Roadmap

Status: **order confirmed by the owner, 2026-11-26** (an interview that set the vision, [VISION.md](VISION.md)). Release, repository and deployment are the orchestrator's and need the owner's yes. Every step starts with pictures for the owner; releases are small and often.

## Decisions this rests on

1. **Public for everyone** from the first release; open registration with protection; one "Juloc Games" account for all games, provided by Drift as a module ([ACCOUNTS-GAMES.md](ACCOUNTS-GAMES.md)); the family comes in through the hub.
2. **Standard entry: a public open world** ("meeting point", stylised sunset look, soft and painted) plus single tracks; meeting, racing and drift points equally important.
3. **32 and more players per world**, everything on our own server (the owner's small server, behind the reverse proxy; the address is the owner's).
4. **PC first** (keyboard and controller), the phone runs along.
5. **Real cars through the pipeline** (the owner's GPU PC, soon); the S15 first. Until then the code models.

## The order up to the public start

| # | Step | Done means | The owner checks |
|---|---|---|---|
| 1 | **Look probe** (the session drift-look) | pictures of the look (exactly the owner's mockup: soft, atmospheric, painted sunset; not angular low-poly): world, car, interface | the look, in pictures |
| 2 | **Accounts** | *done* (slices 1 to 4 built; the independent security review is running) | the privacy and imprint texts, the sign-up page |
| 3 | **Open world** | a small meeting point with mountain roads; **network for 32+** (a car is sent only to players near it, far cars are drawn simplified), emotes | driving there with others; numbers: bytes per second per player with 32 and 64 |
| 4 | **Tandem** | bonus for driving side by side, lead/chase, tandem competition, a bot to practise | how it feels with a friend and with the bot |
| 5 | **Challenges with stars** | Story mode, first part: challenges with stars; Creative mode (everything free) | the first ten challenges |
| 6 | **Driving feel, controller, cameras** | the assist switch (boards show it), controller, chase/bonnet/cockpit cameras | the feel with assists on and off |
| 7 | **Sound and music** | engine and tyres generated in code, music; real recordings later | an hour of play |
| 8 | **Collision and damage** | contact between cars in our own 2D code, damage that costs grip and shows | how contact feels (no sticking, no flying) |
| 9 | **Load test, review, legal texts, start** | load test 32+ (and the limit written down), backups with a restore that was tried, monitoring, a review of everything new, the owner's texts in, release | the whole thing as a newcomer, phone and PC |

**In parallel as soon as the GPU PC runs:** real cars (S15 first) with Forza-like values per car; the model path is ready ([CAR-MODELS.md](CAR-MODELS.md)).

## After the public start

Shaping like Forza (paint, wheels, parts, body kits one by one, height and suspension, detailed values with a performance class, tuning); weather and day/night (selectable, later dynamic); friends, private lobbies, crews, spectating; the career; steering wheel; stickers. Ideas that stay: ghost against your own best time, photo mode and replay, scoring by line, weekly board.

## Risks

- **32+ players on a small server:** the relay today sends every car to everybody, which grows with the square of the players; step 3 fixes this first (interest areas) and measures it before anything else is built on it.
- **Look:** a matter of taste; pictures first, code after.
- **Abuse** (names, ramming, blocking): filter, reports, block/ban are built; collision rules (step 8) must not let one player trap another.
- **Phone:** the open world and 32 cars are the heavy part; the answer is a lower tier, not a second game. Frame time on a real phone is still unmeasured.
- **Pipeline:** real cars depend on the owner's machine; the code models carry the release if it is late.
- **The relay is shared with the website's demo:** see PLAN-0.2.md for how it stays compatible.

## Not covered

No effort estimates, no costs, no legal text.
