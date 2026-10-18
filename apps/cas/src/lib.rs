// Library part of the crate: the domain, the HTTP transport, and the modules
// shared between the `cas` server binary and the `cas-migrate` binary.
pub mod accounts;
pub mod clients;
pub mod config;
pub mod db;
pub mod deadline;
pub mod http;
pub mod migrations;
pub mod oidc;
pub mod sessions;
pub mod shared;
#[cfg(test)]
pub(crate) mod testing;
pub mod webauthn;
// The Cloudflare Workers entrypoint: the one module that exists for a single
// target (ADR 0022).
#[cfg(target_arch = "wasm32")]
pub mod worker;
