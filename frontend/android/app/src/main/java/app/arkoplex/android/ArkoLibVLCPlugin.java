package app.arkoplex.android;

import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.URI;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "ArkoLibVLC")
public class ArkoLibVLCPlugin extends Plugin {
  // Memory handoff only: never put credentials/stream URLs in an Intent or saved state.
  static final class Run {
    final JSObject options;
    LibVLCActivity activity;
    JSObject result;
    boolean hadActivity;

    Run(JSObject options) {
      this.options = options;
    }
  }

  private static Run active;

  static synchronized Run claim() {
    return active;
  }

  @PluginMethod
  public void play(PluginCall call) {
    getActivity()
        .runOnUiThread(
            () -> {
              synchronized (ArkoLibVLCPlugin.class) {
                if (active != null) {
                  call.reject("Un lecteur est déjà actif");
                  return;
                }
                try {
                  validate(call.getData());
                } catch (Exception ignored) {
                  call.reject("Paramètres de lecture invalides");
                  return;
                }
                active = new Run(call.getData());
              }
              try {
                startActivityForResult(
                    call, new Intent(getContext(), LibVLCActivity.class), "finished");
              } catch (Exception ignored) {
                active = null;
                call.reject("Lecteur natif indisponible");
              }
            });
  }

  private static URI http(String value) throws Exception {
    URI uri = new URI(value);
    if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))
        || uri.getHost() == null
        || uri.getUserInfo() != null
        || uri.getFragment() != null) throw new IllegalArgumentException();
    return uri;
  }

  private static void sameOrigin(URI base, String value) throws Exception {
    URI uri = http(value);
    if (!base.getScheme().equals(uri.getScheme())
        || !base.getAuthority().equals(uri.getAuthority())) throw new IllegalArgumentException();
  }

  private static void validate(JSObject options) throws Exception {
    URI base = http(options.getString("url"));
    if (options.getString("authorization").isEmpty()) throw new IllegalArgumentException();
    JSONObject session = options.getJSONObject("session");
    sameOrigin(base, session.getString("startUrl"));
    sameOrigin(base, session.getString("progressUrl"));
    JSONArray cleanup = session.getJSONArray("cleanup");
    for (int i = 0; i < cleanup.length(); i++)
      sameOrigin(base, cleanup.getJSONObject(i).getString("url"));
    JSONArray subtitles = options.getJSONArray("externalSubtitles");
    for (int i = 0; i < subtitles.length(); i++)
      sameOrigin(base, subtitles.getJSONObject(i).getString("url"));
  }

  @PluginMethod
  public void stop(PluginCall call) {
    getActivity()
        .runOnUiThread(
            () -> {
              Run run = active;
              if (run != null && run.activity != null) run.activity.finishPlayback("back");
              call.resolve();
            });
  }

  @ActivityCallback
  private void finished(PluginCall call, ActivityResult result) {
    Run run = active;
    active = null;
    if (call == null) return;
    if (run != null && run.result != null) call.resolve(run.result);
    else if (run != null && run.hadActivity) {
      // A native session owns its last position and cleanup. Do not let a
      // cancelled Activity result trigger a second JS stop at the old resume point.
      if (run.activity != null) run.activity.finishPlayback("interrupted");
      JSObject interrupted = new JSObject();
      interrupted.put("reason", "interrupted");
      interrupted.put("cleanupFailed", true);
      interrupted.put("volume", run.options.optDouble("volume", 1));
      interrupted.put("brightness", run.options.optDouble("brightness", 1));
      interrupted.put("positionMs", run.options.optLong("startMs", 0));
      call.resolve(interrupted);
    } else call.reject("Lecture native interrompue");
  }

  @Override
  protected void handleOnDestroy() {
    Run run = active;
    if (run != null && run.activity != null)
      run.activity.runOnUiThread(() -> run.activity.finishPlayback("interrupted"));
  }
}
