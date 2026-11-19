// The bus: wait at a stop and one comes, get on while its doors are open,
// ride where it goes, get off when it next opens them.
import { distanceTo, speedOf } from './car.js'
import { MODELS } from './models.js'
import { leaveCar } from './player.js'
import { nearestPavement } from './police.js'
import { sound } from './sound.js'

const AT_STOP = 2.5 // tiles from the pole that count as waiting there
const BOARD = 3 // tiles from an open bus you can still get on
const STUCK = 3 // seconds a bus stands still before you may get off anyway

export function createBusRide({ world, traffic, player, say }) {
	const stops = (world.transit ?? []).filter((t) => t.kind === 'bus')
	let waiting = null // the stop the player stands at
	let called = null // the bus on its way there
	let retry = 0
	let still = 0 // seconds the bus you're on has stood still

	const onFoot = () => !player.car && !player.onBike && !player.down
	const open = (c) => c.model === MODELS.bus && c.ai?.dwell > 0

	const boardable = () => (onFoot() && traffic.cars.find((c) => open(c) && distanceTo(c, player.x, player.y) < BOARD)) || null

	function update(dt) {
		if (player.passenger) {
			if (!traffic.cars.includes(player.car)) return getOff()
			still = speedOf(player.car) < 0.3 ? still + dt : 0
			waiting = null
			return
		}
		const stop = onFoot() ? stops.find((s) => Math.hypot(s.x - player.x, s.y - player.y) < AT_STOP) : null
		if (stop !== waiting) [waiting, called, retry] = [stop, null, 0]
		if (!stop) return
		// Until the bus has been and gone again, it is still coming.
		const ai = called && traffic.cars.includes(called) && called.ai
		if ((ai && !(ai.served === stop && ai.dwell <= 0)) || (retry -= dt) > 0) return
		called = traffic.callBus(stop)
		retry = 2
		if (called) say(`${stop.name || 'Haltestelle'}: ${[called.model.name, called.line].filter(Boolean).join(' ')} kommt`)
	}

	function getOff() {
		leaveCar(player, world)
		Object.assign(player, nearestPavement(world, player.x, player.y))
		still = 0
		sound.door()
	}

	function use() {
		if (player.passenger) {
			if (open(player.car) || still > STUCK) getOff()
			else say('Erst an der nächsten Haltestelle')
			return true
		}
		const bus = boardable()
		if (!bus) return false
		player.car = bus
		player.passenger = true
		player.speed = 0
		sound.door()
		return true
	}

	return { update, use, boardable }
}
