//! The integration tests: every scenario in the test Worker (`tests/worker`),
//! run inside `wrangler dev --local` against a scratch Postgres behind a local
//! Hyperdrive binding.
//!
//! Skipped unless `HD_WORKER_URL` names a running test Worker, so plain
//! `cargo test` stays offline. `make test-worker` builds the Worker, starts it
//! on a fresh database and runs this with the URL set.

use std::io::Read;

fn get(url: &str) -> String {
    let mut body = String::new();
    ureq::get(url)
        .call()
        .unwrap_or_else(|error| panic!("GET {url}: {error}"))
        .into_body()
        .into_reader()
        .read_to_string(&mut body)
        .unwrap();
    body
}

#[test]
fn every_scenario_passes_against_local_hyperdrive() {
    let Ok(base) = std::env::var("HD_WORKER_URL") else {
        eprintln!("HD_WORKER_URL is unset; skipping -- run `make test-worker`");
        return;
    };
    let base = base.trim_end_matches('/');

    let scenarios: Vec<String> = serde_json::from_str(&get(base)).unwrap();
    assert!(!scenarios.is_empty(), "the Worker lists no scenarios");

    // All of them, then one failure listing every scenario that failed:
    // stopping at the first would hide how much else is broken.
    let failures: Vec<String> = scenarios
        .iter()
        .filter_map(|name| {
            let body = get(&format!("{base}/{name}"));
            match serde_json::from_str::<serde_json::Value>(&body) {
                Ok(outcome) if outcome["ok"] == true => None,
                Ok(outcome) => Some(format!("{name}: {}", outcome["error"])),
                // A panic in the Worker answers with an error page, not JSON.
                Err(_) => Some(format!("{name}: {body}")),
            }
        })
        .collect();

    assert!(failures.is_empty(), "failed:\n{}", failures.join("\n"));
    eprintln!("{} scenarios passed", scenarios.len());
}
