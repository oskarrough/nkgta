// Going into a shop. E at the door tears the air open on the facade, showing
// the room inside, live and in parallax. Walk into the tear and it swells
// until it fills the view while the room swings upright, and you're inside.
// The tear stays open behind you at the shop door; walk back through it, or
// press E, and you're on the street where you left it.
import * as THREE from 'three'
import { createPortal } from './portal.js'
import { createInterior, DOOR, ENTRY } from './interior.js'
import { shopAt } from './shops.js'

const RADIUS = 1.25 // half-height of the open tear, tiles
const TILT = (60 * Math.PI) / 180 // leaning back against the wall, from upright, so the camera sees it
const WARP = 0.8 // seconds to swell and step through
const CLOSER = 1.6 // the camera comes in this much closer inside
const WANDER = 2.5 // walk this far from an open tear and it closes, tiles

const Z = new THREE.Vector3(0, 0, 1)
const smooth = (t) => t * t * (3 - 2 * t)
const angleOf = (n) => Math.atan2(n.y, n.x)
const turn = (a) => Math.atan2(Math.sin(a), Math.cos(a))

export function createVisit({ city3d, shops, player, pfand, say }) {
	const interior = createInterior(city3d.gradient)
	const portal = createPortal(city3d.renderer, {
		radius: RADIUS,
		up: Z,
		clip: false,
		floor: null,
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
	let armed = false // inside, the way out waits until you've let go of the keys
	// Traffic keeps running round the shop door while you're in, for the
	// street seen through the tear; this stands in for you there.
	const standIn = { x: 0, y: 0, speed: 0, car: null }

	// The tear for a door at `anchor`, where you stand, `out` tiles off its
	// wall, with `n` pointing from the wall to you: centred on the wall and
	// leaning back against it, foot on the ground.
	const position = new THREE.Vector3()
	const facing = new THREE.Vector3()
	function tear(anchor, n, out) {
		position.set(anchor.x - n.x * out, -(anchor.y - n.y * out), RADIUS * Math.cos(TILT))
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
		portal.place(...tear(here.anchor, here.n, here.out))
		// The far door faces the way you'd come out of it, turning to face
		// the way you're going in, which leaves the far side upright.
		const real = inside ? { x: -shop.nx, y: -shop.ny } : { x: -DOOR.nx, y: -DOOR.ny }
		const a = turn(angleOf(here.n) - angleOf(real)) * smooth(swing)
		portal.exit(...tear(inside ? shop.stand : ENTRY, rotated(real, a), here.out))
	}

	function open(s) {
		shop = s
		interior.setShop(s)
		aim(0)
		portal.open()
	}

	function startWarp() {
		warp = { t: 0, from: { x: player.x, y: player.y } }
		player.speed = 0
	}

	// Through to the other side, at the end of the warp.
	function cross() {
		portal.object.scale.setScalar(1)
		if (!inside) {
			inside = true
			Object.assign(player, { x: ENTRY.x, y: ENTRY.y, speed: 0, dir: -Math.PI / 2 })
			armed = false
			Object.assign(standIn, shop.stand)
			aim(0)
			portal.flash()
		} else {
			inside = false
			Object.assign(player, { x: shop.stand.x, y: shop.stand.y, speed: 0, dir: angleOf({ x: shop.nx, y: shop.ny }) })
			// It seals behind you.
			aim(0)
			portal.collapse()
		}
	}

	return {
		inside: () => inside,
		warping: () => !!warp,
		// Once the tear has swallowed most of the view, the street's markers go.
		indoors: () => inside || (!!warp && warp.t > 0.4),
		shop: () => (inside ? shop : null),
		// The world the player moves in.
		world: (city) => (inside ? interior.world : city),
		// Where traffic should centre on: you, or your stand-in at the shop door.
		street: () => (inside ? standIn : player),
		closer: () => (inside ? CLOSER : 1),

		// E: in or out, open or close. True if it was for us.
		use() {
			if (warp) return true
			if (inside) {
				startWarp()
				return true
			}
			if (player.car || player.onBike) return false
			const s = shopAt(shops, player.x, player.y)
			if (!s) return false
			if (portal.phase === 'closed') open(s)
			else if (s === shop) portal.isOpen ? portal.collapse() : portal.open()
			else portal.collapse()
			return true
		},

		update(dt, axis) {
			if (warp) {
				warp.t += dt / WARP
				const k = Math.min(1, warp.t)
				// Drawn to the tear's foot, and the tear swells past the screen edges.
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
				if (!axis.x && !axis.y) armed = true
				const dx = player.x - DOOR.x
				const dy = player.y - DOOR.y
				if (armed && Math.abs(dx) < 0.75 && Math.abs(dy) < 0.5 && pushing({ x: DOOR.nx, y: DOOR.ny })) startWarp()
				if (shop.kind === 'spaeti' && interior.atCounter(player.x, player.y)) pfand.cashIn(shop.name, say)
				return
			}
			if (!shop || portal.phase === 'closed') return
			if (player.car || player.onBike || Math.hypot(player.x - shop.stand.x, player.y - shop.stand.y) > WANDER) {
				portal.collapse()
				return
			}
			if (portal.openness > 0.4 && shopAt(shops, player.x, player.y) === shop && pushing({ x: shop.nx, y: shop.ny })) startWarp()
		},

		// Draw the frame: the street or the room, and the tear over it.
		render(cam, cars, dt) {
			frame.cam = cam
			frame.cars = cars
			const view = (frame.view = city3d.aim(cam))
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

		// What E would do here, for the HUD.
		hint() {
			if (warp) return ''
			if (inside) {
				if (shop.kind === 'spaeti' && interior.atCounter(player.x, player.y)) return pfand.bag.bottles ? '' : 'Pfand? Erst sammeln.'
				return 'E: raus auf die Straße'
			}
			if (player.car || player.onBike) return null
			const s = shopAt(shops, player.x, player.y)
			if (!s) return null
			return s === shop && portal.isOpen ? `Rein da · ${s.name}` : `E: ${s.name} betreten`
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
