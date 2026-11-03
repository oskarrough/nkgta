import * as THREE from 'three'
import { createGhost } from './race-gates.js'
import { createPeers } from './peers.js'

const HZ = 10
const BEAT = 2 // seconds: say where you are even standing still, so you don't go stale
const RETRY = { first: 2, most: 60 }
const COLOR = '#ff8fd8'

// Other players in the same area, as named figures in the city, through the
// relay in worker/street.js. The dev server has no relay, so it stays offline
// there unless the URL asks with ?together.
export function createTogether({ scene, heightAt, room, pose, name }) {
	const peers = createPeers()
	const root = new THREE.Group()
	scene.add(root)
	const ghosts = new Map()
	const online = !import.meta.env.DEV || new URLSearchParams(location.search).has('together')
	let socket = null
	let wait = RETRY.first
	let sent = ''
	let sentAt = 0
	let shown = []

	const now = () => performance.now() / 1000

	function connect() {
		if (!online || typeof WebSocket === 'undefined') return
		const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/street?room=${encodeURIComponent(room)}`
		socket = new WebSocket(url)
		socket.onopen = () => {
			wait = RETRY.first
			sent = ''
		}
		socket.onmessage = (e) => {
			try {
				peers.receive(JSON.parse(e.data), now())
			} catch {
				// Not ours to worry about: a garbled message is just skipped.
			}
		}
		socket.onclose = () => {
			socket = null
			peers.clear()
			setTimeout(connect, wait * 1000)
			wait = Math.min(RETRY.most, wait * 2)
		}
	}
	connect()

	function send(hidden) {
		if (socket?.readyState !== WebSocket.OPEN) return
		const t = now()
		if (t - sentAt < 1 / HZ) return
		const p = pose()
		const msg = JSON.stringify({
			t: 'pose',
			x: +p.x.toFixed(2),
			y: +p.y.toFixed(2),
			angle: +p.angle.toFixed(2),
			vehicle: p.vehicle,
			name: name(),
			hidden,
		})
		if (msg === sent && t - sentAt < BEAT) return
		socket.send(msg)
		sent = msg
		sentAt = t
	}

	return {
		// `hidden` while you're in a shop: they don't see you, you don't see them.
		update({ hidden = false } = {}) {
			send(hidden)
			root.visible = !hidden
			shown = peers.at(now())
			const here = new Set(shown.map((p) => p.id))
			for (const [id, ghost] of ghosts)
				if (!here.has(id)) {
					ghost.dispose()
					ghosts.delete(id)
				}
			for (const peer of shown) {
				let ghost = ghosts.get(peer.id)
				if (!ghost) ghosts.set(peer.id, (ghost = createGhost(root, heightAt, COLOR, true, 0.85)))
				ghost(peer.pose, peer.name)
			}
		},
		// Where the others are, for the pocket map.
		friends: () => shown.filter((p) => p.pose).map((p) => p.pose),
	}
}
