// Writes Cburnett's pieces, as react-chessboard (web-chess's board) draws them,
// into assets/js/web-chess.js as symbol contents. Run once; the result is
// committed. react-chessboard is MIT; the artwork is Colin M.L. Burnett's
// (GPL/BSD/GFDL on Wikimedia Commons).
//
//   node pieces.cjs <web-chess checkout> <assets/js/web-chess.js>
const fs = require('fs')
const [webChess, target] = process.argv.slice(2)
const src = fs.readFileSync(`${webChess}/node_modules/react-chessboard/dist/index.js`, 'utf8').split('\n')
const start = src.findIndex(l => l.startsWith('const defaultPieces = {'))
let depth = 0, end = start
for (let i = start; i < src.length; i++) {
  for (const ch of src[i]) { if (ch === '{') depth++; else if (ch === '}') depth-- }
  if (depth === 0 && i > start) { end = i; break }
}
const body = src.slice(start, end + 1).join('\n').replace('const defaultPieces =', 'module.exports =')
function jsx(tag, props) {
  const { children, style, ...rest } = props || {}
  const attrs = Object.entries(rest).filter(([k]) => k !== 'svgStyle').map(([k, v]) => ` ${k}="${v}"`).join('')
  const st = style ? ' style="' + Object.entries(style).map(([k, v]) => k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()) + ':' + v).join(';') + '"' : ''
  const kids = children === undefined ? [] : Array.isArray(children) ? children : [children]
  return tag === 'svg' ? kids.join('') : `<${tag}${attrs}${st}>${kids.join('')}</${tag}>`
}
const m = { exports: {} }
new Function('module', 'jsxRuntime', body)(m, { jsx, jsxs: jsx })
const out = {}
for (const [k, f] of Object.entries(m.exports)) out[k] = f({})
const js = fs.readFileSync(target, 'utf8').replace(/var PIECES = .*;\n/, `var PIECES = ${JSON.stringify(out)};\n`)
fs.writeFileSync(target, js)
console.log(`${Object.keys(out).length} pieces, ${JSON.stringify(out).length} bytes`)
