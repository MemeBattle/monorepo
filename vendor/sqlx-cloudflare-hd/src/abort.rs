//! Closing a socket from outside the future that owns it.

use std::sync::{Arc, Mutex};

use worker::send::SendWrapper;
use worker::worker_sys;

/// A handle that forcibly closes the socket of a connection, from anywhere,
/// at any time.
///
/// Nothing on this stack closes a socket when it is dropped: neither sqlx,
/// which sends `Terminate` and shuts the stream down only inside
/// [`Connection::close`](sqlx_core::connection::Connection::close), nor
/// `worker::Socket`, nor this crate's own socket wrapper. Cloudflare documents
/// the explicit [`Socket.close()`][close] as the forcible close of both
/// streams, and gives no guarantee that an unclosed socket is torn down when
/// the invocation ends. So a caller that must not leak the socket — a future
/// the caller raced against a deadline and dropped mid-handshake, a request
/// that is over — needs a way in from outside, and this is it.
///
/// Hand one to [`connect_with_abort`](crate::postgres::connect_with_abort) and
/// keep a clone: the slot is filled with the connection's socket, and
/// [`abort`](Self::abort) closes whatever is in it. A TLS upgrade replaces the
/// socket, and the handle follows it, so it always points at the live one.
///
/// Cloning is cheap and shares the slot. `abort` is idempotent: the first call
/// takes the socket out.
///
/// [close]: https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/#close-tcp-connections
///
/// ```no_run
/// # async fn example(hd: &worker::Hyperdrive) -> Result<(), sqlx_core::Error> {
/// use sqlx_cloudflare_hd::SocketAbort;
///
/// let abort = SocketAbort::new();
/// let options = sqlx_cloudflare_hd::postgres::options(hd)?.statement_cache_capacity(0);
/// let conn = sqlx_cloudflare_hd::postgres::connect_with_abort(hd, &options, &abort).await?;
/// // ... serve the request ...
/// abort.abort();
/// # Ok(())
/// # }
/// ```
#[derive(Clone)]
pub struct SocketAbort {
    // `SendWrapper` is the worker crate's own wrapper for a JS value that has
    // to cross a `Send` bound; it is sound here for the reason that crate
    // gives, the Workers runtime being single-threaded. The `std` mutex around
    // it is what makes the handle `Send + Sync` without any unsafe of ours,
    // and it is never held across an await.
    slot: Arc<Mutex<SendWrapper<Option<worker_sys::Socket>>>>,
}

impl SocketAbort {
    /// A handle with no socket in it yet.
    #[must_use]
    pub fn new() -> Self {
        Self {
            slot: Arc::new(Mutex::new(SendWrapper::new(None))),
        }
    }

    /// Puts `socket` in the slot, replacing whatever was there.
    ///
    /// The replacement is the TLS upgrade: `startTls()` returns a new JS
    /// socket and abandons the old one, so the handle has to move with it.
    pub(crate) fn set(&self, socket: worker_sys::Socket) {
        if let Ok(mut slot) = self.slot.lock() {
            slot.0 = Some(socket);
        }
    }

    /// Closes the socket in the slot, if there is one, and empties it.
    ///
    /// Fire and forget: the JS `close()` returns a promise, which is dropped
    /// unawaited together with any rejection it carries. There is nothing to
    /// do about a socket that will not close, and the caller is on its way
    /// out.
    pub fn abort(&self) {
        let socket = match self.slot.lock() {
            Ok(mut slot) => slot.0.take(),
            Err(_poisoned) => None,
        };

        if let Some(socket) = socket {
            let _ = socket.close();
        }
    }
}

impl Default for SocketAbort {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Debug for SocketAbort {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let open = match self.slot.lock() {
            Ok(slot) => slot.0.is_some(),
            Err(_poisoned) => false,
        };
        f.debug_struct("SocketAbort").field("open", &open).finish()
    }
}
