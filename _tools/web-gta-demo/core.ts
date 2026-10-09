// The pure parts of web-gta the post's figures run in the browser, bundled from
// the port's own source by run.sh into assets/js/web-gta-core.js. The figures
// feed them made-up inputs; nothing from the game's data is bundled.
export { SceneRegionFollower, REGION_PREFETCH_FRACTION, REGION_PAUSE_FRACTION } from '../../../web-gta/src/assets/sceneRegionFollower'
export { slowCarDownForOtherCar } from '../../../web-gta/src/vehicle/nativeCarCtrl'
export { DynamicResolution, RESOLUTION_STEPS, RESOLUTION_FLOOR, scaledRatio } from '../../../web-gta/src/core/dynamicResolution'
export { decodeDxt, decodeDxt1To5551 } from '../../../web-gta/src/assets/dxt'
export { stickSteering } from '../../../web-gta/src/input/stickSteering'
