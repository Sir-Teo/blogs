// The parts of web-xiangqi the post's figures run in the browser, bundled from
// the app's own source by run.sh into assets/js/web-xiangqi-core.js.
export {
  START_POSITION_FEN, parseFenBoard, boardToFen, parseMove, squareToUci, validatePieceMove,
  legalMovesFrom, isInCheck, hasAnyLegalMove, cloneBoardState, findKing,
} from '../../../web-xiangqi/src/utils/xiangqi'
export { formatMoveInStyle, formatLineTokensInStyle } from '../../../web-xiangqi/src/utils/xiangqiNotation'
export { formatMoveRuleHint } from '../../../web-xiangqi/src/utils/moveRuleHints'
export { pieceLabel } from '../../../web-xiangqi/src/utils/pieceStyle'
export { getWinningChancePercent } from '../../../web-xiangqi/src/utils/review'
export { describeRepetition, shouldReportRepetition, formatRepetitionHeadline, formatRepetitionRule } from '../../../web-xiangqi/src/utils/repetition'
