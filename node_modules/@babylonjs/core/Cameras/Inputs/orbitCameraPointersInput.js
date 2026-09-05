import { __decorate } from "../../tslib.es6.js";
import { serialize } from "../../Misc/decorators.js";
import { BaseCameraPointersInput } from "./BaseCameraPointersInput.js";
/**
 * Used by both arcrotatecamera and geospatialcamera, OrbitCameraPointersInputs handle pinchToZoom and multiTouchPanning
 * as though you are orbiting around a target point
 */
export class OrbitCameraPointersInput extends BaseCameraPointersInput {
    constructor() {
        super(...arguments);
        /**
         * Defines whether zoom (2 fingers pinch) is enabled through multitouch
         */
        this.pinchZoom = true;
        /**
         * Defines whether panning (2 fingers swipe) is enabled through multitouch.
         */
        this.multiTouchPanning = true;
        /**
         * Defines whether panning is enabled for both pan (2 fingers swipe) and
         * zoom (pinch) through multitouch.
         */
        this.multiTouchPanAndZoom = true;
        this._isPinching = false;
        this._twoFingerActivityCount = 0;
        this._shouldStartPinchZoom = false;
    }
    _computePinchZoom(_previousPinchSquaredDistance, _pinchSquaredDistance) { }
    _computeMultiTouchPanning(_previousMultiTouchPanPosition, _multiTouchPanPosition) { }
    /**
     * Called on pointer POINTERMOVE event if multiple touches are active.
     * Override this method to provide functionality.
     * @param _pointA First point in the pair
     * @param _pointB Second point in the pair
     * @param previousPinchSquaredDistance Sqr Distance between the points the last time this event was fired (by this input)
     * @param pinchSquaredDistance Sqr Distance between the points this time
     * @param previousMultiTouchPanPosition Previous center point between the points
     * @param multiTouchPanPosition Current center point between the points
     */
    onMultiTouch(_pointA, _pointB, previousPinchSquaredDistance, pinchSquaredDistance, previousMultiTouchPanPosition, multiTouchPanPosition) {
        if (previousPinchSquaredDistance === 0 && previousMultiTouchPanPosition === null) {
            // First time this method is called for new pinch.
            // Next time this is called there will be a
            // previousPinchSquaredDistance and pinchSquaredDistance to compare.
            return;
        }
        if (pinchSquaredDistance === 0 && multiTouchPanPosition === null) {
            // Last time this method is called at the end of a pinch.
            return;
        }
        // Zoom and panning enabled together
        if (this.multiTouchPanAndZoom) {
            this._computePinchZoom(previousPinchSquaredDistance, pinchSquaredDistance);
            this._computeMultiTouchPanning(previousMultiTouchPanPosition, multiTouchPanPosition);
            // Zoom and panning enabled but only one at a time
        }
        else if (this.multiTouchPanning && this.pinchZoom) {
            this._twoFingerActivityCount++;
            if (this._isPinching || this._shouldStartPinchZoom) {
                // Since pinch has not been active long, assume we intend to zoom.
                this._computePinchZoom(previousPinchSquaredDistance, pinchSquaredDistance);
                // Since we are pinching, remain pinching on next iteration.
                this._isPinching = true;
            }
            else {
                // Pause between pinch starting and moving implies not a zoom event. Pan instead.
                this._computeMultiTouchPanning(previousMultiTouchPanPosition, multiTouchPanPosition);
            }
            // Panning enabled, zoom disabled
        }
        else if (this.multiTouchPanning) {
            this._computeMultiTouchPanning(previousMultiTouchPanPosition, multiTouchPanPosition);
            // Zoom enabled, panning disabled
        }
        else if (this.pinchZoom) {
            this._computePinchZoom(previousPinchSquaredDistance, pinchSquaredDistance);
        }
    }
    /**
     * Called each time a new POINTERUP event occurs. Ie, for each button
     * release.
     * @param _evt Defines the event to track
     */
    onButtonUp(_evt) {
        this._twoFingerActivityCount = 0;
        this._isPinching = false;
    }
    /**
     * Called when window becomes inactive.
     */
    onLostFocus() {
        this._twoFingerActivityCount = 0;
        this._isPinching = false;
    }
}
__decorate([
    serialize()
], OrbitCameraPointersInput.prototype, "pinchZoom", void 0);
__decorate([
    serialize()
], OrbitCameraPointersInput.prototype, "multiTouchPanning", void 0);
__decorate([
    serialize()
], OrbitCameraPointersInput.prototype, "multiTouchPanAndZoom", void 0);
//# sourceMappingURL=orbitCameraPointersInput.js.map