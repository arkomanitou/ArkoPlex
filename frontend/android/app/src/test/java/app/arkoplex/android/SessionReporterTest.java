package app.arkoplex.android;

import static org.junit.Assert.*;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class SessionReporterTest {
  private JSONObject spec() throws Exception {
    return new JSONObject()
        .put("startUrl", "start")
        .put("progressUrl", "progress")
        .put("body", new JSONObject().put("ItemId", "fixture").put("PlaySessionId", "this-session"))
        .put(
            "cleanup",
            new JSONArray()
                .put(
                    new JSONObject()
                        .put("method", "POST")
                        .put("url", "stopped")
                        .put("body", new JSONObject().put("PositionTicks", 0)))
                .put(
                    new JSONObject()
                        .put("method", "DELETE")
                        .put("url", "encoding?deviceId=this-device&playSessionId=this-session"))
                .put(new JSONObject().put("method", "POST").put("url", "live")));
  }

  @Test
  public void serializesStartPauseAndStopOnce() throws Exception {
    List<String> calls = new ArrayList<>();
    List<Long> positions = new ArrayList<>();
    SessionReporter reporter =
        new SessionReporter(
            spec(),
            (method, url, body) -> {
              calls.add(url);
              if (body != null) positions.add(body.optLong("PositionTicks"));
              if (url.equals("progress")) assertTrue(body.getBoolean("IsPaused"));
            });
    reporter.start(1230000, 40, 2, -1);
    reporter.start(0, 40, 2, -1);
    reporter.progress(4560000, true, 40, 2, -1);
    CountDownLatch done = new CountDownLatch(1);
    reporter.close(
        4560000,
        failed -> {
          assertFalse(failed);
          done.countDown();
        });
    reporter.progress(0, false, 0, 0, 0);
    assertTrue(done.await(5, TimeUnit.SECONDS));
    assertEquals(
        List.of(
            "start",
            "progress",
            "stopped",
            "encoding?deviceId=this-device&playSessionId=this-session",
            "live"),
        calls);
    assertEquals(List.of(1230000L, 4560000L, 4560000L), positions);
  }

  @Test
  public void cleanupContinuesAfterFailuresAndWithoutStart() throws Exception {
    List<String> calls = new ArrayList<>();
    SessionReporter reporter =
        new SessionReporter(
            spec(),
            (method, url, body) -> {
              calls.add(url);
              if (url.equals("stopped")) {
                assertEquals(9990000L, body.getLong("PositionTicks"));
                throw new java.io.IOException();
              }
            });
    CountDownLatch done = new CountDownLatch(1);
    reporter.close(
        9990000,
        failed -> {
          assertTrue(failed);
          done.countDown();
        });
    reporter.close(0, failed -> fail("duplicate close"));
    assertTrue(done.await(5, TimeUnit.SECONDS));
    assertEquals(
        List.of(
            "stopped",
            "stopped",
            "encoding?deviceId=this-device&playSessionId=this-session",
            "live"),
        calls);
  }
}
