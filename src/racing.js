// Racing in the game: G drops the next gate where you are, F saves the race
// (or calls off a run), Q puts you back at the start in the same vehicle for
// another go. Riding into any race's first gate starts it too: you're set
// down just behind the line, held for 3-2-1, then the clock runs until the
// last gate. The city carries on round you the whole time. A race can be
// shared as a link with your best ghost; opening one adds the race to the
// list, with the sender's ghost to beat next to yours, and starts it.
import { MODELS } from './models.js'
import { SOLID } from './tiles.js'
import { crossing, ghostAt, letter, loadRaces, makeGate, saveRaces, startRun, stepRun, submit } from './race.js'
import { createRaceGates } from './race-gates.js'
import { createRaceHud } from './race-hud.js'
import { createRaceList } from './race-list.js'
import { cleanName, nickname, raceFromHash, shareLink } from './race-share.js'

const COUNTDOWN = 3 // seconds
const TELEPORT = 6 // tiles in a frame: a respawn, not a ride through a gate

const storage = (() => {
	try {
		return localStorage
	} catch {
		return { getItem: () => null, setItem() {} }
	}
})()

const NAME_KEY = 'nk-name'
let nameNow = null // the player's name on shared ghosts: set once, a Kiez nickname until then
const myName = () => {
	if (!nameNow) {
		nameNow = cleanName(storage.getItem(NAME_KEY))
		if (!nameNow) setName(nickname())
	}
	return nameNow
}
function setName(name) {
	nameNow = cleanName(name) || nameNow || nickname()
	try {
		storage.setItem(NAME_KEY, nameNow)
	} catch {
		// The name lasts until the tab closes.
	}
}

async function copy(text) {
	try {
		await navigator.clipboard.writeText(text)
		return true
	} catch {
		const field = Object.assign(document.createElement('textarea'), { value: text })
		document.body.append(field)
		field.select()
		const ok = document.execCommand('copy')
		field.remove()
		return ok
	}
}

export function createRacing({ world, player, scene, gradient, area, say, snapCamera }) {
	const races = loadRaces(storage, area)
	const gates3d = createRaceGates(scene, gradient, world.heightAt)
	let draft = null // gates being dropped, before the race is saved
	let race = null // the race being run, or last run, for Q
	let run = null
	let phase = 'idle' // 'countdown', 'running', 'done'
	let count = 0
	let start = null // where a run starts: { x, y, angle, vehicle, car }
	let result = null

	const hud = createRaceHud({ placeGate, finish, restart, share: () => race && share(race) })
	const list = createRaceList({
		world,
		player,
		races: () => races,
		start: (r) => begin(r),
		share,
		name: { get: myName, set: setName },
		create() {
			// A new race from the list, even from the middle of a run.
			if (phase === 'countdown' || phase === 'running') phase = 'idle'
			placeGate()
		},
		remove(r) {
			races.splice(races.indexOf(r), 1)
			save()
			if (race === r) {
				race = null
				run = null
				phase = 'idle'
			}
		},
	})
	// Copies a link to the race with your best ghost, as far as it fits.
	async function share(r) {
		const { url, ghost } = shareLink(r, myName(), location.origin + location.pathname + location.search)
		const copied = await copy(url)
		if (!copied) return void prompt('Link zum Teilen', url)
		say(
			!r.best
				? 'Link kopiert: nur die Tore, noch keine Zeit'
				: ghost
					? 'Link kopiert, mit deinem Geist'
					: 'Link kopiert, ohne Geist: zu lang',
		)
	}

	// A race from a link: added to the list (or, if you have it, given a new
	// rival) and started.
	function receive(shared) {
		let r = races.find((x) => x.id === shared.id)
		if (!r) races.push((r = { id: shared.id, gates: shared.gates, times: [], best: null }))
		if (shared.rival) r.rival = shared.rival
		save()
		const from = shared.rival?.name
		say(
			!shared.rival
				? 'Rennen geladen'
				: shared.rival.ghost
					? `Rennen von ${from}: schlag den Geist`
					: `Rennen von ${from}, ohne Geist: zu lang`,
		)
		begin(r)
	}
	const solid = (x, y) => SOLID.has(world.tileAt(x, y))
	const save = () => saveRaces(storage, area, races)

	const vehicleOf = () =>
		player.car ? (Object.keys(MODELS).find((k) => MODELS[k] === player.car.model) ?? 'car') : player.onBike ? 'bike' : 'foot'
	const pose = () => ({ x: player.x, y: player.y, angle: player.car?.angle ?? player.dir, vehicle: vehicleOf() })

	function placeGate() {
		if (phase === 'countdown' || phase === 'running') return
		phase = 'idle'
		draft ??= []
		draft.push(makeGate(player.x, player.y, player.car?.angle ?? player.dir, solid))
		say(`Tor ${letter(draft.length - 1)}`)
		hud.placed()
	}

	// Saves the race being made, or calls off the run.
	function finish() {
		if (draft) {
			if (draft.length >= 2) {
				race = { id: Date.now().toString(36), gates: draft, times: [], best: null }
				races.push(race)
				save()
				say(`Rennen gespeichert: ${draft.length} Tore`)
				hud.saved()
				// Straight onto the start line, to ride what you just made.
				begin(race)
			}
			draft = null
		} else if (phase === 'countdown' || phase === 'running' || phase === 'done') {
			phase = 'idle'
			race = null
			run = null
		}
	}

	// Set down just behind the first gate, facing the way it was dropped, in
	// the vehicle you started in if it's still about, and hold still for 3-2-1.
	function begin(next, vehicle = vehicleOf()) {
		draft = null
		race = next
		const a = race.gates[0]
		const angle = a.angle
		const back = 0.6 + (player.car?.model.length ?? 0.3) / 2
		let x = a.x - Math.cos(angle) * back
		let y = a.y - Math.sin(angle) * back
		if (solid(x, y)) {
			x = a.x
			y = a.y
		}
		start = { x, y, angle, vehicle, car: vehicle in MODELS ? player.car : null }
		phase = 'countdown'
		count = COUNTDOWN
		result = null
		run = startRun(race, vehicle)
		hold()
		snapCamera()
	}

	function restart() {
		if (draft || !race) return
		const car = start?.car
		if (car && !car.gone) {
			player.car = car
			player.onBike = false
		} else if (start?.vehicle === 'bike') {
			player.car = null
			player.onBike = true
		} else if (start?.vehicle === 'foot') {
			player.car = null
			player.onBike = false
		}
		begin(race, start?.vehicle)
	}

	// Pinned to the start line, engine or legs going but not moving.
	function hold() {
		const c = player.car
		if (c) {
			Object.assign(c, { x: start.x, y: start.y, angle: start.angle, vx: 0, vy: 0, spin: 0, steer: 0 })
		}
		Object.assign(player, { x: start.x, y: start.y, dir: start.angle, speed: 0 })
		if (player.onBike) Object.assign(player.bike, { x: start.x, y: start.y })
	}

	function view() {
		const gates = draft ?? race?.gates ?? []
		return {
			mode: draft ? 'draft' : race ? phase : 'idle',
			gates: gates.length,
			next: run?.next ?? 0,
			t: run?.t ?? 0,
			count,
			canFinish: !draft && phase !== 'idle',
			canRestart: !draft && !!race,
		}
	}

	// What's standing in the city: the gates being dropped, the race being
	// run, or every race's first gate, waiting to be ridden into.
	function shownGates() {
		if (draft) return draft.map((gate, i) => ({ gate, label: letter(i), state: i === draft.length - 1 ? 'next' : 'later' }))
		if (race && phase !== 'idle') {
			const next = phase === 'done' ? 0 : run.next
			return race.gates
				.map((gate, i) => ({ gate, label: letter(i), state: i === next ? 'next' : 'later', i }))
				.filter((g) => phase === 'done' || g.i >= next || (phase === 'countdown' && g.i === 0))
		}
		return races.map((r) => ({ gate: r.gates[0], label: letter(0), state: 'start' }))
	}

	// A link opened here, or pasted into a tab that's already playing.
	function openLink() {
		if (!location.hash.startsWith('#race=')) return
		const shared = raceFromHash(location.hash)
		history.replaceState(null, '', location.pathname + location.search)
		if (shared) receive(shared)
	}
	openLink()
	addEventListener('hashchange', openLink)

	return {
		placeGate,
		finish,
		restart,
		// The panel of saved races, from the menu.
		openList: list.open,
		listOpen: list.isOpen,
		// Called going down, so a run doesn't carry on from under a car.
		abort() {
			if (phase === 'countdown' || phase === 'running') phase = 'done'
		},

		// After the player has moved this frame from `from`.
		update(dt, from, { inside = false, down = false } = {}) {
			const to = { x: player.x, y: player.y }
			const jumped = Math.hypot(to.x - from.x, to.y - from.y) > TELEPORT
			if (phase === 'countdown') {
				hold()
				if ((count -= dt) <= 0) {
					count = 0
					phase = 'running'
				}
			} else if (phase === 'running' && !jumped && !inside && !down) {
				const event = stepRun(run, from, to, dt, pose())
				if (event) hud.split(event)
				if (event?.finish) {
					const previous = race.best?.time
					const { place, best } = submit(race, run)
					save()
					result = { time: run.t, best, place, times: race.times, previous, rival: race.rival }
					hud.result(result)
					phase = 'done'
				}
			} else if (phase === 'running') run.t += dt
			if (!draft && phase !== 'countdown' && phase !== 'running' && !jumped && !inside && !down) {
				const next = races.find((r) => crosses(r.gates[0], from, to))
				if (next) begin(next)
			}
			const riding = phase === 'running' || phase === 'countdown'
			const at = phase === 'running' ? run.t : 0
			gates3d.ghost(race?.best?.ghost && riding ? ghostAt(race.best.ghost, at) : null)
			gates3d.rival(race?.rival?.ghost && riding ? ghostAt(race.rival.ghost, at) : null, race?.rival?.name || 'Geist')
			gates3d.show(shownGates())
			gates3d.update(dt, inside)
			hud.update(view(), dt)
		},

		// The next gate, for the radar.
		target() {
			if (draft || !race || (phase !== 'running' && phase !== 'countdown')) return null
			const gate = race.gates[run.next]
			return gate && { x: gate.x, y: gate.y, label: letter(run.next) }
		},
		races: () => races,
	}
}

function crosses(gate, from, to) {
	const dx = to.x - from.x
	const dy = to.y - from.y
	if (!dx && !dy) return false
	// Only riding in the gate's own direction starts a race, so riding back
	// out through it after the finish doesn't start another.
	if (dx * Math.cos(gate.angle) + dy * Math.sin(gate.angle) <= 0) return false
	return crossing(gate, from.x, from.y, to.x, to.y) !== null
}
