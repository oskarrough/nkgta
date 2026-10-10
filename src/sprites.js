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

// Transit signs the Berlin way: white U on a blue square, green H on a
// yellow disc.
export function transitSprites() {
	const sign = (draw) => {
		const c = document.createElement('canvas')
		c.width = c.height = 64
		const g = c.getContext('2d')
		g.textAlign = 'center'
		g.textBaseline = 'middle'
		g.font = '700 44px system-ui'
		draw(g)
		return c
	}
	return {
		ubahn: sign((g) => {
			g.fillStyle = '#fff'
			g.fillRect(2, 2, 60, 60)
			g.fillStyle = '#115d91'
			g.fillRect(6, 6, 52, 52)
			g.fillStyle = '#fff'
			g.fillText('U', 32, 35)
		}),
		bus: sign((g) => {
			g.beginPath()
			g.arc(32, 32, 29, 0, Math.PI * 2)
			g.fillStyle = '#f5d000'
			g.fill()
			g.lineWidth = 4
			g.strokeStyle = '#2f7d32'
			g.stroke()
			g.fillStyle = '#2f7d32'
			g.fillText('H', 32, 35)
		}),
	}
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
