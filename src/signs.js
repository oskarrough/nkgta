import { openAttribute } from './front-panels.js'
// An awning over every shop door with the shop's name painted on it, readable
// from above, where walls are seen edge on. One atlas, one mesh, one draw,
// for the shops in `pick`, by index; each still makes room for every other.
import * as THREE from 'three'
import { posterText, posterWidth } from './poster.js'
import { alongFacade } from './shops.js'

const CLOTH = ['#C8302A', '#3D5E82', '#3FA34D', '#B5603F', '#E8C21A', '#2D333D']
export const DEPTH = 1.05 // how far the awning reaches out over the pavement, tiles
const HIGH = 1.15 // where it meets the wall, tiles up
const LOW = 0.85 // its front edge
const WIDTH = [1.6, 7] // tiles
const GAP = 0.15 // between neighbours' awnings, tiles
const CELL = 96 // atlas pixels across the awning's depth
const TYPE = 54 // type size in those pixels
const ATLAS_W = 2048

export function createSigns(shops, gradient, pick = shops.keys(), heightAt = () => 0, opening) {
	const list = [...pick]
	if (!list.length) return new THREE.Group()
	const measure = document.createElement('canvas').getContext('2d')
	const cells = []
	let x = 0
	let y = 0
	for (const shop of list.map((i) => shops[i])) {
		const w = Math.min(ATLAS_W, Math.ceil(posterWidth(measure, shop.name, TYPE) + CELL * 0.5))
		if (x + w > ATLAS_W) [x, y] = [0, y + CELL]
		cells.push({ x, y, w })
		x += w
	}
	const canvas = document.createElement('canvas')
	canvas.width = ATLAS_W
	canvas.height = y + CELL
	const g = canvas.getContext('2d')

	const pos = []
	const uv = []
	const ranges = []
	list.forEach((i, k) => {
		const shop = shops[i]
		const start = pos.length / 3
		const cell = cells[k]
		const color = signColor(shop.name)
		// Scene coordinates: y points north. Text reads from the street, its
		// top towards the wall, turned round when that would put it upside down.
		const n = [shop.nx, -shop.ny]
		let up = [-n[0], -n[1]]
		let right = [up[1], -up[0]]
		const flip = right[0] < -0.2 || (right[0] <= 0.2 && right[1] < 0)
		if (flip) [up, right] = [up.map((v) => -v), right.map((v) => -v)]
		paintCell(g, cell, shop.name, color, flip)

		const want = Math.max(WIDTH[0], Math.min(WIDTH[1], (cell.w / CELL) * DEPTH)) / 2
		let lo = -want
		let hi = want
		for (const other of shops) {
			const t = other === shop ? null : alongFacade(shop, other)
			if (t === null || Math.abs(t) > want * 2 + WIDTH[1]) continue
			if (t >= 0) hi = Math.min(hi, Math.max(t / 2 - GAP / 2, 0.5))
			else lo = Math.max(lo, Math.min(t / 2 + GAP / 2, -0.5))
		}
		const width = hi - lo
		const e = [shop.ex, -shop.ey]
		const door = [shop.x + shop.ex * ((lo + hi) / 2), -(shop.y + shop.ey * ((lo + hi) / 2))]
		const centre = [door[0] + (n[0] * DEPTH) / 2, door[1] + (n[1] * DEPTH) / 2]
		// A hair apart, so neighbouring awnings don't flicker where they overlap.
		const lift = (i % 7) * 0.004 + heightAt(shop.x, shop.y)
		const corner = (s, out) => [
			door[0] + e[0] * s * (width / 2) + n[0] * out * DEPTH,
			door[1] + e[1] * s * (width / 2) + n[1] * out * DEPTH,
			(out ? LOW : HIGH) + lift,
		]
		const quad = [corner(-1, 0), corner(1, 0), corner(1, 1), corner(-1, 1)]
		// Anticlockwise from above, so the face points up.
		const [a, b, c] = quad
		const tris = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]
		for (const k of tris) {
			const p = quad[k]
			const dx = p[0] - centre[0]
			const dy = p[1] - centre[1]
			const s = (dx * right[0] + dy * right[1]) / width + 0.5
			const t = (dx * up[0] + dy * up[1]) / DEPTH + 0.5
			pos.push(...p)
			uv.push((cell.x + s * cell.w) / canvas.width, 1 - (cell.y + (1 - t) * CELL) / canvas.height)
		}
		ranges.push([shop.place, start, pos.length / 3])
	})

	const tex = new THREE.CanvasTexture(canvas)
	tex.colorSpace = THREE.SRGBColorSpace
	tex.anisotropy = 8
	const geo = new THREE.BufferGeometry()
	geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
	geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
	if (opening) openAttribute(geo, ranges, opening)
	geo.computeVertexNormals()
	const material = new THREE.MeshToonMaterial({ map: tex, gradientMap: gradient })
	// One-sided, and the sun sees its top, so its shadow needs both sides.
	material.shadowSide = THREE.DoubleSide
	const mesh = new THREE.Mesh(geo, material)
	mesh.castShadow = true
	mesh.receiveShadow = true
	return mesh
}

function paintCell(g, { x, y, w }, name, color, flip) {
	g.save()
	g.translate(x, y)
	g.fillStyle = color
	g.fillRect(0, 0, w, CELL)
	const band = CELL * 0.16
	const front = flip ? 0 : CELL - band
	g.fillStyle = 'rgba(0, 0, 0, 0.28)'
	g.fillRect(0, front, w, band)
	g.fillStyle = 'rgba(255, 255, 255, 0.18)'
	const r = band * 0.5
	for (let sx = r; sx < w; sx += r * 2) {
		g.beginPath()
		g.arc(sx, flip ? band : CELL - band, r * 0.8, flip ? 0 : Math.PI, flip ? Math.PI : Math.PI * 2)
		g.fill()
	}
	posterText(g, name, w / 2, flip ? CELL * 0.58 : CELL * 0.42, TYPE, w - CELL * 0.4)
	g.restore()
}

export function signColor(name) {
	return CLOTH[hash(name) % CLOTH.length]
}

function hash(s) {
	let h = 7
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
	return h
}
