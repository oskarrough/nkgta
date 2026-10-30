import * as THREE from 'three'
import { createPortal } from './portal.js'
import { createInterior, DOOR, ENTRY, MIDDLE } from './interior.js'
import { shopAt } from './shops.js'
import { createDoener } from './doener.js'

const RADIUS = 1.25 // half-height of the open tear, tiles
const TILT = (60 * Math.PI) / 180 // leaning back against the wall, from upright, so the camera sees it
const WARP = 0.8 // seconds to swell and step through
const CLOSER = 1.25 // the camera comes in this much closer inside
const SETTLE = 0.8 // and drifts most of the way to the room's middle, over this many seconds
const WANDER = 2.5 // walk this far from an open tear and it closes, tiles

const Z = new THREE.Vector3(0, 0, 1)
const smooth = (t) => t * t * (3 - 2 * t)
const angleOf = (n) => Math.atan2(n.y, n.x)
const turn = (a) => Math.atan2(Math.sin(a), Math.cos(a))

export function createVisit({ city3d, shops, player, pfand, say, heightAt = () => 0, opening }) {
	const interior = createInterior(city3d.gradient)
	const doener = createDoener(pfand.bag, say)
	const portal = createPortal(city3d.renderer, {
		radius: RADIUS,
		up: Z,
		clip: false,
		floor: RADIUS * Math.cos(TILT),
		level: true,
		samples: 0,
		sparkSize: 5,
		draw: (target, far) =>
			inside ? city3d.render(frame.cam, frame.cars, { view: far, target }) : city3d.draw(interior.scene, far, target),
	})
	const overlay = new THREE.Scene().add(portal.object)
	const frame = { cam: null, cars: [], view: null }

	let shop = null // the shop the tear opens onto
	let inside = false
	let warp = null // { t, from: { x, y } } while stepping through
	let going = false // E was pressed: step through as soon as the tear lets you
	let armed = true // just through a door, it waits until you've stopped pushing towards it
	let settle = 0 // how far the camera has drifted to the room's middle
	const focus = { x: 0, y: 0, speed: 0 }
	// Traffic keeps running round the shop door while you're in, for the
	// street seen through the tear; this stands in for you there.
	const standIn = { x: 0, y: 0, dir: 0, speed: 0, car: null }

	// The tear for a door at `anchor`, where you stand, `out` tiles off its
	// wall, with `n` pointing from the wall to you: centred on the wall and
	// leaning back against it, foot on the ground.
	const position = new THREE.Vector3()
	const facing = new THREE.Vector3()
	function tear(anchor, n, out, ground = 0) {
		position.set(anchor.x - n.x * out, -(anchor.y - n.y * out), ground + RADIUS * Math.cos(TILT))
		facing.set(n.x, -n.y, 0).multiplyScalar(Math.cos(TILT)).addScaledVector(Z, Math.sin(TILT))
		return [position, facing]
	}
	const rotated = (n, a) => ({ x: n.x * Math.cos(a) - n.y * Math.sin(a), y: n.x * Math.sin(a) + n.y * Math.cos(a) })

	// Near side and far side of the tear. Seen from the street, the room lies
	// behind the wall as if it were really there; stepping through, it swings
	// round (`swing` 0 to 1) until it's upright, as you'll stand in it.
	function near() {
		return inside
			? { anchor: DOOR, n: { x: DOOR.nx, y: DOOR.ny }, out: DOOR.out }
			: { anchor: shop.stand, n: { x: shop.nx, y: shop.ny }, out: shop.out }
	}
	function aim(swing) {
		const here = near()
		portal.place(...tear(here.anchor, here.n, here.out, inside ? 0 : heightAt(shop.stand.x, shop.stand.y)))
		// The far door faces the way you'd come out of it, turning to face
		// the way you're going in, which leaves the far side upright.
		const real = inside ? { x: -shop.nx, y: -shop.ny } : { x: -DOOR.nx, y: -DOOR.ny }
		const a = turn(angleOf(here.n) - angleOf(real)) * smooth(swing)
		portal.exit(...tear(inside ? shop.stand : ENTRY, rotated(real, a), here.out, inside ? heightAt(shop.stand.x, shop.stand.y) : 0))
	}

	function open(s) {
		if (s !== shop || portal.phase === 'closed') {
			shop = s
			interior.setShop(s)
			aim(0)
		}
		portal.open()
	}

	function startWarp() {
		going = false
		warp = { t: 0, from: { x: player.x, y: player.y } }
		player.speed = 0
	}

	function cross() {
		portal.object.scale.setScalar(1)
		if (!inside) {
			inside = true
			Object.assign(player, { x: ENTRY.x, y: ENTRY.y, speed: 0, dir: -Math.PI / 2 })
			armed = false
			Object.assign(standIn, shop.stand, { dir: angleOf({ x: shop.nx, y: shop.ny }), speed: 0 })
			aim(0)
			portal.flash()
		} else {
			inside = false
			Object.assign(player, { x: shop.stand.x, y: shop.stand.y, speed: 0, dir: angleOf({ x: shop.nx, y: shop.ny }) })
			// It seals behind you, and won't reopen until you stop walking at it.
			armed = false
			aim(0)
			portal.collapse()
		}
	}

	return {
		inside: () => inside,
		busy: () => inside || !!warp || portal.phase !== 'closed',
		warping: () => !!warp,
		indoors: () => inside || (!!warp && warp.t > 0.4),
		shop: () => (inside ? shop : null),
		choose: doener.choose,
		shiftChoice: (n) => doener.shift(n),
		room: () => (inside ? interior.scene : null),
		world: (city) => (inside ? interior.world : city),
		street: () => (inside ? standIn : player),
		closer: () => (inside ? CLOSER : 1),
		// What the camera follows: you, but inside drawn towards the middle of
		// the room so the board stays in view. Back to just you before you step
		// out, so the street lines up with the view through the tear.
		focus(dt) {
			const want = inside && !warp ? 0.7 : 0
			settle += Math.sign(want - settle) * Math.min(Math.abs(want - settle), dt / SETTLE)
			if (warp && inside) settle *= 1 - Math.min(1, warp.t * 2)
			if (!settle) return player
			focus.x = player.x + (MIDDLE.x - player.x) * settle
			focus.y = player.y + (MIDDLE.y - player.y) * settle
			focus.speed = player.speed
			return focus
		},

		use() {
			if (warp) return true
			if (inside) {
				if (doener.use()) return true
				startWarp()
				return true
			}
			if (player.car || player.onBike) return false
			const s = shopAt(shops, player.x, player.y)
			if (!s) return false
			if (!opening.isOpen(s.place)) {
				say(`${s.name} ist geschlossen.`)
				return true
			}
			open(s)
			going = true
			return true
		},

		update(dt, axis) {
			if (warp) {
				doener.update(false)
				warp.t += dt / WARP
				const k = Math.min(1, warp.t)
				const anchor = near().anchor
				const pull = smooth(Math.min(1, k * 1.4))
				player.x = warp.from.x + (anchor.x - warp.from.x) * pull
				player.y = warp.from.y + (anchor.y - warp.from.y) * pull
				portal.object.scale.setScalar(1 + (cover() - 1) * k ** 3)
				aim(k)
				if (k >= 1) {
					warp = null
					cross()
				}
				return
			}
			const pushing = (n) => -(axis.x * n.x + axis.y * n.y) > 0.3
			if (inside) {
				doener.update(shop.kind === 'doener' && interior.atCounter(player.x, player.y))
				const out = pushing({ x: DOOR.nx, y: DOOR.ny })
				if (!out) armed = true
				const dx = player.x - DOOR.x
				const dy = player.y - DOOR.y
				if (armed && out && Math.abs(dx) < 0.9 && dy > -0.6) startWarp()
				if (shop.kind === 'spaeti' && interior.atCounter(player.x, player.y)) pfand.cashIn(shop.name, say)
				return
			}
			if (shop && !opening.isOpen(shop.place) && portal.phase !== 'closed') {
				going = false
				portal.collapse()
			}
			const at = !player.car && !player.onBike && shopAt(shops, player.x, player.y)
			const walking = at && opening.isOpen(at.place) && pushing({ x: at.nx, y: at.ny }) && armed
			if (!at || !pushing({ x: at.nx, y: at.ny })) armed = true
			if (walking && (at !== shop || !portal.isOpen)) open(at)
			if (!shop || portal.phase === 'closed') return
			if (player.car || player.onBike || Math.hypot(player.x - shop.stand.x, player.y - shop.stand.y) > WANDER) {
				going = false
				portal.collapse()
				return
			}
			if (portal.openness > 0.4 && (going || (walking && at === shop))) startWarp()
		},

		render(cam, cars, dt) {
			frame.cam = cam
			frame.cars = cars
			// The room stands on flat ground of its own.
			const view = (frame.view = city3d.aim(inside ? { ...cam, ground: 0 } : cam))
			const active = portal.phase !== 'closed'
			if (active) portal.update(dt, view)
			if (inside) city3d.draw(interior.scene, view)
			else city3d.render(cam, cars, { view })
			if (!active) return
			const renderer = city3d.renderer
			renderer.autoClear = false
			renderer.render(overlay, view)
			renderer.autoClear = true
		},

		// What E does at a shop door, { action: 'shop' | 'exit' }, or a { note } to read instead.
		hint() {
			if (warp) return null
			if (inside) {
				if (doener.active()) return null
				if (shop.kind === 'spaeti' && interior.atCounter(player.x, player.y))
					return pfand.bag.bottles ? null : { note: 'Pfand? Erst sammeln.' }
				return { action: 'exit' }
			}
			if (player.car || player.onBike) return null
			const s = shopAt(shops, player.x, player.y)
			if (!s || !opening.isOpen(s.place)) return null
			return { action: 'shop' }
		},
	}

	// How much the tear must grow to cover the view, wherever it is on screen.
	function cover() {
		const view = frame.view
		const halfH = view.position.z * Math.tan(THREE.MathUtils.degToRad(view.fov / 2))
		const reach = halfH * Math.hypot(view.aspect, 1) + 2
		return reach / (0.68 * RADIUS * 0.8)
	}
}
