import * as THREE from 'three'
import { INK, POSTER_FONT } from './poster.js'

const BADGE = { size: 2.2, lift: 2.2 }
const PLATE = { width: 1.25, lift: 1.1, near: 40 } // tiles; plates show within `near` of you
const ENAMEL = '#173b7a'

function canvasMaterial(draw, w, h) {
	const canvas = document.createElement('canvas')
	canvas.width = w
	canvas.height = h
	draw(canvas.getContext('2d'), w, h)
	const texture = new THREE.CanvasTexture(canvas)
	texture.colorSpace = THREE.SRGBColorSpace
	return new THREE.SpriteMaterial({ map: texture, transparent: true })
}

const bagBadge = () =>
	canvasMaterial(
		(g) => {
			g.beginPath()
			g.arc(64, 64, 56, 0, Math.PI * 2)
			g.fillStyle = '#e8c21a'
			g.fill()
			g.lineWidth = 10
			g.strokeStyle = INK
			g.stroke()
			g.fillStyle = INK
			g.beginPath()
			g.roundRect(36, 46, 56, 46, 6)
			g.fill()
			g.lineWidth = 8
			g.beginPath()
			g.arc(64, 46, 13, Math.PI, 0)
			g.stroke()
			g.fillStyle = '#e8c21a'
			g.fillRect(40, 62, 48, 6)
		},
		128,
		128,
	)

const plates = new Map()
function plate(number) {
	if (plates.has(number)) return plates.get(number)
	const material = canvasMaterial(
		(g, w, h) => {
			g.beginPath()
			g.roundRect(4, 4, w - 8, h - 8, 14)
			g.fillStyle = ENAMEL
			g.fill()
			g.lineWidth = 6
			g.strokeStyle = '#f4f2ea'
			g.stroke()
			g.lineWidth = 4
			g.strokeStyle = INK
			g.beginPath()
			g.roundRect(1, 1, w - 2, h - 2, 16)
			g.stroke()
			g.fillStyle = '#f4f2ea'
			g.font = `900 ${number.length > 3 ? 46 : 60}px ${POSTER_FONT}`
			g.textAlign = 'center'
			g.textBaseline = 'middle'
			g.fillText(number, w / 2, h / 2 + 3)
		},
		128,
		84,
	)
	plates.set(number, material)
	return material
}

export function createCourierMarks(scene, heightAt = () => 0) {
	const root = new THREE.Group()
	scene.add(root)
	const badge = new THREE.Sprite(bagBadge())
	badge.material.depthTest = false
	badge.renderOrder = 10
	badge.visible = false
	root.add(badge)
	const pool = []
	let street = [] // the drop-off street's doors
	let since = Infinity
	let pulse = 0
	let lift = 0

	return {
		show(kitchen, doors) {
			badge.visible = !!kitchen
			if (kitchen) {
				const { x, y } = kitchen.stand
				lift = heightAt(x, y) + BADGE.lift
				badge.position.set(x, -y, lift)
			}
			if (doors !== street) {
				street = doors
				since = Infinity
			}
		},
		update(dt, player, hidden) {
			root.visible = !hidden
			pulse += dt
			const k = 1 + Math.sin(pulse * 6) * 0.08
			badge.scale.set(BADGE.size * k, BADGE.size * k, 1)
			badge.position.z = lift + Math.sin(pulse * 3) * 0.2

			if ((since += dt) < 0.25) return
			since = 0
			const near = street.filter((d) => Math.hypot(d.x - player.x, d.y - player.y) < PLATE.near)
			while (pool.length < near.length) {
				const sprite = new THREE.Sprite()
				pool.push(sprite)
				root.add(sprite)
			}
			pool.forEach((sprite, i) => {
				const d = near[i]
				sprite.visible = !!d
				if (!d) return
				sprite.material = plate(d.number)
				const x = d.x + d.nx * 0.35
				const y = d.y + d.ny * 0.35
				sprite.position.set(x, -y, heightAt(x, y) + PLATE.lift)
				sprite.scale.set(PLATE.width, (PLATE.width * 84) / 128, 1)
			})
		},
	}
}
