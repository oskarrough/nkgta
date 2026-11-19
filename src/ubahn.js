// Down a real U7 or U8 entrance: a platform under the station, a train every
// so often, and the carriage you ride to the next station. Underground the
// city is never drawn; when the train moves it is the platform and the
// tunnel lamps that slide past. Room coordinates are tiles, y south, like
// the shop interior's.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { SOLID, T } from './tiles.js'
import { CREAM, INK, posterText } from './poster.js'

// The lines through the default map, in order, and where they end beyond it.
const LINES = {
	U7: {
		stops: ['Mehringdamm', 'Gneisenaustraße', 'Südstern', 'Hermannplatz', 'Rathaus Neukölln', 'Karl-Marx-Straße', 'Neukölln'],
		ends: ['Rathaus Spandau', 'Rudow'],
	},
	U8: { stops: ['Hermannplatz', 'Boddinstraße', 'Leinestraße', 'Hermannstraße'], ends: ['Wittenau', 'Hermannstraße'] },
}

const W = 16
const D = 9.5
const WALL = 0.5
const DOOR_Y = D - WALL
const EDGE = 3.3 // platform edge
export const DOOR = { x: W / 2, y: DOOR_Y - 0.35, nx: 0, ny: -1, out: 0.35 }
export const ENTRY = { x: W / 2, y: DOOR_Y - 1.1 }
export const MIDDLE = { x: W / 2, y: 2 }

const CAR = 14 // carriage length; the one you board stands at x 1 to 15
const DOORS = [3.5, 7, 10.5] // along a carriage
const SEATS = [
	[0.4, 2.8],
	[4.2, 6.3],
	[7.7, 9.8],
	[11.2, 13.6],
]
const FIRST = 10 // seconds until the first train
const HEADWAY = 20 // between trains, each way in turn
const SLIDE = 4 // a train pulling in or out without you
const DWELL = 9
const SHUT = 1.2 // doors
const SPEED = 8 // tiles a second, cruising
const RUN_UP = 25 // tiles to reach it, and to stop again
const LAMPS = 5 // apart along the tunnel

const smooth = (t) => t * t * (3 - 2 * t)
const median = (v) => [...v].sort((a, b) => a - b)[v.length >> 1]

// Stations from the map's entrances, in line order, each with its entrances
// as doors you can go down.
export function stationsOf(world) {
	const all = (world.transit ?? []).filter((t) => t.kind === 'ubahn')
	const free = (x, y) => !SOLID.has(world.tileAt(x, y))
	const stations = new Map()
	for (const name of new Set(Object.values(LINES).flatMap((l) => l.stops))) {
		let at = all.filter((t) => t.name === name && t.lines.length)
		// Some stations' entrances are only named for the streets they come up on.
		if (!at.length) at = all.filter((t) => !t.lines.length && t.name.split(/[;/]/).includes(name))
		if (!at.length) continue
		const mx = median(at.map((t) => t.x))
		const my = median(at.map((t) => t.y))
		at = at.filter((t) => Math.hypot(t.x - mx, t.y - my) < 80)
		const station = { name, x: 0, y: 0, services: [], entrances: [] }
		for (const t of at) {
			station.x += t.x / at.length
			station.y += t.y / at.length
			// Step off the stairs onto whichever side is open, pavement first.
			let best = null
			for (let i = 0; i < 8; i++) {
				const a = (i * Math.PI) / 4
				const nx = Math.cos(a)
				const ny = Math.sin(a)
				if (!free(t.x + nx * 0.6, t.y + ny * 0.6) || !free(t.x + nx * 1.2, t.y + ny * 1.2)) continue
				const score = world.tileAt(t.x + nx * 0.6, t.y + ny * 0.6) === T.SIDEWALK ? 0 : 1
				if (!best || score < best.score) best = { nx, ny, score }
			}
			const { nx, ny } = best ?? { nx: 0, ny: 1 }
			const out = 0.6
			station.entrances.push({
				kind: 'ubahn',
				name,
				station,
				place: null,
				x: t.x,
				y: t.y,
				nx,
				ny,
				ex: -ny,
				ey: nx,
				out,
				stand: { x: t.x + nx * out, y: t.y + ny * out },
			})
		}
		stations.set(name, station)
	}
	for (const [line, { stops, ends }] of Object.entries(LINES)) {
		const on = stops.map((s) => stations.get(s)).filter(Boolean)
		on.forEach((s, i) => {
			if (on[i + 1]) s.services.push({ line, to: ends[1], next: on[i + 1], dir: 1 })
			if (on[i - 1]) s.services.push({ line, to: ends[0], next: on[i - 1], dir: -1 })
		})
	}
	return [...stations.values()].filter((s) => s.services.length)
}

export function entranceLookup(stations) {
	const doors = stations.flatMap((s) => s.entrances)
	return (x, y) => {
		let best = null
		let bestD = 1.3
		for (const e of doors) {
			const d = Math.hypot(x - e.x, y - e.y)
			if (d < bestD) [best, bestD] = [e, d]
		}
		return best
	}
}

export function createUbahn(gradient) {
	const scene = new THREE.Scene()
	scene.background = new THREE.Color('#15181c')
	const toon = (color, map = null) => new THREE.MeshToonMaterial({ color, map, gradientMap: gradient })
	const box = (x0, y0, x1, y1, h, z = 0) => new THREE.BoxGeometry(x1 - x0, y1 - y0, h).translate((x0 + x1) / 2, -(y0 + y1) / 2, z + h / 2)
	const mesh = (parts, material, cast = true) => {
		const m = new THREE.Mesh(mergeGeometries(parts), material)
		m.castShadow = cast
		m.receiveShadow = true
		return m
	}

	// Everything outside the train, which slides past while you ride: the
	// platform, and tunnel either side of it.
	const outside = new THREE.Group()
	const FAR = 110
	outside.add(
		mesh([box(-FAR, 0.5, W + FAR, EDGE, 0.02)], toon('#2A2826'), false),
		mesh(
			[box(-FAR, 0, W + FAR, 0.5, 2.4), box(-FAR, EDGE, -4, EDGE + 0.6, 2.4), box(W + 4, EDGE, W + FAR, EDGE + 0.6, 2.4)],
			toon('#3A3F45'),
		),
		mesh([box(-FAR, 1.3, W + FAR, 1.38, 0.08), box(-FAR, 2.42, W + FAR, 2.5, 0.08)], toon('#8C8F93'), false),
		mesh([box(-4, EDGE, W + 4, D, 0.04)], toon('#B9B3A6'), false),
		mesh([box(-4, EDGE, W + 4, EDGE + 0.25, 0.05)], toon('#E7E2D2'), false),
		mesh(
			[box(-4, DOOR_Y, W / 2 - 1, D, 2.4), box(W / 2 + 1, DOOR_Y, W + 4, D, 2.4), box(W / 2 - 1, DOOR_Y + 0.3, W / 2 + 1, D, 2.4)],
			toon('#C9B98F'),
		),
		mesh([box(3.75, 5.75, 4.25, 6.25, 2.4), box(11.75, 5.75, 12.25, 6.25, 2.4)], toon('#7E8C86')),
		mesh(
			[0, 1, 2, 3].map((i) => box(W / 2 - 0.9, DOOR_Y - 0.2 + i * 0.12, W / 2 + 0.9, DOOR_Y - 0.12 + i * 0.12, 0.05 + i * 0.12)),
			toon('#8A877E'),
		),
	)
	const lampSpots = []
	for (let x = -FAR; x <= W + FAR; x += LAMPS) {
		lampSpots.push([x, 0.55])
		if (x < -4 || x > W + 4) lampSpots.push([x, EDGE - 0.05])
	}
	const lamps = new THREE.InstancedMesh(
		new THREE.BoxGeometry(0.5, 0.1, 0.12),
		new THREE.MeshBasicMaterial({ color: '#FFE9A8' }),
		lampSpots.length,
	)
	lampSpots.forEach(([x, y], i) => lamps.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, -y, 1.7)))
	outside.add(lamps)

	const sign = document.createElement('canvas')
	sign.width = 2048
	sign.height = 300
	const signTex = new THREE.CanvasTexture(sign)
	signTex.colorSpace = THREE.SRGBColorSpace
	signTex.anisotropy = 8
	const ink = new THREE.MeshBasicMaterial({ color: INK })
	const board = new THREE.Mesh(new THREE.BoxGeometry(9, 1.3, 0.08), [ink, ink, ink, ink, toon('#fff', signTex), ink])
	board.position.set(W / 2, -4.4, 1.9)
	board.rotation.x = Math.atan2(1.2, 1.6)
	outside.add(board)
	scene.add(outside)

	// Three carriages, the middle one the one you get into.
	const train = new THREE.Group()
	const walls = []
	const seats = []
	const floors = []
	const leaves = []
	const leafMaterial = toon('#E2C619')
	for (const at of [1 - CAR - 1, 1, 1 + CAR + 1]) {
		walls.push(box(at, 0.8, at + CAR, 1, 1.25), box(at, 0.8, at + 0.2, 3, 1.25), box(at + CAR - 0.2, 0.8, at + CAR, 3, 1.25))
		let x = at
		for (const d of DOORS) {
			walls.push(box(x, 2.8, at + d - 0.6, 3, 1.25))
			x = at + d + 0.6
			for (const side of [-1, 1]) {
				const leaf = new THREE.Mesh(box(-0.3, 2.82, 0.3, 2.98, 1.2), leafMaterial)
				leaf.userData = { x: at + d + side * 0.3, side }
				leaf.position.x = leaf.userData.x
				leaves.push(leaf)
				train.add(leaf)
			}
		}
		walls.push(box(x, 2.8, at + CAR, 3, 1.25))
		for (const [a, b] of SEATS) seats.push(box(at + a, 1, at + b, 1.45, 0.45), box(at + a, 2.35, at + b, 2.8, 0.45))
		floors.push(box(at + 0.2, 1, at + CAR - 0.2, 2.8, 0.03))
	}
	train.add(mesh(walls, toon('#F0D722')), mesh(seats, toon('#2F4A73')), mesh(floors, toon('#9AA0A6'), false))
	train.visible = false
	scene.add(train)

	scene.add(new THREE.AmbientLight('#d8dce0', 1.1))
	const light = new THREE.DirectionalLight('#fff4e2', 2)
	light.target.position.set(W / 2, -D / 2, 0)
	light.position.copy(light.target.position).addScaledVector(new THREE.Vector3(0.25, 0.45, -1).normalize(), -20)
	light.castShadow = true
	light.shadow.mapSize.set(1024, 1024)
	light.shadow.bias = -0.0005
	Object.assign(light.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 })
	scene.add(light, light.target)

	function paintSign(station) {
		const g = sign.getContext('2d')
		const { width: w, height: h } = sign
		g.fillStyle = '#115d91'
		g.fillRect(0, 0, w, h)
		g.strokeStyle = CREAM
		g.lineWidth = 12
		g.strokeRect(24, 24, w - 48, h - 48)
		posterText(g, station.name, w / 2, h * 0.52, 190, w - 200)
		signTex.needsUpdate = true
	}

	let station = null
	let exit = null // the entrance you'll come up by
	let state = 'waiting'
	let t = 0
	let turn = 0
	let service = null
	let doors = 0
	let ride = null
	const where = { x: 0, y: 0 }

	const aboard = (p) => p.y < 2.9 && p.x > 1 && p.x < 1 + CAR
	const inDoorway = (p) => p.y > 2.7 && p.y < EDGE + 0.2
	const coming = () => station.services[turn % station.services.length]

	function arrive(s) {
		station = s
		paintSign(s)
	}

	function setShop(entrance) {
		exit = entrance
		arrive(entrance.station)
		Object.assign(where, entrance.stand)
		state = 'waiting'
		t = FIRST
		ride = null
		doors = 0
		train.visible = false
		outside.position.x = 0
	}

	function update(dt, player) {
		t -= dt
		const on = aboard(player)
		doors += Math.sign((state === 'open' ? 1 : 0) - doors) * Math.min(Math.abs((state === 'open' ? 1 : 0) - doors), dt / SHUT)
		for (const leaf of leaves) leaf.position.x = leaf.userData.x + leaf.userData.side * doors * 0.55
		if (state === 'waiting' && t <= 0) {
			service = coming()
			turn++
			state = 'arriving'
			t = SLIDE
			train.visible = true
		}
		if (state === 'arriving') {
			train.position.x = -50 * (Math.max(0, t) / SLIDE) ** 2
			if (t <= 0) [state, t] = ['open', DWELL]
		}
		if (state === 'open' && t <= 0 && service.next && !inDoorway(player)) [state, t] = ['closing', SHUT]
		if (state === 'closing' && t <= 0) {
			if (on) {
				state = 'riding'
				const dist = Math.hypot(service.next.x - station.x, service.next.y - station.y)
				// A whole number of lamps between the run-up and the run-in, so they
				// don't jump when the tunnel hands over to the next platform.
				ride = { from: station, covered: 0, dist: 2 * RUN_UP + Math.max(0, LAMPS * Math.round((dist - 2 * RUN_UP) / LAMPS)) }
			} else [state, t] = ['leaving', SLIDE]
		}
		if (state === 'leaving') {
			train.position.x = 50 * (1 - Math.max(0, t) / SLIDE) ** 2
			if (t <= 0) {
				state = 'waiting'
				t = HEADWAY
				train.visible = false
			}
		}
		if (state === 'riding') {
			const { dist } = ride
			const ease = Math.min(ride.covered, dist - ride.covered)
			ride.covered = Math.min(dist, ride.covered + Math.max(0.6, SPEED * Math.min(1, Math.sqrt(ease / RUN_UP))) * dt)
			const c = ride.covered
			outside.position.x = c < RUN_UP ? -c : dist - c <= RUN_UP ? dist - c : -RUN_UP - ((((c - RUN_UP) % LAMPS) + LAMPS) % LAMPS)
			const k = smooth(c / dist)
			const to = service.next
			where.x = station.x + (to.x - station.x) * k
			where.y = station.y + (to.y - station.y) * k
			if (c >= dist) {
				arrive(to)
				exit = to.entrances[0]
				Object.assign(where, exit.stand)
				const onward = to.services.find((s) => s.line === service.line && s.dir === service.dir)
				service = onward ?? { ...service, next: null }
				turn = Math.max(0, to.services.indexOf(onward)) + 1
				ride = null
				outside.position.x = 0
				;[state, t] = ['open', DWELL]
			}
		}
		// The train ends here for you: it waits until you've stepped off.
		if (state === 'open' && !service.next && !on && t <= 0) [state, t] = ['leaving', SLIDE]
	}

	const inRect = (x, y, x0, y0, x1, y1) => x > x0 && x < x1 && y > y0 && y < y1
	const world = {
		tileAt(x, y) {
			if (x < WALL || x > W - WALL || y < 1.05 || y > DOOR_Y) return T.BUILDING
			const docked = (state === 'open' || state === 'closing' || state === 'riding') && train.visible
			if (y >= EDGE)
				return state === 'riding' || inRect(x, y, 3.65, 5.65, 4.35, 6.35) || inRect(x, y, 11.65, 5.65, 12.35, 6.35) ? T.BUILDING : T.GROUND
			if (!docked || x < 1.25 || x > CAR + 0.75) return T.BUILDING
			if (y > 2.75) return doors > 0.9 && DOORS.some((d) => Math.abs(x - 1 - d) < 0.5) ? T.GROUND : T.BUILDING
			if (y < 1.5 || y > 2.3) return SEATS.some(([a, b]) => x > 1 + a && x < 1 + b) ? T.BUILDING : T.GROUND
			return T.GROUND
		},
	}

	return {
		scene,
		world,
		setShop,
		update,
		DOOR,
		ENTRY,
		MIDDLE,
		exit: () => exit,
		where: () => where,
		aboard,
		// What the platform or the carriage says, for the line under the device.
		note(player) {
			if (state === 'riding') return `${service.line} · Nächster Halt: ${service.next.name}`
			if (aboard(player))
				return service.next ? `${service.line} → ${service.to} · ${station.name}` : `${station.name}. Endstation, bitte aussteigen.`
			if (state === 'waiting') {
				const s = coming()
				return `${s.line} → ${s.to} in ${Math.ceil(t + SLIDE)} s`
			}
			return `${service.line} → ${service.to}`
		},
	}
}
