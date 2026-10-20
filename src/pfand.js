// Pfand bottles lying around on pavements and in parks, cashed in at Spätis.
import { sound } from './sound.js'
import { T } from './tiles.js'
import { nearestPlace, placeName } from './places.js'

const BAG_SIZE = 30
const RESPAWN_MS = 20000

export const euro = (c) => `€${(c / 100).toFixed(2).replace('.', ',')}`

export function createPfand(world) {
	const bottles = []
	const bag = { bottles: 0, pending: 0, cents: 0 }

	function spawn() {
		for (let tries = 0; tries < 200; tries++) {
			const x = Math.random() * world.W
			const y = Math.random() * world.H
			const t = world.tileAt(x, y)
			if (t === T.SIDEWALK || t === T.GRASS || t === T.PLAYGROUND) {
				bottles.push({ x, y, can: Math.random() < 0.25 })
				return
			}
		}
	}
	// About one bottle per 50 m × 50 m.
	for (let i = 0; i < (world.W * world.H) / 300; i++) spawn()

	function update(player, say) {
		for (let i = bottles.length - 1; i >= 0; i--) {
			const b = bottles[i]
			if (bag.bottles >= BAG_SIZE || Math.hypot(b.x - player.x, b.y - player.y) > 0.8) continue
			// 8 cents a bottle, 25 a can.
			sound.clink()
			bag.bottles++
			bag.pending += b.can ? 25 : 8
			bottles.splice(i, 1)
			setTimeout(spawn, RESPAWN_MS)
		}

		const spaeti = nearestPlace(world.pois, player.x, player.y, 2, 'spaeti')
		if (spaeti && bag.bottles) {
			sound.till()
			bag.cents += bag.pending
			say(`${placeName(spaeti)}: ${bag.bottles} Flaschen, +${euro(bag.pending)}`)
			bag.bottles = 0
			bag.pending = 0
		}
	}

	// Knocked over: the bag splits and the bottles roll about.
	function spill(x, y) {
		sound.spill(bag.bottles)
		for (let i = 0; i < bag.bottles; i++) {
			const a = Math.random() * Math.PI * 2
			const r = 0.4 + Math.random() * 1.2
			bottles.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, can: Math.random() < 0.25 })
		}
		bag.bottles = 0
		bag.pending = 0
	}

	return { bottles, bag, update, spill }
}
