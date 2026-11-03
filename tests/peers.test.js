import { expect, test } from 'bun:test'
import { createPeers } from '../src/peers.js'

const pose = (id, x, extra = {}) => ({ t: 'pose', id, x, y: 0, angle: 0, vehicle: 'foot', name: 'Kalle', ...extra })

test('a peer is shown between the two poses either side of 0.2 s ago', () => {
	const peers = createPeers()
	peers.receive(pose('a', 0), 1)
	peers.receive(pose('a', 1), 1.1)
	const [p] = peers.at(1.25)
	expect(p.name).toBe('Kalle')
	expect(p.pose.x).toBeCloseTo(0.5)
})

test('a respawn snaps instead of sliding across the map', () => {
	const peers = createPeers()
	peers.receive(pose('a', 0), 1)
	peers.receive(pose('a', 50), 1.1)
	expect([0, 50]).toContain(peers.at(1.25)[0].pose.x)
})

test('hidden players, leavers and the silent drop out', () => {
	const peers = createPeers()
	peers.receive(pose('a', 0, { hidden: true }), 1)
	peers.receive(pose('b', 0), 1)
	peers.receive(pose('c', 0), 1)
	peers.receive({ t: 'leave', id: 'c' }, 1)
	expect(peers.at(1.5).map((p) => [p.id, !!p.pose])).toEqual([
		['a', false],
		['b', true],
	])
	expect(peers.at(20)).toEqual([])
})

test('junk is ignored and names are cleaned', () => {
	const peers = createPeers()
	peers.receive(pose('a', NaN), 1)
	peers.receive({ t: 'pose', x: 1 }, 1)
	peers.receive(pose('b', 0, { name: '<b>' }), 1)
	expect(peers.at(1).map((p) => p.name)).toEqual(['b'])
})
