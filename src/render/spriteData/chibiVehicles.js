// @ts-check
/**
 * Chibi style — vehicles at chibi scale: the New 3D models rendered 1.75× bigger (the chibi soldiers stand about
 * 1.6 tiles tall, so a buggy should be a couple of soldiers long and a Juggernaut a small house), through the same
 * cel filter as Newest. Hit zones are rendered at the same scale, so the scope still finds drivers, tanks and slits.
 * Gameplay footprints do not change.
 */
import { Art } from '../artStyle.js';
import { renderVehicle, VEHICLE_TYPES } from './newVehicles.js';
import { rtsFilterPix } from './rtsVehicles.js';

export const CHIBI_VEHICLE_SCALE = 1.75;

for (const type of VEHICLE_TYPES) {
  Art.registerChibi('vehicle', type, (dir, state) => {
    const r = renderVehicle(type, dir, state, CHIBI_VEHICLE_SCALE);
    const P = rtsFilterPix(r.pix, { lift: 1.25, sat: 1.3 });
    return { get canvas() { return this._c || (this._c = P.toCanvas()); }, _c: null, ax: r.ax, ay: r.ay, w: r.w, h: r.h, zoneMap: state === 'wreck' ? null : r.zone, top: r.ay - r.top, pix: P };
  });
}
