use serde::Deserialize;
use taup_core::{calculate_all, first_p_time, Arrival, Phase};

#[derive(Deserialize)]
struct Corpus {
    cases: Vec<Case>,
}
#[derive(Deserialize)]
struct Case {
    depth_km: f64,
    distance_deg: f64,
    arrivals: Vec<Expected>,
}
#[derive(Deserialize)]
struct Expected {
    phase: Phase,
    time_s: f64,
    ray_param_s_rad: f64,
    turning_depth_km: f64,
    path_samples: Vec<ExpectedPoint>,
}
#[derive(Deserialize)]
struct ExpectedPoint {
    time_s: f64,
    depth_km: f64,
}

fn depth_at(arrival: &Arrival, time: f64) -> f64 {
    let pair = arrival.path.windows(2).find(|pair| pair[1].time_s >= time);
    if let Some(pair) = pair {
        let fraction = (time - pair[0].time_s) / (pair[1].time_s - pair[0].time_s);
        pair[0].depth_km + fraction * (pair[1].depth_km - pair[0].depth_km)
    } else {
        arrival.path.last().unwrap().depth_km
    }
}

fn verify(json: &str, expected_cases: usize, expected_arrivals: usize) {
    let corpus: Corpus = serde_json::from_str(json).unwrap();
    assert_eq!(corpus.cases.len(), expected_cases);
    assert_eq!(
        corpus.cases.iter().map(|c| c.arrivals.len()).sum::<usize>(),
        expected_arrivals
    );
    for case in corpus.cases {
        let actual = calculate_all(case.depth_km, case.distance_deg).unwrap();
        let earliest = actual.iter().find(|arrival| arrival.phase == Phase::P);
        assert_eq!(
            first_p_time(case.depth_km, case.distance_deg).unwrap(),
            earliest.map(|arrival| arrival.time_s),
            "scalar P parity at depth={} distance={}",
            case.depth_km,
            case.distance_deg
        );
        for phase in [Phase::P, Phase::S, Phase::PKIKP] {
            let mut expected = case
                .arrivals
                .iter()
                .filter(|a| a.phase == phase)
                .collect::<Vec<_>>();
            let mut observed = actual
                .iter()
                .filter(|a| a.phase == phase)
                .collect::<Vec<_>>();
            expected.sort_by(|a, b| a.ray_param_s_rad.total_cmp(&b.ray_param_s_rad));
            observed.sort_by(|a, b| a.ray_param_s_rad.total_cmp(&b.ray_param_s_rad));
            let context = format!(
                "depth={} distance={} phase={phase:?}",
                case.depth_km, case.distance_deg
            );
            assert_eq!(observed.len(), expected.len(), "{context}");
            for (want, got) in expected.into_iter().zip(observed) {
                assert!((want.time_s - got.time_s).abs() <= 0.1, "time {context}");
                assert!(
                    (want.ray_param_s_rad - got.ray_param_s_rad).abs() <= 0.05,
                    "ray parameter {context}"
                );
                assert!(
                    (want.turning_depth_km - got.turning_depth_km).abs() <= 0.5,
                    "turn {context}"
                );
                let first = got.path.first().unwrap();
                let last = got.path.last().unwrap();
                assert_eq!(first.depth_km, case.depth_km, "source {context}");
                assert_eq!(first.time_s, 0.0);
                assert_eq!(first.distance_rad, 0.0);
                assert_eq!(last.depth_km, 0.0, "receiver {context}");
                assert!(
                    (last.time_s - got.time_s).abs() < 1e-8,
                    "path time {context}"
                );
                assert!(
                    (last.distance_rad.to_degrees() - case.distance_deg).abs() <= 1e-5,
                    "closure {context}"
                );
                assert!(
                    (got.path.iter().map(|p| p.depth_km).fold(0.0_f64, f64::max)
                        - got.turning_depth_km)
                        .abs()
                        < 1e-8,
                    "path turn {context}"
                );
                for pair in got.path.windows(2) {
                    assert!(
                        pair[1].time_s.is_finite()
                            && pair[1].distance_rad.is_finite()
                            && pair[1].depth_km.is_finite(),
                        "finite path {context}"
                    );
                    assert!(
                        pair[1].time_s >= pair[0].time_s
                            && pair[1].distance_rad >= pair[0].distance_rad,
                        "forward path {context}"
                    );
                }
                for point in &want.path_samples {
                    let depth = depth_at(got, point.time_s / want.time_s * got.time_s);
                    assert!(
                        (depth - point.depth_km).abs() <= 2.0,
                        "path depth {context}"
                    );
                }
            }
        }
    }
}

#[test]
fn frozen_reference_corpus() {
    verify(include_str!("../../../fixtures/reference.json"), 176, 427);
}

#[test]
fn frozen_boundary_corpus() {
    verify(
        include_str!("../../../fixtures/reference-boundaries.json"),
        84,
        208,
    );
}
