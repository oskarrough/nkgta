// Getting run over. A car hitting you at more than about 25 km/h and you're
// wasted: you lie in the road for a moment, the screen fades, then you're
// back on your feet at the nearest hospital, or where the game started if
// the area has none.

import { sound } from './sound.js'

const LETHAL = 2.3 // tiles per second
const DOWN_FOR = 3 // seconds
const FADE = 0.45 // seconds either side of the cut

export function createWasted({ player, onDown, respawn, fade = () => {} }) {
	let down = 0
	let waking = 0
	return {
		active: () => down > 0 || waking > 0,
		shown: () => down > 0,

		hit(speed) {
			if (down || waking || speed < LETHAL) return
			sound.hit(speed)
			down = DOWN_FOR
			player.down = true
			player.speed = 0
			if (player.onBike) {
				player.onBike = false
				player.bike.x = player.x
				player.bike.y = player.y
			}
			onDown()
		},

		update(dt) {
			if (down > 0) {
				down -= dt
				if (down > 0) {
					fade(down < FADE ? 1 - down / FADE : 0)
					return
				}
				down = 0
				player.down = false
				fade(1)
				respawn()
				waking = FADE
				return
			}
			if (waking <= 0) return
			waking = Math.max(0, waking - dt)
			fade(waking / FADE)
		},
	}
}
