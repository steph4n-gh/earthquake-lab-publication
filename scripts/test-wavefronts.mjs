#!/usr/bin/env node
import assert from 'node:assert/strict';
import {packFan, sampleRay, stationPhaseState} from '../web/wavefronts.js';
const fan = packFan({depth_km: 29, policy: 'control', gaps: [], segments: [{phase: 'P', rays: [{phase: 'P', time_s: 20, ray_param_s_rad: 300, turning_depth_km: 300, path: [{time_s: 0, distance_rad: 0, depth_km: 29}, {time_s: 10, distance_rad: 0.2, depth_km: 300}, {time_s: 20, distance_rad: 0.5, depth_km: 0}]}]}]}, 'frozen-model');
const result = new Float64Array(2);
assert.equal(fan.byteLength, 72);
assert.equal(sampleRay(fan.samples, fan.segments[0].rays[0], 5, result), true);
assert.deepEqual(Array.from(result), [0.1, 164.5]);
assert.equal(sampleRay(fan.samples, fan.segments[0].rays[0], 20, result), true);
assert.deepEqual(Array.from(result), [0.5, 0]);
assert.equal(sampleRay(fan.samples, fan.segments[0].rays[0], 20.001, result), false);
assert.equal(sampleRay(fan.samples, fan.segments[0].rays[0], -0.001, result), false);
const arrivals = [{phase: 'P', timeS: 20}, {phase: 'S', timeS: 40}];
assert.deepEqual(stationPhaseState(arrivals, 25, 5), {reached: ['P'], pulse: 1, phase: 'P'});
assert.deepEqual(stationPhaseState(arrivals, 24.99, 5), {reached: [], pulse: 0, phase: undefined});
assert.deepEqual(stationPhaseState(arrivals, 45, 5), {reached: ['P', 'S'], pulse: 1, phase: 'S'});
assert.deepEqual(stationPhaseState(arrivals, 0, 5), {reached: [], pulse: 0, phase: undefined});
console.log('PASS packed cumulative-time interpolation, expiry, origin offset and pure rewind.');
