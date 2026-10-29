// A race and its best ghost as a link, no server: /#race=<base64url>. The
// bytes are a version, the race's id, the sender's name, the gates, and the
// best run: time, vehicle, splits, and the ghost as delta-coded steps of
// quantised positions (15 cm) and headings. The ghost is thinned until the
// link fits LIMIT characters; if even the sparsest won't, the link carries
// the gates and the time but no ghost. Everything that comes in is
// untrusted, so decoding checks every size and gives null for anything odd.
import { GHOST_HZ } from './race.js'

const VERSION = 1
const LIMIT = 4000 // characters of link, to survive chats and mail clients
const STEPS = [2, 3, 4, 6, 8, 12] // ghost frames kept: every nth of the recorded 10 Hz
const XY = 20 // position units per tile
const ANGLE = 50 // heading units per radian
const MAX_GATES = 40
const MAX_FRAMES = 6000 // ten minutes at 10 Hz
const NAME_LENGTH = 24
const FORMS = ['er', 'e']
const KIEZ = [
	['Pfand-Pirat', 0],
	['Späti-Fuchs', 0],
	['Kanal-Ratte', 1],
	['Hasenheide-Taube', 1],
	['Poller-Pilot', 0],
	['Döner-Drache', 0],
	['Ringbahn-Schnecke', 1],
	['Tempelhof-Hase', 0],
]
const ADJECTIVES = ['flink', 'müd', 'wild', 'laut', 'schräg', 'still']

// A random Kiez nickname: "Flinker Pfand-Pirat", "Wilde Kanal-Ratte".
export function nickname(random = Math.random) {
	const [noun, feminine] = KIEZ[Math.floor(random() * KIEZ.length)]
	const adjective = ADJECTIVES[Math.floor(random() * ADJECTIVES.length)]
	return `${adjective[0].toUpperCase()}${adjective.slice(1)}${FORMS[feminine]} ${noun}`
}

// Names from strangers end up on screen: no markup, no control characters.
export const cleanName = (name) =>
	String(name ?? '')
		.replace(/[\p{C}<>&"']/gu, '')
		.trim()
		.slice(0, NAME_LENGTH)

// The link for `race`, sent as `name`. Returns { url, ghost }: whether the
// best run's ghost made it in.
export function shareLink(race, name, base = '/') {
	const make = (step) => `${base}#race=${toBase64Url(encode(race, cleanName(name), step))}`
	if (!race.best?.ghost?.frames?.length) return { url: make(0), ghost: false }
	for (const step of STEPS) {
		const url = make(step)
		if (url.length <= LIMIT) return { url, ghost: true }
	}
	return { url: make(0), ghost: false }
}

// The race in a link's hash, or null if there isn't one or it's no good.
export function raceFromHash(hash) {
	const payload = /^#race=([\w-]+)$/.exec(hash)?.[1]
	if (!payload) return null
	try {
		return decode(fromBase64Url(payload))
	} catch {
		return null
	}
}

function encode(race, name, step) {
	const out = []
	const byte = (v) => out.push(v & 255)
	const varint = (v) => {
		while (v >= 128) {
			byte((v & 127) | 128)
			v = Math.floor(v / 128)
		}
		byte(v)
	}
	const signed = (v) => varint(v < 0 ? -2 * v - 1 : 2 * v)
	const text = (s) => {
		const bytes = new TextEncoder().encode(s)
		varint(bytes.length)
		out.push(...bytes)
	}

	byte(VERSION)
	text(String(race.id))
	text(name)
	varint(race.gates.length)
	let px = 0
	let py = 0
	for (const g of race.gates) {
		const x = Math.round(g.x * 100)
		const y = Math.round(g.y * 100)
		signed(x - px)
		signed(y - py)
		px = x
		py = y
		signed(Math.round(g.angle * 1000))
		varint(Math.round(g.left * 20))
		varint(Math.round(g.right * 20))
	}
	const best = race.best
	byte(best ? 1 : 0)
	if (!best) return Uint8Array.from(out)
	varint(Math.round(best.time * 1000))
	text(best.vehicle)
	varint(best.splits.length)
	for (const s of best.splits) varint(Math.round(s * 1000))
	const frames = step ? best.ghost.frames.filter((_, i) => i % step === 0) : []
	varint(frames.length)
	if (!frames.length) return Uint8Array.from(out)
	byte(step)
	let x = 0
	let y = 0
	let a = 0
	for (const f of frames) {
		const qx = Math.round(f[0] * XY)
		const qy = Math.round(f[1] * XY)
		const qa = Math.round(f[2] * ANGLE)
		signed(qx - x)
		signed(qy - y)
		signed(qa - a)
		x = qx
		y = qy
		a = qa
	}
	return Uint8Array.from(out)
}

function decode(bytes) {
	let at = 0
	const byte = () => {
		if (at >= bytes.length) throw new Error('short')
		return bytes[at++]
	}
	const varint = () => {
		let v = 0
		let scale = 1
		for (let i = 0; i < 8; i++) {
			const b = byte()
			v += (b & 127) * scale
			if (b < 128) return v
			scale *= 128
		}
		throw new Error('long')
	}
	const signed = () => {
		const v = varint()
		return v % 2 ? -(v + 1) / 2 : v / 2
	}
	const text = () => {
		const n = varint()
		if (n > 200 || at + n > bytes.length) throw new Error('text')
		const s = new TextDecoder().decode(bytes.subarray(at, at + n))
		at += n
		return s
	}

	if (byte() !== VERSION) return null
	const id = text()
	const name = cleanName(text())
	const count = varint()
	if (!id || count < 2 || count > MAX_GATES) return null
	const gates = []
	let px = 0
	let py = 0
	for (let i = 0; i < count; i++) {
		px += signed()
		py += signed()
		gates.push({ x: px / 100, y: py / 100, angle: signed() / 1000, left: varint() / 20, right: varint() / 20 })
	}
	const race = { id, name, gates, rival: null }
	if (!byte()) return race
	const time = varint() / 1000
	const vehicle = text().replace(/[^\w-]/g, '')
	const splitCount = varint()
	if (!time || !vehicle || splitCount !== count - 1) return null
	const splits = Array.from({ length: splitCount }, () => varint() / 1000)
	const total = varint()
	if (total > MAX_FRAMES) return null
	const rival = { name, time, vehicle, splits, ghost: null }
	if (total) {
		const step = byte()
		if (!step || step > 60) return null
		const frames = []
		let x = 0
		let y = 0
		let a = 0
		for (let i = 0; i < total; i++) {
			x += signed()
			y += signed()
			a += signed()
			frames.push([x / XY, y / XY, a / ANGLE, vehicle])
		}
		rival.ghost = { hz: GHOST_HZ / step, frames }
	}
	race.rival = rival
	return race
}

function toBase64Url(bytes) {
	let s = ''
	for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192))
	return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function fromBase64Url(text) {
	const s = atob(text.replaceAll('-', '+').replaceAll('_', '/'))
	return Uint8Array.from(s, (c) => c.charCodeAt(0))
}
