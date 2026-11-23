package app.arkoplex.android;

/** Resume survives pre-roll zeroes and failed starts; explicit seeks may select zero. */
final class PlaybackPosition {
  private long position;
  private boolean waitingForResume;
  private boolean started;
  private boolean closed;

  PlaybackPosition(long resumeMs) {
    position = Math.max(0, resumeMs);
    waitingForResume = position > 0;
  }

  void started() {
    started = true;
  }

  void update(long timeMs) {
    if (!started || closed || timeMs < 0) return;
    if (waitingForResume && timeMs < position - 2000) return;
    waitingForResume = false;
    if (timeMs > 0) position = timeMs;
  }

  void seek(long timeMs) {
    position = Math.max(0, timeMs);
    waitingForResume = false;
  }

  long milliseconds() {
    return position;
  }

  long ticks() {
    return position * 10_000L;
  }

  boolean close() {
    if (closed) return false;
    closed = true;
    return true;
  }
}
