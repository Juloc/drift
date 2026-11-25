# Changelog

Versions follow SemVer. The version stands in `Directory.Build.props`.

## 0.3.0

- The game wears the new look: the shared look stage (sky, light, world, mist, smoke, tyre marks), the HUD from the mockup, the RX-7 for everybody, the road on a drawn height profile (view only), the maps drawn in the new style.

## 0.2.3

- Look probe rounds 9 to 14: the road on a drawn height profile with a deep valley (view only, physics unchanged), painted car style, detailed road and surroundings, painted billow smoke.

## 0.2.2

- Reverse works: the brake brakes while the car rolls forward and becomes reverse at a stop; the camera stays behind the car.
- Finer control on the PC: keyboard throttle, brake and steering as smooth ramps (tap to hold half throttle or a steering angle), "direct" as a setting; the mouse as a throttle lever (optional).

## 0.2.1

- The first real car: the Mazda RX-7 FD ("Mazda RX-7 FD" by Lexyc16, CC BY 4.0, scaled, materials replaced, emblems removed), with the pipeline that normalises downloaded models; the credits page lists it.
- The look probe "sunset" from the owner's mockup as its own page (`/play/lookprobe.html`): meeting place, mountain road, valley, the mockup's HUD; not yet the game's look.

## 0.2.0

- The first preview of the public game: the open lobby (64 per world, interest areas), races and boards, the Juloc Games account (open registration, closed until the owner's privacy and imprint texts are in), tandem, challenges with stars, Arcade and Pro feel, controller, cameras, sound, collision and damage, model files (test model only).
- A production stack (`deploy/stack/docker-compose.yml`) and a release workflow for `ghcr.io/juloc/drift:<version>`.

## 0.1.0

- Made from base 0.3.4 with `new-app.sh`.
