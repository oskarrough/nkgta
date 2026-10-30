import { addressesOf } from './addresses.js'
import { offerJob, payout } from './jobs.js'
import { createCourierHud } from './courier-hud.js'
import { createCourierMarks } from './courier-marks.js'

const OFFER = 14 // seconds an offer stands
const WAIT = [6, 14] // seconds between offers, least and most
const FIRST = 8 // seconds before the first one
const AT = { reach: 1.1, car: 2.4, slow: 1.4 } // tiles and tiles a second: stopped at a door

const KNOCK = { drop: 1.8, rate: 24, calm: 1 }
const HINT = { off: 7, r: 13 } // tiles: the radar's ring round the door, off centre by up to `off`

export function createCourier({ world, shops, player, scene, pfand, on = true }) {
	const named = new Set(world.streets)
	const doors = addressesOf(world).filter((d) => named.has(d.street))
	const marks = createCourierMarks(scene, world.heightAt)
	const hud = createCourierHud({ accept })
	let mode = on ? 'idle' : 'off' // 'offer', 'pickup', 'deliver'
	let wait = FIRST
	let job = null
	let fuse = 0
	let t = 0
	let bumps = 0
	let calm = 0
	let lastSpeed = 0
	let street = [] // doors along the drop-off's street

	function accept() {
		if (mode !== 'offer') return false
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
		on: () => mode !== 'off',
		toggle() {
			if (mode === 'off') next()
			else {
				job = null
				street = []
				mode = 'off'
			}
		},

		lose() {
			if (mode !== 'pickup' && mode !== 'deliver') return
			if (mode === 'deliver') hud.lost()
			next()
		},

		update(dt, { inside = false, busy = false, down = false } = {}) {
			if (mode === 'idle' && !inside && !busy && !down && (wait -= dt) <= 0) {
				job = offerJob(shops, doors, player.x, player.y)
				if (job) {
					mode = 'offer'
					fuse = OFFER
					hud.ping()
				} else wait = WAIT[1]
			} else if (mode === 'offer' && (fuse -= dt) <= 0) next()
			else if (mode === 'pickup' && !inside && stoppedAt(job.from)) {
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
			if (mode === 'pickup') return { x: job.from.stand.x, y: job.from.stand.y, job: 'pickup' }
			if (mode === 'deliver') return { x: job.to.stand.x, y: job.to.stand.y, job: 'drop', hint: job.hint }
			return null
		},
	}
}
