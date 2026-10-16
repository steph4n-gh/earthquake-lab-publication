use serde::Deserialize;
use std::io::{self, Read};
#[derive(Deserialize)]
struct Query {
    depth_km: f64,
    distance_deg: f64,
}
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if args == ["--batch"] {
        let mut input = String::new();
        io::stdin().read_to_string(&mut input)?;
        let queries: Vec<Query> = serde_json::from_str(&input)?;
        let output = queries
            .into_iter()
            .map(|q| taup_core::calculate_all(q.depth_km, q.distance_deg))
            .collect::<Result<Vec<_>, _>>()?;
        println!("{}", serde_json::to_string(&output)?);
    } else if args == ["--wavefront-reference"] {
        let cases = [0.0, 29.0, 22.9, 598.1, 700.0]
            .into_iter()
            .map(|depth| {
                taup_core::wavefront_fan(
                    depth,
                    &[
                        taup_core::Phase::P,
                        taup_core::Phase::S,
                        taup_core::Phase::PKIKP,
                    ],
                )
            })
            .collect::<Result<Vec<_>, _>>()?;
        let controls = [0.0, 598.1].into_iter().map(|depth| { let fan = taup_core::constant_velocity_control(depth); serde_json::json!({"radius_km":6371.0,"velocity_km_s":6.0,"depth_km":depth,"rays":fan.segments[0].rays}) }).collect::<Vec<_>>();
        println!(
            "{}",
            serde_json::json!({"cases":cases,"constant_velocity_controls":controls})
        );
    } else if args.len() == 2 && args[0] == "--wavefront-fan" {
        println!(
            "{}",
            serde_json::to_string(&taup_core::wavefront_fan(
                args[1].parse()?,
                &[
                    taup_core::Phase::P,
                    taup_core::Phase::S,
                    taup_core::Phase::PKIKP
                ]
            )?)?
        );
    } else if args.len() == 2 {
        let arrivals = taup_core::calculate_all(args[0].parse()?, args[1].parse()?)?;
        println!("{}", serde_json::to_string(&arrivals)?);
    } else {
        return Err("usage: taup DEPTH_KM DISTANCE_DEG | taup --batch".into());
    }
    Ok(())
}
fn main() {
    if let Err(e) = run() {
        eprintln!("{e}");
        std::process::exit(1);
    }
}
