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
| Sound on/off, music switch | M, the chips | | the chips |
| Damage on/off | V | | |
| Creative mode (no scores, no damage) | K | | the violet chip |
| Emotes | 1 to 0 | **d-pad** (up, right, down, left = the first four) | the emote button |
| Fullscreen, quality, HUD, debug | F, Q, H, G | | |

- **Hot-plug:** a pad that is connected shows its mapping for a few seconds; a pad that is unplugged **pauses** the game.
- A pad that reports no buttons or axes is ignored, not an error. A resting trigger that reads a little pressed (under 6 %) is not a pedal.
- **Cameras:** *chase* (a spring behind the car, the default), *bonnet* (on the nose, the body stays in view), *cockpit* (the driver's eyes, the car's body and wheels are not drawn). In both in-car cameras the view leans towards the direction of travel, so a slide opens the view into the corner.
- **Feel of driving:** *Arcade* (the default) and *Pro* (a third of the counter-steer aid and about 60 % of the yaw damping). The boards keep the feel a time was set with: `/api/times?feel=1` is the Pro list.
- Not built: steering wheel, tilt steering, remapping of buttons.

## Fine control at the PC (settings of the device)

- **Keyboard: soft (the default) or direct.** In *soft* the keys drive ramps (`game/sim/keys.js`): **gas** builds up while the key is held (0 to 100 % in about 0.6 s) and dies away in about a second after it is let go, so a short tap is a little gas, and tapping again and again at about a third of the time on holds a middle gas (the build-up and the decay cancel); the **brake** ramps in a third of a second and out in a quarter; the **steering** builds up in half a second, returns in two thirds, and crosses to the other side in a quarter second, so repeated taps hold an angle. In *direct* a key is all or nothing, as before. Set in the garage ("Controls at the PC") or with **J** in the game; `?keys=direct` for trying; the rates can be stored as JSON in `localStorage` key `drift.keys.rates` (`gasUp`, `gasDown`, `brakeUp`, `brakeDown`, `steerUp`, `steerBack`, `steerOpposite`, per second).
- **Mouse as a throttle lever** (off by default): the **wheel** moves it by a tenth per notch, a **vertical drag** on the game moves it with the pointer (220 px is the whole way), and it **stays** until it is changed; the **brake** puts it back to zero. The gas bar of the HUD shows it. Garage setting, **L** in the game, `?mouse=1` for trying.
- **Reversing:** hold the brake: the car stops, then goes backwards (up to 40 km/h); gas takes it forward again. The chase camera stays behind the nose.
- The controller is analog as before; the keys and the lever work together with it (the larger value wins).
