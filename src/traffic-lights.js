// Berlin's traffic lights in 3D: a thin dark pole on the kerb at each stop
// line, a black housing with three lamps of which only the lit ones glow, and
// at each crossing a pedestrian light either side with its Ampelmännchen. On
// the road a soft glow along the stop line in the light's colour, so the
// overhead view reads from the street, and at night a small pool of it by the
// pole. Each part is one instanced mesh for the whole city, no real lights;
// a frame only recolours the lights that changed.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { pointAt } from './roads.js'
import { LENGTH } from './car.js'
import { crossingLine } from './pedestrians.js'

const HOUSING = '#17191a'
const LIT = { red: '#ff3b2a', amber: '#ffb020', green: '#3ce36a' }
const DIM = { red: '#2c1512', amber: '#2a2110', green: '#10261a' }
const ROAD = { red: '#ff2a1a', redamber: '#ff2a1a', amber: '#ffa21a', green: '#2ee860' }
const LAMPS = { red: ['red'], redamber: ['red', 'amber'], amber: ['amber'], green: ['green'] }
const SLOTS = ['red', 'amber', 'green']
const FACE_DIM = 0.12 // the unlit Ampelmann, of full brightness

// Sizes in tiles (3 m), the pole at the origin, the lamps facing +x.
const CAR = { pole: 1.12, w: 0.17, d: 0.1, h: 0.46, z: 0.9, lamp: 0.11, gap: 0.14 }
const WALK = { pole: 0.74, w: 0.1, d: 0.07, h: 0.22, z: 0.63, face: 0.08, gap: 0.1 }

// 16×16, the East Berlin man in his hat: standing with his arms out, and striding.
const STAND = [
	'................',
	'......####......',
	'......####......',
	'....########....',
	'......####......',
	'......####......',
	'.......##.......',
	'.##############.',
	'.##..######..##.',
	'.....######.....',
	'.....######.....',
	'.....######.....',
	'.....##..##.....',
	'.....##..##.....',
	'.....##..##.....',
	'....###..###....',
]
const STRIDE = [
	'................',
	'......####......',
	'......####......',
	'....########....',
	'......####......',
	'......####......',
	'......###.......',
	'.....######.....',
	'....########....',
	'...##.####.##...',
	'..##..####..##..',
	'......####......',
	'.....##..##.....',
	'....##....##....',
	'...##......##...',
	'..###......###..',
]

const plain = (geo) => (geo.index ? geo.toNonIndexed() : geo)
const upright = (geo, z) => geo.rotateX(Math.PI / 2).translate(0, 0, z)

function head({ pole, w, d, h, z }) {
	return mergeGeometries(
		[upright(new THREE.CylinderGeometry(0.022, 0.026, pole, 6), pole / 2), new THREE.BoxGeometry(d, w, h).translate(d / 2, 0, z)].map(
			plain,
		),
	)
}

function figure(rows, color) {
	const canvas = document.createElement('canvas')
	canvas.width = canvas.height = 16
	const ctx = canvas.getContext('2d')
	ctx.fillStyle = '#0c0c0c'
	ctx.fillRect(0, 0, 16, 16)
	ctx.fillStyle = color
	rows.forEach((row, y) => [...row].forEach((c, x) => c === '#' && ctx.fillRect(x, y, 1, 1)))
	const texture = new THREE.CanvasTexture(canvas)
	texture.magFilter = texture.minFilter = THREE.NearestFilter
	texture.colorSpace = THREE.SRGBColorSpace
	return new THREE.MeshBasicMaterial({ map: texture })
}

// A soft patch on the asphalt in each instance's colour: a band fading back
// from the stop line, or a round pool that only shows at night.
function glow(pool, night) {
	return new THREE.ShaderMaterial({
		uniforms: { night },
		transparent: true,
		depthWrite: false,
		polygonOffset: true,
		polygonOffsetFactor: -2,
		vertexShader: `varying vec2 vUv; varying vec3 vColor;
			void main() { vUv = uv; vColor = instanceColor; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
		fragmentShader: `uniform float night; varying vec2 vUv; varying vec3 vColor;
			void main() {
				${
					pool
						? 'float a = (1.0 - smoothstep(0.1, 0.5, length(vUv - 0.5))) * night * 0.35;'
						: 'float a = (1.0 - smoothstep(0.32, 0.5, abs(vUv.x - 0.5))) * pow(1.0 - vUv.y, 2.0) * smoothstep(0.0, 0.08, vUv.y) * mix(0.5, 0.7, night);'
				}
				gl_FragColor = vec4(vColor, a);
				#include <colorspace_fragment>
			}`,
	})
}

// `lights` is the list from junctions.lights(), the same objects every frame.
export function createTrafficLights(scene, world, gradientMap, night, lights) {
	const heightAt = world.heightAt ?? (() => 0)
	const group = new THREE.Group()
	scene.add(group)
	const crossings = lights.map((l) => crossingLine(world, l.e))
	const walks = crossings.filter(Boolean).length * 2

	const housing = new THREE.MeshToonMaterial({ color: HOUSING, gradientMap })
	const mesh = (geometry, material, count, shadow = false) => {
		const m = new THREE.InstancedMesh(geometry, material, Math.max(1, count))
		m.count = count
		m.castShadow = shadow
		m.frustumCulled = false
		group.add(m)
		return m
	}
	const poles = mesh(head(CAR), housing, lights.length, true)
	const lamps = mesh(new THREE.BoxGeometry(0.08, CAR.lamp, CAR.lamp), new THREE.MeshBasicMaterial(), lights.length * 3)
	const walkPoles = mesh(head(WALK), housing, walks, true)
	const face = new THREE.PlaneGeometry(WALK.face, WALK.face).rotateY(Math.PI / 2).rotateX(Math.PI / 2)
	const standing = mesh(face, figure(STAND, LIT.red), walks)
	const walking = mesh(face, figure(STRIDE, LIT.green), walks)
	const bands = mesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), glow(false, night), lights.length)
	const pools = mesh(new THREE.PlaneGeometry(1, 1), glow(true, night), lights.length)

	const m = new THREE.Matrix4()
	const q = new THREE.Quaternion()
	const p = new THREE.Vector3()
	const s = new THREE.Vector3()
	const z = new THREE.Vector3(0, 0, 1)
	// Tile (x, y) sits at (x, -y), so angles turn the other way.
	const put = (target, i, x, y, h, angle, sx = 1, sy = 1) =>
		target.setMatrixAt(i, m.compose(p.set(x, -y, h), q.setFromAxisAngle(z, -angle), s.set(sx, sy, 1)))

	const heads = [] // per light, its two pedestrian lights' indices
	let k = 0
	lights.forEach((l, i) => {
		const cos = Math.cos(l.dir)
		const sin = Math.sin(l.dir)
		// On the pavement just past the kerb, facing the traffic it holds.
		const x = l.x - sin * 0.2
		const y = l.y + cos * 0.2
		const ground = heightAt(x, y)
		put(poles, i, x, y, ground, l.dir + Math.PI)
		SLOTS.forEach((_, n) => {
			const at = CAR.d + 0.03
			lamps.setMatrixAt(
				i * 3 + n,
				m.compose(
					p.set(x - cos * at, -(y - sin * at), ground + CAR.z + CAR.gap * (1 - n)),
					q.setFromAxisAngle(z, -(l.dir + Math.PI)),
					s.set(1, 1, 1),
				),
			)
		})
		const line = pointAt(l.e.lane, Math.min(l.e.len, l.e.stop + LENGTH / 2))
		put(bands, i, line.x, line.y, heightAt(line.x, line.y) + 0.03, line.dir - Math.PI / 2, l.e.twin ? l.e.w / 2 : l.e.w, 1.1)
		const px = l.x + sin * 0.5 - cos * 0.5
		const py = l.y - cos * 0.5 - sin * 0.5
		put(pools, i, px, py, heightAt(px, py) + 0.03, 0, 2.4, 2.4)
		const ends = crossings[i]
		if (!ends) return heads.push(null)
		heads.push([k, k + 1])
		for (const [a, b] of [ends, [...ends].reverse()]) {
			const angle = Math.atan2(b.y - a.y, b.x - a.x)
			const wx = a.x + cos * 0.3
			const wy = a.y + sin * 0.3
			const h = heightAt(wx, wy)
			put(walkPoles, k, wx, wy, h, angle)
			const fx = wx + Math.cos(angle) * (WALK.d + 0.003)
			const fy = wy + Math.sin(angle) * (WALK.d + 0.003)
			put(standing, k, fx, fy, h + WALK.z + WALK.gap / 2, angle)
			put(walking, k, fx, fy, h + WALK.z - WALK.gap / 2, angle)
			k++
		}
	})
	const color = new THREE.Color()
	for (const target of [poles, lamps, walkPoles, standing, walking, bands, pools]) {
		target.instanceMatrix.needsUpdate = true
		target.computeBoundingSphere()
	}
	// The shaders compile before the first frame, so the colours must be there.
	for (const target of [lamps, standing, walking, bands, pools]) target.setColorAt(0, color.setScalar(0))

	const shown = lights.map(() => ({ state: null, walk: null }))
	return {
		update() {
			pools.visible = night.value > 0.02
			let lit = false
			let walked = false
			lights.forEach((l, i) => {
				const was = shown[i]
				if (l.state !== was.state) {
					was.state = l.state
					lit = true
					SLOTS.forEach((slot, n) => lamps.setColorAt(i * 3 + n, color.set((LAMPS[l.state].includes(slot) ? LIT : DIM)[slot])))
					color.set(ROAD[l.state])
					bands.setColorAt(i, color)
					pools.setColorAt(i, color.set(LIT[LAMPS[l.state][0]]))
				}
				if (heads[i] && !!l.walk !== was.walk) {
					was.walk = !!l.walk
					walked = true
					for (const n of heads[i]) {
						standing.setColorAt(n, color.setScalar(was.walk ? FACE_DIM : 1))
						walking.setColorAt(n, color.setScalar(was.walk ? 1 : FACE_DIM))
					}
				}
			})
			if (lit) for (const target of [lamps, bands, pools]) if (target.instanceColor) target.instanceColor.needsUpdate = true
			if (walked) for (const target of [standing, walking]) if (target.instanceColor) target.instanceColor.needsUpdate = true
		},
	}
}
