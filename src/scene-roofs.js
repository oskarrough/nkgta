import { splitRoofWalls } from './measured-roofs.js'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { roofHatches, roofOf, roofSpots } from './map-image.js'
import { DETAIL_PX } from './chunks.js'
import { roofHeight, roofShape, roofTriangles } from './roofs.js'
import { pulse } from './scene-shader.js'

// Tile courses on pitched roofs: height between them in tiles of the map,
// the share of each that is dark line, and how dark.
const ROOF_TILES = { row: 0.18, line: 0.3, ink: 0.45 }
// Roof hatches, in tiles: side, height, and the lid's share of the side.
const HATCH = { size: 0.42, height: 0.14, lid: 0.78, frame: '#b9bdc0', lidColor: '#7e868d' }
// Chimney stacks on the roofs: size along and across the ridge and height,
// in tiles, and their brick and sooty plaster colours.
const CHIMNEY = { length: 0.75, width: 0.42, height: 0.42, colors: ['#8a4c38', '#7a6d64', '#9a5a42'] }

// Outlines come as flat [x, y, x, y, …] rings in tiles. In the scene y points
// north, so flip it, and sort the rings into outer walls and courtyards.
function footprint(rings) {
	const polys = rings
		.map((r) => {
			const pts = []
			for (let i = 0; i < r.length; i += 2) pts.push(new THREE.Vector2(r[i], -r[i + 1]))
			if (pts.length > 1 && pts[0].equals(pts.at(-1))) pts.pop()
			return pts
		})
		.filter((pts) => pts.length >= 3)
		.sort((a, b) => Math.abs(THREE.ShapeUtils.area(b)) - Math.abs(THREE.ShapeUtils.area(a)))
	const shapes = []
	for (const pts of polys) {
		const owner = shapes.find((s) => inside(pts[0], s.outer))
		if (owner) owner.holes.push(THREE.ShapeUtils.isClockWise(pts) ? pts : pts.reverse())
		else shapes.push({ outer: THREE.ShapeUtils.isClockWise(pts) ? pts.reverse() : pts, holes: [] })
	}
	return shapes
}

function inside(p, poly) {
	let hit = false
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const a = poly[i]
		const b = poly[j]
		if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x)) hit = !hit
	}
	return hit
}

// A building as the scene needs it: eaves height and outline in tiles, and
// a pitched roof if its roof is tiled and its outline allows one. `top` is
// the height of the roof at a point, over sea level, so to speak: a house
// stands on the lowest ground round it, and uphill its walls go into the
// slope, as on a real street.
export function house(b, n, world) {
	const tileM = world.tileM
	const h = b.h / tileM
	let base = Infinity
	for (const r of b.rings) for (let i = 0; i < r.length; i += 2) base = Math.min(base, world.heightAt(r[i], r[i + 1]))
	if (!Number.isFinite(base)) base = 0
	let parts = footprint(b.rings)
	const pitched = parts.length === 1 && roofOf(b, n).ridge
	const rings = [parts[0]?.outer, ...(parts[0]?.holes ?? [])].map((r) => r?.map((p) => [p.x, p.y]))
	const roof = b.roof ?? (pitched ? roofShape(rings, b.h, tileM) : null)
	if (roof?.kind === 'measured') parts = splitRoofWalls(parts, roof)
	// The building's axis, along its longest wall, for lining up tar paper.
	let axis = 0
	let longest = 0
	const outer = parts[0]?.outer ?? []
	outer.forEach((a, i) => {
		const e = outer[(i + 1) % outer.length]
		if (a.distanceTo(e) > longest) [longest, axis] = [a.distanceTo(e), Math.atan2(e.y - a.y, e.x - a.x)]
	})
	return { n, h, base, parts, roof, axis, top: roof ? (x, y) => base + h + roofHeight(roof, x, y) : () => base + h }
}

export function chimneys(list, houses, gradient) {
	const geo = new THREE.BoxGeometry(CHIMNEY.length, CHIMNEY.width, CHIMNEY.height).translate(0, 0, CHIMNEY.height / 2)
	const mesh = new THREE.InstancedMesh(geo, new THREE.MeshToonMaterial({ color: '#fff', gradientMap: gradient }), list.length)
	mesh.castShadow = true
	mesh.receiveShadow = true
	mesh.frustumCulled = false
	const m = new THREE.Matrix4()
	const q = new THREE.Quaternion()
	const z = new THREE.Vector3(0, 0, 1)
	const at = new THREE.Vector3()
	const one = new THREE.Vector3(1, 1, 1)
	const c = new THREE.Color()
	list.forEach((ch, i) => {
		m.compose(at.set(ch.x, -ch.y, houses[ch.n].top(ch.x, -ch.y) - 0.05), q.setFromAxisAngle(z, -ch.angle), one)
		mesh.setMatrixAt(i, m)
		mesh.setColorAt(i, c.set(CHIMNEY.colors[Math.floor(ch.tone * CHIMNEY.colors.length)]))
	})
	return mesh
}

export function hatches(list, houses, gradient) {
	const { size, height, lid } = HATCH
	const frame = new THREE.BoxGeometry(size, size, height).translate(0, 0, height / 2)
	const top = new THREE.BoxGeometry(size * lid, size * lid, 0.03).translate(0, 0, height + 0.015)
	const paint = (geo, hex) => {
		const c = new THREE.Color(hex)
		geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(geo.attributes.position.count).fill([c.r, c.g, c.b]).flat(), 3))
		return geo
	}
	const geo = mergeGeometries([paint(frame, HATCH.frame), paint(top, HATCH.lidColor)])
	const mesh = new THREE.InstancedMesh(geo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient }), list.length)
	mesh.castShadow = true
	mesh.receiveShadow = true
	mesh.frustumCulled = false
	const m = new THREE.Matrix4()
	const q = new THREE.Quaternion()
	const z = new THREE.Vector3(0, 0, 1)
	const at = new THREE.Vector3()
	const one = new THREE.Vector3(1, 1, 1)
	list.forEach((h, i) => {
		m.compose(at.set(h.x, -h.y, houses[h.n].top(h.x, -h.y) - 0.01), q.setFromAxisAngle(z, -h.angle), one)
		mesh.setMatrixAt(i, m)
	})
	return mesh
}

// Every outline filled in at its building's height, or raised into its
// pitched roof, all in one geometry, or null for no roofs. Pitched faces are flat-shaded, so each slope
// takes one light band and the ink finds the ridges and hips.
export function roofGeometry(houses) {
	const tops = []
	const flat = (shape, z, axis) => {
		const geo = new THREE.ShapeGeometry(shape).translate(0, 0, z).toNonIndexed()
		geo.deleteAttribute('uv')
		return withAxis(geo, axis)
	}
	for (const { h: eaves, base, parts, roof, axis } of houses) {
		const h = base + eaves
		if (!roof) {
			for (const { outer, holes } of parts) {
				const shape = new THREE.Shape(outer)
				shape.holes = holes.map((hole) => new THREE.Path(hole))
				tops.push(flat(shape, h, axis))
			}
			continue
		}
		// Under a mansard, which follows a simplified outline, the flat roof
		// stays just below to fill the slivers it leaves.
		if (roof.kind === 'mansard') {
			const shape = new THREE.Shape(parts[0].outer)
			shape.holes = parts[0].holes.map((hole) => new THREE.Path(hole))
			tops.push(flat(shape, h - 0.02, axis))
		}
		const tris = roofTriangles(roof, triangulate)
		const pos = []
		for (let i = 0; i < tris.length; i += 3) pos.push(tris[i], tris[i + 1], h + tris[i + 2])
		const geo = new THREE.BufferGeometry()
		geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
		geo.computeVertexNormals()
		tops.push(withAxis(geo, axis))
	}
	return tops.length ? mergeGeometries(tops) : null
}

function withAxis(geo, axis) {
	geo.setAttribute('axis', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count).fill(axis), 1))
	return geo
}

// Earcut over [x, y] points, as roofs.js wants it: indices into the
// contour followed by the holes.
function triangulate(contour, holes) {
	const v = (r) => r.map(([x, y]) => new THREE.Vector2(x, y))
	return THREE.ShapeUtils.triangulateShape(v(contour), holes.map(v))
}

// Each chunk's roof image covers its buildings, `rect` (x, y, width, height
// in tiles), so each roof looks up its patch by world position. Slopes draw their own tile courses: lines of
// equal height, so they run along the eaves of every face.
export function roofMaterial(rect, gradient, tex) {
	const material = new THREE.MeshToonMaterial({ map: tex, gradientMap: gradient })
	material.onBeforeCompile = (shader) => {
		shader.uniforms.roofRect = { value: rect }
		const decl = 'varying vec3 vRoofPos;\nvarying vec3 vRoofNormal;\nvarying float vRoofAxis;\n'
		shader.vertexShader =
			'attribute float axis;\nuniform vec4 roofRect;\n' +
			decl +
			shader.vertexShader.replace(
				'#include <uv_vertex>',
				`#include <uv_vertex>
				vMapUv = vec2((position.x - roofRect.x) / roofRect.z, 1.0 + (position.y + roofRect.y) / roofRect.w);
				vRoofPos = position;
				vRoofNormal = normal;
				vRoofAxis = axis;`,
			)
		shader.fragmentShader =
			decl +
			pulse +
			'float tarHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' +
			shader.fragmentShader.replace(
				'#include <map_fragment>',
				`#include <map_fragment>
				if (vRoofNormal.z < 0.97) {
					float row = vRoofPos.z / ${ROOF_TILES.row.toFixed(3)};
					float course = pulse(row, 0.0, ${ROOF_TILES.line.toFixed(2)}, fwidth(row));
					diffuseColor.rgb *= 1.0 - course * ${ROOF_TILES.ink.toFixed(2)};
				} else if (max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b)) < 0.05) {
					${tarPaper}
				}`,
			)
	}
	return material
}

// Grey flat roofs are tar paper, lined up with the building: pale seams
// between the rolls, newer and older patches, and now and then a vent.
// Sizes in tiles. The hatches stand up in 3D.
const TAR = {
	seam: 0.34, // roll width
	seamLight: 0.35, // the sealed overlaps catch the light
	patch: [2.2, 1.3], // patch size
	patchTone: 0.14,
	ventCell: 1.7,
	ventShare: 0.86,
	vent: 0.08,
}

const tarPaper = `
	vec2 ax = vec2(cos(vRoofAxis), sin(vRoofAxis));
	vec2 side = vec2(-ax.y, ax.x);
	vec2 uv = vec2(dot(vRoofPos.xy, ax), dot(vRoofPos.xy, side));
	float fine = 1.0 - smoothstep(0.05, 0.1, length(fwidth(uv)));
	float f = 1.0 + pulse(uv.y / ${TAR.seam.toFixed(3)}, 0.0, 0.1, fwidth(uv.y / ${TAR.seam.toFixed(3)})) * ${TAR.seamLight.toFixed(2)};
	float patch_ = tarHash(floor(uv / vec2(${TAR.patch[0].toFixed(2)}, ${TAR.patch[1].toFixed(2)})));
	f += (step(0.86, patch_) - step(patch_, 0.12)) * ${TAR.patchTone.toFixed(2)};
	diffuseColor.rgb *= f;
	// Vents: small dark dots.
	vec2 vcell = floor(uv / ${TAR.ventCell.toFixed(1)});
	vec2 vd = uv - (vcell + 0.25 + 0.5 * vec2(tarHash(vcell + 3.3), tarHash(vcell + 4.4))) * ${TAR.ventCell.toFixed(1)};
	diffuseColor.rgb *= 1.0 - step(${TAR.ventShare.toFixed(2)}, tarHash(vcell + 8.8)) * step(length(vd), ${TAR.vent.toFixed(2)}) * 0.6 * fine;
`

export function build({ world, houses, gradient }) {
	const byIndex = []
	const spots = []
	const lids = []
	for (const h of houses) {
		byIndex[h.n] = h
		spots.push(...roofSpots(world.buildings[h.n], h.n).filter((s) => s.chimney))
		lids.push(...roofHatches(world.buildings[h.n], h.n, h.roof))
	}
	const meshes = [spots.length && chimneys(spots, byIndex, gradient), lids.length && hatches(lids, byIndex, gradient)].filter(Boolean)
	for (const mesh of meshes) {
		mesh.frustumCulled = true
		mesh.computeBoundingSphere()
	}
	return {
		meshes,
		zoom(scale) {
			for (const mesh of meshes) mesh.visible = scale >= DETAIL_PX
		},
	}
}
