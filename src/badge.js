// The disc that marks something for you in the city: a race gate's letter,
// the courier's bag over a kitchen door. One material per design, shared.
import * as THREE from 'three'
import { INK } from './poster.js'

const SIZE = 128
const materials = new Map()

// `paint(g)` draws the glyph in INK on the filled disc.
export function badgeMaterial(key, color, paint) {
	if (materials.has(key)) return materials.get(key)
	const canvas = document.createElement('canvas')
	canvas.width = canvas.height = SIZE
	const g = canvas.getContext('2d')
	g.beginPath()
	g.arc(64, 64, 56, 0, Math.PI * 2)
	g.fillStyle = color
	g.fill()
	g.lineWidth = 10
	g.strokeStyle = INK
	g.stroke()
	g.fillStyle = INK
	paint(g)
	const texture = new THREE.CanvasTexture(canvas)
	texture.colorSpace = THREE.SRGBColorSpace
	const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true })
	materials.set(key, material)
	return material
}

// How big a badge is at time t, as a share of its size: it throbs to be noticed.
export const throb = (t) => 1 + Math.sin(t * 6) * 0.08
