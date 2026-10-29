import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { BBOX } from './default-area.js'
import { areaFromUrl, areaUrl } from './area-url.js'

// Bigger areas take long to fetch and the prerendered map gets huge.
const MAX_KM2 = 16

const start = areaFromUrl() ?? BBOX
const map = L.map('map')
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
	maxZoom: 19,
	attribution: '© OpenStreetMap',
}).addTo(map)

const toBounds = (b) => L.latLngBounds([b.south, b.west], [b.north, b.east])
const RED = '#e0302a'
const casing = L.rectangle(toBounds(start), { color: '#fff', weight: 7, fill: false, interactive: false }).addTo(map)
const rect = L.rectangle(toBounds(start), { color: RED, weight: 3, fillColor: RED, fillOpacity: 0.12 }).addTo(map)
map.fitBounds(rect.getBounds(), { padding: [60, 60] })

const handle = () =>
	L.marker([0, 0], {
		draggable: true,
		icon: L.divIcon({
			className: '',
			html: `<div style="width:16px;height:16px;margin:-8px 0 0 -8px;background:${RED};border:3px solid #fff;box-shadow:0 0 0 1px #222;border-radius:50%"></div>`,
		}),
	}).addTo(map)
const nw = handle()
const se = handle()
function placeHandles() {
	const b = rect.getBounds()
	nw.setLatLng(b.getNorthWest())
	se.setLatLng(b.getSouthEast())
	update()
	history.replaceState(null, '', location.pathname + areaUrl(area()).slice(1))
}
for (const m of [nw, se])
	m.on('drag', () => {
		rect.setBounds(L.latLngBounds(nw.getLatLng(), se.getLatLng()))
		update()
	})
for (const m of [nw, se]) m.on('dragend', placeHandles)

function area() {
	const b = rect.getBounds()
	const r = (n) => Math.round(n * 10000) / 10000
	return { south: r(b.getSouth()), west: r(b.getWest()), north: r(b.getNorth()), east: r(b.getEast()) }
}

function km2() {
	const b = rect.getBounds()
	const w = b.getSouthWest().distanceTo(b.getSouthEast()) / 1000
	const h = b.getSouthWest().distanceTo(b.getNorthWest()) / 1000
	return { w, h, km2: w * h }
}

const size = document.getElementById('size')
const play = document.getElementById('play')
function update() {
	casing.setBounds(rect.getBounds())
	const { w, h, km2: a } = km2()
	size.textContent = `${w.toFixed(1)} × ${h.toFixed(1)} km`
	const tooBig = a > MAX_KM2 || w > 5 || h > 5
	size.classList.toggle('too-big', tooBig)
	play.disabled = tooBig
	play.title = tooBig ? `Höchstens ${MAX_KM2} km² und 5 km pro Seite` : ''
}
placeHandles()

const drawBtn = document.getElementById('draw')
let drawFrom = null
drawBtn.onclick = () => {
	map.dragging.disable()
	map.getContainer().classList.add('drawing')
	drawFrom = 'armed'
}
map.on('mousedown', (e) => {
	if (drawFrom !== 'armed') return
	drawFrom = e.latlng
	rect.setBounds(L.latLngBounds(e.latlng, e.latlng))
})
map.on('mousemove', (e) => {
	if (!drawFrom || drawFrom === 'armed') return
	rect.setBounds(L.latLngBounds(drawFrom, e.latlng))
	update()
})
map.on('mouseup', () => {
	if (!drawFrom || drawFrom === 'armed') return
	drawFrom = null
	map.dragging.enable()
	map.getContainer().classList.remove('drawing')
	placeHandles()
})

play.onclick = () => (location.href = areaUrl(area()))
