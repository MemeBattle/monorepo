//! A deadline around one await, in the terms each target can honour.
//!
//! Shared infrastructure that knows no context (`docs/LAYOUT.md` §5), for the
//! same reason `db` exists: a database wait must be bounded, and what bounds
//! it differs between the two runtimes.
//!
//! Natively `tokio::time::timeout` does it, and the native server already
//! relies on it (`http::health`) and on the pool's own `acquire_timeout`. A
//! Worker has neither: `tokio::time` needs the time driver, which does not
//! run on `wasm32-unknown-unknown`, and Cloudflare bounds a Worker's **CPU**
//! time, not the wall-clock time a request may spend waiting on I/O
//! ([Workers limits — Duration](https://developers.cloudflare.com/workers/platform/limits/#duration)).
//! So an unbounded await on a stalled socket hangs the request for as long as
//! the client stays connected, and every database wait on the Worker path —
//! the per-request connect, the `/health` probe, the close — goes through
//! here (ADR 0022 (d)).

use std::future::Future;
use std::time::Duration;

use thiserror::Error;

/// The awaited operation did not finish inside its limit.
///
/// By the time this is returned the losing future has been **dropped**, which
/// cancels the Rust-side operation and releases what it owned — a `DbConn`
/// guard, a buffer. That is all it does: dropping closes no socket. On a
/// Worker the socket is closed by the entrypoint's `SocketAbort`
/// (ADR 0022 (c)).
#[derive(Debug, Error)]
#[error("the operation did not finish within its deadline")]
pub struct DeadlineExpired;

/// Awaits `future` for at most `limit`.
#[cfg(not(target_arch = "wasm32"))]
pub async fn with_deadline<F: Future>(
    limit: Duration,
    future: F,
) -> Result<F::Output, DeadlineExpired> {
    tokio::time::timeout(limit, future)
        .await
        .map_err(|_| DeadlineExpired)
}

/// Awaits `future` for at most `limit`, against the Workers runtime's timer.
///
/// The timer is `worker::Delay` — a future over the JS `setTimeout` — wrapped
/// in `worker::send::SendFuture`, the worker crate's own wrapper whose unsafe
/// `Send` is sound because the Workers runtime is single-threaded. The wrap is
/// not optional: `Delay` holds a `wasm_bindgen::Closure` and an
/// `Rc<Cell<bool>>` and so is not `Send`, while axum requires every handler's
/// future to be `Send` on every target, and `/health` awaits this. It is built
/// in one expression so no bare `Delay` is ever a local held across an await,
/// which would make this future `!Send` again.
#[cfg(target_arch = "wasm32")]
pub async fn with_deadline<F: Future>(
    limit: Duration,
    future: F,
) -> Result<F::Output, DeadlineExpired> {
    use futures_util::future::{Either, select};

    let future = std::pin::pin!(future);
    let timer = std::pin::pin!(worker::send::SendFuture::new(worker::Delay::from(limit)));

    match select(future, timer).await {
        Either::Left((output, _timer)) => Ok(output),
        // The pinned `future` is dropped with this scope: the operation is
        // cancelled, not awaited past its deadline.
        Either::Right(((), _expired)) => Err(DeadlineExpired),
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};

    use super::*;
    use crate::http::health::DB_TIMEOUT;

    /// Set when the value it is held by is dropped.
    struct DropFlag(Arc<AtomicBool>);

    impl Drop for DropFlag {
        fn drop(&mut self) {
            self.0.store(true, Ordering::SeqCst);
        }
    }

    #[tokio::test]
    async fn a_future_that_finishes_in_time_passes_its_output_through() {
        let answer = with_deadline(DB_TIMEOUT, std::future::ready(7)).await;

        assert_eq!(answer.unwrap(), 7);
    }

    /// The paused clock makes the two seconds pass instantly, so the expiry is
    /// deterministic rather than a two-second test. The drop flag proves the
    /// loser was dropped and not left running — cancellation of the Rust
    /// operation, which is the whole of what expiry promises.
    #[tokio::test(start_paused = true)]
    async fn a_pending_future_expires_and_is_dropped() {
        let dropped = Arc::new(AtomicBool::new(false));
        let flag = DropFlag(Arc::clone(&dropped));
        let never = async move {
            let _flag = flag;
            std::future::pending::<()>().await;
        };

        let answer = with_deadline(DB_TIMEOUT, never).await;

        assert!(answer.is_err());
        assert!(
            dropped.load(Ordering::SeqCst),
            "the expired operation must be dropped, not left running"
        );
    }
}
