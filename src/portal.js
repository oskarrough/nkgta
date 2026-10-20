import * as THREE from 'three'

// A tear in the air that shows another place, live and in parallax. The far view is drawn from
// the viewing camera carried through the tear (place → exit) into a target the size of the
// drawing buffer, scissored to the tear's rect on screen, its near plane bent onto the exit
// (Lengyel's oblique clip) so nothing in front of the exit shows through. The hole samples it in
// screen space. The rim is glitter in alternating pink and cyan bands with thin white seams.
// Closed, it draws and renders nothing.
//
// Ported from dodgethis (src/core/portal.js). Changes for NK GTA: `up` for a z-up world, `clip`
// to skip the oblique near plane (the ink pass reads depth, and a top-down camera never has
// anything in front of the exit), `sparkSize` for a camera thirty tiles up, and `flash()`.

const DEFAULTS = {
	scene: null, // the far scene; may be the near scene itself
	draw: null, // (target, camera) => draw the far view yourself; default renderer.render(scene, camera)
	layer: 0,
	radius: 1.9, // half-height of the open tear, metres
	floor: undefined, // ground distance below the centre for the light spill; default radius, null = none
	colors: ['#ff6fcf', '#5ff0ff', '#ffffff'], // two alternating bands, then the seams and sparks
	openTime: 1.5,
	closeTime: 0.9,
	popTime: 0.45,
	sparks: 2000,
	samples: 4,
	up: new THREE.Vector3(0, 1, 0), // the world's up, which the tear's long axis leans towards
	clip: true, // bend the far view's near plane onto the exit
	sparkSize: 1, // spark size multiplier
}

// Walking through needs a hole this open; the test page's camera swap needs it too.
const PASSABLE = 0.35

// One shape for the hole, the glitter and the crossing test: a slit that rips to full height, then
// widens into a ragged oval. Collapsing runs it backwards, so the oval narrows to a slit first.
const SHAPE = /* glsl */ `
	uniform float uOpen;
	uniform float uTime;
	uniform float uQuiver;
	uniform float uFlare;
	uniform float uPop;
	uniform vec3 uColorA;
	uniform vec3 uColorB;
	uniform vec3 uColorC;
	vec2 tearRadii(float t) {
		return vec2(mix(0.004, 0.68, smoothstep(0.15, 1.0, t)), mix(0.03, 1.0, smoothstep(0.0, 0.5, t)));
	}
	float rag(float a, float t) {
		float n = sin(a * 5.0 + uTime * 1.1) * 0.45 + sin(a * 11.0 - uTime * 1.9) * 0.3
			+ sin(a * 23.0 + uTime * 3.3) * 0.25;
		float shiver = sin(a * 31.0 + uTime * 41.0) * uQuiver * 0.05;
		return 1.0 + n * mix(0.2, 0.05, smoothstep(0.0, 1.0, t)) + sin(uTime * 1.7) * 0.015 + shiver;
	}
	float edgeAt(float a, float t) {
		vec2 r = tearRadii(t);
		float c = cos(a) / r.x, s = sin(a) / r.y;
		return inversesqrt(c * c + s * s) * rag(a, t);
	}
	// Bands drift round the rim: colour A where positive, B where negative, C on the seams.
	float band(float a) {
		return sin(a * 3.0 + uTime * 0.5 + sin(a * 7.0 - uTime * 0.8) * 0.9);
	}
	vec3 tearColor(float a) {
		float b = band(a);
		return mix(uColorC, b > 0.0 ? uColorA : uColorB, smoothstep(0.06, 0.28, abs(b)));
	}
`

const smooth = (a, b, x) => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
	return t * t * (3 - 2 * t)
}
const lerp = (a, b, t) => a + (b - a) * t
const easeOut = (k) => 1 - (1 - k) ** 3

export function createPortal(renderer, options = {}) {
	const o = { ...DEFAULTS, ...options }
	const R = o.radius
	const floor = o.floor === undefined ? R : o.floor
	const [colorA, colorB, colorC] = o.colors.map((c) => new THREE.Color(c))

	const uniforms = {
		uOpen: { value: 0 },
		uTime: { value: 0 },
		uQuiver: { value: 0 },
		uFlare: { value: 0 },
		uPop: { value: 0 },
		uR: { value: R },
		uRes: { value: new THREE.Vector2(1, 1) },
		uPx: { value: 1 },
		uColorA: { value: colorA },
		uColorB: { value: colorB },
		uColorC: { value: colorC },
		uSpark: { value: o.sparkSize },
		tFar: { value: null },
	}
	// Premultiplied: the hole replaces what's behind it; rim light keeps its hue on bright ground.
	const premultiplied = {
		transparent: true,
		depthWrite: false,
		blending: THREE.CustomBlending,
		blendSrc: THREE.OneFactor,
		blendDst: THREE.OneMinusSrcAlphaFactor,
	}

	const object = new THREE.Group()
	object.name = 'portal'
	object.visible = false
	object.up.copy(o.up)

	const hole = new THREE.Mesh(
		new THREE.PlaneGeometry(R * 2.9, R * 2.9),
		new THREE.ShaderMaterial({
			uniforms,
			vertexShader: /* glsl */ `
				uniform float uR;
				varying vec2 vP;
				void main() {
					vP = position.xy / uR;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}`,
			fragmentShader: /* glsl */ `
				${SHAPE}
				uniform sampler2D tFar;
				uniform vec2 uRes;
				varying vec2 vP;
				void main() {
					float a = atan(vP.y, vP.x);
					vec3 tint = tearColor(a);
					if (uOpen <= 0.0) {
						// The pop: a last star where the tear was.
						float r2 = dot(vP, vP);
						float f = exp(-r2 * 60.0 / (0.15 + uPop * 1.5)) * (1.0 - uPop) * (1.0 - uPop) * step(0.0001, uPop);
						if (f < 0.004) discard;
						gl_FragColor = vec4(mix(uColorC, tint, 0.4) * f, f);
					} else {
						float d = length(vP) / edgeAt(a, uOpen);
						if (d < 1.0) {
							vec2 uv = gl_FragCoord.xy / uRes;
							float rim = smoothstep(0.72, 1.0, d);
							vec2 dir = vP / max(length(vP), 1e-4);
							vec2 bend = (vec2(-dir.y, dir.x) * sin(uTime * 1.3 + a * 2.0) * 0.6 + dir) * rim * rim * 0.014;
							vec3 col = vec3(
								texture2D(tFar, uv + bend * 1.4).r,
								texture2D(tFar, uv + bend).g,
								texture2D(tFar, uv + bend * 0.6).b);
							float edge = pow(rim, 10.0) * (0.55 + uFlare);
							col = mix(col, tint, min(edge, 0.85));
							gl_FragColor = vec4(col, 1.0);
						} else {
							// Tongues: the glow reaches further in some directions than others.
							float reach = mix(7.0, 30.0, 0.5 + 0.5 * sin(a * 13.0 + uTime * 2.3 + sin(a * 5.0) * 2.0));
							float h = exp(-(d - 1.0) * reach) * (0.5 + uFlare * 0.8) * smoothstep(0.0, 0.2, uOpen);
							h = min(h, 0.85);
							if (h < 0.004) discard;
							gl_FragColor = vec4(tint * h, h);
						}
					}
					#include <colorspace_fragment>
				}`,
			side: THREE.DoubleSide,
			...premultiplied,
		}),
	)
	hole.renderOrder = 50
	hole.frustumCulled = false

	const count = o.sparks
	const seeds = new Float32Array(count * 4)
	const kinds = new Float32Array(count * 2)
	for (let i = 0; i < count; i++) {
		seeds.set([Math.random() * Math.PI * 2, Math.random(), Math.random(), 0.15 + Math.random() * 0.5], i * 4)
		// A seam spark or a band spark, and its size.
		kinds.set([Math.random() < 0.12 ? 1 : 0, 0.03 + Math.random() ** 3 * 0.1], i * 2)
	}
	const sparkGeometry = new THREE.BufferGeometry()
	sparkGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
	sparkGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
	sparkGeometry.setAttribute('aKind', new THREE.BufferAttribute(kinds, 2))
	const sparks = new THREE.Points(
		sparkGeometry,
		new THREE.ShaderMaterial({
			uniforms,
			vertexShader: /* glsl */ `
				${SHAPE}
				uniform float uR;
				uniform float uPx;
				uniform float uSpark;
				attribute vec4 aSeed; // angle, spread, phase, speed
				attribute vec2 aKind; // seam, size
				varying vec3 vColor;
				varying float vAlpha;
				void main() {
					float life = fract(uTime * aSeed.w + aSeed.z);
					float a = aSeed.x + life * 0.5 * (aSeed.y - 0.5);
					float twinkle = pow(0.5 + 0.5 * sin(uTime * (6.0 + aSeed.w * 30.0) + aSeed.z * 40.0), 8.0);
					vec3 local;
					if (uPop > 0.0) {
						// The pop: everything left flies off the point where the tear shut.
						float fly = uPop * (0.4 + 1.6 * aSeed.y) * (0.6 + aSeed.w);
						local = vec3(vec2(cos(aSeed.x), sin(aSeed.x)) * fly, (aSeed.z - 0.5) * fly) * uR;
						vAlpha = (1.0 - uPop) * (1.0 - uPop) * (0.5 + 0.9 * twinkle) * step(0.55, aSeed.y);
					} else {
						float e = edgeAt(a, uOpen);
						float drift = 1.0 + life * life * (0.6 + uFlare * 0.6) * aSeed.y;
						local = vec3(vec2(cos(a), sin(a)) * e * drift, (aSeed.y - 0.5) * 0.16 * (0.3 + life)) * uR;
						// A spark before the rip: a few bright ones on the centre.
						float spark = 1.0 - smoothstep(0.0, 0.1, uOpen);
						vAlpha = sin(life * 3.14159) * (0.5 + 0.9 * twinkle) * smoothstep(0.0, 0.02, uOpen)
							* mix(1.0, step(0.93, aSeed.y) * 2.5, spark) * (1.0 + uFlare * 0.6);
					}
					vColor = aKind.x > 0.5 ? uColorC : tearColor(a);
					vec4 mv = modelViewMatrix * vec4(local, 1.0);
					gl_Position = projectionMatrix * mv;
					gl_PointSize = clamp(aKind.y * uSpark * (0.6 + twinkle) * uPx / -mv.z, 1.0, 48.0);
				}`,
			fragmentShader: /* glsl */ `
				varying vec3 vColor;
				varying float vAlpha;
				void main() {
					vec2 c = gl_PointCoord - 0.5;
					float core = exp(-dot(c, c) * 60.0);
					float rays = max(0.0, 1.0 - abs(c.x) * 14.0) * max(0.0, 1.0 - abs(c.y) * 2.2)
						+ max(0.0, 1.0 - abs(c.y) * 14.0) * max(0.0, 1.0 - abs(c.x) * 2.2);
					float v = min(1.0, (core + rays * 0.5) * vAlpha);
					if (v < 0.004) discard;
					// Mostly over, a little added: overlapping sparks keep their colour instead of going white.
					gl_FragColor = vec4(vColor * v, v * 0.8);
					#include <colorspace_fragment>
				}`,
			...premultiplied,
		}),
	)
	sparks.renderOrder = 51
	sparks.frustumCulled = false
	object.add(hole, sparks)

	// Light spill: the tear's colour pooled on the ground either side of it, flickering with the rim.
	let spill = null
	if (floor !== null) {
		spill = new THREE.Mesh(
			new THREE.PlaneGeometry(R * 3.4, R * 2.6).rotateX(-Math.PI / 2).translate(0, -floor + 0.01, 0),
			new THREE.ShaderMaterial({
				uniforms,
				vertexShader: /* glsl */ `
					uniform float uR;
					varying vec2 vP;
					void main() {
						vP = position.xz / uR;
						gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
					}`,
				fragmentShader: /* glsl */ `
					${SHAPE}
					varying vec2 vP;
					void main() {
						vec2 r = tearRadii(uOpen);
						vec2 q = vP / vec2(r.x * 1.4 + 0.06, 0.5);
						float glow = exp(-dot(q, q) * 1.6) * smoothstep(0.0, 0.3, uOpen);
						float flicker = 0.85 + 0.15 * sin(uTime * 7.3) * sin(uTime * 3.1 + 1.0);
						float h = min(0.5, glow * 0.45 * flicker * (1.0 + uFlare));
						if (h < 0.004) discard;
						// Pink pools on one side, cyan on the other, trading places slowly; never mixed to white.
						vec3 c = mix(uColorA, uColorB, smoothstep(-0.25, 0.25, sin(uTime * 0.4) * sign(vP.y) + vP.x * 0.3));
						gl_FragColor = vec4(c * h, h);
						#include <colorspace_fragment>
					}`,
				...premultiplied,
			}),
		)
		spill.renderOrder = 49
		spill.frustumCulled = false
		object.add(spill)
	}
	object.traverse((child) => child.layers.set(o.layer))

	// --- Animation ----------------------------------------------------------------------------

	let time = 0
	let openness = 0
	let phase = 'closed' // opening, open, collapsing, closed
	let tween = null // { from, to, start, duration, fresh }
	let popStart = -1
	let flare = 0

	function open() {
		if (phase === 'opening' || phase === 'open') return
		const fresh = openness <= 0
		phase = 'opening'
		popStart = -1
		flare = Math.max(flare, fresh ? 0.6 : 0.3)
		tween = { from: openness, to: 1, start: time, duration: o.openTime * (1 - openness), fresh }
	}

	function collapse() {
		if (phase === 'closed' || phase === 'collapsing') return
		phase = 'collapsing'
		flare = 1
		tween = { from: openness, to: 0, start: time, duration: o.closeTime * Math.max(0.3, openness) }
	}

	function animate(dt) {
		time += dt
		flare = Math.max(0, flare - dt * 2.2)
		if (tween) {
			const { from, to, start, duration, fresh } = tween
			const k = duration > 0 ? Math.min(1, (time - start) / duration) : 1
			if (to > from) {
				// Opening holds a beat as a spark, then rips.
				const e = fresh ? (k < 0.12 ? 0.04 * (k / 0.12) : 0.04 + 0.96 * easeOut((k - 0.12) / 0.88)) : easeOut(k)
				openness = fresh ? e : lerp(from, to, e)
			} else {
				// Collapsing: a breath held, then it snaps shut; the edge shivers as it goes.
				openness = lerp(from, to, k ** 2.4)
			}
			if (k >= 1) {
				openness = to
				tween = null
				if (to > 0) phase = 'open'
				else popStart = time
			}
		}
		let pop = 0
		if (popStart >= 0) {
			pop = (time - popStart) / o.popTime
			if (pop >= 1) {
				pop = 0
				popStart = -1
				phase = 'closed'
			}
		}
		uniforms.uTime.value = time
		uniforms.uOpen.value = openness
		uniforms.uFlare.value = flare
		uniforms.uQuiver.value = phase === 'collapsing' ? 1 - openness * 0.5 : 0
		uniforms.uPop.value = pop
	}

	// --- Geometry -----------------------------------------------------------------------------

	const exitMatrix = new THREE.Matrix4()
	let exitSet = false
	const through = new THREE.Matrix4() // near world → far world
	const inverse = new THREE.Matrix4()
	const v = new THREE.Vector3()

	function pose(target, position, facing) {
		const m = new THREE.Object3D()
		m.up.copy(o.up)
		m.position.copy(position)
		m.lookAt(v.copy(position).add(facing))
		m.updateMatrix()
		target.copy(m.matrix)
	}

	function place(position, facing) {
		object.position.copy(position)
		object.lookAt(v.copy(position).add(facing))
		object.updateMatrixWorld(true)
	}

	function exit(position, facing) {
		exitSet = !!position
		if (position) pose(exitMatrix, position, facing)
	}

	function syncThrough() {
		object.updateMatrixWorld(true)
		if (!exitSet) return through.identity()
		return through.multiplyMatrices(exitMatrix, inverse.copy(object.matrixWorld).invert())
	}

	const toLocal = (point) => object.worldToLocal(v.copy(point))

	function inHole(x, y) {
		if (openness < PASSABLE) return false
		const rx = lerp(0.004, 0.68, smooth(0.15, 1, openness)) * R * 0.9
		const ry = lerp(0.03, 1, smooth(0, 0.5, openness)) * R * 0.9
		return (x / rx) ** 2 + (y / ry) ** 2 < 1
	}

	function crossed(from, to) {
		const a = toLocal(from).clone()
		const b = toLocal(to)
		// Half-open sides, so a step that ends exactly on the plane counts once.
		if (a.z > 0 === b.z > 0) return false
		const t = a.z / (a.z - b.z)
		return inHole(lerp(a.x, b.x, t), lerp(a.y, b.y, t))
	}

	// The camera is in the hole, a hair from the plane and facing it: the hole fills the view, so
	// draw the far view itself (`view(camera)`) and pass `{ far: false }` to `update`.
	function covers(camera, eps = 0.08) {
		camera.updateMatrixWorld()
		const p = toLocal(camera.getWorldPosition(new THREE.Vector3())).clone()
		if (Math.abs(p.z) >= eps || !inHole(p.x, p.y)) return false
		const look = camera.getWorldDirection(new THREE.Vector3())
		inverse.copy(object.matrixWorld).invert()
		return look.transformDirection(inverse).z * Math.sign(p.z || 1) < -0.2
	}

	const farCamera = new THREE.PerspectiveCamera()
	const scratch = { s: new THREE.Vector3(), q: new THREE.Quaternion() }
	function view(camera) {
		farCamera.copy(camera)
		farCamera.matrix.multiplyMatrices(syncThrough(), camera.matrixWorld)
		farCamera.matrix.decompose(farCamera.position, farCamera.quaternion, scratch.s)
		farCamera.updateMatrixWorld(true)
		return farCamera
	}

	function toFar(point) {
		return point.clone().applyMatrix4(syncThrough())
	}

	// --- Far render ---------------------------------------------------------------------------

	let target = null
	const size = new THREE.Vector2()
	const clip = new THREE.Vector4()
	const q = new THREE.Vector4()
	const plane = new THREE.Plane()
	const corner = new THREE.Vector3()

	// The hole's rect on screen in drawing-buffer pixels, or null when it's off screen.
	function screenRect(camera) {
		let x0 = Infinity,
			y0 = Infinity,
			x1 = -Infinity,
			y1 = -Infinity
		for (const [sx, sy] of [
			[-1, -1],
			[1, -1],
			[1, 1],
			[-1, 1],
		]) {
			corner.set(sx * 0.8 * R, sy * 1.25 * R, 0).applyMatrix4(object.matrixWorld)
			corner.applyMatrix4(camera.matrixWorldInverse)
			if (corner.z > -camera.near) return [0, 0, size.x, size.y]
			corner.applyMatrix4(camera.projectionMatrix)
			x0 = Math.min(x0, corner.x)
			x1 = Math.max(x1, corner.x)
			y0 = Math.min(y0, corner.y)
			y1 = Math.max(y1, corner.y)
		}
		if (x1 < -1 || x0 > 1 || y1 < -1 || y0 > 1) return null
		// Padded for the rim's bend, which samples a little outside the hole.
		const pad = Math.ceil(size.x * 0.03)
		const px = (n, s) => Math.min(s, Math.max(0, ((n + 1) / 2) * s))
		const left = Math.max(0, Math.floor(px(x0, size.x)) - pad),
			bottom = Math.max(0, Math.floor(px(y0, size.y)) - pad)
		return [
			left,
			bottom,
			Math.min(size.x, Math.ceil(px(x1, size.x)) + pad) - left,
			Math.min(size.y, Math.ceil(px(y1, size.y)) + pad) - bottom,
		]
	}

	function renderFar(camera) {
		renderer.getDrawingBufferSize(size)
		uniforms.uRes.value.copy(size)
		if (!target) {
			target = new THREE.WebGLRenderTarget(size.x, size.y, {
				samples: o.samples,
				colorSpace: renderer.outputColorSpace,
			})
			uniforms.tFar.value = target.texture
		} else if (target.width !== size.x || target.height !== size.y) target.setSize(size.x, size.y)
		const rect = screenRect(camera)
		if (!rect) return
		target.scissor.set(...rect)
		target.scissorTest = true

		const far = view(camera)
		far.projectionMatrix.copy(camera.projectionMatrix)
		// Bend the near plane onto the exit so nothing on this side of it shows through.
		const side = toLocal(camera.getWorldPosition(corner)).z
		if (o.clip && far.isPerspectiveCamera && Math.abs(side) > 0.02) {
			const exitWorld = exitSet ? exitMatrix : object.matrixWorld
			const n = v.set(0, 0, -Math.sign(side)).transformDirection(exitWorld)
			plane.setFromNormalAndCoplanarPoint(n, corner.setFromMatrixPosition(exitWorld))
			plane.applyMatrix4(far.matrixWorldInverse)
			clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant)
			const e = far.projectionMatrix.elements
			q.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14])
			clip.multiplyScalar(2 / clip.dot(q))
			e[2] = clip.x
			e[6] = clip.y
			e[10] = clip.z + 1
			e[14] = clip.w
		}
		far.projectionMatrixInverse.copy(far.projectionMatrix).invert()

		const previous = renderer.getRenderTarget()
		const shown = object.visible
		object.visible = false
		if (o.draw) o.draw(target, far)
		else {
			renderer.setRenderTarget(target)
			renderer.clear()
			renderer.render(api.scene, far)
		}
		object.visible = shown
		renderer.setRenderTarget(previous)
	}

	function update(dt, camera, { far = true } = {}) {
		if (phase === 'closed' && !tween) {
			object.visible = false
			return
		}
		animate(dt)
		object.visible = phase !== 'closed'
		hole.visible = far || openness <= 0
		const px = renderer.getDrawingBufferSize(size).y
		uniforms.uPx.value = camera.isPerspectiveCamera ? px / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) : px
		if (far && openness > 0 && (api.scene || o.draw)) {
			camera.updateMatrixWorld()
			renderFar(camera)
		}
	}

	function dispose() {
		object.removeFromParent()
		object.traverse((child) => {
			child.geometry?.dispose()
			child.material?.dispose()
		})
		target?.dispose()
	}

	const api = {
		object,
		scene: o.scene,
		radius: R,
		place,
		exit,
		open,
		collapse,
		update,
		crossed,
		covers,
		view,
		toFar,
		dispose,
		// A burst of rim light and sparks, as when it first rips.
		flash: () => (flare = 1),
		get openness() {
			return openness
		},
		get phase() {
			return phase
		},
		get isOpen() {
			return phase === 'opening' || phase === 'open'
		},
	}
	return api
}
