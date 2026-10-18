//! A `worker::Socket` as sqlx's [`Socket`].

use std::io;
use std::pin::Pin;
use std::task::{ready, Context, Poll};

use sqlx_core::io::ReadBuf;
use sqlx_core::net::Socket;
use tokio::io::{AsyncRead, AsyncWrite};

/// How much [`HdSocket::try_write`] queues before it asks sqlx to wait for a
/// flush.
const WRITE_BUF_LIMIT: usize = 64 * 1024;

/// How much one read from the Worker's socket takes at most.
const READ_CHUNK: usize = 8 * 1024;

/// A `worker::Socket` as sqlx's readiness-based [`Socket`].
///
/// sqlx asks "can I read / write now?" and then tries without a waker; a
/// `worker::Socket` only offers tokio's poll-based `AsyncRead` and
/// `AsyncWrite`. So reads land in `read_buf` from `poll_read_ready` and
/// `try_read` drains it, and writes queue in `write_buf` until
/// `poll_write_ready` or `poll_flush` pushes them out.
pub(crate) struct HdSocket {
    inner: worker::Socket,
    read_buf: Vec<u8>,
    eof: bool,
    write_buf: Vec<u8>,
}

impl HdSocket {
    /// Opens a socket to `hyperdrive`'s host and port.
    ///
    /// `StartTls` for a driver that may upgrade the socket later, with
    /// [`into_inner`](Self::into_inner) and `start_tls`; `Off` otherwise.
    pub(crate) fn connect(
        hyperdrive: &worker::Hyperdrive,
        transport: worker::SecureTransport,
    ) -> Result<Self, sqlx_core::Error> {
        let socket = worker::Socket::builder()
            .secure_transport(transport)
            .connect(hyperdrive.host(), hyperdrive.port())
            .map_err(|e| sqlx_core::Error::Io(io::Error::other(e.to_string())))?;
        Ok(Self::new(socket))
    }

    pub(crate) fn new(inner: worker::Socket) -> Self {
        Self {
            inner,
            read_buf: Vec::new(),
            eof: false,
            write_buf: Vec::new(),
        }
    }

    /// The Worker's socket back, for `start_tls`.
    ///
    /// Fails if the server has already sent bytes nobody has read. Before a TLS
    /// upgrade those would be plaintext an attacker injected, which must not be
    /// read as though it came over TLS (the attack behind CVE-2021-23222).
    pub(crate) fn into_inner(self) -> io::Result<worker::Socket> {
        if !self.read_buf.is_empty() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "server sent unexpected data after accepting TLS",
            ));
        }
        Ok(self.inner)
    }

    fn poll_drain(&mut self, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        while !self.write_buf.is_empty() {
            let n = ready!(Pin::new(&mut self.inner).poll_write(cx, &self.write_buf))?;
            if n == 0 {
                return Poll::Ready(Err(io::ErrorKind::WriteZero.into()));
            }
            self.write_buf.drain(..n);
        }
        Poll::Ready(Ok(()))
    }
}

impl Socket for HdSocket {
    fn try_read(&mut self, buf: &mut dyn ReadBuf) -> io::Result<usize> {
        if self.read_buf.is_empty() {
            return if self.eof {
                Ok(0)
            } else {
                Err(io::ErrorKind::WouldBlock.into())
            };
        }
        let n = self.read_buf.len().min(buf.remaining_mut());
        buf.put_slice(&self.read_buf[..n]);
        self.read_buf.drain(..n);
        Ok(n)
    }

    fn try_write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let room = WRITE_BUF_LIMIT.saturating_sub(self.write_buf.len());
        if room == 0 {
            return Err(io::ErrorKind::WouldBlock.into());
        }
        let n = buf.len().min(room);
        self.write_buf.extend_from_slice(&buf[..n]);
        Ok(n)
    }

    fn poll_read_ready(&mut self, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        if !self.read_buf.is_empty() || self.eof {
            return Poll::Ready(Ok(()));
        }
        let mut chunk = [0u8; READ_CHUNK];
        let mut chunk = tokio::io::ReadBuf::new(&mut chunk);
        ready!(Pin::new(&mut self.inner).poll_read(cx, &mut chunk))?;
        if chunk.filled().is_empty() {
            self.eof = true;
        } else {
            self.read_buf.extend_from_slice(chunk.filled());
        }
        Poll::Ready(Ok(()))
    }

    fn poll_write_ready(&mut self, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        self.poll_drain(cx)
    }

    fn poll_flush(&mut self, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        ready!(self.poll_drain(cx))?;
        Pin::new(&mut self.inner).poll_flush(cx)
    }

    fn poll_shutdown(&mut self, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        ready!(self.poll_drain(cx))?;
        Pin::new(&mut self.inner).poll_shutdown(cx)
    }
}
