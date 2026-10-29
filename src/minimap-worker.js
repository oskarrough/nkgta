// Paint once off-thread, using the same ground and roofs as the city chunks.
import { renderMapImage, renderRoofImage } from './map-image.js'

onmessage = ({ data }) => {
	const { W, H } = data
	const px = Math.min(1, 2048 / Math.max(W, H))
	const area = { x: 0, y: 0, w: W, h: H, px }
	const canvas = renderMapImage(data, area)
	canvas.getContext('2d').drawImage(renderRoofImage(data, undefined, area).canvas, 0, 0)
	const bitmap = canvas.transferToImageBitmap()
	postMessage({ bitmap, px }, [bitmap])
}
