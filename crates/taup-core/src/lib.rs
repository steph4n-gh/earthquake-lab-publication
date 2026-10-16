//! Spherical IASP91 rays for surface receivers. The Bullen layer equations and
//! source-depth splitting follow ObsPy 1.5.1, distributed under LGPLv3.
//! See THIRD_PARTY.md and fixtures/provenance.json for source and model lineage.
use serde::{Deserialize, Serialize};
use std::{fmt, sync::OnceLock};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum Phase {
    P,
    S,
    PKIKP,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PathPoint {
    pub time_s: f64,
    pub distance_rad: f64,
    pub depth_km: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Arrival {
    pub phase: Phase,
    pub time_s: f64,
    pub ray_param_s_rad: f64,
    pub turning_depth_km: f64,
    pub path: Vec<PathPoint>,
}

#[derive(Clone, Debug, Serialize)]
pub struct FanSegment {
    pub phase: Phase,
    pub rays: Vec<Arrival>,
}

#[derive(Clone, Debug, Serialize)]
pub struct FanGap {
    pub phase: Phase,
    pub lower_p_s_rad: f64,
    pub upper_p_s_rad: f64,
    pub depth_km: f64,
    pub reason: &'static str,
}

#[derive(Clone, Debug, Serialize)]
pub struct WavefrontFan {
    pub depth_km: f64,
    pub policy: &'static str,
    pub segments: Vec<FanSegment>,
    pub gaps: Vec<FanGap>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InputError(pub &'static str);
impl fmt::Display for InputError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(f)
    }
}
impl std::error::Error for InputError {}

#[derive(Deserialize)]
struct ModelData {
    radius_km: f64,
    cmb_depth_km: f64,
    icb_depth_km: f64,
    ray_params_s_rad: Vec<f64>,
    p_layers: Vec<[f64; 4]>,
    s_layers: Vec<[f64; 4]>,
}

struct Model {
    cmb: f64,
    icb: f64,
    knots: Vec<f64>,
    p: Vec<Layer>,
    s: Vec<Layer>,
}

#[derive(Clone, Copy)]
struct Layer {
    q0: f64,
    z0: f64,
    q1: f64,
    z1: f64,
    radius: f64,
    b: f64,
}

#[derive(Clone, Copy, Default)]
struct Integral {
    time: f64,
    angle: f64,
}
impl Integral {
    fn plus(self, other: Self) -> Self {
        Self {
            time: self.time + other.time,
            angle: self.angle + other.angle,
        }
    }
}

struct Ray {
    total: Integral,
    source: Integral,
    turning_depth: f64,
    slope: f64,
}

impl Layer {
    fn new(a: [f64; 4], radius: f64) -> Self {
        let [q0, z0, q1, z1] = a;
        let b = if z1 == z0 {
            0.0
        } else if q1 == 0.0 {
            1.0
        } else {
            (q0 / q1).ln() / ((radius - z0) / (radius - z1)).ln()
        };
        Self {
            q0,
            z0,
            q1,
            z1,
            radius,
            b,
        }
    }
    fn slowness(&self, depth: f64) -> f64 {
        if depth == self.z0 {
            self.q0
        } else if depth == self.z1 {
            self.q1
        } else {
            self.q0 * (self.b * ((self.radius - depth) / (self.radius - self.z0)).ln()).exp()
        }
    }
    fn turning_depth(&self, p: f64) -> f64 {
        if self.z0 == self.z1 || p == self.q0 {
            self.z0
        } else if p == self.q1 {
            self.z1
        } else {
            self.radius - (self.radius - self.z0) * ((p / self.q0).ln() / self.b).exp()
        }
    }
    fn distance_slope(&self, p: f64, z0: f64, z1: f64, turns: bool) -> f64 {
        if z0 == z1 {
            return 0.0;
        }
        let q0 = self.slowness(z0);
        let q1 = self.slowness(z1);
        let u0 = ((q0 - p).max(0.0) * (q0 + p)).sqrt();
        if turns {
            return -1.0 / (self.b * u0);
        }
        let u1 = ((q1 - p).max(0.0) * (q1 + p)).sqrt();
        if self.b.abs() < 1e-10 {
            return q0 * q0 / (u0 * u0 * u0) * ((self.radius - z0) / (self.radius - z1)).ln();
        }
        (q0 - q1) * (q0 + q1) / ((u0 + u1) * u0 * u1 * self.b)
    }
    fn integral(&self, p: f64, z0: f64, z1: f64) -> Integral {
        if z0 == z1 {
            return Integral::default();
        }
        let q0 = self.slowness(z0);
        if p == 0.0 && z1 == self.radius {
            return Integral {
                time: q0,
                angle: std::f64::consts::FRAC_PI_2,
            };
        }
        let mut q1 = self.slowness(z1);
        if (q1 - p).abs() < 1e-9 {
            q1 = p;
        }
        let u0 = ((q0 - p).max(0.0) * (q0 + p)).sqrt();
        let u1 = ((q1 - p).max(0.0) * (q1 + p)).sqrt();
        if self.b.abs() < 1e-10 {
            let log_r = ((self.radius - z0) / (self.radius - z1)).ln();
            return Integral {
                time: q0 * q0 / u0 * log_r,
                angle: p / u0 * log_r,
            };
        }
        let du = if u0 + u1 > 0.0 {
            (q0 - q1) * (q0 + q1) / (u0 + u1)
        } else {
            0.0
        };
        Integral {
            time: du / self.b,
            angle: (p * du).atan2(p * p + u0 * u1) / self.b,
        }
    }
}

fn model() -> &'static Model {
    static MODEL: OnceLock<Model> = OnceLock::new();
    MODEL.get_or_init(|| {
        let raw: ModelData = serde_json::from_str(include_str!("../../../fixtures/iasp91.json"))
            .expect("bundled IASP91 data must parse");
        Model {
            cmb: raw.cmb_depth_km,
            icb: raw.icb_depth_km,
            knots: raw.ray_params_s_rad,
            p: raw
                .p_layers
                .into_iter()
                .map(|a| Layer::new(a, raw.radius_km))
                .collect(),
            s: raw
                .s_layers
                .into_iter()
                .map(|a| Layer::new(a, raw.radius_km))
                .collect(),
        }
    })
}

impl Model {
    fn layers(&self, phase: Phase) -> &[Layer] {
        if phase == Phase::S {
            &self.s
        } else {
            &self.p
        }
    }
    fn source_slowness(&self, layers: &[Layer], depth: f64) -> f64 {
        layers
            .iter()
            .find(|l| l.z0 <= depth && depth < l.z1)
            .expect("supported source lies in a finite layer")
            .slowness(depth)
    }
    fn bounds(&self, layers: &[Layer], phase: Phase, depth: f64) -> (f64, f64) {
        let source_q = self.source_slowness(layers, depth);
        if phase == Phase::PKIKP {
            let max = layers
                .iter()
                .take_while(|l| l.z1 <= self.icb)
                .fold(source_q, |q, l| q.min(l.q0).min(l.q1));
            (0.0, max)
        } else {
            let min = layers
                .iter()
                .find(|l| l.z1 == self.cmb && l.z0 < l.z1)
                .expect("model has a CMB")
                .q1;
            (min, source_q)
        }
    }
    fn shoot(&self, phase: Phase, depth: f64, p: f64) -> Option<Ray> {
        let mut total = Integral::default();
        let mut source = Integral::default();
        let mut slope = 0.0;
        let layers = self.layers(phase);
        for layer in layers {
            if p > layer.q0 + 1e-8 {
                return None;
            }
            let turns = p >= layer.q1 && layer.q1 <= layer.q0;
            let bottom = if turns {
                layer.turning_depth(p)
            } else {
                layer.z1
            };
            if layer.z0 < depth {
                source = source.plus(layer.integral(p, layer.z0, bottom.min(depth)));
                slope -=
                    layer.distance_slope(p, layer.z0, bottom.min(depth), turns && bottom <= depth);
            }
            total = total.plus(layer.integral(p, layer.z0, bottom));
            slope += 2.0 * layer.distance_slope(p, layer.z0, bottom, turns);
            if turns {
                if bottom + 1e-7 < depth {
                    return None;
                }
                let legal = match phase {
                    Phase::P | Phase::S => bottom <= self.cmb,
                    Phase::PKIKP => bottom >= self.icb,
                };
                return legal.then_some(Ray {
                    total,
                    source,
                    turning_depth: bottom,
                    slope,
                });
            }
            if phase != Phase::PKIKP && layer.z1 >= self.cmb {
                return None;
            }
        }
        None
    }
    fn roots(&self, phase: Phase, depth: f64, angle: f64) -> Vec<f64> {
        let layers = self.layers(phase);
        let (lo, hi) = self.bounds(layers, phase, depth);
        let mut knots = self
            .knots
            .iter()
            .copied()
            .chain(layers.iter().flat_map(|l| [l.q0, l.q1]))
            .filter(|p| *p > lo && *p < hi)
            .collect::<Vec<_>>();
        knots.extend([lo, hi]);
        knots.sort_by(f64::total_cmp);
        knots
            .dedup_by(|a, b| (*a - *b).abs() <= 8.0 * f64::EPSILON * a.abs().max(b.abs()).max(1.0));
        let mut samples = Vec::with_capacity(knots.len() * 5);
        for pair in knots.windows(2) {
            for i in 0..4 {
                let p = pair[0] + (pair[1] - pair[0]) * (i as f64) / 4.0;
                samples.push((
                    p,
                    self.shoot(phase, depth, p)
                        .map(|r| 2.0 * r.total.angle - r.source.angle - angle),
                ));
            }
        }
        samples.push((
            hi,
            self.shoot(phase, depth, hi)
                .map(|r| 2.0 * r.total.angle - r.source.angle - angle),
        ));
        let mut extrema = Vec::new();
        for pair in samples.windows(2) {
            let span = pair[1].0 - pair[0].0;
            let mut a = pair[0].0 + span * 1e-7;
            let mut b = pair[1].0 - span * 1e-7;
            let (Some(left), Some(right)) =
                (self.shoot(phase, depth, a), self.shoot(phase, depth, b))
            else {
                continue;
            };
            let mut da = left.slope;
            if da.is_finite() && right.slope.is_finite() && da * right.slope < 0.0 {
                for _ in 0..60 {
                    let mid = (a + b) / 2.0;
                    if mid == a || mid == b {
                        break;
                    }
                    let Some(ray) = self.shoot(phase, depth, mid) else {
                        break;
                    };
                    if da * ray.slope <= 0.0 {
                        b = mid;
                    } else {
                        a = mid;
                        da = ray.slope;
                    }
                }
                let p = (a + b) / 2.0;
                let ray = self
                    .shoot(phase, depth, p)
                    .expect("extremum remains a legal ray");
                extrema.push((p, Some(2.0 * ray.total.angle - ray.source.angle - angle)));
            }
        }
        samples.extend(extrema);
        samples.sort_by(|a, b| a.0.total_cmp(&b.0));
        let mut roots = Vec::new();
        for (index, &(p, residual)) in samples.iter().enumerate() {
            let Some(value) = residual else { continue };
            let has_crossing = index
                .checked_sub(1)
                .into_iter()
                .chain((index + 1 < samples.len()).then_some(index + 1))
                .any(|neighbor| samples[neighbor].1.is_some_and(|other| value * other < 0.0));
            if value.abs() < 1e-12 && !has_crossing {
                roots.push(p);
            }
        }
        for pair in samples.windows(2) {
            let [(mut a, fa), (mut b, fb)] = [pair[0], pair[1]];
            let (Some(mut fa), Some(fb)) = (fa, fb) else {
                continue;
            };
            if fa * fb < 0.0 {
                for _ in 0..65 {
                    let mid = (a + b) / 2.0;
                    if mid == a || mid == b {
                        break;
                    }
                    let Some(ray) = self.shoot(phase, depth, mid) else {
                        break;
                    };
                    let fm = 2.0 * ray.total.angle - ray.source.angle - angle;
                    if fa * fm <= 0.0 {
                        b = mid;
                    } else {
                        a = mid;
                        fa = fm;
                    }
                }
                roots.push((a + b) / 2.0);
            }
        }
        roots.sort_by(f64::total_cmp);
        roots.dedup_by(|a, b| {
            (*a - *b).abs() <= 32.0 * f64::EPSILON * a.abs().max(b.abs()).max(1.0)
        });
        roots.retain(|p| {
            self.shoot(phase, depth, *p)
                .is_some_and(|r| (2.0 * r.total.angle - r.source.angle - angle).abs() < 1e-8)
        });
        roots
    }
    fn path(&self, phase: Phase, depth: f64, p: f64, ray: &Ray) -> Vec<PathPoint> {
        let mut surface = vec![PathPoint {
            time_s: 0.0,
            distance_rad: 0.0,
            depth_km: 0.0,
        }];
        let mut cumulative = Integral::default();
        for layer in self.layers(phase) {
            if layer.z0 >= ray.turning_depth {
                break;
            }
            let bottom = layer.z1.min(ray.turning_depth);
            if bottom <= layer.z0 {
                continue;
            }
            let mut ends = vec![bottom];
            if depth > layer.z0 && depth < bottom {
                ends.push(depth);
                ends.sort_by(f64::total_cmp);
            }
            for z in ends {
                let point = cumulative.plus(layer.integral(p, layer.z0, z));
                surface.push(PathPoint {
                    time_s: point.time,
                    distance_rad: point.angle,
                    depth_km: z,
                });
            }
            cumulative = cumulative.plus(layer.integral(p, layer.z0, bottom));
            if bottom == ray.turning_depth {
                break;
            }
        }
        let mut path = vec![PathPoint {
            time_s: 0.0,
            distance_rad: 0.0,
            depth_km: depth,
        }];
        path.extend(
            surface
                .iter()
                .filter(|pt| pt.depth_km > depth)
                .map(|pt| PathPoint {
                    time_s: pt.time_s - ray.source.time,
                    distance_rad: pt.distance_rad - ray.source.angle,
                    depth_km: pt.depth_km,
                }),
        );
        path.extend(surface.iter().rev().skip(1).map(|pt| PathPoint {
            time_s: 2.0 * ray.total.time - ray.source.time - pt.time_s,
            distance_rad: 2.0 * ray.total.angle - ray.source.angle - pt.distance_rad,
            depth_km: pt.depth_km,
        }));
        path
    }
}

/// Compute all arrivals of the requested supported phases. Empty is a valid
/// result in a shadow zone or for a downgoing phase unavailable at this depth.
pub fn calculate(
    source_depth_km: f64,
    distance_deg: f64,
    phases: &[Phase],
) -> Result<Vec<Arrival>, InputError> {
    validate_geometry(source_depth_km, distance_deg)?;
    let model = model();
    let mut arrivals = Vec::new();
    for phase in [Phase::P, Phase::S, Phase::PKIKP] {
        if !phases.contains(&phase) {
            continue;
        }
        for p in model.roots(phase, source_depth_km, distance_deg.to_radians()) {
            let ray = model
                .shoot(phase, source_depth_km, p)
                .expect("root has a ray");
            let path = model.path(phase, source_depth_km, p, &ray);
            arrivals.push(Arrival {
                phase,
                time_s: 2.0 * ray.total.time - ray.source.time,
                ray_param_s_rad: p,
                turning_depth_km: ray.turning_depth,
                path,
            });
        }
    }
    arrivals.sort_by(|a, b| a.time_s.total_cmp(&b.time_s));
    Ok(arrivals)
}

fn validate_geometry(source_depth_km: f64, distance_deg: f64) -> Result<(), InputError> {
    if !source_depth_km.is_finite() || !(0.0..=700.0).contains(&source_depth_km) {
        return Err(InputError(
            "source depth must be finite and between 0 and 700 km",
        ));
    }
    if !distance_deg.is_finite() || !(1.0..=179.0).contains(&distance_deg) {
        return Err(InputError(
            "distance must be finite and between 1 and 179 degrees",
        ));
    }
    Ok(())
}

/// Return the earliest supported uppercase P time without constructing paths.
pub fn first_p_time(source_depth_km: f64, distance_deg: f64) -> Result<Option<f64>, InputError> {
    validate_geometry(source_depth_km, distance_deg)?;
    let model = model();
    Ok(model
        .roots(Phase::P, source_depth_km, distance_deg.to_radians())
        .into_iter()
        .filter_map(|p| model.shoot(Phase::P, source_depth_km, p))
        .map(|ray| 2.0 * ray.total.time - ray.source.time)
        .min_by(f64::total_cmp))
}

pub fn calculate_all(source_depth_km: f64, distance_deg: f64) -> Result<Vec<Arrival>, InputError> {
    calculate(
        source_depth_km,
        distance_deg,
        &[Phase::P, Phase::S, Phase::PKIKP],
    )
}

impl Model {
    fn fan(&self, depth: f64, phases: &[Phase]) -> WavefrontFan {
        let mut fan = WavefrontFan {
            depth_km: depth,
            policy: "downward-p-144-physical-jump-gaps-v1",
            segments: Vec::new(),
            gaps: Vec::new(),
        };
        for &phase in phases {
            let layers = self.layers(phase);
            let (lo, hi) = self.bounds(layers, phase, depth);
            let mut gaps: Vec<FanGap> = Vec::new();
            for layer in layers.iter().filter(|l| l.z0 == l.z1 && l.q1 < l.q0) {
                if let Some(gap) = gaps.iter_mut().find(|gap| gap.depth_km == layer.z0) {
                    gap.lower_p_s_rad = gap.lower_p_s_rad.min(layer.q1);
                    gap.upper_p_s_rad = gap.upper_p_s_rad.max(layer.q0);
                } else {
                    gaps.push(FanGap {
                        phase,
                        lower_p_s_rad: layer.q1,
                        upper_p_s_rad: layer.q0,
                        depth_km: layer.z0,
                        reason: "velocity-discontinuity",
                    });
                }
            }
            gaps.retain(|gap| gap.upper_p_s_rad.min(hi) > gap.lower_p_s_rad.max(lo) + 1e-8);
            let edge = (hi - lo) * 1e-8;
            let mut cuts = vec![lo + edge, hi - edge];
            for gap in &gaps {
                cuts.extend([
                    gap.lower_p_s_rad.max(lo + edge),
                    gap.upper_p_s_rad.min(hi - edge),
                ]);
            }
            cuts.sort_by(f64::total_cmp);
            cuts.dedup();
            for interval in cuts.windows(2) {
                let [a, b] = [interval[0], interval[1]];
                let middle = (a + b) / 2.0;
                if gaps
                    .iter()
                    .any(|gap| middle > gap.lower_p_s_rad && middle < gap.upper_p_s_rad)
                {
                    continue;
                }
                let count = (((b - a) / (hi - lo) * 144.0).ceil() as usize).max(1);
                let mut rays = Vec::new();
                for index in 0..=count {
                    let p = a + (b - a) * index as f64 / count as f64;
                    let ray = self.shoot(phase, depth, p);
                    if let Some(ray) =
                        ray.filter(|ray| 2.0 * ray.total.time - ray.source.time > 1e-8)
                    {
                        rays.push(Arrival {
                            phase,
                            time_s: 2.0 * ray.total.time - ray.source.time,
                            ray_param_s_rad: p,
                            turning_depth_km: ray.turning_depth,
                            path: self.path(phase, depth, p, &ray),
                        });
                    } else if !rays.is_empty() {
                        fan.segments.push(FanSegment {
                            phase,
                            rays: std::mem::take(&mut rays),
                        });
                    }
                }
                if !rays.is_empty() {
                    fan.segments.push(FanSegment { phase, rays });
                }
            }
            fan.gaps.extend(gaps);
        }
        fan
    }
}

pub fn wavefront_fan(depth_km: f64, phases: &[Phase]) -> Result<WavefrontFan, InputError> {
    validate_geometry(depth_km, 1.0)?;
    Ok(model().fan(depth_km, phases))
}

pub fn constant_velocity_control(depth_km: f64) -> WavefrontFan {
    let radius = 6371.0;
    let velocity = 6.0;
    let layers = (0..1275)
        .map(|index| {
            let z0 = (index as f64 * 5.0).min(radius);
            let z1 = ((index + 1) as f64 * 5.0).min(radius);
            Layer::new(
                [(radius - z0) / velocity, z0, (radius - z1) / velocity, z1],
                radius,
            )
        })
        .filter(|layer| layer.z0 < layer.z1)
        .collect::<Vec<_>>();
    let control = Model {
        cmb: radius,
        icb: radius,
        knots: Vec::new(),
        p: layers.clone(),
        s: layers,
    };
    let rays = [0.03, 0.2, 0.5, 0.8, 0.98]
        .into_iter()
        .map(|fraction| {
            let p = (radius - depth_km) / velocity * fraction;
            let ray = control
                .shoot(Phase::P, depth_km, p)
                .expect("control is a downward chord");
            Arrival {
                phase: Phase::P,
                time_s: 2.0 * ray.total.time - ray.source.time,
                ray_param_s_rad: p,
                turning_depth_km: ray.turning_depth,
                path: control.path(Phase::P, depth_km, p, &ray),
            }
        })
        .collect();
    WavefrontFan {
        depth_km,
        policy: "constant-velocity-control",
        segments: vec![FanSegment {
            phase: Phase::P,
            rays,
        }],
        gaps: Vec::new(),
    }
}

#[cfg(feature = "wasm")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn wavefront_fan_json(
    depth_km: f64,
    phase_index: u32,
) -> Result<String, wasm_bindgen::JsValue> {
    let phase = [Phase::P, Phase::S, Phase::PKIKP]
        .get(phase_index as usize)
        .ok_or_else(|| wasm_bindgen::JsValue::from_str("unsupported fan phase"))?;
    let fan = wavefront_fan(depth_km, &[*phase])
        .map_err(|error| wasm_bindgen::JsValue::from_str(&error.to_string()))?;
    serde_json::to_string(&fan).map_err(|error| wasm_bindgen::JsValue::from_str(&error.to_string()))
}

#[cfg(feature = "wasm")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn calculate_json(
    source_depth_km: f64,
    distance_deg: f64,
) -> Result<String, wasm_bindgen::JsValue> {
    let arrivals = calculate_all(source_depth_km, distance_deg)
        .map_err(|e| wasm_bindgen::JsValue::from_str(&e.to_string()))?;
    serde_json::to_string(&arrivals).map_err(|e| wasm_bindgen::JsValue::from_str(&e.to_string()))
}

#[cfg(feature = "wasm")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn first_p_time_json(
    source_depth_km: f64,
    distance_deg: f64,
) -> Result<String, wasm_bindgen::JsValue> {
    let time = first_p_time(source_depth_km, distance_deg)
        .map_err(|e| wasm_bindgen::JsValue::from_str(&e.to_string()))?;
    serde_json::to_string(&time).map_err(|e| wasm_bindgen::JsValue::from_str(&e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fan_preserves_physical_jump_gaps_and_source_domain() {
        for depth in [0.0, 29.0, 598.1, 700.0] {
            let fan = wavefront_fan(depth, &[Phase::P, Phase::S, Phase::PKIKP]).unwrap();
            for phase in [Phase::P, Phase::S, Phase::PKIKP] {
                assert!(fan.segments.iter().any(|segment| segment.phase == phase));
            }
            for gap in &fan.gaps {
                assert_eq!(
                    fan.gaps
                        .iter()
                        .filter(|other| other.phase == gap.phase && other.depth_km == gap.depth_km)
                        .count(),
                    1
                );
                for segment in fan
                    .segments
                    .iter()
                    .filter(|segment| segment.phase == gap.phase)
                {
                    for ray in &segment.rays {
                        assert!(
                            ray.ray_param_s_rad <= gap.lower_p_s_rad + 1e-8
                                || ray.ray_param_s_rad >= gap.upper_p_s_rad - 1e-8
                        );
                    }
                    for pair in segment.rays.windows(2) {
                        assert!(
                            !(pair[0].ray_param_s_rad < gap.upper_p_s_rad - 1e-8
                                && pair[1].ray_param_s_rad > gap.lower_p_s_rad + 1e-8)
                        );
                    }
                }
            }
        }
        for depth in [f64::NAN, -1.0, 700.01] {
            assert!(wavefront_fan(depth, &[Phase::P]).is_err());
        }
    }
    #[test]
    fn homogeneous_sphere_chord() {
        let radius = 6371.0;
        let velocity = 6.0;
        let angle = 60.0_f64.to_radians();
        let p = radius / velocity * (angle / 2.0).cos();
        let layer = Layer::new([radius / velocity, 0.0, 0.0, radius], radius);
        let turn = layer.turning_depth(p);
        let integral = layer.integral(p, 0.0, turn);
        assert!((2.0 * integral.time - 2.0 * radius / velocity * (angle / 2.0).sin()).abs() < 1e-9);
        assert!((2.0 * integral.angle - angle).abs() < 1e-12);
        assert!((turn - radius * (1.0 - (angle / 2.0).cos())).abs() < 1e-9);
    }
    #[test]
    fn constant_slowness_shell() {
        let layer = Layer::new([100.0, 100.0, 100.0, 200.0], 1000.0);
        let ray = layer.integral(50.0, 100.0, 200.0);
        let log_radius = (900.0_f64 / 800.0).ln();
        assert!((ray.time - 10000.0 / 7500.0_f64.sqrt() * log_radius).abs() < 1e-12);
        assert!((ray.angle - 50.0 / 7500.0_f64.sqrt() * log_radius).abs() < 1e-12);
    }
    #[test]
    fn center_limit_and_source_split() {
        let layer = Layer::new([1000.0, 0.0, 0.0, 6000.0], 6000.0);
        let center = layer.integral(0.0, 0.0, 6000.0);
        assert_eq!(center.time, 1000.0);
        assert_eq!(center.angle, std::f64::consts::FRAC_PI_2);
        let full = layer.integral(500.0, 0.0, 1000.0);
        let split = layer
            .integral(500.0, 0.0, 333.0)
            .plus(layer.integral(500.0, 333.0, 1000.0));
        assert!((full.time - split.time).abs() < 1e-10);
        assert!((full.angle - split.angle).abs() < 1e-12);
    }
    #[test]
    fn rejects_invalid_domain() {
        for depth in [f64::NAN, f64::INFINITY, -1.0, 700.001] {
            assert!(calculate_all(depth, 30.0).is_err());
        }
        for angle in [f64::NAN, f64::INFINITY, 0.0, 180.0] {
            assert!(calculate_all(10.0, angle).is_err());
        }
    }
    #[test]
    fn near_caustic_preserves_two_roots_without_an_extra_tangent() {
        for distance in [14.277354176720932, 14.277354176721932] {
            let arrivals = calculate(0.0, distance, &[Phase::P]).unwrap();
            assert_eq!(arrivals.len(), 5);
            let close_pair: Vec<_> = arrivals
                .iter()
                .filter(|arrival| (767.0..768.0).contains(&arrival.ray_param_s_rad))
                .collect();
            assert_eq!(close_pair.len(), 2);
            assert!(close_pair[0].ray_param_s_rad != close_pair[1].ray_param_s_rad);
        }
    }
}
