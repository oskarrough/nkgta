// Getting run over. A car hitting you at more than about 25 km/h and you're
// wasted: you lie in the road for a moment, then you're back on your feet
// where the game started, bike beside you.

const LETHAL = 2.3 // tiles per second
const DOWN_FOR = 3 // seconds

export function createWasted({ player, onDown, respawn }) {
	let down = 0
	return {
		active: () => down > 0,

		hit(speed) {
			if (down || speed < LETHAL) return
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
			if (!down || (down -= dt) > 0) return
			down = 0
			player.down = false
			respawn()
		},
	}
}
