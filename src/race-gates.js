// Race gates and the ghost, in the city. A gate is two posts with bunting
// strung between them, a chalk line across the ground and its letter on a
// round badge above, big enough to read from the overhead camera and seen
// through the houses in the chase camera. The next gate's badge is yellow
// and pulses. The ghost is your best run as a see-through stand-in of the
// vehicle you rode it in.
import * as THREE from 'three'
import { MODELS } from './models.js'
import { postsOf } from './race.js'
import { INK, POSTER_FONT } from './poster.js'

const POST = { height: 1.5, width: 0.12 }
const FLAG = { every: 0.32, width: 0.22, drop: 0.28 }
const BUNTING = ['#e23b2e', '#e8c21a', '#e7e7e5', '#115d91', '#2f6b3c']
const BADGE = { size: 1.5, next: 2.2, lift: 0.9 }
const COLORS = { next: '#e8c21a', later: '#e7e7e5', start: '#e8c21a' }
const GHOST = { color: '#8fe3ff', opacity: 0.5 }

const badges = new Map()
function badge(text, state) {
	const key = `${text}:${state}`
	if (badges.has(key)) return badges.get(key)
	const canvas = document.createElement('canvas')
	canvas.width = canvas.height = 128
	const g = canvas.getContext('2d')
	g.beginPath()
	g.arc(64, 64, 56, 0, Math.PI * 2)
	g.fillStyle = COLORS[state]
	g.fill()
	g.lineWidth = 10
	g.strokeStyle = INK
	g.stroke()
	g.fillStyle = INK
	g.font = `900 ${text.length > 1 ? 52 : 78}px ${POSTER_FONT}`
	g.textAlign = 'center'
	g.textBaseline = 'middle'
	g.fillText(text, 64, 70)
	const texture = new THREE.CanvasTexture(canvas)
	texture.colorSpace = THREE.SRGBColorSpace
	const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true })
	badges.set(key, material)
	return material
}

// Tile (x, y) sits at (x, -y) in the scene, as everywhere else, so headings turn the other way.
export function createRaceGates(scene, gradientMap, heightAt = () => 0) {
	const root = new THREE.Group()
	scene.add(root)
	const box = new THREE.BoxGeometry(1, 1, 1)
	const postMaterial = new THREE.MeshToonMaterial({ color: '#e7e7e5', gradientMap })
	const capMaterial = new THREE.MeshToonMaterial({ color: '#e23b2e', gradientMap })
	const ropeMaterial = new THREE.MeshBasicMaterial({ color: INK })
	const flagMaterial = new THREE.MeshToonMaterial({ vertexColors: true, side: THREE.DoubleSide, gradientMap })
	const chalk = {
		next: new THREE.MeshBasicMaterial({ color: '#f3d64a', polygonOffset: true, polygonOffsetFactor: -2 }),
		later: new THREE.MeshBasicMaterial({ color: '#f4f2ea', polygonOffset: true, polygonOffsetFactor: -2 }),
	}
	chalk.start = chalk.next

	let shown = ''
	let items = []

	function build(gate, label, state) {
		const group = new THREE.Group()
		const z = heightAt(gate.x, gate.y)
		const posts = postsOf(gate)
		for (const [x, y] of posts) {
			const post = new THREE.Mesh(box, postMaterial)
			post.scale.set(POST.width, POST.width, POST.height)
			post.position.set(x, -y, z + POST.height / 2)
			post.castShadow = true
			const cap = new THREE.Mesh(box, capMaterial)
			cap.scale.set(POST.width * 1.6, POST.width * 1.6, 0.14)
			cap.position.set(x, -y, z + POST.height)
			group.add(post, cap)
		}
		const [[ax, ay], [bx, by]] = posts
		const span = Math.hypot(bx - ax, by - ay)
		const mid = [(ax + bx) / 2, (ay + by) / 2]
		const across = Math.atan2(by - ay, bx - ax)
		const top = z + POST.height - 0.08
		const rope = new THREE.Mesh(box, ropeMaterial)
		rope.scale.set(span, 0.03, 0.03)
		rope.rotation.z = -across
		rope.position.set(mid[0], -mid[1], top)
		const line = new THREE.Mesh(new THREE.PlaneGeometry(span, 0.14), chalk[state])
		line.rotation.z = -across
		line.position.set(mid[0], -mid[1], z + 0.02)
		group.add(rope, line, bunting(ax, ay, bx, by, top))
		const sprite = new THREE.Sprite(badge(label, state))
		sprite.renderOrder = 10
		sprite.position.set(mid[0], -mid[1], z + POST.height + BADGE.lift)
		const size = state === 'later' ? BADGE.size : BADGE.next
		sprite.scale.set(size, size, 1)
		group.add(sprite)
		root.add(group)
		return { group, sprite, size, state }
	}

	// Little triangles hanging off the rope, in turn through the colours.
	function bunting(ax, ay, bx, by, top) {
		const span = Math.hypot(bx - ax, by - ay)
		const n = Math.max(2, Math.floor(span / FLAG.every))
		const ux = (bx - ax) / span
		const uy = (by - ay) / span
		const position = []
		const color = []
		const paint = new THREE.Color()
		for (let i = 0; i < n; i++) {
			const s = ((i + 0.5) / n) * span
			const cx = ax + ux * s
			const cy = ay + uy * s
			const h = FLAG.width / 2
			position.push(cx - ux * h, -(cy - uy * h), top, cx + ux * h, -(cy + uy * h), top, cx, -cy, top - FLAG.drop)
			paint.set(BUNTING[i % BUNTING.length])
			for (let k = 0; k < 3; k++) color.push(paint.r, paint.g, paint.b)
		}
		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3))
		geometry.computeVertexNormals()
		return new THREE.Mesh(geometry, flagMaterial)
	}

	function clear() {
		for (const item of items) {
			root.remove(item.group)
			item.group.traverse((o) => o.geometry !== box && o.geometry?.dispose())
		}
		items = []
	}

	// The ghost: one see-through box shape per kind of vehicle, swapped as needed.
	const ghostMaterial = new THREE.MeshBasicMaterial({ color: GHOST.color, transparent: true, opacity: GHOST.opacity, depthWrite: false })
	const ghost = new THREE.Group()
	ghost.visible = false
	root.add(ghost)
	let ghostKind = null
	function ghostShape(kind) {
		ghost.clear()
		const add = (l, w, h, x = 0, z = 0) => {
			const mesh = new THREE.Mesh(box, ghostMaterial)
			mesh.scale.set(l, w, h)
			mesh.position.set(x, 0, z + h / 2)
			ghost.add(mesh)
		}
		const model = MODELS[kind]
		if (model) {
			add(model.length, model.width, 0.3, 0, 0.06)
			add(model.length * 0.55, model.width * 0.85, 0.2, -model.length * 0.08, 0.36)
		} else if (kind === 'bike') {
			add(0.62, 0.1, 0.32, 0, 0.05)
			add(0.18, 0.22, 0.42, -0.05, 0.37)
			add(0.14, 0.14, 0.14, -0.02, 0.8)
		} else {
			add(0.22, 0.3, 0.5, 0, 0)
			add(0.16, 0.16, 0.16, 0, 0.52)
		}
		ghostKind = kind
	}

	let pulse = 0
	return {
		// `gates` is [{ gate, label, state }], state 'next', 'later' or 'start'.
		show(gates) {
			const key = gates.map((g) => `${g.gate.x},${g.gate.y},${g.label},${g.state}`).join('|')
			if (key !== shown) {
				shown = key
				clear()
				items = gates.map((g) => build(g.gate, g.label, g.state))
			}
		},
		// The ghost's pose, { x, y, angle, vehicle }, or null to hide it.
		ghost(pose) {
			ghost.visible = !!pose
			if (!pose) return
			if (pose.vehicle !== ghostKind) ghostShape(pose.vehicle)
			ghost.position.set(pose.x, -pose.y, heightAt(pose.x, pose.y))
			ghost.rotation.z = -pose.angle
		},
		update(dt, hidden) {
			root.visible = !hidden
			pulse += dt
			const k = 1 + Math.sin(pulse * 6) * 0.08
			for (const item of items) if (item.state !== 'later') item.sprite.scale.set(item.size * k, item.size * k, 1)
		},
	}
}
