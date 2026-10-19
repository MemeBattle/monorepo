use super::{ConfigError, WorkerConfig};

impl WorkerConfig {
    /// Reads the bindings of `env`.
    ///
    /// `CAS_RP_ID`, `CAS_ORIGIN`, `CAS_CORS_ORIGINS` and `CAS_ISSUER` are
    /// plain vars: they are public, and two of them are published by discovery
    /// anyway. `CAS_SIGNING_KEY` is a secret — it is the private key every
    /// token is signed with — so it is read with `Env::secret`, which is the
    /// binding kind a `wrangler secret` value arrives as.
    ///
    /// # Errors
    ///
    /// [`ConfigError::MissingBinding`] for a binding that is not there or not
    /// of the expected kind, and the matching validation error for one whose
    /// value the native server would refuse too.
    pub fn from_worker_env(env: &worker::Env) -> Result<Self, ConfigError> {
        let var = |name: &str| env.var(name).ok().map(|var| var.to_string());

        Self::from_values(
            var("CAS_RP_ID"),
            var("CAS_ORIGIN"),
            var("CAS_CORS_ORIGINS"),
            var("CAS_ISSUER"),
            env.secret("CAS_SIGNING_KEY")
                .ok()
                .map(|secret| secret.to_string()),
        )
    }
}
