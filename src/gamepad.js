// Gamepad: the left stick drives the way the touch thumbstick does, the
// triggers work the gas and brake, and the face buttons do what their keys
// do. The pad is read afresh each frame, so one plugged in mid-game just
// starts working; a button only acts on the way down, and one already held
// when the pad arrives does nothing until it's let go.
import { stickDrive } from './touch.js'

// Standard mapping (https://w3c.github.io/gamepad/#remapping).
const A = 0
const B = 1
const X = 2
const Y = 3
const START = 9
const UP = 12
const DOWN = 13
const LEFT = 14
const RIGHT = 15
const GAS = 7
const BRAKE = 6

const DEAD = 0.15 // fraction of full throw the stick ignores
const TRIGGER = 0.08 // how far a trigger is pulled before it counts

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const ZERO = { x: 0, y: 0 }

const buttonsOf = (pad) => Array.from(pad?.buttons ?? [], (b) => Boolean(b?.pressed) || (b?.value ?? 0) > 0.5)
const pressed = (pad, i) => buttonsOf(pad)[i] === true
const amount = (pad, i) => clamp(Number(pad?.buttons?.[i]?.value) || 0, 0, 1)

// The left stick, each axis -1…1. Inside the deadzone nothing moves; what's
// left beyond it is stretched back out, so the edge of the ring is still
// full deflection and a pad can walk as slowly as a thumb.
export function stickOf(pad) {
	const x = clamp(Number(pad?.axes?.[0]) || 0, -1, 1)
	const y = clamp(Number(pad?.axes?.[1]) || 0, -1, 1)
	const len = Math.hypot(x, y)
	if (len < DEAD) return ZERO
	const k = Math.min(1, (len - DEAD) / (1 - DEAD)) / len
	return { x: x * k, y: y * k }
}

// In a car: pulled triggers are the throttle and the stick steers; with
// neither trigger touched the stick drives the way the thumbstick does.
export function padDrive(car, pad) {
	const stick = stickOf(pad)
	const gas = amount(pad, GAS)
	const brake = amount(pad, BRAKE)
	const handbrake = pressed(pad, B)
	if (gas > TRIGGER || brake > TRIGGER) return { throttle: gas - brake, turn: stick.x, handbrake }
	return stickDrive(car, stick, handbrake)
}

export function createGamepad(actions, blocked = () => false) {
	let pad = null
	let down = []

	// Browsers only hand a pad over once it has been seen pressed, sometimes
	// after this event; listening is what gets it started.
	addEventListener('gamepadconnected', () => {})
	addEventListener('gamepaddisconnected', () => {
		pad = null
		down = []
	})

	function find() {
		try {
			for (const p of navigator.getGamepads?.() ?? []) {
				if (p?.connected && p.mapping === 'standard') return p
			}
		} catch {
			// Some browsers expose the API but refuse it; then there's just no pad.
		}
		return null
	}

	// Fresh state, and the buttons that went down since the last look. Returns
	// the pad, or null while the menu is up and the game shouldn't hear it.
	function read() {
		const next = find()
		if (next !== pad) {
			// A pad just arrived: whatever is held on it now isn't a new press.
			pad = next
			down = buttonsOf(pad)
		}
		const now = buttonsOf(pad)
		const before = down
		down = now
		const fired = (i) => now[i] && !before[i]
		if (!pad) return null
		// Start is the way back out of the menu, so it keeps working while
		// everything else on the pad is mute.
		if (fired(START)) actions.toggleMenu()
		if (blocked()) return null
		if (fired(A)) actions.use()
		if (fired(LEFT)) actions.shiftChoice(-1)
		if (fired(RIGHT)) actions.shiftChoice(1)
		if (fired(X)) actions.toggleCamera()
		if (fired(Y)) actions.nextStation()
		if (fired(UP)) actions.zoom(1.25)
		if (fired(DOWN)) actions.zoom(0.8)
		return pad
	}

	return {
		// Where the stick points, each axis -1…1, as the thumbstick does.
		axis: () => stickOf(read()),
		drive: (car) => padDrive(car, read()),
	}
}
