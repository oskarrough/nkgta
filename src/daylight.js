import * as THREE from 'three'

export const HOUR_SECONDS = 60 // seconds of play per hour of the day
export const START_HOUR = 11 // late morning, so the first look is in daylight

// Sky light and sun (or moon) light as colour and strength, how dark cast
// shadows are, what the map's colours are multiplied by in sun and in shade,
// the sky past the clouds (and the street fog), the clouds' three tones from
// sunlit to shaded, how night it is (lamps and windows glow by it), and the
// share of flats with the lamp on.
const HOURS = [
	{
		hour: 0,
		ambient: ['#6878a8', 0.75],
		sun: ['#a8bce6', 0.85],
		shadow: 0,
		ground: ['#5c6990', '#525e88'],
		sky: '#2c3552',
		clouds: ['#69769a', '#56628a', '#414c6e'],
		night: 1,
		home: 0.28,
	},
	{
		hour: 4,
		ambient: ['#6878a8', 0.72],
		sun: ['#a8bce6', 0.85],
		shadow: 0,
		ground: ['#5c6990', '#525e88'],
		sky: '#2c3552',
		clouds: ['#69769a', '#56628a', '#414c6e'],
		night: 1,
		home: 0.08,
	},
	{
		hour: 6,
		ambient: ['#9ea0bc', 0.75],
		sun: ['#ffb68c', 1.3],
		shadow: 0.6,
		ground: ['#d2b8b4', '#7e86aa'],
		sky: '#8c8ca8',
		clouds: ['#ffd2b4', '#cbbac6', '#7c82a2'],
		night: 0.35,
		home: 0.18,
	},
	{
		hour: 8.5,
		ambient: ['#c2c8d6', 0.95],
		sun: ['#fff0d8', 2.35],
		shadow: 1,
		ground: ['#fff6ea', '#96a2c0'],
		sky: '#8d9cb1',
		clouds: ['#ffffff', '#dce3ea', '#b4c1d0'],
		night: 0,
		home: 0.06,
	},
	{
		hour: 16,
		ambient: ['#c6ccd6', 1.0],
		sun: ['#fff4e2', 2.55],
		shadow: 1,
		ground: ['#fffaf0', '#98a4c0'],
		sky: '#8d9cb1',
		clouds: ['#ffffff', '#dce3ea', '#b4c1d0'],
		night: 0,
		home: 0.06,
	},
	{
		hour: 19.25,
		ambient: ['#c4bcc4', 0.9],
		sun: ['#ffc386', 2.45],
		shadow: 1,
		ground: ['#ffe0b6', '#8e92b6'],
		sky: '#a698a6',
		clouds: ['#ffdcb0', '#e9c4b0', '#9a9ab6'],
		night: 0.08,
		home: 0.14,
	},
	{
		hour: 20.75,
		ambient: ['#8c8cb2', 0.75],
		sun: ['#ff9468', 1.1],
		shadow: 0.45,
		ground: ['#b89ca6', '#717aa2'],
		sky: '#5c6288',
		clouds: ['#e8a48a', '#a88ea8', '#5c6488'],
		night: 0.6,
		home: 0.3,
	},
	{
		hour: 22,
		ambient: ['#6878a8', 0.75],
		sun: ['#a8bce6', 0.85],
		shadow: 0,
		ground: ['#5c6990', '#525e88'],
		sky: '#2c3552',
		clouds: ['#69769a', '#56628a', '#414c6e'],
		night: 1,
		home: 0.45,
	},
]

// Where the sun rises and sets, in hours, how high it gets at noon, how low
// its light is let go before the shadows would smear, and where the moon is.
const SUN_PATH = { rise: 6, set: 21, noon: 0.95, low: 0.16 }
const MOON = new THREE.Vector3(0.45, -0.55, 0.7).normalize()

const mixColor = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t)
const smooth = (a, b, x) => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
	return t * t * (3 - 2 * t)
}

// The direction towards the light at `hour`, scene axes (x east, y north,
// z up): from the east through the south to the west, then the moon.
export function lightDirection(hour) {
	const t = (hour - SUN_PATH.rise) / (SUN_PATH.set - SUN_PATH.rise)
	const up = Math.sin(Math.PI * t)
	const along = Math.PI * Math.min(1, Math.max(0, t))
	const height = Math.max(SUN_PATH.low, SUN_PATH.noon * up)
	const sun = new THREE.Vector3(Math.cos(along), -Math.sin(along), 0).setLength(Math.cos(height)).setZ(Math.sin(height))
	return MOON.clone()
		.lerp(sun, t > 0 && t < 1 ? smooth(0, 0.12, up) : 0)
		.normalize()
}

// The look at `hour`: the two bundles either side, blended, colours as
// THREE.Colors, plus where the light comes from.
export function daylight(hour) {
	const h = ((hour % 24) + 24) % 24
	const i = HOURS.findLastIndex((k) => k.hour <= h)
	const a = HOURS[i]
	const b = HOURS[(i + 1) % HOURS.length]
	const span = (b.hour - a.hour + 24) % 24 || 24
	const t = smooth(0, 1, (h - a.hour) / span)
	const num = (x, y) => x + (y - x) * t
	return {
		hour: h,
		ambient: [mixColor(a.ambient[0], b.ambient[0], t), num(a.ambient[1], b.ambient[1])],
		sun: [mixColor(a.sun[0], b.sun[0], t), num(a.sun[1], b.sun[1])],
		shadow: num(a.shadow, b.shadow),
		ground: [mixColor(a.ground[0], b.ground[0], t), mixColor(a.ground[1], b.ground[1], t)],
		sky: mixColor(a.sky, b.sky, t),
		clouds: a.clouds.map((c, k) => mixColor(c, b.clouds[k], t)),
		night: num(a.night, b.night),
		home: num(a.home, b.home),
		direction: lightDirection(h),
	}
}

export function createClock(hour = START_HOUR) {
	let day = 0 // Monday
	return {
		get hour() {
			return hour
		},
		get day() {
			return day
		},
		set(h) {
			hour = ((h % 24) + 24) % 24
		},
		tick(dt) {
			const elapsed = hour + dt / HOUR_SECONDS
			day = (day + Math.floor(elapsed / 24)) % 7
			hour = elapsed % 24
		},
	}
}

export function tuneClock(form, clock) {
	form.style.cssText =
		'display:grid;grid-template-columns:auto 9em 3em;gap:2px 6px;align-items:center;margin-top:0.6rem;color:#fff;font:11px monospace'
	for (const type of ['keydown', 'keyup', 'pointerdown', 'pointermove', 'pointerup', 'wheel']) {
		form.addEventListener(type, (e) => e.code === 'Backquote' || e.stopPropagation())
	}
	const time = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`
	const value = document.createElement('output')
	const slider = Object.assign(document.createElement('input'), { type: 'range', min: 0, max: 24, step: 0.05 })
	slider.addEventListener('input', () => clock.set(Number(slider.value)))
	form.append(Object.assign(document.createElement('label'), { textContent: 'time' }), slider, value)
	setInterval(() => {
		if (form.closest('[hidden]')) return
		if (document.activeElement !== slider) slider.value = clock.hour
		value.value = time(clock.hour)
	}, 100)
}
