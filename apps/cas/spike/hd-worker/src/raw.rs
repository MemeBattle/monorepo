//! A hand-rolled Postgres frontend for `/raw`: sends exact extended-protocol
//! message sequences to the Hyperdrive binding and records every backend
//! message type, to pin down which frontend message Hyperdrive rejects.

use serde::Serialize;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use worker::{Hyperdrive, SecureTransport, Socket};

type Res<T> = std::result::Result<T, String>;

#[derive(Serialize)]
pub struct Step {
    pub name: String,
    /// Backend message types received until ReadyForQuery, e.g. "1 2 D C 3 Z".
    pub replies: String,
    pub error: Option<String>,
}

fn msg(tag: u8, body: &[u8]) -> Vec<u8> {
    let mut m = vec![tag];
    m.extend_from_slice(&((body.len() + 4) as i32).to_be_bytes());
    m.extend_from_slice(body);
    m
}

fn cstr(out: &mut Vec<u8>, s: &str) {
    out.extend_from_slice(s.as_bytes());
    out.push(0);
}

pub fn parse(name: &str, sql: &str) -> Vec<u8> {
    parse_typed(name, sql, &[])
}

/// Parse with explicit parameter type OIDs, as sqlx sends them.
pub fn parse_typed(name: &str, sql: &str, oids: &[u32]) -> Vec<u8> {
    let mut b = Vec::new();
    cstr(&mut b, name);
    cstr(&mut b, sql);
    b.extend_from_slice(&(oids.len() as i16).to_be_bytes());
    for oid in oids {
        b.extend_from_slice(&oid.to_be_bytes());
    }
    msg(b'P', &b)
}

pub fn bind(statement: &str) -> Vec<u8> {
    let mut b = Vec::new();
    cstr(&mut b, ""); // unnamed portal
    cstr(&mut b, statement);
    b.extend_from_slice(&0i16.to_be_bytes()); // parameter formats
    b.extend_from_slice(&0i16.to_be_bytes()); // parameters
    b.extend_from_slice(&0i16.to_be_bytes()); // result formats (text)
    msg(b'B', &b)
}

pub fn describe_statement(name: &str) -> Vec<u8> {
    let mut b = vec![b'S'];
    cstr(&mut b, name);
    msg(b'D', &b)
}

pub fn execute() -> Vec<u8> {
    let mut b = Vec::new();
    cstr(&mut b, "");
    b.extend_from_slice(&0i32.to_be_bytes());
    msg(b'E', &b)
}

pub fn close_portal() -> Vec<u8> {
    let mut b = vec![b'P'];
    cstr(&mut b, "");
    msg(b'C', &b)
}

pub fn close_statement(name: &str) -> Vec<u8> {
    let mut b = vec![b'S'];
    cstr(&mut b, name);
    msg(b'C', &b)
}

pub fn sync() -> Vec<u8> {
    msg(b'S', &[])
}

pub fn simple(sql: &str) -> Vec<u8> {
    let mut b = Vec::new();
    cstr(&mut b, sql);
    msg(b'Q', &b)
}

pub struct Raw {
    socket: Socket,
}

impl Raw {
    pub async fn connect(hd: &Hyperdrive) -> Res<Self> {
        let socket = Socket::builder()
            .secure_transport(SecureTransport::Off)
            .connect(hd.host(), hd.port())
            .map_err(|e| e.to_string())?;
        let mut raw = Self { socket };
        let mut b = Vec::new();
        b.extend_from_slice(&196608i32.to_be_bytes());
        cstr(&mut b, "user");
        cstr(&mut b, &hd.user());
        cstr(&mut b, "database");
        cstr(&mut b, &hd.database());
        b.push(0);
        let mut startup = ((b.len() + 4) as i32).to_be_bytes().to_vec();
        startup.extend_from_slice(&b);
        raw.write(&startup).await?;
        loop {
            let (tag, body) = raw.read_msg().await?;
            match tag {
                b'R' => {
                    let code = i32::from_be_bytes(body[0..4].try_into().unwrap());
                    match code {
                        0 => {}
                        3 => {
                            let mut p = Vec::new();
                            cstr(&mut p, &hd.password());
                            raw.write(&msg(b'p', &p)).await?;
                        }
                        5 => {
                            use md5::{Digest, Md5};
                            let inner =
                                hex(&Md5::digest(format!("{}{}", hd.password(), hd.user())));
                            let mut h = Md5::new();
                            h.update(inner.as_bytes());
                            h.update(&body[4..8]);
                            let mut p = Vec::new();
                            cstr(&mut p, &format!("md5{}", hex(&h.finalize())));
                            raw.write(&msg(b'p', &p)).await?;
                        }
                        other => return Err(format!("unsupported auth request {other}")),
                    }
                }
                b'E' => return Err(error_text(&body)),
                b'Z' => return Ok(raw),
                _ => {}
            }
        }
    }

    /// Sends Terminate without waiting for a reply.
    pub async fn terminate(mut self) {
        let _ = self.write(&msg(b'X', &[])).await;
        let _ = self.socket.shutdown().await;
    }

    async fn write(&mut self, bytes: &[u8]) -> Res<()> {
        self.socket
            .write_all(bytes)
            .await
            .map_err(|e| e.to_string())?;
        self.socket.flush().await.map_err(|e| e.to_string())
    }

    async fn read_msg(&mut self) -> Res<(u8, Vec<u8>)> {
        let mut head = [0u8; 5];
        self.socket
            .read_exact(&mut head)
            .await
            .map_err(|e| format!("read: {e}"))?;
        let len = i32::from_be_bytes(head[1..5].try_into().unwrap()) as usize;
        let mut body = vec![0u8; len.saturating_sub(4)];
        self.socket
            .read_exact(&mut body)
            .await
            .map_err(|e| format!("read: {e}"))?;
        Ok((head[0], body))
    }

    /// Sends `messages` in one write and reads until ReadyForQuery.
    pub async fn step(&mut self, name: &str, messages: &[Vec<u8>]) -> Step {
        let bytes: Vec<u8> = messages.concat();
        let mut replies = Vec::new();
        let mut error = None;
        if let Err(e) = self.write(&bytes).await {
            return Step {
                name: name.into(),
                replies: String::new(),
                error: Some(e),
            };
        }
        loop {
            match self.read_msg().await {
                Ok((tag, body)) => {
                    replies.push(match tag {
                        // DataRow: show the first column as text.
                        b'D' if body.len() >= 6 => {
                            let len = i32::from_be_bytes(body[2..6].try_into().unwrap());
                            let v = if len < 0 {
                                "NULL".into()
                            } else {
                                String::from_utf8_lossy(&body[6..6 + len as usize]).into_owned()
                            };
                            format!("D({v})")
                        }
                        // CommandComplete: show the command tag.
                        b'C' => format!(
                            "C({})",
                            String::from_utf8_lossy(body.strip_suffix(&[0]).unwrap_or(&body))
                        ),
                        _ => (tag as char).to_string(),
                    });
                    if tag == b'E' {
                        error = Some(error_text(&body));
                    }
                    if tag == b'Z' {
                        break;
                    }
                }
                Err(e) => {
                    error = Some(error.map_or(e.clone(), |prev| format!("{prev}; then {e}")));
                    break;
                }
            }
        }
        Step {
            name: name.into(),
            replies: replies.join(" "),
            error,
        }
    }
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn error_text(body: &[u8]) -> String {
    let mut code = String::new();
    let mut message = String::new();
    for field in body.split(|b| *b == 0) {
        if let Some((&t, rest)) = field.split_first() {
            let v = String::from_utf8_lossy(rest).into_owned();
            match t {
                b'C' => code = v,
                b'M' => message = v,
                _ => {}
            }
        }
    }
    format!("{code}: {message}")
}
