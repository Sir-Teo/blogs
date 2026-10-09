// web-gta's script interpreter and decoder, bundled by run.sh into
// assets/js/web-gta-vm.js. The figure runs a hand-assembled script that uses
// only the interpreter's core operations, never a game command.
export { ScmThread } from '../../../web-gta/src/engine/ScmThread'
export { decodeScmInstructions } from '../../../web-gta/src/assets/scm'
