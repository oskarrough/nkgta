import './pocket.css'
import { recall, remember } from './remember.js'
import { sound } from './sound.js'

const TURN = 270 // degrees of knob from silent to full
const HOLD = 350 // ms a finger holds the body still before it drags the device
const MUTE = 600 // ms the knob is held down before it mutes
const MOVED = 5 // px a pointer moves before it's a drag or a turn, not a tap
const EDGE = 8 // px from the screen's edge
const CORNER = 0.2 // this close to a second edge, it goes in the corner
const STORE = 'nk-pocket'
const SAY = 2.5 // seconds a note from the device itself stays on its top line

// The one piece of interface: a scuffed handheld. Its screen shows the map
// unless something else needs it; the knob is the radio; two rubber keys open
// the races and the post. It never changes size: it's in your hand, not a window.
export function createPocket({ turnStation, toggleMute }) {
	const el = document.createElement('div')
	el.id = 'pocket'
	// Hidden until its first frame is drawn, so it appears once, settled.
	el.className = 'asleep'
	el.innerHTML = `
		<i class="led"></i>
		<div class="screen"><div class="top"><div class="ticker"><span></span></div><b class="tags"></b></div></div>
		<div class="lower">
			<div class="keys"></div>
			<div class="dial"><button type="button" class="knob" aria-label="Lautstärke" title="Drehen: Lautstärke · Tippen: Sender (R) · Halten: Ton aus (L)"><i></i></button></div>
		</div>
		<span class="sticker">NK 44</span>`
	document.body.append(el)
	const knob = el.querySelector('.knob')
	const dial = el.querySelector('.dial')
	const screen = el.querySelector('.screen')
	const keys = el.querySelector('.keys')
	const ticker = el.querySelector('.ticker')
	const tickerText = ticker.querySelector('span')
	const tags = el.querySelector('.tags')
	const apps = []
	const tagOf = {}
	let home = null
	let current = null
	let back = null // where an alert hands the screen back to
	let alerting = null
	let said = null
	let shownText = null
	let first = true

	function add(app) {
		apps.push(app)
		app.page.classList.add('page')
		app.page.hidden = true
		screen.append(app.page)
		if (app.key) {
			const button = document.createElement('button')
			button.type = 'button'
			button.dataset.app = app.id
			button.title = button.ariaLabel = app.key.title ?? app.key.label
			button.innerHTML = `<img src="/icons/${app.key.icon}.png" alt=""><span>${app.key.label}</span>`
			keys.append(button)
		}
		if (!home) {
			home = app
			show(app.id)
		}
	}
	function show(id) {
		const app = apps.find((a) => a.id === id)
		if (!app || current === app) return
		if (current) current.page.hidden = true
		current = app
		app.page.hidden = false
		el.dataset.screen = id
		for (const b of keys.children) b.classList.toggle('on', b.dataset.app === id)
		app.shown?.()
		showTags()
	}
	// A key opens its app, and pressed again goes back to the map.
	function press(id) {
		sound.tick()
		back = null
		show(current?.id === id ? home.id : id)
	}
	function showTags() {
		tags.textContent = Object.entries(tagOf)
			.filter(([id, tag]) => tag?.text && id !== current?.id)
			.map(([, tag]) => tag.text)
			.join(' ')
		tags.classList.toggle(
			'urgent',
			Object.values(tagOf).some((tag) => tag?.urgent),
		)
	}
	function setTicker(text) {
		if (text === shownText) return
		shownText = text
		tickerText.textContent = text
		ticker.classList.remove('run')
		const over = tickerText.scrollWidth - ticker.clientWidth
		if (over > 2) {
			ticker.style.setProperty('--over', `${-over}px`)
			ticker.style.setProperty('--run', `${3 + over / 25}s`)
			ticker.classList.add('run')
		}
	}

	// Where it sits: fractions of the free room across and down, or null for
	// the default, top right under the money.
	let spot = recall(STORE)
	function place() {
		if (!spot) return
		const free = room()
		el.style.left = `${EDGE + spot.x * free.w}px`
		el.style.top = `${EDGE + spot.y * free.h}px`
		el.style.right = el.style.bottom = 'auto'
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
	// A slide switch on the casing: it shows its own state, and says nothing else.
	const switches = new Map()
	function flip(button) {
		const slide = switches.get(button)
		slide.set(!slide.on)
		slide.change(slide.on)
	}
	function nextStation() {
		said = turnStation(1) ? null : { text: 'Radio gibt’s im Auto', t: SAY }
		knob.blur()
	}

	// What's on the screen of an app you type or tap in is its own; the rest of
	// the device is hardware: drag it, turn the knob, press it.
	const onScreen = (target) => !!current?.live && screen.contains(target)

	let gesture = null
	el.addEventListener('pointerdown', (e) => {
		if (e.button > 0) return
		sound.start()
		if (onScreen(e.target) || e.target.closest('.screen button')) return
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
			// Held still, the knob mutes; a finger on the body drags, so taps
			// still work. A mouse drags the body straight away.
			hold: onKnob
				? setTimeout(() => {
						if (!gesture || gesture.mode) return
						gesture.mode = 'mute'
						dial.classList.remove('pressing')
						toggleMute()
						navigator.vibrate?.(20)
					}, MUTE)
				: e.pointerType === 'mouse'
					? 0
					: setTimeout(() => {
							if (gesture && !gesture.mode) startDrag()
						}, HOLD),
		}
		if (onKnob) dial.classList.add('pressing')
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
			dial.classList.remove('pressing')
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
		dial.classList.remove('pressing')
		const { mode, target } = gesture
		gesture = null
		el.classList.remove('held')
		if (mode === 'drag') {
			const free = room()
			const x = (parseFloat(el.style.left) - EDGE) / free.w
			const y = (parseFloat(el.style.top) - EDGE) / free.h
			spot = snap(Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y)))
			place()
			remember(STORE, spot)
		} else if (!mode && e.type === 'pointerup') tap(target)
	}
	el.addEventListener('pointerup', end)
	el.addEventListener('pointercancel', end)
	function tap(target) {
		const appKey = target.closest('.keys [data-app]')
		if (appKey) press(appKey.dataset.app)
		else if (target.closest('.knob')) nextStation()
		else if (target.closest('.slide')) flip(target.closest('.slide'))
		else if (screen.contains(target)) current.tap?.()
	}
	// Taps are handled above; keyboard presses still click.
	el.addEventListener('click', (e) => {
		if (e.detail !== 0 || onScreen(e.target)) return
		const button = e.target.closest('button')
		if (button === knob) nextStation()
		else if (button?.dataset.app) press(button.dataset.app)
		else if (button?.classList.contains('slide')) flip(button)
		else return
		button.blur()
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
		show(id) {
			back = null
			show(id)
		},
		current: () => current?.id,
		// A slide switch printed with `label`; `change(on)` runs when it's flipped by hand.
		slide({ label, on, change }) {
			const button = document.createElement('button')
			button.type = 'button'
			button.className = 'slide'
			button.role = 'switch'
			button.ariaLabel = label
			button.innerHTML = `<i></i><span>${label}</span>`
			const slide = {
				on,
				change,
				set(value) {
					slide.on = value
					button.ariaChecked = String(value)
					button.classList.toggle('on', value)
				},
			}
			slide.set(on)
			switches.set(button, slide)
			el.append(button)
			return slide
		},
		// A note from the device itself on the top line.
		say(text, t = SAY) {
			said = { text, t }
		},
		// App `id` takes the screen and lights it; `release` hands it back.
		alert(id) {
			if (alerting !== id && current?.id !== id) back = current
			alerting = id
			const typing = current?.live && el.contains(document.activeElement)
			if (!typing) show(id)
		},
		release(id) {
			if (alerting !== id) return
			alerting = null
			if (current?.id === id) show((back ?? home).id)
			back = null
		},
		// A few characters on the top line, while another app has the screen.
		tag(id, text, urgent = false) {
			const tag = tagOf[id]
			if (tag?.text === text && tag?.urgent === urgent) return
			tagOf[id] = { text, urgent }
			showTags()
		},
		// `radio`: the car radio's { name, title }, or null out of a car;
		// `hearing`: the loudest song around, or null.
		update({ radio, hearing, car }, dt) {
			const muted = sound.isMuted()
			const volume = sound.volume()
			if (said && (said.t -= dt) <= 0) said = null
			const now = radio ? { name: radio.name ?? 'Radio aus', title: radio.title } : hearing
			setTicker(said?.text ?? (muted ? '' : now ? [now.name, now.title].filter(Boolean).join(' · ') : 'Straße'))
			el.classList.toggle('lit', !!alerting && current?.id === alerting)
			el.classList.toggle('car', car)
			el.classList.toggle('muted', muted)
			knob.style.setProperty('--turn', `${(muted ? 0 : volume) * TURN - TURN / 2}deg`)
			knob.ariaLabel = car ? 'Lautstärke, tippen: Sender (R)' : 'Lautstärke'
			current?.update?.(dt)
			if (first) el.classList.remove('asleep')
			first = false
		},
	}
}
