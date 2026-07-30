use std::sync::{
    mpsc::{sync_channel, Receiver, SyncSender, TrySendError},
    Mutex,
};

const SUBSCRIBER_BUFFER_FRAMES: usize = 32;

#[derive(Clone, Debug)]
pub(crate) struct PlaybackFrame {
    pub sample_rate: u32,
    pub samples: Vec<f32>,
}

/// Fans out the PCM frames that were actually handed to the speaker callback.
///
/// Subscribers receive a best-effort real-time reference. A slow subscriber is
/// allowed to lose old frames instead of blocking the operating system audio
/// callback and causing audible glitches.
pub struct PlaybackReference {
    subscribers: Mutex<Vec<SyncSender<PlaybackFrame>>>,
}

impl PlaybackReference {
    pub fn new() -> Self {
        Self {
            subscribers: Mutex::new(Vec::new()),
        }
    }

    pub(crate) fn subscribe(&self) -> Receiver<PlaybackFrame> {
        let (sender, receiver) = sync_channel(SUBSCRIBER_BUFFER_FRAMES);
        if let Ok(mut subscribers) = self.subscribers.lock() {
            subscribers.push(sender);
        }
        receiver
    }

    pub(crate) fn publish(&self, sample_rate: u32, samples: &[f32]) {
        if samples.is_empty() {
            return;
        }
        let Ok(mut subscribers) = self.subscribers.lock() else {
            return;
        };
        if subscribers.is_empty() {
            return;
        }
        let frame = PlaybackFrame {
            sample_rate,
            samples: samples.to_vec(),
        };
        subscribers.retain(|subscriber| match subscriber.try_send(frame.clone()) {
            Ok(()) | Err(TrySendError::Full(_)) => true,
            Err(TrySendError::Disconnected(_)) => false,
        });
    }
}

impl Default for PlaybackReference {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::PlaybackReference;

    #[test]
    fn publishes_played_pcm_to_active_subscribers() {
        let reference = PlaybackReference::new();
        let receiver = reference.subscribe();

        reference.publish(48_000, &[0.25, -0.5]);

        let frame = receiver.try_recv().unwrap();
        assert_eq!(frame.sample_rate, 48_000);
        assert_eq!(frame.samples, vec![0.25, -0.5]);
    }
}
