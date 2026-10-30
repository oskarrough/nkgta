import './pocket.css'
import { sound } from './sound.js'

const OPEN = 4 // seconds it stays big after a change
const TURN = 270 // degrees of knob from silent to full
const HOLD = 350 // ms a touch holds still before it drags the device
const MOVED = 5 // px a pointer moves before it's a drag, not a tap
const EDGE = 8 // px from the screen's edge
const CORNER = 0.2 // this close to a second edge, it goes in the corner
const STORE = 'nk-pocket'
const SETTLE = 3 // seconds after it first shows when a new song doesn't make it jump

function soundApp() {
	const page = document.createElement('div')
	page.className = 'app-sound'
	page.innerHTML = '<b></b><span></span>'
	const [name, title] = page.children
	return {
		id: 'sound',
		icon: 'speaker',
		label: 'Musik',
		page,
		draw({ radio, hearing, muted }) {
			const now = muted ? { name: 'Ton aus', title: '' } : radio ? { name: radio.name ?? 'Radio aus', title: radio.title ?? '' } : hearing
			name.textContent = now?.name ?? 'Straße'
			title.textContent = now?.title ?? ''
			return `${name.textContent}:${title.textContent}`
		},
	}
}

// The one piece of interface: a scuffed handheld whose screen runs one app at a
// time, picked with the rubber keys under it. Apps bring their own page; one
// that needs you `alert`s and takes the screen, and `release` hands it back.
export function createPocket({ turnStation, toggleMute }) {
	const el = document.createElement('div')
	el.id = 'pocket'
	// Hidden until its first frame is drawn, so it appears once, settled.
	el.className = 'asleep'
	el.innerHTML = `
		<button type="button" class="switch" aria-label="Ton aus (L)" title="Ton aus (L)"></button>
		<i class="led"></i>
		<div class="screen"><div class="status"><b class="tags"></b><i class="volume"></i></div></div>
		<div class="keys"></div>
		<div class="lower">
			<span class="grille"></span>
			<div class="dial"><button type="button" class="knob" aria-label="Sender wechseln (R)" title="Drehen: Lautstärke · Tippen: Sender (R)"><i></i></button></div>
		</div>
		<span class="sticker">NK 44</span>`
	document.body.append(el)
	const knob = el.querySelector('.knob')
	const muteSwitch = el.querySelector('.switch')
	const screen = el.querySelector('.screen')
	const keys = el.querySelector('.keys')
	const tags = el.querySelector('.tags')
	const volumeBars = el.querySelector('.volume')
	const apps = []
	const tagOf = {}
	const flagged = new Set()
	let current = null
	let back = null // the app to go back to once an alert is over
	let key = null
	let open = 0
	let awake = 0

	function add(app) {
		apps.push(app)
		app.page.classList.add('page')
		app.page.hidden = true
		screen.append(app.page)
		const button = document.createElement('button')
		button.type = 'button'
		button.dataset.app = app.id
		button.title = button.ariaLabel = app.label
		button.innerHTML = `<img src="/icons/${app.icon}.png" alt="">`
		keys.append(button)
		if (!current) show(app.id, { quiet: true })
	}
	function show(id, { quiet = false } = {}) {
		const app = apps.find((a) => a.id === id)
		if (!app) return
		back = null
		if (current !== app) {
			if (current) current.page.hidden = true
			current = app
			app.page.hidden = false
			el.dataset.app = id
			for (const b of keys.children) b.classList.toggle('on', b.dataset.app === id)
			app.shown?.()
			showTags()
		}
		if (!quiet) open = OPEN
	}
	function next(step = 1) {
		const i = apps.indexOf(current)
		show(apps[(i + step + apps.length) % apps.length].id)
	}
	function showTags() {
		tags.textContent = Object.entries(tagOf)
			.filter(([id, text]) => text && id !== current?.id)
			.map(([, text]) => text)
			.join(' ')
	}
	const sounds = soundApp()
	add(sounds)

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

	// What's on the screen of an app you type or tap in is its own; the rest of
	// the device is hardware: drag it, turn it, press it.
	const onScreen = (target) => !!current?.live && screen.contains(target)

	let gesture = null
	el.addEventListener('pointerdown', (e) => {
		if (e.button > 0) return
		sound.start()
		open = OPEN
		if (onScreen(e.target)) return
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
		const appKey = target.closest('[data-app]')
		if (appKey) press(appKey.dataset.app)
		else if (target.closest('.switch')) toggleMute()
		else if (target.closest('.knob')) {
			const k = knob.getBoundingClientRect()
			turnStation(x < k.left + k.width * 0.35 ? -1 : 1)
		} else if (screen.contains(target)) current.tap?.()
	}
	function press(id) {
		sound.tick()
		show(id)
	}
	// Taps are handled above; keyboard presses still click.
	el.addEventListener('click', (e) => {
		if (e.detail !== 0 || onScreen(e.target)) return
		const button = e.target.closest('button')
		if (button === knob) turnStation(1)
		else if (button === muteSwitch) toggleMute()
		else if (button?.dataset.app) press(button.dataset.app)
		button?.blur()
	})
	el.addEventListener(
		'wheel',
		(e) => {
			e.stopPropagation()
			if (onScreen(e.target) && e.target.closest('.scroll')) return
			e.preventDefault()
			setVolume((sound.isMuted() ? 0 : sound.volume()) + (e.deltaY < 0 ? 0.05 : -0.05))
		},
		{ passive: false },
	)

	return {
		add,
		show,
		next,
		current: () => current?.id,
		// Take the screen for app `id`, light its key and shake; `release` goes
		// back to what was on before, unless you've moved on yourself.
		alert(id) {
			flagged.add(id)
			keys.querySelector(`[data-app="${id}"]`)?.classList.add('flag')
			const busy = current?.live && el.contains(document.activeElement) && document.activeElement !== document.body
			if (!busy && current?.id !== id) {
				const was = current.id
				show(id)
				back = was
			}
			open = OPEN
			el.classList.remove('ring')
			void el.offsetWidth
			el.classList.add('ring')
		},
		// Stop buzzing but keep the screen, as when you take the call.
		calm(id) {
			flagged.delete(id)
			keys.querySelector(`[data-app="${id}"]`)?.classList.remove('flag')
		},
		release(id) {
			this.calm(id)
			if (current?.id === id && back) show(back)
		},
		// A few characters for the status line, shown while another app has the screen.
		tag(id, text) {
			if (tagOf[id] === text) return
			tagOf[id] = text
			showTags()
		},
		// `radio`: the car radio's { name, title }, or null out of a car;
		// `hearing`: the loudest song around, or null.
		update({ radio, hearing, car }, dt) {
			const muted = sound.isMuted()
			const volume = sound.volume()
			const level = muted ? 0 : Math.round(volume * 10)
			const next = `${sounds.draw({ radio, hearing, muted })}:${level}`
			if (next !== key) {
				if (key !== null && current === sounds && awake > SETTLE) open = OPEN
				key = next
			}
			volumeBars.style.setProperty('--level', String(level))
			open = Math.max(0, open - dt)
			const urgent = flagged.has(current?.id)
			const inHand = current?.live && el.contains(document.activeElement) && document.activeElement !== document.body
			el.classList.toggle('open', open > 0 || urgent || inHand || !!gesture?.mode)
			el.classList.toggle('lit', urgent)
			el.classList.toggle('car', car)
			el.classList.toggle('muted', muted)
			knob.style.setProperty('--turn', `${(muted ? 0 : volume) * TURN - TURN / 2}deg`)
			knob.ariaLabel = car ? 'Sender wechseln (R)' : 'Lautstärke'
			muteSwitch.ariaLabel = muteSwitch.title = muted ? 'Ton an (L)' : 'Ton aus (L)'
			current?.update?.(dt)
			if (!awake) el.classList.remove('asleep')
			awake += dt
		},
	}
}
