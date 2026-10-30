import { expect, test } from 'bun:test'
import { offerJob, payout, timeFor } from '../src/jobs.js'

const shop = (kind, x, y) => ({ kind, name: kind, stand: { x, y } })
const door = (number, x, y) => ({ street: 'Weserstraße', number, x, y, stand: { x, y } })

test('a job goes from a kitchen near you to a door a fair ride away', () => {
	const shops = [shop('doener', 50, 0), shop('bakery', 30, 0), shop('doener', 2000, 0)]
	const doors = [door('1', 60, 0), door('47', 250, 0)]
	let n = 0
	const job = offerJob(shops, doors, 0, 0, () => (n++ % 2) * 0.6)
	expect(job.from).toBe(shops[0])
	expect(job.to.number).toBe('47')
	expect(job.limit).toBe(timeFor(200))
	expect(job.items.length).toBeGreaterThan(1)
})

test('no kitchen at all, no job', () => {
	expect(offerJob([shop('bakery', 50, 0)], [door('1', 200, 0)], 0, 0)).toBeNull()
})

test('ridden out of the Kiez, the job comes from the nearest kitchen', () => {
	const far = shop('doener', 1000, 0)
	const job = offerJob([far, shop('doener', 3000, 0)], [door('1', 1200, 0)], 0, 0, () => 0)
	expect(job.from).toBe(far)
})

test('quick pays a tip, late pays half, knocks cost', () => {
	const job = { limit: 100, pay: 500 }
	const quick = payout(job, 50, 0)
	expect(quick.tip).toBeGreaterThan(0)
	expect(quick.total).toBe(quick.base + quick.tip)
	expect(payout(job, 120, 0)).toMatchObject({ late: true, tip: 0, total: 250 })
	expect(payout(job, 50, 2).total).toBeLessThan(quick.total)
	expect(payout(job, 200, 20).total).toBe(50)
})
