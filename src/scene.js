// The city in 3D, the GTA 1 way: the flat map on the ground, every building
// tile pushed up into a box, and a perspective camera looking straight down,
// so walls lean outwards towards the screen edges.
import * as THREE from 'three'
import { T } from './tiles.js'
import { renderMapImage, renderRoofImage } from './map-image.js'

// Altbau plaster: cream, ochre, sandstone, grey, salmon, off-white.
const FACADES = ['#d8c6a2', '#c9a266', '#bfa98a', '#a8a39b', '#c98f72', '#e2dacb']

// Narrow, so the camera sits high and walls lean gently, like GTA 1.
const FOV = 40

export function createScene(canvas, world) {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
	renderer.setPixelRatio(devicePixelRatio)
	const scene = new THREE.Scene()
	scene.background = new THREE.Color('#222')
	const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000)

	// Tile (x, y) sits at (x, -y), so north stays up and z is height in tiles.
	const ground = new THREE.CanvasTexture(renderMapImage(world))
	ground.colorSpace = THREE.SRGBColorSpace
	ground.anisotropy = renderer.capabilities.getMaxAnisotropy()
	const plane = new THREE.Mesh(new THREE.PlaneGeometry(world.W, world.H), new THREE.MeshBasicMaterial({ map: ground }))
	plane.position.set(world.W / 2, -world.H / 2, 0)
	scene.add(plane)

	scene.add(buildings(world, roofMaterial(world, renderer)))
	scene.add(new THREE.AmbientLight('#fff', 1.6))
	// Sun from the south-west, so south and west walls catch the light.
	const sun = new THREE.DirectionalLight('#fff', 1.6)
	sun.position.set(-0.5, -0.6, 0.8)
	scene.add(sun)

	function resize() {
		renderer.setSize(innerWidth, innerHeight, false)
		camera.aspect = innerWidth / innerHeight
		camera.updateProjectionMatrix()
	}
	addEventListener('resize', resize)
	resize()

	// Same view as the 2D overlay: `scale` device pixels per tile at street
	// level, top-left corner at (cam.x, cam.y) in those pixels.
	return function render(cam) {
		const h = innerHeight * devicePixelRatio
		const w = innerWidth * devicePixelRatio
		camera.position.set(
			(cam.x + w / 2) / cam.scale,
			-(cam.y + h / 2) / cam.scale,
			h / 2 / cam.scale / Math.tan((FOV / 2) * (Math.PI / 180)),
		)
		renderer.render(scene, camera)
	}
}

// One box per run of tiles of the same building along a row; far fewer boxes
// than one per tile, and the GPU doesn't mind the hidden inner walls. Each
// building gets its own shade, so a row of equal Altbauten still reads as
// separate houses.
function buildings({ W, H, tiles, heights, buildingOf, tileM }, roof) {
	const runs = []
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W;) {
			const i = y * W + x
			if (tiles[i] !== T.BUILDING) {
				x++
				continue
			}
			let n = 1
			while (x + n < W && tiles[i + n] === T.BUILDING && buildingOf[i + n] === buildingOf[i] && heights[i + n] === heights[i]) n++
			runs.push({ x, y, n, h: (heights[i] || 17) / tileM, id: buildingOf[i] })
			x += n
		}
	}

	const box = new THREE.BoxGeometry(1, 1, 1).translate(0.5, -0.5, 0.5)
	// Box faces go +x, -x, +y, -y, top, bottom.
	const wall = wallMaterial(tileM)
	const mesh = new THREE.InstancedMesh(box, [wall, wall, wall, wall, roof, wall], runs.length)
	const m = new THREE.Matrix4()
	const plaster = FACADES.map((f) => new THREE.Color(f))
	const c = new THREE.Color()
	runs.forEach((r, k) => {
		m.makeScale(r.n, 1, r.h).setPosition(r.x, -r.y, 0)
		mesh.setMatrixAt(k, m)
		// Each building gets a façade colour, from a cheap stable hash of its id.
		const j = ((r.id * 2654435761) >>> 0) % 1000
		mesh.setColorAt(k, c.copy(plaster[j % plaster.length]).offsetHSL(0, 0, (j / 1000 - 0.5) * 0.08))
	})
	return mesh
}

// The roof image is one texture for the whole map, so each box top looks up
// its patch by world position instead of its own 0..1 face coordinates. Roofs
// carry their own colours and skip the per-building wall shade.
function roofMaterial(world, renderer) {
	const tex = new THREE.CanvasTexture(renderRoofImage(world))
	tex.colorSpace = THREE.SRGBColorSpace
	tex.magFilter = THREE.NearestFilter
	tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
	const material = new THREE.MeshLambertMaterial({ map: tex })
	material.onBeforeCompile = (shader) => {
		shader.vertexShader = shader.vertexShader.replace(
			'#include <uv_vertex>',
			`#include <uv_vertex>
			vec4 roofPos = instanceMatrix * vec4(position, 1.0);
			vMapUv = vec2(roofPos.x / ${world.W.toFixed(1)}, 1.0 + roofPos.y / ${world.H.toFixed(1)});`,
		)
		shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '')
	}
	return material
}

// Walls draw their own windows from world position: one per 3 m along the
// wall and per storey up it, wider shop windows on the ground floor, a ledge
// between storeys and now and then a lit window. Sheds and garages stay blank.
function wallMaterial(tileM) {
	const material = new THREE.MeshLambertMaterial()
	const storey = (3.2 / tileM).toFixed(3)
	material.onBeforeCompile = (shader) => {
		const decl = 'varying vec3 vWall;\nvarying vec3 vWallN;\nvarying float vWallH;\n'
		shader.vertexShader =
			decl +
			shader.vertexShader.replace(
				'#include <project_vertex>',
				`#include <project_vertex>
			vWall = (instanceMatrix * vec4(position, 1.0)).xyz;
			vWallN = normal;
			vWallH = instanceMatrix[2][2];`,
			)
		shader.fragmentShader =
			decl +
			shader.fragmentShader.replace(
				'#include <color_fragment>',
				`#include <color_fragment>
			if (vWallH > 2.0 && abs(vWallN.z) < 0.5 && vWall.z < vWallH - 0.3) {
				float along = abs(vWallN.x) > 0.5 ? vWall.y : vWall.x;
				float f = floor(vWall.z / ${storey});
				float fz = fract(vWall.z / ${storey});
				float u = fract(along);
				float shop = f < 0.5 ? 1.0 : 0.0;
				float halfW = mix(0.22, 0.4, shop);
				float lo = mix(0.35, 0.1, shop);
				vec2 aa = fwidth(vec2(along, vWall.z / ${storey}));
				float wx = smoothstep(0.5 - halfW - aa.x, 0.5 - halfW + aa.x, u) * (1.0 - smoothstep(0.5 + halfW - aa.x, 0.5 + halfW + aa.x, u));
				float wz = smoothstep(lo - aa.y, lo + aa.y, fz) * (1.0 - smoothstep(0.8 - aa.y, 0.8 + aa.y, fz));
				float lit = fract(sin(dot(vec3(floor(along), f, floor(vWall.x - vWall.y)), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
				vec3 glass = lit > 0.94 ? vec3(0.9, 0.7, 0.3) : vec3(0.05, 0.07, 0.1);
				diffuseColor.rgb = mix(diffuseColor.rgb, glass, wx * wz);
				float ledge = 1.0 - smoothstep(0.0, 0.05 + aa.y, fz);
				diffuseColor.rgb *= 1.0 - 0.3 * ledge * (1.0 - shop);
			}`,
			)
	}
	return material
}
