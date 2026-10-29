// What's the same for everyone today: one race and one Wo bin ich? round,
// generated from the date (Berlin's) and the area, so no server is needed.
import { makeGate } from './race.js'
import { SOLID, T } from './tiles.js'

export const dateKey = (now = new Date()) => now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })

// mulberry32, seeded from a string.
export function seeded(text) {
	let h = 1779033703 ^ text.length
	for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 3432918353)
	let a = Math.imul(h ^ (h >>> 16), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)
	return () => {
		a = (a + 0x6d2b79f5) | 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

export const dailyId = (date) => `daily-${date}`
export const isDaily = (race) => String(race.id).startsWith('daily-')

const GATES = 4
const LEG = [150, 360] // metres between gates

// The direction the road runs at p (the longest stretch of road through it),
// turned to face `heading`, so a gate stands across the street.
function alongRoad(world, p, heading) {
	let best = 0
	let longest = -1
	for (let k = 0; k < 8; k++) {
		const a = (k * Math.PI) / 8
		let run = 0
		for (const side of [1, -1])
			for (let d = 0.5; d <= 20 && world.tileAt(p.x + Math.cos(a) * d * side, p.y + Math.sin(a) * d * side) === T.ROAD; d += 0.5) run += 0.5
		if (run > longest) {
			longest = run
			best = a
		}
	}
	return Math.cos(best - heading) < 0 ? best + Math.PI : best
}

// Today's race: gates on roads, a few hundred metres apart, each on another
// street than the one before. `streets` is quiz-rules' streetSpots. Null if
// the area has no room for one.
export function dailyRace(world, streets, date, area) {
	const random = seeded(`race|${area}|${date}`)
	const metres = world.tileM ?? 3
	const [near, far] = LEG.map((m) => m / metres)
	const spots = [...streets.values()].flat().filter((s) => world.tileAt(s.x, s.y) === T.ROAD)
	if (!spots.length) return null
	const points = [spots[Math.floor(random() * spots.length)]]
	while (points.length < GATES) {
		const last = points.at(-1)
		const ring = spots.filter((s) => {
			const d = Math.hypot(s.x - last.x, s.y - last.y)
			return d >= near && d <= far && s.street !== last.street && points.every((p) => Math.hypot(s.x - p.x, s.y - p.y) >= near)
		})
		if (!ring.length) break
		points.push(ring[Math.floor(random() * ring.length)])
	}
	if (points.length < 2) return null
	const solid = (x, y) => SOLID.has(world.tileAt(x, y))
	const gates = points.map((p, i) => {
		const [from, to] = points[i + 1] ? [p, points[i + 1]] : [points[i - 1], p]
		return makeGate(p.x, p.y, alongRoad(world, p, Math.atan2(to.y - from.y, to.x - from.x)), solid)
	})
	return { id: dailyId(date), gates, times: [], best: null }
}

const KEY = 'nk-daily-quiz'

// Your result in today's Wo bin ich?, { date, score, marks } or null.
export function dailyQuizResult(storage, date) {
	try {
		const saved = JSON.parse(storage.getItem(KEY))
		return saved?.date === date ? saved : null
	} catch {
		return null
	}
}

export function saveDailyQuiz(storage, result) {
	const old = dailyQuizResult(storage, result.date)
	if (old && old.score >= result.score) return
	try {
		storage.setItem(KEY, JSON.stringify(result))
	} catch {
		// Not remembered.
	}
}

// The text that goes into a chat: the score, a tick or cross per round, a link.
export const quizShareText = (result, link) => `Wo bin ich? ${result.date} · ${result.score}/5 ${result.marks}\n${link}`
