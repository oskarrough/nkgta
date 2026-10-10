// Text is slow to draw every frame, so emoji and street names are drawn once
// into small canvases and stamped from there.
import { ICONS } from './places.js'

export function iconSprites() {
	const sprites = {}
	for (const [kind, icon] of Object.entries(ICONS)) {
		const c = document.createElement('canvas')
		c.width = c.height = 64
		const g = c.getContext('2d')
		g.textAlign = 'center'
		g.textBaseline = 'middle'
		g.font = '52px system-ui'
		g.fillText(icon, 32, 34)
		sprites[kind] = c
	}
	return sprites
}

export const LABEL_PX = 28

export function labelSprites(names) {
	const sprites = {}
	const font = `700 ${LABEL_PX}px system-ui`
	for (const name of new Set(names)) {
		const c = document.createElement('canvas')
		const g = c.getContext('2d')
		g.font = font
		c.width = Math.ceil(g.measureText(name).width) + 12
		c.height = LABEL_PX + 12
		g.font = font
		g.textBaseline = 'middle'
		g.lineWidth = 6
		g.lineJoin = 'round'
		g.strokeStyle = '#222'
		g.fillStyle = '#fff'
		g.strokeText(name, 6, c.height / 2)
		g.fillText(name, 6, c.height / 2)
		sprites[name] = c
	}
	return sprites
}
