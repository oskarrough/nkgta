// Your pocket device, always on you: a battered little handheld with a screen,
// a knob and a mute switch on its edge. The screen shows what you hear: the
// car's station in a car, otherwise the song nearest you and where it comes
// from. Turning the knob sets the volume; tapping it in a car turns the dial,
// its left side back, the rest forward. Drag it anywhere (on touch, hold it
// first); it snaps to the nearest edge or corner and stays there. It sits
// small, and grows for a few seconds whenever something changes.
import './pocket.css'
import { sound } from './sound.js'

const OPEN = 4 // seconds it stays big after a change
const TURN = 270 // degrees of knob from silent to full
const HOLD = 350 // ms a touch holds still before it drags the device
const MOVED = 5 // px a pointer moves before it's a drag, not a tap
const EDGE = 8 // px from the screen's edge
const CORNER = 0.2 // this close to a second edge, it goes in the corner
const STORE = 'nk-pocket'

// The screen runs one app. For now that's sound; another (a courier job, the
// race list) is an object like this one: mount fills the screen, draw shows
// the moment and returns a key that changes whenever the device should grow.
const soundApp = {
	mount(screen) {
		screen.innerHTML = '<b></b><span></span><i class="volume"></i>'
		return { name: screen.querySelector('b'), title: screen.querySelector('span'), volume: screen.querySelector('.volume') }
	},
	draw(parts, { radio, hearing, muted, volume }) {
		const now = muted ? { name: 'Ton aus', title: '' } : radio ? { name: radio.name ?? 'Radio aus', title: radio.title ?? '' } : hearing
		const name = now?.name ?? 'Straße'
		const title = now?.title ?? ''
		parts.name.textContent = name
		parts.title.textContent = title
		const level = muted ? 0 : Math.round(volume * 10)
		parts.volume.style.setProperty('--level', String(level))
		return `${name}:${title}:${level}`
	},
}

export function createPocket({ turnStation, toggleMute }) {
	const el = document.createElement('div')
	el.id = 'pocket'
	el.innerHTML = `
		<button type="button" class="switch" aria-label="Ton aus (L)" title="Ton aus (L)"></button>
		<div class="screen"></div>
		<div class="dial"><button type="button" class="knob" aria-label="Sender wechseln (R)" title="Drehen: Lautstärke · Tippen: Sender (R)"><i></i></button></div>
		<span class="sticker">NK 44</span>`
	document.body.append(el)
	const knob = el.querySelector('.knob')
	const muteSwitch = el.querySelector('.switch')
	const app = soundApp
	const parts = app.mount(el.querySelector('.screen'))
	let key = null
	let open = 0

	// Where it sits: fractions of the free room across and down, or null for
	// the default, top right under the money.
	let spot = null
	try {
		spot = JSON.parse(localStorage.getItem(STORE))
	} catch {
		// Then it starts where it always does.
	}
	function place() {
		if (!spot) return
		const free = room()
		el.style.left = `${EDGE + spot.x * free.w}px`
		el.style.top = `${EDGE + spot.y * free.h}px`
		el.style.right = el.style.bottom = 'auto'
		el.style.transformOrigin = `${spot.x * 100}% ${spot.y * 100}%`
	}
	function room() {
		return { w: Math.max(1, innerWidth - el.offsetWidth - 2 * EDGE), h: Math.max(1, innerHeight - el.offsetHeight - 2 * EDGE) }
	}
	// To the nearest edge, and into the corner if it's near a second one.
	function snap(x, y) {
		const edges = [x, 1 - x, y, 1 - y]
		const nearest = edges.indexOf(Math.min(...edges))
		if (nearest < 2) x = nearest === 0 ? 0 : 1
		else y = nearest === 2 ? 0 : 1
		if (nearest < 2 && Math.min(y, 1 - y) < CORNER) y = y < 0.5 ? 0 : 1
		if (nearest >= 2 && Math.min(x, 1 - x) < CORNER) x = x < 0.5 ? 0 : 1
		return { x, y }
	}
	place()
	addEventListener('resize', place)

	function setVolume(value) {
		sound.start()
		sound.setVolume(value)
	}

	// One gesture: a tap, a turn of the knob, or a drag of the whole thing.
	let gesture = null
	el.addEventListener('pointerdown', (e) => {
		if (e.button > 0) return
		sound.start()
		const onKnob = !!e.target.closest('.knob')
		const r = el.getBoundingClientRect()
		const k = knob.getBoundingClientRect()
		gesture = {
			id: e.pointerId,
			// Captured, the pointer's later events all land on the device itself.
			target: e.target,
			x: e.clientX,
			y: e.clientY,
			grab: { x: e.clientX - r.left, y: e.clientY - r.top },
			knob: onKnob && { x: k.left + k.width / 2, y: k.top + k.height / 2 },
			angle: null,
			mode: null,
			// A mouse drags the body straight away; a finger holds it first, so taps still work.
			hold:
				e.pointerType === 'mouse'
					? 0
					: setTimeout(() => {
							if (gesture && !gesture.mode) startDrag()
						}, HOLD),
		}
		el.setPointerCapture(e.pointerId)
	})
	function startDrag() {
		gesture.mode = 'drag'
		el.classList.add('held')
		navigator.vibrate?.(12)
	}
	el.addEventListener('pointermove', (e) => {
		if (!gesture || e.pointerId !== gesture.id) return
		const far = Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > MOVED
		if (!gesture.mode && far) {
			clearTimeout(gesture.hold)
			if (gesture.knob) gesture.mode = 'turn'
			else if (gesture.hold === 0) startDrag()
			else gesture.mode = 'none'
		}
		if (gesture.mode === 'drag') {
			el.style.left = `${e.clientX - gesture.grab.x}px`
			el.style.top = `${e.clientY - gesture.grab.y}px`
			el.style.right = el.style.bottom = 'auto'
		} else if (gesture.mode === 'turn') {
			const angle = (Math.atan2(e.clientY - gesture.knob.y, e.clientX - gesture.knob.x) * 180) / Math.PI
			if (gesture.angle !== null) {
				const step = ((angle - gesture.angle + 540) % 360) - 180
				setVolume((sound.isMuted() ? 0 : sound.volume()) + step / TURN)
			}
			gesture.angle = angle
		}
	})
	function end(e) {
		if (!gesture || e.pointerId !== gesture.id) return
		clearTimeout(gesture.hold)
		const { mode, target } = gesture
		gesture = null
		el.classList.remove('held')
		if (mode === 'drag') {
			const free = room()
			const x = (parseFloat(el.style.left) - EDGE) / free.w
			const y = (parseFloat(el.style.top) - EDGE) / free.h
			spot = snap(Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y)))
			place()
			try {
				localStorage.setItem(STORE, JSON.stringify(spot))
			} catch {
				// It just won't stay there next time.
			}
		} else if (!mode && e.type === 'pointerup') tap(target, e.clientX)
	}
	el.addEventListener('pointerup', end)
	el.addEventListener('pointercancel', end)
	function tap(target, x) {
		if (target.closest('.switch')) toggleMute()
		else if (target.closest('.knob')) {
			const k = knob.getBoundingClientRect()
			turnStation(x < k.left + k.width * 0.35 ? -1 : 1)
		}
	}
	// Taps are handled above; keyboard presses still click.
	knob.addEventListener('click', (e) => {
		if (e.detail === 0) turnStation(1)
		knob.blur()
	})
	muteSwitch.addEventListener('click', (e) => {
		if (e.detail === 0) toggleMute()
		muteSwitch.blur()
	})
	// Scrolling over it turns the volume and leaves the zoom alone.
	el.addEventListener(
		'wheel',
		(e) => {
			e.preventDefault()
			e.stopPropagation()
			setVolume((sound.isMuted() ? 0 : sound.volume()) + (e.deltaY < 0 ? 0.05 : -0.05))
		},
		{ passive: false },
	)

	return {
		// `radio`: the car radio's { name, title }, or null out of a car;
		// `hearing`: the loudest song around, or null.
		update({ radio, hearing, car }, dt) {
			const muted = sound.isMuted()
			const volume = sound.volume()
			const next = app.draw(parts, { radio, hearing, muted, volume })
			if (next !== key) {
				// Not at the very start, only on a change.
				if (key !== null) open = OPEN
				key = next
			}
			open = Math.max(0, open - dt)
			el.classList.toggle('open', open > 0 || !!gesture?.mode)
			el.classList.toggle('car', car)
			el.classList.toggle('muted', muted)
			knob.style.setProperty('--turn', `${(muted ? 0 : volume) * TURN - TURN / 2}deg`)
			knob.ariaLabel = car ? 'Sender wechseln (R)' : 'Lautstärke'
			muteSwitch.ariaLabel = muteSwitch.title = muted ? 'Ton an (L)' : 'Ton aus (L)'
		},
	}
}
