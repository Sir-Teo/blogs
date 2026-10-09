// Battles from Crown & Clan's own simulation (web-coc's GameModel), run in Node
// and recorded compactly for the post's figures. Only the project's own
// authored villages (the valley-v1 campaign) are used, and nothing from the
// game's art or data tables is written out beyond positions, footprints and
// hit-point fractions.
//
//   node raids.mjs <out.json>
import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { GameModel, enemyBase, findPath, distanceTo, resetPathCaches, type Battle } from '../../../web-coc/src/game/model'
import { TROOP_KEYS, TROOPS, BUILDINGS, CAMPAIGN } from '../../../web-coc/src/game/data'

const FIXED_NOW = Date.UTC(2026, 9, 1)
const TICK = 0.05
const STALL = 20
const EVERY = 8 // record every eighth step: 2.5 frames a second; the figure interpolates
const DEFENSES = new Set(['cannon', 'archertower', 'mortar', 'airdefense', 'wizardtower', 'tesla', 'bombtower', 'airsweeper'])
const RESOURCES = new Set(['goldstorage', 'elixirstorage', 'goldmine', 'collector', 'townhall'])

const canonical = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canonical)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical((v as Record<string, unknown>)[k])]))
      : v
const hash = (b: Battle) => createHash('sha256').update(JSON.stringify(canonical(b))).digest('hex').slice(0, 12)

type Drop = { kind: string; x: number; y: number; at: number }
type Army = Record<string, number>

function fresh(index: number, army: Army, level: number) {
  resetPathCaches()
  const m = new GameModel(undefined, FIXED_NOW)
  m.state.obstacles = []
  m.state.stars = Array(12).fill(3) // the campaign gates village i on a star at i - 1
  m.state.army = Object.fromEntries(TROOP_KEYS.map(k => [k, army[k] ?? 0])) as never
  m.state.troopLevels = Object.fromEntries(TROOP_KEYS.map(k => [k, level])) as never
  m.startBattle(index, false, 'valley-v1')
  if (!m.battle) throw new Error('battle refused')
  return m
}

// Moves a drop outward, away from the village centre, until it is outside the red zone.
function legal(m: GameModel, x: number, y: number, cx: number, cy: number) {
  const dx = x - cx, dy = y - cy, len = Math.hypot(dx, dy) || 1
  for (let k = 0; k < 60 && m.deployBlocked(x, y); k++) { x += dx / len * 0.5; y += dy / len * 0.5 }
  return { x: Math.max(1, Math.min(46.9, x)), y: Math.max(1, Math.min(46.9, y)) }
}

function plan(army: Army, px: number, py: number, nx: number, ny: number): Drop[] {
  // A player's usual order: tanks first, wall breakers behind them, then the rest.
  const order: [string, number][] = [['giant', 0], ['balloon', 0], ['dragon', 1], ['wallbreaker', 2.5], ['swordsman', 3.5], ['archer', 6], ['wizard', 6]]
  const drops: Drop[] = []
  for (const [kind, at] of order) {
    const n = army[kind] ?? 0
    for (let i = 0; i < n; i++) {
      const s = (i - (n - 1) / 2) * 0.35 // spread along the edge
      drops.push({ kind, x: px + nx * s, y: py + ny * s, at: at + i * 0.1 })
    }
  }
  return drops.sort((a, b) => a.at - b.at)
}

function battle(index: number, army: Army, level: number, drops: Drop[], dt = TICK, record = true) {
  const m = fresh(index, army, level)
  const b = m.battle!
  const bs = b.buildings
  const cx = bs.reduce((s, v) => s + v.x, 0) / bs.length, cy = bs.reduce((s, v) => s + v.y, 0) / bs.length
  const shots: number[] = []
  let frame = 0
  // A shot fired during a step is stamped with the frame sampled after it, the
  // first one that can show the projectile in flight.
  m.onEffect = fx => {
    if (!record || fx.type !== 'projectile' || fx.sourceId === undefined || fx.targetBuilding) return
    const bi = bs.findIndex(v => v.id === fx.sourceId)
    if (bi >= 0 && fx.targetId !== undefined) shots.push(frame, bi, fx.targetId)
  }
  const queue = [...drops]
  const tracks = new Map<number, { k: number; f0: number; xy: number[]; hp: number[]; last?: [number, number] }>()
  const bhp: number[][] = bs.map(() => [])
  const score: number[] = []
  let ticks = 0
  const sample = () => {
    for (const u of b.units) {
      let t = tracks.get(u.id)
      if (u.hp <= 0 && (!t || t.hp[t.hp.length - 1] === 0)) continue
      if (!t) { t = { k: TROOP_KEYS.indexOf(u.kind as never), f0: frame, xy: [], hp: [] }; tracks.set(u.id, t) }
      // Tenths of a tile, each sample stored as the change from the one before.
      const qx = Math.round(u.x * 10), qy = Math.round(u.y * 10)
      if (!t.last) t.xy.push(qx, qy)
      else t.xy.push(qx - t.last[0], qy - t.last[1])
      t.last = [qx, qy]
      t.hp.push(Math.max(0, Math.round(100 * u.hp / u.maxHp)))
    }
    bs.forEach((v, i) => {
      const hp = Math.max(0, Math.round(100 * v.hp / v.maxHp))
      const h = bhp[i]
      if (!h.length || h[h.length - 1] !== hp) h.push(frame, hp)
    })
    score.push(b.destruction, b.stars)
    frame++
  }
  // The campaign has no clock: a player whose troops have stalled presses End.
  // The script does the same after STALL seconds without damage to a building.
  let progressAt = 0, standing = Infinity, ended = false
  while (!b.finished && ticks < 20000) {
    const hp = bs.reduce((sum, v) => sum + Math.max(0, v.hp), 0)
    if (hp < standing) { standing = hp; progressAt = b.elapsed }
    if (!queue.length && b.elapsed - progressAt > STALL) { m.finishBattle(); ended = true; break }
    while (queue.length && queue[0].at <= b.elapsed + 1e-9) {
      const d = queue.shift()!
      m.activeTroop = d.kind as never
      const p = legal(m, d.x, d.y, cx, cy)
      m.deploy(p.x, p.y)
    }
    if (record && ticks % EVERY === 0) sample()
    m.step(dt)
    ticks++
  }
  if (record) sample()
  return {
    m, b, ticks,
    result: { stars: b.stars, destruction: b.destruction, seconds: +b.elapsed.toFixed(2), ended, hash: hash(b) },
    frames: frame,
    units: [...tracks.entries()].map(([id, t]) => ({ id, k: t.k, f0: t.f0, xy: t.xy, hp: t.hp })),
    bhp, shots, score,
  }
}

function layoutOf(index: number) {
  return enemyBase(index).map(v => [v.kind, v.x, v.y, BUILDINGS[v.kind].size])
}

// Deploy points on a rectangle around the village, a little outside its bounding box.
function ring(index: number, n: number) {
  const bs = enemyBase(index)
  const x0 = Math.min(...bs.map(v => v.x)) - 2, y0 = Math.min(...bs.map(v => v.y)) - 2
  const x1 = Math.max(...bs.map(v => v.x + BUILDINGS[v.kind].size)) + 2, y1 = Math.max(...bs.map(v => v.y + BUILDINGS[v.kind].size)) + 2
  const w = x1 - x0, h = y1 - y0, per = 2 * (w + h)
  const pts: { x: number; y: number; nx: number; ny: number }[] = []
  for (let i = 0; i < n; i++) {
    let d = (i + 0.5) / n * per
    if (d < w) pts.push({ x: x0 + d, y: y0, nx: 1, ny: 0 })
    else if ((d -= w) < h) pts.push({ x: x1, y: y0 + d, nx: 0, ny: 1 })
    else if ((d -= h) < w) pts.push({ x: x1 - d, y: y1, nx: 1, ny: 0 })
    else { d -= w; pts.push({ x: x0, y: y1 - d, nx: 0, ny: 1 }) }
  }
  return pts
}

const out: Record<string, unknown> = {
  troops: TROOP_KEYS.slice(0, 10).map(k => (TROOPS as Record<string, { name: string }>)[k].name),
  villages: CAMPAIGN.map((c, i) => ({ name: c.name, difficulty: c.difficulty, layout: layoutOf(i) })),
}

const SECTIONS = new Set((process.env.SECTIONS || 'raids,paths,sweep,det').split(','))

// ---- 1. Where you attack from: one army, many deploy points --------------------
const RAID_ARMY: Army = JSON.parse(process.env.RAID_ARMY || '{"giant":6,"wallbreaker":4,"swordsman":16,"archer":16}')
const RAID_LEVEL = Number(process.env.RAID_LEVEL || 3)
const raidVillages = (process.env.RAID_VILLAGES || '5').split(',').map(Number)
const raidPoints = Number(process.env.RAID_POINTS || 12)
out.raidArmy = RAID_ARMY
out.raidLevel = RAID_LEVEL
if (SECTIONS.has('raids')) out.raids = raidVillages.map(index => {
  const points = ring(index, raidPoints)
  const runs = points.map(p => {
    const r = battle(index, RAID_ARMY, RAID_LEVEL, plan(RAID_ARMY, p.x, p.y, p.nx, p.ny))
    console.log(`raid v${index} @${p.x.toFixed(1)},${p.y.toFixed(1)}: ${r.result.stars}* ${r.result.destruction}% ${r.result.seconds}s, ${r.units.length} units, ${r.frames} frames`)
    return { at: [+p.x.toFixed(2), +p.y.toFixed(2)], ...r.result, frames: r.frames, units: r.units, bhp: r.bhp, shots: r.shots, score: r.score }
  })
  return { index, runs }
})

// ---- 2. Routes through walls: the real findPath from every edge point ----------
const PATH_VILLAGE = Number(process.env.PATH_VILLAGE || 5)
if (SECTIONS.has('paths')) {
  const bs = enemyBase(PATH_VILLAGE).map((v, i) => ({ ...v, id: 1000 + i }))
  const walls = new Set(bs.filter(v => v.kind === 'wall').map(v => `${v.x},${v.y}`))
  const targets = {
    barbarian: { range: (TROOPS as never as Record<string, { range: number }>).swordsman.range, pick: (v: { kind: string }) => v.kind !== 'wall' && !(BUILDINGS[v.kind as never] as { trap?: unknown }).trap },
    giant: { range: (TROOPS as never as Record<string, { range: number }>).giant.range, pick: (v: { kind: string }) => DEFENSES.has(v.kind) },
    goblin: { range: (TROOPS as never as Record<string, { range: number }>).goblin.range, pick: (v: { kind: string }) => RESOURCES.has(v.kind) },
  }
  const starts = ring(PATH_VILLAGE, 64)
  const routes: Record<string, unknown[]> = {}
  for (const [name, t] of Object.entries(targets)) {
    routes[name] = starts.map(s => {
      const cands = bs.filter(t.pick)
      let best = cands[0], bd = Infinity
      for (const c of cands) { const d = distanceTo(s, c); if (d < bd) { bd = d; best = c } }
      resetPathCaches()
      const path = findPath(s, best, bs, t.range)
      const crossed = path.filter(p => walls.has(`${Math.floor(p.x)},${Math.floor(p.y)}`)).length
      return { s: [+s.x.toFixed(2), +s.y.toFixed(2)], t: bs.indexOf(best), p: path.map(p => [+p.x.toFixed(2), +p.y.toFixed(2)]), walls: crossed }
    })
  }
  out.paths = { index: PATH_VILLAGE, routes }
  for (const [k, v] of Object.entries(routes)) console.log(`paths ${k}: ${v.length} routes, ${(v as { walls: number }[]).filter(r => r.walls > 0).length} through walls`)
}

// ---- 3. The same army against all twelve villages -----------------------------
const ARMIES: { name: string; army: Army; level: number }[] = [
  { name: 'Small', army: { giant: 4, swordsman: 20, archer: 20 }, level: 1 },
  { name: 'Medium', army: { giant: 8, wallbreaker: 6, swordsman: 30, archer: 30, wizard: 6 }, level: 3 },
  { name: 'Air', army: { balloon: 8, dragon: 3, archer: 14 }, level: 2 },
]
if (SECTIONS.has('sweep')) out.sweep = ARMIES.map(a => ({
  name: a.name, army: a.army, level: a.level,
  results: CAMPAIGN.map((_, index) => {
    const p = ring(index, 4)[3] // the west side
    const r = battle(index, a.army, a.level, plan(a.army, p.x, p.y, p.nx, p.ny), TICK, false)
    return r.result
  }),
}))
for (const s of (out.sweep ?? []) as { name: string; results: { stars: number; destruction: number }[] }[]) console.log(`sweep ${s.name}: ${s.results.map(r => `${r.stars}*${r.destruction}`).join(' ')}`)

// ---- 4. Determinism: the same raid stepped at 0.05 s and at 0.1 s --------------
if (SECTIONS.has('det')) {
  const index = 0
  const p = ring(index, 4)[3]
  const army: Army = { giant: 4, swordsman: 20, archer: 20 }
  const drops = plan(army, p.x, p.y, p.nx, p.ny)
  const a = battle(index, army, 1, drops, 0.05)
  const a2 = battle(index, army, 1, drops, 0.05, false)
  const b = battle(index, army, 1, drops, 0.1)
  const rec = a.m.state.raidLog?.[0]?.replay
  const replayJson = rec ? JSON.stringify(rec) : ''
  // Replay the recording in a new model from the saved state, and compare.
  const viewer = new GameModel(JSON.parse(JSON.stringify(a.m.state)), FIXED_NOW)
  const id = a.m.state.raidLog![0].id
  viewer.startReplay(id)
  let guard = 0
  while (!viewer.replay!.complete && guard++ < 20000) viewer.step(0.05)
  out.determinism = {
    index,
    fine: { ...a.result, ticks: a.ticks, frames: a.frames, units: a.units, bhp: a.bhp, score: a.score },
    coarse: { ...b.result, ticks: b.ticks, frames: b.frames, units: b.units, bhp: b.bhp, score: b.score },
    rerunHash: a2.result.hash,
    replayHash: hash(viewer.battle!),
    replay: rec ? { steps: rec.steps.length, actions: rec.actions.length, bytes: replayJson.length, kinds: rec.actions.map((x: { kind?: string; type?: string }) => x.kind ?? x.type), at: rec.actions.map((x: { step: number }) => x.step) } : null,
  }
  console.log(`determinism: 0.05 -> ${JSON.stringify(a.result)} ticks ${a.ticks}; rerun ${a2.result.hash}; replay ${hash(viewer.battle!)}; 0.1 -> ${JSON.stringify(b.result)} ticks ${b.ticks}; recording ${rec?.steps.length} steps ${rec?.actions.length} actions ${replayJson.length} bytes`)
}

for (const i of [0, 4, 6]) console.log(`village ${i} west point`, JSON.stringify(ring(i, 4)[3]))
writeFileSync(process.argv[2], JSON.stringify(out))
process.exit(0)
