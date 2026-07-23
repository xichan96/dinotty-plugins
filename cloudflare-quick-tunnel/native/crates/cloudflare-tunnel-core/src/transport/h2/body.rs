use std::io;
use std::pin::Pin;
use std::task::{Context, Poll};

use bytes::{Buf, Bytes};
use h2::{RecvStream, SendStream};
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};

pub(crate) struct H2Reader {
    stream: RecvStream,
    current: Bytes,
}

impl H2Reader {
    pub fn new(stream: RecvStream) -> Self {
        Self {
            stream,
            current: Bytes::new(),
        }
    }
}

impl AsyncRead for H2Reader {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        output: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        loop {
            if !self.current.is_empty() {
                let count = self.current.len().min(output.remaining());
                output.put_slice(&self.current[..count]);
                self.current.advance(count);
                return Poll::Ready(Ok(()));
            }
            match self.stream.poll_data(cx) {
                Poll::Pending => return Poll::Pending,
                Poll::Ready(None) => return Poll::Ready(Ok(())),
                Poll::Ready(Some(Err(error))) => return Poll::Ready(Err(io::Error::other(error))),
                Poll::Ready(Some(Ok(data))) => {
                    let length = data.len();
                    if let Err(error) = self.stream.flow_control().release_capacity(length) {
                        return Poll::Ready(Err(io::Error::other(error)));
                    }
                    self.current = data;
                }
            }
        }
    }
}

pub(crate) struct H2Writer {
    stream: Option<SendStream<Bytes>>,
}

impl H2Writer {
    pub fn new(stream: SendStream<Bytes>) -> Self {
        Self {
            stream: Some(stream),
        }
    }
}

impl AsyncWrite for H2Writer {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        input: &[u8],
    ) -> Poll<io::Result<usize>> {
        if input.is_empty() {
            return Poll::Ready(Ok(0));
        }
        let stream = self
            .stream
            .as_mut()
            .ok_or_else(|| io::Error::new(io::ErrorKind::BrokenPipe, "H2 stream ended"))?;
        stream.reserve_capacity(input.len());
        if stream.capacity() == 0 {
            match stream.poll_capacity(cx) {
                Poll::Pending => return Poll::Pending,
                Poll::Ready(None) => {
                    return Poll::Ready(Err(io::Error::new(
                        io::ErrorKind::BrokenPipe,
                        "H2 stream closed",
                    )))
                }
                Poll::Ready(Some(Err(error))) => return Poll::Ready(Err(io::Error::other(error))),
                Poll::Ready(Some(Ok(_))) => {}
            }
        }
        let count = input.len().min(stream.capacity());
        stream
            .send_data(Bytes::copy_from_slice(&input[..count]), false)
            .map_err(io::Error::other)?;
        Poll::Ready(Ok(count))
    }

    fn poll_flush(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Poll::Ready(Ok(()))
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        if let Some(mut stream) = self.stream.take() {
            stream
                .send_data(Bytes::new(), true)
                .map_err(io::Error::other)?;
        }
        Poll::Ready(Ok(()))
    }
}

pub(crate) async fn send_data(
    stream: &mut SendStream<Bytes>,
    mut data: Bytes,
    end: bool,
) -> Result<(), h2::Error> {
    while !data.is_empty() {
        stream.reserve_capacity(data.len());
        let capacity = stream.capacity();
        let capacity = if capacity == 0 {
            futures::future::poll_fn(|cx| stream.poll_capacity(cx))
                .await
                .unwrap_or(Ok(0))?
        } else {
            capacity
        };
        if capacity == 0 {
            return Err(h2::Error::from(h2::Reason::STREAM_CLOSED));
        }
        let count = capacity.min(data.len());
        stream.send_data(data.split_to(count), false)?;
    }
    if end && data.is_empty() {
        stream.send_data(Bytes::new(), true)?;
    }
    Ok(())
}
