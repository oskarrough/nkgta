// Getting run over. A car hitting you at more than about 25 km/h and you're
// wasted: you lie in the road for a moment, the screen fades, then you're
// back on your feet at the nearest hospital, or where the game started if
// the area has none.

import { sound } from './sound.js'
import { createKnockout } from './knockout.js'

const LETHAL = 2.3 // tiles per second
const DOWN_FOR = 3 // seconds

export function createWasted({ player, onDown, respawn, fade = () => {} }) {
	const out = createKnockout({
		show: DOWN_FOR,
		fade,
		cut() {
			player.down = false
			respawn()
		},
	})
	return {
		active: out.active,
		shown: out.shown,
		update: out.update,

		hit(speed) {
			if (out.active() || speed < LETHAL) return
			sound.hit(speed)
			out.start()
			player.down = true
			player.speed = 0
			if (player.onBike) {
				player.onBike = false
				player.bike.x = player.x
				player.bike.y = player.y
			}
			onDown()
		},
	}
}
