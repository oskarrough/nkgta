import * as THREE from 'three'
import { INK } from './poster.js'

const BADGE = { size: 2.2, lift: 2.2 }
const PLATE = { width: 1.14, lift: 1.2, near: 40 } // tiles; plates show within `near` of you
const FACE = 160 // enamel plate texture, wider than tall like the ones on Berlin doorways
const FACE_H = 136
const FACE_PAPER = '#f2eee0'

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
			const edge = 7
			const rim = 10
			const enamel = g.createLinearGradient(0, edge, 0, h - edge)
			enamel.addColorStop(0, '#fbf8ee')
			enamel.addColorStop(0.45, FACE_PAPER)
			enamel.addColorStop(1, '#dcd7c5')
			g.save()
			g.shadowColor = 'rgba(0, 0, 0, .35)'
			g.shadowBlur = 9
			g.shadowOffsetY = 4
			g.fillStyle = enamel
			g.beginPath()
			g.roundRect(edge, edge, w - edge * 2, h - edge * 2, rim)
			g.fill()
			g.restore()
			g.lineWidth = 5
			g.strokeStyle = INK
			g.beginPath()
			g.roundRect(edge, edge, w - edge * 2, h - edge * 2, rim)
			g.stroke()
			g.lineWidth = 2
			g.strokeStyle = 'rgba(26, 30, 27, .45)'
			g.beginPath()
			g.roundRect(edge + 7, edge + 7, w - (edge + 7) * 2, h - (edge + 7) * 2, rim - 5)
			g.stroke()
			// The glaze catches the light along the top, like old enamel.
			g.save()
			g.beginPath()
			g.roundRect(edge, edge, w - edge * 2, h - edge * 2, rim)
			g.clip()
			const gloss = g.createLinearGradient(0, edge, 0, h * 0.55)
			gloss.addColorStop(0, 'rgba(255, 255, 255, .5)')
			gloss.addColorStop(1, 'rgba(255, 255, 255, 0)')
			g.fillStyle = gloss
			g.fillRect(edge, edge, w - edge * 2, h)
			g.restore()
			for (const [x, y] of [
				[edge + 10, edge + 10],
				[w - edge - 10, edge + 10],
				[edge + 10, h - edge - 10],
				[w - edge - 10, h - edge - 10],
			]) {
				g.fillStyle = 'rgba(26, 30, 27, .5)'
				g.beginPath()
				g.arc(x, y, 2, 0, Math.PI * 2)
				g.fill()
			}
			const text = number.toUpperCase()
			const room = w - edge * 2 - 34
			let size = Math.round(h * 0.58)
			for (;;) {
				g.font = `800 ${size}px Arial, "Helvetica Neue", sans-serif`
				if (g.measureText(text).width <= room || size <= 22) break
				size--
			}
			g.fillStyle = INK
			g.textAlign = 'center'
			g.textBaseline = 'middle'
			g.fillText(text, w / 2, h / 2 + size * 0.03)
		},
		FACE,
		FACE_H,
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
				sprite.scale.set(PLATE.width, (PLATE.width * FACE_H) / FACE, 1)
			})
		},
	}
}
