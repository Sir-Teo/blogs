// Time to each depth from the start position, at several thread counts, with
// the threaded SIMD core in Node on this machine. One run per count.
//
//   node threads.cjs <out.json> [max depth] [threads...]
const { writeFileSync } = require('fs')
const { boot, parseInfo } = require('./pikafish.cjs')
const [out, depthArg, ...counts] = process.argv.slice(2)
const maxDepth = Number(depthArg || 22)
const threads = (counts.length ? counts : ['1', '2', '4', '8']).map(Number)
;(async () => {
  const runs = []
  for (const t of threads) {
    const e = await boot({ variant: t === 1 ? 'single-simd' : 'threaded-simd', threads: t, hashMb: 256 })
    await e.fresh()
    const lines = await e.search('position startpos', `go depth ${maxDepth}`)
    const byDepth = new Map()
    for (const i of lines.map(parseInfo).filter(Boolean)) if (!i.bound && i.multipv === 1) byDepth.set(i.depth, { depth: i.depth, time: i.time, nodes: i.nodes, cp: i.cp ?? null })
    const points = [...byDepth.values()].sort((a, b) => a.depth - b.depth)
    const last = points[points.length - 1]
    console.log(`${t} thread(s), ${e.variant}: depth ${last.depth} in ${last.time} ms, ${last.nodes} nodes, ${Math.round(last.nodes / last.time * 1000)} nps`)
    runs.push({ threads: t, variant: e.variant, points })
    e.quit()
  }
  const os = require('os')
  writeFileSync(out, JSON.stringify({ cpu: os.cpus()[0].model, cores: os.cpus().length, node: process.version, runs }))
  process.exit(0)
})()
