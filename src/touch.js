// Touch controls: a thumbstick that appears under the thumb on the left half,
// and E and turbo/handbrake buttons on the right. The stick is an absolute
// direction, like pointing at the map; the car's own physics stays untouched,
// the stick is translated into its throttle, turn and handbrake here.
import { forwardSpeed } from './car.js'

const RANGE = 56 // pixels from the centre for full deflection
const DEAD = 0.12 // fraction of full deflection that doesn't move you
const PINCH = 1.25 // px of two-finger distance before the zoom follows

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

export function createTouch(actions) {
	const root = document.getElementById('touch')
	const base = document.getElementById('stick')
	const knob = document.getElementById('stick-knob')
	const use = document.getElementById('touch-use')
	const boost = document.getElementById('touch-boost')

	const pointers = new Map()
	let stick = null // { id, x0, y0, x, y }
	let pinch = 0 // last distance between two fingers
	let boostHeld = false
	let enabled = matchMedia('(pointer: coarse)').matches

	function show(on) {
		enabled = on
		document.body.classList.toggle('touch', on)
	}

	function placeStick() {
		if (!stick) return
		base.style.left = `${stick.x0}px`
		base.style.top = `${stick.y0}px`
		base.classList.add('on')
	}

	function moveKnob() {
		const x = stick ? stick.x * RANGE : 0
		const y = stick ? stick.y * RANGE : 0
		knob.style.transform = `translate(${x}px, ${y}px)`
	}

	function endStick() {
		stick = null
		base.classList.remove('on')
		moveKnob()
	}

	const stickAxis = () => {
		if (!stick) return { x: 0, y: 0 }
		const len = Math.hypot(stick.x, stick.y)
		if (len < DEAD) return { x: 0, y: 0 }
		return { x: stick.x, y: stick.y }
	}

	// Two fingers zoom; dragging them around does nothing.
	function pinchMove() {
		const [a, b] = [...pointers.values()]
		if (!a || !b) return
		const dist = Math.hypot(a.x - b.x, a.y - b.y)
		if (pinch > 0 && Math.abs(dist - pinch) > PINCH) actions.zoom(clamp(dist / pinch, 0.9, 1.1))
		pinch = dist
	}

	function down(e) {
		if (e.pointerType !== 'touch') return
		if (!enabled) show(true)
		if (e.target.closest('.touch-button, #sound, #menu, #menu-button')) return
		e.preventDefault()
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
		if (pointers.size === 1 && e.clientX < innerWidth / 2) {
			stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: 0, y: 0 }
			placeStick()
			moveKnob()
		} else if (pointers.size >= 2) {
			endStick()
			pinch = 0
			pinchMove()
		}
	}

	function move(e) {
		if (!pointers.has(e.pointerId)) return
		e.preventDefault()
		const p = pointers.get(e.pointerId)
		p.x = e.clientX
		p.y = e.clientY
		if (stick && stick.id === e.pointerId) {
			let dx = e.clientX - stick.x0
			let dy = e.clientY - stick.y0
			const len = Math.hypot(dx, dy)
			if (len > RANGE) {
				dx *= RANGE / len
				dy *= RANGE / len
			}
			stick.x = dx / RANGE
			stick.y = dy / RANGE
			moveKnob()
		} else if (pointers.size >= 2) pinchMove()
	}

	function up(e) {
		if (!pointers.has(e.pointerId)) return
		pointers.delete(e.pointerId)
		if (stick && stick.id === e.pointerId) endStick()
		if (pointers.size < 2) pinch = 0
		if (!pointers.size) {
			boostHeld = false
			boost.classList.remove('on')
		}
	}

	addEventListener('pointerdown', down, { passive: false })
	addEventListener('pointermove', move, { passive: false })
	addEventListener('pointerup', up)
	addEventListener('pointercancel', up)

	// The buttons are held, not clicked: E fires at once, boost stays down
	// until the thumb lifts.
	use.addEventListener('pointerdown', (e) => {
		e.preventDefault()
		e.stopPropagation()
		use.classList.add('on')
		actions.use()
	})
	const lift = (e) => {
		e.stopPropagation()
		use.classList.remove('on')
	}
	use.addEventListener('pointerup', lift)
	use.addEventListener('pointercancel', lift)
	boost.addEventListener('pointerdown', (e) => {
		e.preventDefault()
		e.stopPropagation()
		boostHeld = true
		boost.classList.add('on')
	})
	for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
		boost.addEventListener(type, (e) => {
			e.stopPropagation()
			boostHeld = false
			boost.classList.remove('on')
		})
	}
	root.addEventListener('contextmenu', (e) => e.preventDefault())

	if (enabled) show(true)

	return {
		// Where the thumb points, each axis -1…1.
		axis: stickAxis,
		// On foot and on the bike: turbo while the boost button is held.
		turbo: () => boostHeld,
		drive(car) {
			const { x, y } = stickAxis()
			const mag = Math.min(1, Math.hypot(x, y))
			if (!mag) return { throttle: 0, turn: 0, handbrake: boostHeld }
			const want = Math.atan2(y, x)
			const diff = wrap(want - car.angle)
			const align = Math.cos(diff)
			// Pointing against the nose brakes first, then reverses. Pointing
			// across it still creeps forward, so a stopped car can turn.
			let throttle = Math.abs(align) < 0.08 ? 0 : mag * clamp(align * 1.4, -1, 1)
			if (align > -0.05 && align < 0.7) throttle = Math.max(throttle, mag * 0.4)
			// Heading error steers; reversing flips the sign, because the front
			// wheels turn the nose the other way while backing up.
			const backwards = forwardSpeed(car) < -0.1 || (Math.abs(forwardSpeed(car)) <= 0.1 && throttle < 0)
			const turn = clamp(diff / 0.9, -1, 1) * (backwards ? -1 : 1)
			return { throttle, turn, handbrake: boostHeld }
		},
		// The E button shows a picture of what it does, the same as the HUD's.
		setUse(action) {
			if (use.dataset.action === (action ?? '')) return
			use.dataset.action = action ?? ''
			use.innerHTML = action ? `<img class="icon" src="/icons/act-${action}.png" alt="">` : ''
			use.classList.toggle('dim', !action)
		},
		setDriving(driving) {
			if (boost.dataset.driving === String(driving)) return
			boost.dataset.driving = String(driving)
			boost.textContent = driving ? 'HANDBREMSE' : 'TURBO'
		},
	}
}
