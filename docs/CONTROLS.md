# Controls

Keyboard, touch and a controller (Gamepad API, the standard layout that browsers give for common pads). The controller can be used together with the keyboard: an analog stick or trigger wins over a key, the pedals take the larger of the two.

| Action | Keyboard | Controller | Touch |
|---|---|---|---|
| Steer | Left/Right or A/D | **left stick** (dead zone 12 %, curve 1.5) | the two arrow buttons |
| Gas | Up or W | **right trigger** (analog) | GAS |
| Brake / reverse | Down, S or Shift | **left trigger** (analog) | BRAKE |
| Handbrake | Space | **A** (or B) | HAND |
| Restart | R | **X** | |
| Camera: chase, bonnet, cockpit | C | **Y** or **RB** | |
| Feel of driving: Arcade or Pro | X | **LB** (and the chip on the screen) | the chip |
| Practice bot (tandem) | B | **Back** | |
| Pause | P | **Start** | |
| Emotes | 1 to 0 | **d-pad** (up, right, down, left = the first four) | the emote button |
| Fullscreen, quality, HUD, debug | F, Q, H, G | | |

- **Hot-plug:** a pad that is connected shows its mapping for a few seconds; a pad that is unplugged **pauses** the game.
- A pad that reports no buttons or axes is ignored, not an error. A resting trigger that reads a little pressed (under 6 %) is not a pedal.
- **Cameras:** *chase* (a spring behind the car, the default), *bonnet* (on the nose, the body stays in view), *cockpit* (the driver's eyes, the car's body and wheels are not drawn). In both in-car cameras the view leans towards the direction of travel, so a slide opens the view into the corner.
- **Feel of driving:** *Arcade* (the default) and *Pro* (a third of the counter-steer aid and about 60 % of the yaw damping). The boards keep the feel a time was set with: `/api/times?feel=1` is the Pro list.
- Not built: steering wheel, tilt steering, remapping of buttons.
