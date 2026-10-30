import { addressesOf } from './addresses.js'
import { offerJob, payout } from './jobs.js'
import { createCourierHud } from './courier-hud.js'
import { createCourierMarks } from './courier-marks.js'

const OFFER = 14 // seconds an offer stands
const WAIT = [45, 90] // seconds between offers, least and most
const FIRST = 8 // seconds from going online to the first one
const GIVE_UP = 2 // offers ignored in a row before the app takes you offline
const AT = { reach: 1.6, car: 2.8, slow: 1.4 } // tiles and tiles a second: stopped at a door

const KNOCK = { drop: 1.8, rate: 24, calm: 1 }
const HINT = { off: 7, r: 13 } // tiles: the radar's ring round the door, off centre by up to `off`

export function createCourier({ world, shops, player, scene, pfand, pocket, online = false, hinted = true, remember = () => {} }) {
	const named = new Set(world.streets)
	const doors = addressesOf(world).filter((d) => named.has(d.street))
	const marks = createCourierMarks(scene, world.heightAt)
	let mode = 'idle' // 'offer', 'pickup', 'deliver'
	let ignored = 0
	let hintIn = hinted ? Infinity : 20 // seconds of play before the switch is mentioned, once
	// Offline, no offers. A job already on the go is finished first.
	const kurier = pocket.slide({ label: 'Kurier', on: online, change: (on) => setOnline(on) })
	const hud = createCourierHud({ accept, pocket })
	let wait = FIRST
	let job = null
	let fuse = 0
	let t = 0
	let bumps = 0
	let calm = 0
	let lastSpeed = 0
	let street = [] // doors along the drop-off's street

	function setOnline(on) {
		kurier.set(on)
		remember('online', on)
		hintIn = Infinity
		if (on) {
			ignored = 0
			wait = Math.min(wait, FIRST)
		} else if (mode === 'offer') next()
	}

	function accept() {
		if (mode !== 'offer') return false
		ignored = 0
		mode = 'pickup'
		hud.took()
		return true
	}

	function next() {
		job = null
		street = []
		mode = 'idle'
		wait = WAIT[0] + Math.random() * (WAIT[1] - WAIT[0])
	}

	const stoppedAt = (spot) =>
		Math.hypot(player.x - spot.stand.x, player.y - spot.stand.y) < (player.car ? AT.car : AT.reach) && Math.abs(player.speed) < AT.slow

	return {
		accept,

		lose() {
			if (mode !== 'pickup' && mode !== 'deliver') return
			if (mode === 'deliver') hud.lost()
			next()
		},

		update(dt, { inside = false, busy = false, down = false } = {}) {
			if ((hintIn -= dt) <= 0) {
				hintIn = Infinity
				remember('hinted', true)
				pocket.say('Schalter „Kurier“ an, dann gibt’s Jobs', 5)
			}
			if (mode === 'idle' && kurier.on && !inside && !busy && !down && (wait -= dt) <= 0) {
				job = offerJob(shops, doors, player.x, player.y)
				if (job) {
					mode = 'offer'
					fuse = OFFER
					hud.ping()
				} else wait = WAIT[1]
			} else if (mode === 'offer' && (fuse -= dt) <= 0) {
				next()
				if (++ignored >= GIVE_UP) {
					setOnline(false)
					pocket.say('Kurier: offline, du warst nicht da', 4)
				}
			} else if (mode === 'pickup' && !inside && stoppedAt(job.from)) {
				mode = 'deliver'
				t = 0
				bumps = 0
				street = doors.filter((d) => d.street === job.to.street)
				const a = Math.random() * Math.PI * 2
				const r = HINT.off * (0.4 + Math.random() * 0.6)
				job.hint = { x: job.to.x + Math.cos(a) * r, y: job.to.y + Math.sin(a) * r, r: HINT.r }
				hud.picked()
			} else if (mode === 'deliver') {
				t += dt

				const speed = Math.abs(player.speed)
				const drop = lastSpeed - speed
				calm -= dt
				if (!inside && dt > 0 && drop > KNOCK.drop && drop / dt > KNOCK.rate && calm <= 0) {
					calm = KNOCK.calm
					if (bumps < job.items.length) hud.bump()
					bumps++
				}
				if (!inside && stoppedAt(job.to)) {
					const pay = payout(job, t, bumps)
					pfand.bag.cents += pay.total
					hud.paid(pay)
					next()
				}
			}
			lastSpeed = Math.abs(player.speed)
			marks.show(mode === 'pickup' ? job.from : null, street)
			marks.update(dt, player, inside)
			hud.update({ mode, job, fuse: fuse / OFFER, left: job ? job.limit - t : 0, spilt: Math.min(bumps, job?.items.length ?? 0) }, dt)
		},

		target() {
			if (mode === 'pickup') return { x: job.from.stand.x, y: job.from.stand.y, job: 'pickup', label: job.from.name, spilt: 0 }
			if (mode === 'deliver') {
				const spilt = Math.min(bumps, job.items.length)
				return { x: job.to.stand.x, y: job.to.stand.y, job: 'drop', hint: job.hint, label: `${job.to.street}\u00a0${job.to.number}`, spilt }
			}
			return null
		},
	}
}
