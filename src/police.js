// The police. Stealing cars and running people over raises your heat, a
// star at a time; at one star a Wanne, a VW bus with the blue light on and
// the Martinshorn going, comes for you, and more of them with more stars.
// They chase what they can see: break their line of sight, through a
// Durchfahrt or into a Hof, and stay out of it for a while, and they give
// up. Get grabbed and it's a short fade, a fine, and you're on foot again.
import { driveCar, distanceTo, forwardSpeed, speedOf, toWorld } from './car.js'
import { MODELS } from './models.js'
import { leaveCar } from './player.js'
import { euro } from './pfand.js'
import { sound } from './sound.js'
import { createKnockout } from './knockout.js'
import { SOLID, T } from './tiles.js'

const MAX_HEAT = 3
const SIGHT = 30 // tiles a cop can see you from, with nothing in the way
const LOSE = 8 // seconds out of everyone's sight before they give up
const NEVER_FOUND = 30 // seconds without ever seeing you, and the call's dropped
const REMEMBER = 2.5 // seconds a cop still goes straight for where you were
const DIRECT = 14 // tiles: nearer than this, and in sight, it leaves the lanes and comes straight at you
const NO_GAIN = 4 // seconds of not getting closer before it goes back to the roads
const LANE_FOR = 5 // seconds it then keeps to them
const FINE = 5000 // cents a star
const GRAB = { car: 1.5, foot: 0.6 } // seconds within reach before you're nicked
const REACH = 0.9 // tiles from the bus's side
const CREEP = 1.9 // tiles/s a cop keeps under near someone on foot: below lethal
const BUSTED_FOR = 1.3 // seconds BUSTED is up
const FLASH = 5 // blue light, flashes a second
const SIREN_HEAR = 45 // tiles

export function createPolice({ world, traffic, player, bag, say = () => {}, fade = () => {}, onBust = () => {} }) {
	let heat = 0
	const stolen = new WeakSet() // cars already counted: getting back in is no new crime
	const cops = []
	let lastSeen = null // where you were last seen, or reported
	let unseen = 0 // seconds since any cop saw you
	let everSeen = false
	let summonIn = 0
	const bust = createKnockout({ show: BUSTED_FOR, fade, cut: bookYou })
	let clock = 0

	function raise(by = 1) {
		heat = Math.min(MAX_HEAT, heat + by)
		unseen = 0
		lastSeen = { x: player.x, y: player.y }
	}

	// Someone saw you take a car: the driver you threw out, or a passer-by.
	function steal(car) {
		if (bust.shown() || (car && stolen.has(car))) return
		if (car) stolen.add(car)
		raise()
	}

	// Off duty: an ordinary car again, lights off, on the nearest lane.
	function release(cop) {
		const wasChasing = cop.chase
		cop.cop = false
		cop.chase = false
		cop.hunt = null
		cop.flash = undefined
		cop.kept = false
		if (wasChasing || !cop.ai) traffic.attach(cop)
	}
	function callOff() {
		for (const cop of cops) release(cop)
		cops.length = 0
		heat = 0
		unseen = 0
		everSeen = false
		lastSeen = null
		summonIn = 0
		sound.siren(0, 0)
	}

	// Straight for a point, walls allowing: full gas, feelers out to steer
	// round what's in the way, and back up when wedged. Within reach of you,
	// it stands on the brake instead of shoving you down the street.
	function chase(cop, target, dt, cap, atHand) {
		const m = cop.model
		const fwd = forwardSpeed(cop)
		if (atHand) {
			cop.stuck = 0
			return { throttle: fwd > 0.15 ? -1 : 0, hold: true, turn: 0 }
		}
		const cos = Math.cos(cop.angle)
		const sin = Math.sin(cop.angle)
		const tx = (target.x - cop.x) * cos + (target.y - cop.y) * sin
		const ty = -(target.x - cop.x) * sin + (target.y - cop.y) * cos
		const aim = Math.atan2(ty, tx)
		const d = Math.hypot(tx, ty)
		// How far each feeler runs before a wall: ahead, and off to each side.
		const look = 1.2 + Math.max(0, fwd) * 0.7
		const feel = (a) => {
			for (let s = 0.4; s <= look; s += 0.4) {
				const [x, y] = toWorld(cop, m.length / 2 + s * Math.cos(a), s * Math.sin(a))
				if (SOLID.has(world.tileAt(x, y))) return s
			}
			return Infinity
		}
		const ahead = feel(0)
		// Wedged on something and getting nowhere: back up a little.
		cop.stuck = Math.abs(fwd) < 0.3 && (ahead < 1 || d > 4) ? (cop.stuck ?? 0) + dt : 0
		if (cop.stuck > 1.2) cop.reversing = 1
		if (cop.reversing > 0) {
			cop.reversing -= dt
			return { throttle: -1, turn: -Math.sign(aim || 1) }
		}
		let turn = Math.max(-1, Math.min(1, aim * 2.5))
		if (ahead < look) {
			const left = feel(-0.7)
			const right = feel(0.7)
			turn = left === right ? (aim < 0 ? -1 : 1) : left > right ? -1 : 1
		}
		// Slow enough to pull up at the target rather than fly past it.
		const want = Math.min(cap, 0.4 + Math.sqrt(0.6 * m.brake * Math.max(0, d - 1.8)), ahead < 1.2 ? 0.8 : Infinity)
		const throttle = fwd > want + 0.3 ? -1 : fwd > want ? 0 : 1
		return { throttle, turn, hold: d < 1 && fwd < 0.5 }
	}

	// Got you. The screen fades while BUSTED is up, then the paperwork.
	function nick() {
		bust.start()
		player.speed = 0
		if (player.car) driveCar(player.car, { hold: true }, world, 0)
		onBust()
	}

	// The fine, the car towed, and you on the pavement.
	function bookYou() {
		const fine = Math.min(bag.cents, FINE * heat)
		bag.cents -= fine
		say(fine ? `Strafe: ${euro(fine)}` : 'Verwarnung. Diesmal.')
		if (player.car) {
			const c = player.car
			leaveCar(player, world)
			const i = traffic.cars.indexOf(c)
			if (i >= 0) traffic.cars.splice(i, 1)
			c.gone = true
		}
		if (player.onBike) {
			player.onBike = false
			player.bike.x = player.x
			player.bike.y = player.y
		}
		const kerb = nearestPavement(world, player.x, player.y)
		if (kerb) Object.assign(player, kerb)
		callOff()
	}

	// `hidden`: inside a shop or otherwise off the street, where nobody can see you.
	function update(dt, view, hidden = false) {
		clock += dt
		const nicked = bust.shown()
		bust.update(dt)
		if (nicked) {
			sound.siren(bust.shown() ? 1 : 0, 0)
			return
		}
		// Someone under your wheels. Each one counts once.
		if (!hidden && player.car && speedOf(player.car) > 1) for (const p of traffic.peds) if (p.under === player.car) hit(p)
		if (!heat) {
			sound.siren(0, 0)
			return
		}
		summonIn -= dt
		if (cops.length < heat && summonIn <= 0) {
			const cop = traffic.summon(MODELS.police, lastSeen)
			summonIn = cop ? 2.5 : 1
			if (cop) {
				cop.cop = true
				cop.kept = true
				cop.seen = Infinity
				cop.grab = 0
				cop.laneFor = 0
				cop.hunt = lastSeen
				cops.push(cop)
			}
		}
		let seen = false
		let loudest = 0
		let pan = 0
		const onFoot = !player.car
		const lead = {
			x: player.x + (player.car ? player.car.vx : Math.cos(player.dir) * player.speed) * 0.6,
			y: player.y + (player.car ? player.car.vy : Math.sin(player.dir) * player.speed) * 0.6,
		}
		for (let i = cops.length - 1; i >= 0; i--) {
			const cop = cops[i]
			// Nicked the Wanne itself, or it drove off the map: the rest look for you.
			if (cop === player.car || !cop.cop || !traffic.cars.includes(cop)) {
				cops.splice(i, 1)
				cop.cop = false
				cop.chase = false
				cop.hunt = null
				cop.flash = true
				continue
			}
			const d = Math.hypot(cop.x - player.x, cop.y - player.y)
			const sees = !hidden && d < SIGHT && lineOfSight(world, cop.x, cop.y, player.x, player.y)
			if (sees) {
				seen = everSeen = true
				lastSeen = { x: player.x, y: player.y }
				cop.seen = 0
			} else cop.seen += dt
			const reach = REACH + (player.car ? player.car.model.length / 2 : 0)
			const atHand = sees && distanceTo(cop, player.x, player.y) < reach
			// Close and in sight: straight at you. Otherwise along the roads,
			// taking every turn towards where you were last seen.
			const direct = (sees && d < DIRECT) || (cop.chase && cop.seen < REMEMBER)
			if (direct && cop.laneFor <= 0) {
				if (!cop.chase) Object.assign(cop, { chase: true, best: Infinity, noGain: 0 })
				cop.hunt = null
				if (d < cop.best - 0.5) Object.assign(cop, { best: d, noGain: 0 })
				else cop.noGain += dt
				if (cop.noGain > NO_GAIN && !atHand) cop.laneFor = LANE_FOR
				const cap = onFoot && d < 5 ? CREEP : Infinity
				const target = !sees ? lastSeen : d < 4 ? player : lead
				driveCar(cop, chase(cop, target, dt, cap, atHand), world, dt)
			} else {
				cop.laneFor = Math.max(0, cop.laneFor - dt)
				if (cop.chase) {
					cop.chase = false
					traffic.attach(cop)
				}
				cop.hunt = lastSeen
			}
			cop.flash = Math.floor(clock * FLASH) % 2 === 0
			// Caught: on foot, or in a car that's not getting away.
			const close = atHand && (onFoot || speedOf(player.car) < 1.2)
			cop.grab = close ? cop.grab + dt : Math.max(0, cop.grab - dt / 2)
			if (cop.grab > GRAB[onFoot ? 'foot' : 'car']) {
				nick()
				return
			}
			const near = Math.max(0, 1 - d / SIREN_HEAR)
			if (near > loudest) {
				loudest = near
				pan = view ? Math.max(-1, Math.min(1, ((cop.x - view.x0) / (view.x1 - view.x0)) * 2 - 1)) : 0
			}
		}
		unseen = seen ? 0 : unseen + dt
		if (unseen > (everSeen ? LOSE : NEVER_FOUND)) {
			// Out of sight long enough, or never found at all: the call's dropped.
			say(everSeen ? 'Abgehängt.' : 'Die Polizei hat dich nicht gefunden.')
			callOff()
			return
		}
		sound.siren(loudest * loudest, pan)
	}

	function hit(p) {
		if (p.counted || bust.shown()) return
		p.counted = true
		raise()
	}

	return {
		update,
		steal,
		clear: callOff, // e.g. waking up in hospital: nobody's chasing a corpse
		// For trying it out: heat up from the console.
		heat: () => heat,
		cops,
		active: bust.active,
		shown: bust.shown,
		raise,
	}
}

// Nothing solid on the straight line between two points.
export function lineOfSight(world, x0, y0, x1, y1) {
	const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.4)
	for (let i = 1; i < n; i++) {
		const k = i / n
		if (SOLID.has(world.tileAt(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k))) return false
	}
	return true
}

// The nearest pavement within a few tiles, to stand on afterwards.
function nearestPavement(world, x, y) {
	let best = null
	for (let ty = Math.floor(y) - 4; ty <= Math.floor(y) + 4; ty++) {
		for (let tx = Math.floor(x) - 4; tx <= Math.floor(x) + 4; tx++) {
			if (world.tileAt(tx + 0.5, ty + 0.5) !== T.SIDEWALK) continue
			const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y)
			if (!best || d < best.d) best = { x: tx + 0.5, y: ty + 0.5, d }
		}
	}
	return best && { x: best.x, y: best.y }
}
