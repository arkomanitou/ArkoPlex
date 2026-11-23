package app.arkoplex.android;

import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/** Single ordered writer: start -> progress -> stopped -> bounded encoding/live cleanup. */
final class SessionReporter {
  interface Transport {
    void send(String method, String url, JSONObject body) throws Exception;
  }

  private final ExecutorService queue = Executors.newSingleThreadExecutor();
  private final JSONObject spec;
  private final Transport transport;
  private boolean started, closed;
  private final java.util.concurrent.atomic.AtomicBoolean pendingProgress =
      new java.util.concurrent.atomic.AtomicBoolean();
  private boolean failed;

  SessionReporter(JSONObject spec, String authorization) {
    this(
        spec,
        (method, url, body) -> {
          HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
          try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(4000);
            connection.setReadTimeout(4000);
            connection.setRequestMethod(method);
            connection.setRequestProperty("Authorization", authorization);
            if (body != null) {
              connection.setRequestProperty("Content-Type", "application/json");
              connection.setDoOutput(true);
              byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
              connection.setFixedLengthStreamingMode(bytes.length);
              try (java.io.OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
              }
            }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300)
              throw new java.io.IOException("Session request failed");
          } finally {
            connection.disconnect();
          }
        });
  }

  SessionReporter(JSONObject spec, Transport transport) {
    this.spec = spec;
    this.transport = transport;
  }

  private JSONObject body(long ticks, boolean paused, int volume, int audio, int subtitle) {
    JSONObject body = new JSONObject();
    try {
      body = new JSONObject(spec.getJSONObject("body").toString());
      body.put("PositionTicks", ticks);
      body.put("IsPaused", paused);
      body.put("VolumeLevel", volume);
      body.put("IsMuted", volume == 0);
      body.put("AudioStreamIndex", audio);
      body.put("SubtitleStreamIndex", subtitle);
    } catch (Exception ignored) {
      failed = true;
    }
    return body;
  }

  void start(long ticks, int volume, int audio, int subtitle) {
    if (started || closed) return;
    started = true;
    JSONObject payload = body(ticks, false, volume, audio, subtitle);
    queue.execute(() -> send("POST", spec.optString("startUrl"), payload));
  }

  void progress(long ticks, boolean paused, int volume, int audio, int subtitle) {
    if (!started || closed || !pendingProgress.compareAndSet(false, true)) return;
    JSONObject payload = body(ticks, paused, volume, audio, subtitle);
    queue.execute(
        () -> {
          try {
            send("POST", spec.optString("progressUrl"), payload);
          } finally {
            pendingProgress.set(false);
          }
        });
  }

  void close(long ticks, java.util.function.Consumer<Boolean> complete) {
    if (closed) return;
    closed = true;
    queue.execute(
        () -> {
          JSONArray cleanup = spec.optJSONArray("cleanup");
          if (cleanup != null)
            for (int i = 0; i < cleanup.length(); i++) {
              JSONObject request = cleanup.optJSONObject(i);
              if (request == null) continue;
              try {
                JSONObject payload =
                    request.has("body")
                        ? new JSONObject(request.getJSONObject("body").toString())
                        : null;
                if (payload != null) payload.put("PositionTicks", ticks);
                // Each cleanup is attempted even when another endpoint fails.
                send(request.optString("method"), request.optString("url"), payload);
              } catch (Exception ignored) {
                failed = true;
              }
            }
          complete.accept(failed);
        });
    queue.shutdown();
  }

  private void send(String method, String url, JSONObject body) {
    // Bounded immediate retry, no persisted token or offline queue.
    for (int attempt = 0; attempt < 2; attempt++) {
      try {
        transport.send(method, url, body);
        return;
      } catch (Exception ignored) {
        if (attempt == 1) failed = true;
      }
    }
  }
}
