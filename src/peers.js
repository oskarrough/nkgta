import { cleanName } from './race-share.js'

const DELAY = 0.2 // seconds behind the newest pose, so there are usually two to blend
const STALE = 10 // seconds without a word and they've gone
const JUMP = 6 // tiles between two poses: a respawn, not a ride

// Everyone else on the street, from what the relay passes on. Times are in
// seconds on one clock; `at(now)` gives each a pose a little in the past,
// blended between the two it heard either side of it.
export function createPeers() {
	const peers = new Map()
	return {
		receive(msg, now) {
			if (!msg || typeof msg.id !== 'string') return
			if (msg.t === 'leave') return void peers.delete(msg.id)
			if (msg.t !== 'pose') return
			const { x, y, angle } = msg
			if (![x, y, angle].every(Number.isFinite)) return
			const peer = peers.get(msg.id) ?? { samples: [] }
			peer.name = cleanName(msg.name) || 'Gast'
			peer.seen = now
			peer.samples.push({ at: now, x, y, angle, vehicle: String(msg.vehicle ?? 'foot'), hidden: !!msg.hidden })
			if (peer.samples.length > 4) peer.samples.shift()
			peers.set(msg.id, peer)
		},
		clear: () => peers.clear(),
		at(now) {
			const out = []
			for (const [id, peer] of peers) {
				if (now - peer.seen > STALE) {
					peers.delete(id)
					continue
				}
				out.push({ id, name: peer.name, pose: blend(peer.samples, now - DELAY) })
			}
			return out
		},
	}
}

function blend(samples, t) {
	let b = samples.findIndex((s) => s.at > t)
	if (b === -1) b = samples.length - 1
	const a = samples[Math.max(0, b - 1)]
	const z = samples[b]
	if (a.hidden || z.hidden) return null
	const k = z.at > a.at ? Math.min(1, Math.max(0, (t - a.at) / (z.at - a.at))) : 1
	if (Math.hypot(z.x - a.x, z.y - a.y) > JUMP) return pose(k < 1 ? a : z)
	const turn = Math.atan2(Math.sin(z.angle - a.angle), Math.cos(z.angle - a.angle))
	return {
		x: a.x + (z.x - a.x) * k,
		y: a.y + (z.y - a.y) * k,
		angle: a.angle + turn * k,
		vehicle: (k < 0.5 ? a : z).vehicle,
	}
}

const pose = (s) => ({ x: s.x, y: s.y, angle: s.angle, vehicle: s.vehicle })
