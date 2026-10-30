import * as THREE from 'three'
import { MODELS } from './models.js'
import { postsOf } from './race.js'
import { INK, POSTER_FONT } from './poster.js'
import { badgeMaterial, throb } from './badge.js'

const POST = { height: 1.5, width: 0.12 }
const FLAG = { every: 0.32, width: 0.22, drop: 0.28 }
const BUNTING = ['#e23b2e', '#e8c21a', '#e7e7e5', '#115d91', '#2f6b3c']
const BADGE = { size: 1.5, next: 2.2, lift: 0.9 }
const COLORS = { next: '#e8c21a', later: '#e7e7e5', start: '#e8c21a' }
const GHOST = { color: '#8fe3ff', rival: '#ffb25c', opacity: 0.5 }
const NAME = { width: 4, lift: 1.6 }

const badge = (text, state) =>
	badgeMaterial(`${text}:${state}`, COLORS[state], (g) => {
		g.font = `900 ${text.length > 1 ? 52 : 78}px ${POSTER_FONT}`
		g.textAlign = 'center'
		g.textBaseline = 'middle'
		g.fillText(text, 64, 70)
	})

const tags = new Map()
function nameTag(name) {
	if (tags.has(name)) return tags.get(name)
	const canvas = document.createElement('canvas')
	canvas.width = 512
	canvas.height = 128
	const g = canvas.getContext('2d')
	g.font = `900 64px ${POSTER_FONT}`
	g.textAlign = 'center'
	g.textBaseline = 'middle'
	g.lineJoin = 'round'
	g.lineWidth = 16
	g.strokeStyle = INK
	g.strokeText(name, 256, 68, 490)
	g.fillStyle = '#ffb25c'
	g.fillText(name, 256, 68, 490)
	const texture = new THREE.CanvasTexture(canvas)
	texture.colorSpace = THREE.SRGBColorSpace
	const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true })
	tags.set(name, material)
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

	function createGhost(color, named) {
		const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: GHOST.opacity, depthWrite: false })
		const group = new THREE.Group()
		group.visible = false
		root.add(group)
		const body = new THREE.Group()
		group.add(body)
		let label = null
		let kind = null
		let shownName = null
		function shape(vehicle) {
			body.clear()
			const add = (l, w, h, x = 0, z = 0) => {
				const mesh = new THREE.Mesh(box, material)
				mesh.scale.set(l, w, h)
				mesh.position.set(x, 0, z + h / 2)
				body.add(mesh)
			}
			const model = MODELS[vehicle]
			if (model) {
				add(model.length, model.width, 0.3, 0, 0.06)
				add(model.length * 0.55, model.width * 0.85, 0.2, -model.length * 0.08, 0.36)
			} else if (vehicle === 'bike') {
				add(0.62, 0.1, 0.32, 0, 0.05)
				add(0.18, 0.22, 0.42, -0.05, 0.37)
				add(0.14, 0.14, 0.14, -0.02, 0.8)
			} else {
				add(0.22, 0.3, 0.5, 0, 0)
				add(0.16, 0.16, 0.16, 0, 0.52)
			}
			kind = vehicle
		}
		return (pose, name) => {
			group.visible = !!pose
			if (!pose) return
			if (pose.vehicle !== kind) shape(pose.vehicle)
			if (named && name !== shownName) {
				shownName = name
				if (label) group.remove(label)
				label = new THREE.Sprite(nameTag(name))
				label.renderOrder = 10
				label.scale.set(NAME.width, NAME.width / 4, 1)
				label.position.set(0, 0, NAME.lift)
				group.add(label)
			}
			group.position.set(pose.x, -pose.y, heightAt(pose.x, pose.y))
			group.rotation.z = -pose.angle
		}
	}
	const showGhost = createGhost(GHOST.color, false)
	const showRival = createGhost(GHOST.rival, true)

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
		// Poses, { x, y, angle, vehicle }, or null to hide: yours, and the
		// rival's of a shared race, tagged with their name.
		ghost: showGhost,
		rival: showRival,
		update(dt, hidden) {
			root.visible = !hidden
			pulse += dt
			const k = throb(pulse)
			for (const item of items) if (item.state !== 'later') item.sprite.scale.set(item.size * k, item.size * k, 1)
		},
	}
}
