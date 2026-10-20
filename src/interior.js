// Inside a shop: one small room every shop shares for now, built like the
// city (toon bands, cast shadows, the ink pass) and seen from the same camera.
// The shop's name hangs over the counter on a big board tilted towards you,
// since walls are seen edge on from up here. Coordinates are tiles, y south,
// like the city's, with the room's own origin at its north-west corner.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { T } from './tiles.js'
import { LABELS } from './places.js'
import { CREAM, INK, posterText } from './poster.js'

const W = 12 // room, outside walls included, tiles
const D = 8
const WALL = 0.5 // thickness
const HIGH = 2.4 // wall height
const FLOOR = { a: '#C2BDB0', b: '#A9A7A0', mat: '#4D4C4B' }
const PLASTER = '#D2C4A0'
const VOID = '#2D333D'
// Indoor light: flat and bright, from the front, so the board is fully lit.
const AMBIENT = { color: '#d8d4cc', intensity: 1.1 }
const LAMP = { color: '#fff4e2', intensity: 2.2, direction: [0.25, 0.45, -1] }
const BOARDS = { spaeti: '#C8302A', doener: '#B5603F', imbiss: '#E8C21A', cafe: '#6E3A2A', bar: '#2D333D', bikeshop: '#3D5E82' }

// The door is in the middle of the south wall. You arrive a step inside it,
// and step back out from just in front of it.
const DOOR_Y = D - WALL
export const DOOR = { x: W / 2, y: DOOR_Y - 0.35, nx: 0, ny: -1, out: 0.35 }
export const ENTRY = { x: W / 2, y: DOOR_Y - 1.1 }
export const MIDDLE = { x: W / 2, y: D / 2 - 0.3 } // where the camera settles inside

// Solid things as [x0, y0, x1, y1, height, colour].
const COUNTER = [2.6, 2.3, 8.6, 3.1, 0.42, '#8F4C35']
const FURNITURE = [
	COUNTER,
	[2.6, 2.3, 8.6, 2.5, 0.44, '#6E3A2A'], // counter top's back edge
	[WALL, WALL, W - WALL, WALL + 0.45, 0.9, '#7A858B'], // shelves behind the counter
	[WALL, 2, WALL + 0.8, 6.4, 1.2, '#DCE3EA'], // drinks fridges
	[8.2, 4.5, 11, 5.2, 0.55, '#A9A7A0'], // a shelf island
	[10.1, 6.2, 11.4, DOOR_Y, 0.5, '#E8C21A'], // crates of drinks
]
const SOLIDS = FURNITURE.filter(([, , , , h]) => h > 0.3)

export function createInterior(gradient) {
	const scene = new THREE.Scene()
	scene.background = new THREE.Color(VOID)
	const toon = (color, map = null) => new THREE.MeshToonMaterial({ color, map, gradientMap: gradient })
	const at = (mesh, cast = true) => {
		mesh.castShadow = cast
		mesh.receiveShadow = true
		scene.add(mesh)
		return mesh
	}

	// Lino in big checks, with a dark mat at the door.
	const lino = document.createElement('canvas')
	lino.width = W * 16
	lino.height = D * 16
	const g = lino.getContext('2d')
	for (let y = 0; y < D * 2; y++) {
		for (let x = 0; x < W * 2; x++) {
			g.fillStyle = (x + y) % 2 ? FLOOR.a : FLOOR.b
			g.fillRect(x * 8, y * 8, 8, 8)
		}
	}
	g.fillStyle = FLOOR.mat
	g.fillRect((W / 2 - 0.8) * 16, (DOOR_Y - 0.8) * 16, 1.6 * 16, 0.8 * 16)
	const linoTex = new THREE.CanvasTexture(lino)
	linoTex.colorSpace = THREE.SRGBColorSpace
	linoTex.magFilter = THREE.NearestFilter
	at(new THREE.Mesh(new THREE.PlaneGeometry(W, D).translate(W / 2, -D / 2, 0), toon('#fff', linoTex)), false)

	// Walls, then the furniture, each kind one merged mesh.
	const box = (x0, y0, x1, y1, h) => new THREE.BoxGeometry(x1 - x0, y1 - y0, h).translate((x0 + x1) / 2, -(y0 + y1) / 2, h / 2)
	at(
		new THREE.Mesh(
			mergeGeometries([
				box(0, 0, W, WALL, HIGH),
				box(0, DOOR_Y, W, D, HIGH),
				box(0, WALL, WALL, DOOR_Y, HIGH),
				box(W - WALL, WALL, W, DOOR_Y, HIGH),
			]),
			toon(PLASTER),
		),
	)
	for (const [x0, y0, x1, y1, h, color] of FURNITURE) at(new THREE.Mesh(box(x0, y0, x1, y1, h), toon(color)))
	// Bottles in the fridges and goods on the shelves: little boxes in shop colours.
	const goods = []
	const colors = ['#C8302A', '#3FA34D', '#E8C21A', '#3D5E82', '#E7E7E5', '#B5603F']
	const shelf = (x0, x1, y0, y1, z, step) => {
		let i = 0
		for (let x = x0; x < x1; x += step) for (let y = y0; y < y1; y += step) goods.push([x, y, z, colors[i++ % colors.length]])
	}
	shelf(1, 11, WALL + 0.1, WALL + 0.4, 0.9, 0.22)
	shelf(8.4, 10.9, 4.6, 5.1, 0.55, 0.25)
	const item = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 0.14).translate(0, 0, 0.07), toon('#fff'), goods.length)
	goods.forEach(([x, y, z, color], i) => {
		item.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, -y, z))
		item.setColorAt(i, new THREE.Color(color))
	})
	at(item)
	// The till.
	at(new THREE.Mesh(box(7.4, 2.45, 8.1, 2.95, 0.62), toon('#363B44')))
	// Lit glass down the fridge fronts.
	at(new THREE.Mesh(box(WALL + 0.8, 2.1, WALL + 0.86, 6.3, 1.1), new THREE.MeshBasicMaterial({ color: '#B4C1D0' })), false)

	// The board: name on the front, ink round the back and edges, hung from
	// the back wall and tilted out over the counter.
	const poster = document.createElement('canvas')
	poster.width = 2048
	poster.height = 456
	const posterTex = new THREE.CanvasTexture(poster)
	posterTex.colorSpace = THREE.SRGBColorSpace
	posterTex.anisotropy = 8
	const ink = new THREE.MeshBasicMaterial({ color: INK })
	const board = new THREE.Mesh(new THREE.BoxGeometry(9, 2, 0.08), [ink, ink, ink, ink, toon('#fff', posterTex), ink])
	// From the top of the back wall down and out to just behind the counter.
	board.position.set(W / 2, -1.3, 2.1)
	board.rotation.x = Math.atan2(1.2, 1.6)
	at(board)

	scene.add(new THREE.AmbientLight(AMBIENT.color, AMBIENT.intensity))
	const lamp = new THREE.DirectionalLight(LAMP.color, LAMP.intensity)
	const dir = new THREE.Vector3(...LAMP.direction).normalize()
	lamp.target.position.set(W / 2, -D / 2, 0)
	lamp.position.copy(lamp.target.position).addScaledVector(dir, -20)
	lamp.castShadow = true
	lamp.shadow.mapSize.set(1024, 1024)
	lamp.shadow.bias = -0.0005
	Object.assign(lamp.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 })
	scene.add(lamp, lamp.target)

	function setShop(shop) {
		const g = poster.getContext('2d')
		const { width: w, height: h } = poster
		g.fillStyle = BOARDS[shop.kind] ?? '#3D5E82'
		g.fillRect(0, 0, w, h)
		// A cream rule round the edge, and the kind of shop in a band below.
		g.strokeStyle = CREAM
		g.lineWidth = 14
		g.strokeRect(28, 28, w - 56, h - 56)
		posterText(g, shop.name, w / 2, h * 0.43, 250, w - 180)
		g.fillStyle = CREAM
		g.font = `800 52px system-ui, sans-serif`
		g.textAlign = 'center'
		g.textBaseline = 'middle'
		const sub = shop.kind === 'spaeti' ? 'Späti · Pfand hier' : LABELS[shop.kind]
		g.fillText(sub.toUpperCase().split('').join(' '), w / 2, h * 0.82)
		posterTex.needsUpdate = true
	}

	const inRect = (x, y, [x0, y0, x1, y1], pad = 0) => x > x0 - pad && x < x1 + pad && y > y0 - pad && y < y1 + pad
	// The room as the player's world: floor, or solid.
	const world = {
		tileAt: (x, y) => (x < WALL || y < WALL || x > W - WALL || y > DOOR_Y || SOLIDS.some((r) => inRect(x, y, r)) ? T.BUILDING : T.GROUND),
	}

	return {
		scene,
		world,
		setShop,
		// In front of the counter, where you hand things over.
		atCounter: (x, y) => x > COUNTER[0] && x < COUNTER[2] && y > COUNTER[3] && y < COUNTER[3] + 1.1,
	}
}
