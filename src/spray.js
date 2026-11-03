import * as THREE from 'three'
import './spray.css'
import { PAINTS, createWallFinder, loadGraffiti, moveNozzle, normalOf, nozzleAt, raiseCan, saveGraffiti, spray, trim } from './graffiti.js'
import { storage } from './remember.js'

const DOT = 0.045 // tiles across one puff
const UP = new THREE.Vector3(0, 0, 1)

function puffTexture() {
	const canvas = document.createElement('canvas')
	canvas.width = canvas.height = 64
	const g = canvas.getContext('2d')
	const glow = g.createRadialGradient(32, 32, 0, 32, 32, 32)
	glow.addColorStop(0, 'rgba(255,255,255,0.9)')
	glow.addColorStop(0.5, 'rgba(255,255,255,0.6)')
	glow.addColorStop(1, 'rgba(255,255,255,0)')
	g.fillStyle = glow
	g.fillRect(0, 0, 64, 64)
	return new THREE.CanvasTexture(canvas)
}

// The spray can: X raises it at the wall in front or the ground, the
// movement keys steer the nozzle, space sprays, Z picks the next colour,
// Backspace takes back the last line, X again puts it away.
export function createSpray({ world, scene, pocket, area }) {
	let strokes = loadGraffiti(storage, area)
	let hitWall = null
	let can = null
	let stroke = null
	let paint = 0

	const material = new THREE.MeshBasicMaterial({
		alphaMap: puffTexture(),
		transparent: true,
		depthWrite: false,
		polygonOffset: true,
		polygonOffsetFactor: -2,
		side: THREE.DoubleSide,
	})
	material.defines = { INK_SKIP: '' }
	const plane = new THREE.PlaneGeometry(DOT, DOT)
	let mesh = null
	let shown = 0
	const m = new THREE.Matrix4()
	const q = new THREE.Quaternion()
	const n = new THREE.Vector3()
	const p = new THREE.Vector3()
	const s = new THREE.Vector3(1, 1, 1)
	const c = new THREE.Color()

	function capacity(need) {
		if (mesh && mesh.instanceMatrix.count >= need) return
		const size = Math.max(1024, 2 ** Math.ceil(Math.log2(need)))
		if (mesh) {
			scene.remove(mesh)
			mesh.dispose()
		}
		mesh = new THREE.InstancedMesh(plane, material, size)
		mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
		mesh.frustumCulled = false
		mesh.count = 0
		scene.add(mesh)
		shown = 0
	}
	function put(i, x, y, z, normal, color) {
		n.set(normal[0], -normal[1], normal[2])
		q.setFromUnitVectors(UP, n)
		m.compose(p.set(x, -y, z), q, s)
		mesh.setMatrixAt(i, m)
		mesh.setColorAt(i, c.set(color))
	}
	// Appends what's new since the last frame; a full redraw only on undo or growth.
	function draw(full) {
		const all = stroke ? [...strokes, stroke] : strokes
		const total = all.reduce((t, st) => t + st.dots.length / 3, 0)
		capacity(total || 1)
		if (full) shown = 0
		let i = 0
		for (const st of all) {
			const len = st.dots.length / 3
			if (i + len > shown)
				for (let k = Math.max(0, shown - i); k < len; k++)
					put(i + k, st.dots[k * 3], st.dots[k * 3 + 1], st.dots[k * 3 + 2], st.n, st.color)
			i += len
		}
		if (total === shown && !full) return
		mesh.count = shown = total
		mesh.instanceMatrix.needsUpdate = true
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
	}
	draw(true)

	const nozzle = new THREE.Mesh(
		new THREE.RingGeometry(DOT * 0.55, DOT * 0.85, 16),
		new THREE.MeshBasicMaterial({ color: PAINTS[0], depthTest: false, transparent: true, opacity: 0.8 }),
	)
	nozzle.material.defines = { INK_SKIP: '' }
	nozzle.renderOrder = 10
	nozzle.visible = false
	scene.add(nozzle)

	const page = document.createElement('div')
	page.className = 'app-spray'
	page.innerHTML = `
		<div class="paints">${PAINTS.map((p, i) => `<button type="button" data-paint="${i}" style="background:${p}" aria-label="Farbe ${i + 1}"></button>`).join('')}</div>
		<p>Leertaste sprüht · Pfeile führen · Z Farbe</p>
		<p><button type="button" class="undo">⌫ Zurück</button> <button type="button" class="away">X Weg</button></p>`
	pocket.add({ id: 'spray', page })
	page.addEventListener('click', (e) => {
		const swatch = e.target.closest('[data-paint]')
		if (swatch) pick(Number(swatch.dataset.paint))
		if (e.target.closest('.undo')) undo()
		if (e.target.closest('.away')) lower()
	})
	function pick(i) {
		paint = (i + PAINTS.length) % PAINTS.length
		nozzle.material.color.set(PAINTS[paint])
		for (const b of page.querySelectorAll('[data-paint]')) b.classList.toggle('on', Number(b.dataset.paint) === paint)
		finish()
	}
	pick(0)

	function finish() {
		if (!stroke) return
		if (stroke.dots.length) {
			strokes.push(stroke)
			const kept = trim(strokes)
			if (kept !== strokes) {
				strokes = kept
				stroke = null
				draw(true)
			}
			saveGraffiti(storage, area, strokes)
		}
		stroke = null
	}
	function raise(player) {
		hitWall ??= createWallFinder(world.buildings)
		can = raiseCan(player, hitWall, world.heightAt)
		pocket.alert('spray')
	}
	function lower() {
		finish()
		can = null
		nozzle.visible = false
		pocket.release('spray')
	}
	function undo() {
		finish()
		if (!strokes.length) return
		strokes.pop()
		saveGraffiti(storage, area, strokes)
		draw(true)
	}

	return {
		active: () => !!can,
		toggle(player, allowed) {
			if (can) lower()
			else if (allowed) raise(player)
		},
		nextPaint: () => can && pick(paint + 1),
		undo,
		lower: () => can && lower(),
		update(dt, axis, painting) {
			if (!can) return
			moveNozzle(can, axis, dt)
			const at = nozzleAt(can)
			nozzle.visible = true
			n.set(...normalOf(can))
			n.y = -n.y
			nozzle.quaternion.setFromUnitVectors(UP, n)
			nozzle.position.set(at[0], -at[1], at[2] + (can.wall ? 0 : 0.002))
			if (!painting) return finish()
			stroke ??= { color: PAINTS[paint], n: normalOf(can), dots: [] }
			if (spray(stroke, at)) draw(false)
		},
	}
}
