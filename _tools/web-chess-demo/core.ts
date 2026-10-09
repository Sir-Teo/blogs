// The parts of web-chess the post's figures run in the browser, bundled from
// the app's own source by run.sh into assets/js/web-chess-core.js.
export { winPercentFromCp, qualityForLoss, accuracyFromWinPercentLoss } from '../../../web-chess/src/engine/analysis'
export { aggregateAccuracy, weightedMean, harmonicMean } from '../../../web-chess/src/engine/accuracyAggregate'
export { planReviewPool, splitReviewQueue } from '../../../web-chess/src/engine/reviewPool'
export {
  detectEngineCapabilities, resolveProfile, recommendedThreadCount, recommendedHashMb, recommendedMultiPv,
} from '../../../web-chess/src/engine/profiles'
