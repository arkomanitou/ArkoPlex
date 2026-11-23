package app.arkoplex.android;

import static org.junit.Assert.*;

import org.junit.Test;

public class PlaybackPositionTest {
  @Test
  public void failedStartPreservesResume() {
    PlaybackPosition clock = new PlaybackPosition(123000);
    clock.update(0);
    assertEquals(1230000000L, clock.ticks());
  }

  @Test
  public void decoderPrerollCannotEraseResume() {
    PlaybackPosition clock = new PlaybackPosition(123000);
    clock.started();
    clock.update(0);
    clock.update(500);
    assertEquals(123000, clock.milliseconds());
    clock.update(123500);
    assertEquals(123500, clock.milliseconds());
  }

  @Test
  public void seekToBeginningAndBackwardsIsIntentional() {
    PlaybackPosition clock = new PlaybackPosition(123000);
    clock.started();
    clock.seek(0);
    clock.update(0);
    assertEquals(0, clock.ticks());
    clock.update(10000);
    clock.seek(1000);
    assertEquals(1000, clock.milliseconds());
  }

  @Test
  public void closeIsIdempotentAndFreezesPosition() {
    PlaybackPosition clock = new PlaybackPosition(5000);
    clock.started();
    clock.update(6000);
    assertTrue(clock.close());
    assertFalse(clock.close());
    clock.update(0);
    clock.update(9000);
    assertEquals(6000, clock.milliseconds());
  }
}
