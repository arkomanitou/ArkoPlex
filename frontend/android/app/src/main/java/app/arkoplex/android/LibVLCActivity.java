package app.arkoplex.android;

import android.app.AlertDialog;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;
import org.videolan.libvlc.LibVLC;
import org.videolan.libvlc.Media;
import org.videolan.libvlc.MediaPlayer;
import org.videolan.libvlc.interfaces.IMedia;
import org.videolan.libvlc.util.VLCVideoLayout;

/** All controls belong to this activity; no external VLC app, service or notification. */
public class LibVLCActivity extends androidx.activity.ComponentActivity {
  private final Handler handler = new Handler(Looper.getMainLooper());
  private ArkoLibVLCPlugin.Run run;
  private LibVLC lib;
  private MediaPlayer player;
  private PlaybackPosition position;
  private SessionReporter reporter;
  private FrameLayout root;
  private LinearLayout top, bottom;
  private TextView time, feedback;
  private Button pause, skip;
  private SeekBar seek;
  private boolean finishing,
      seeking,
      initializedTracks,
      receiverRegistered,
      initialAudioApplied,
      initialSubtitleApplied;
  private int selectedServerIndex = -1;
  private int volume = 100, audioOrdinal = -1, subtitleOrdinal = -1;
  private int audioServerIndex = -1, subtitleServerIndex = -1;
  private float brightness = 1;
  private long lastReport, initialMs;
  private JSONArray audioIndices, embeddedSubtitles, subtitleIndices, externalSubtitles;
  private AudioManager audioManager;
  private AudioFocusRequest focusRequest;
  private final Runnable hideControls =
      () -> {
        if (!finishing) {
          top.setVisibility(View.GONE);
          bottom.setVisibility(View.GONE);
        }
      };
  private final AudioManager.OnAudioFocusChangeListener focusListener =
      change ->
          runOnUiThread(
              () -> {
                if (change < 0 && player != null && player.isPlaying()) {
                  player.pause();
                  report();
                  showControls();
                }
              });
  private final BroadcastReceiver noisy =
      new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
          if (player != null && player.isPlaying()) {
            player.pause();
            report();
            showControls();
          }
        }
      };
  private final Runnable tick =
      new Runnable() {
        @Override
        public void run() {
          if (finishing || player == null) return;
          position.update(player.getTime());
          long length = player.getLength();
          if (!seeking)
            seek.setProgress(length > 0 ? (int) (1000L * position.milliseconds() / length) : 0);
          seek.setEnabled(player.isSeekable() && length > 0);
          time.setText(format(position.milliseconds()) + " / " + format(length));
          pause.setText(player.isPlaying() ? "Pause" : "Lecture");
          updateSkip();
          if (android.os.SystemClock.elapsedRealtime() - lastReport >= 5000) report();
          handler.postDelayed(this, 500);
        }
      };

  @Override
  public void onCreate(Bundle saved) {
    super.onCreate(saved);
    getOnBackPressedDispatcher()
        .addCallback(
            this,
            new androidx.activity.OnBackPressedCallback(true) {
              @Override
              public void handleOnBackPressed() {
                finishPlayback("back");
              }
            });
    run = ArkoLibVLCPlugin.claim();
    // Restored after process death: no secret was saved, so return to navigation.
    if (run == null) {
      finish();
      return;
    }
    run.activity = this;
    run.hadActivity = true;
    JSObject options = run.options;
    initialMs = options.optLong("startMs", 0);
    position = new PlaybackPosition(initialMs);
    reporter =
        new SessionReporter(options.optJSONObject("session"), options.optString("authorization"));
    volume = Math.max(0, Math.min(100, (int) (options.optDouble("volume", 1) * 100)));
    brightness = (float) Math.max(0.3, Math.min(1, options.optDouble("brightness", 1)));
    audioOrdinal = options.optInt("audioOrdinal", -1);
    subtitleOrdinal = options.optInt("subtitleOrdinal", -1);
    audioIndices = options.optJSONArray("audioIndices");
    subtitleIndices = options.optJSONArray("subtitleIndices");
    embeddedSubtitles = options.optJSONArray("embeddedSubtitles");
    externalSubtitles = options.optJSONArray("externalSubtitles");
    JSONObject body = options.optJSONObject("session").optJSONObject("body");
    audioServerIndex = body.optInt("AudioStreamIndex", -1);
    subtitleServerIndex = body.optInt("SubtitleStreamIndex", -1);
    buildUi(options);
    setVolumeControlStream(AudioManager.STREAM_MUSIC);
    applyBrightness();
    fullscreen();
    try {
      lib =
          new LibVLC(
              this,
              new ArrayList<>(
                  Arrays.asList(
                      "--quiet",
                      "--verbose=-1",
                      "--no-video-title-show",
                      "--network-caching=1000")));
      player = new MediaPlayer(lib);
      player.attachViews((VLCVideoLayout) root.getChildAt(0), null, false, false);
      player.setEventListener(event -> runOnUiThread(() -> onPlayerEvent(event)));
      Media media = new Media(lib, Uri.parse(options.optString("url")));
      media.setHWDecoderEnabled(true, false);
      if (initialMs > 0) media.addOption(":start-time=" + initialMs / 1000.0);
      player.setMedia(media);
      media.release();
      player.setVolume(volume);
      boolean hasAudioFocus = requestAudioFocus();
      ContextCompat.registerReceiver(
          this,
          noisy,
          new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
          ContextCompat.RECEIVER_NOT_EXPORTED);
      receiverRegistered = true;
      if (hasAudioFocus) player.play();
      handler.post(tick);
    } catch (Exception | LinkageError ignored) {
      finishPlayback("error");
    }
  }

  private void onPlayerEvent(MediaPlayer.Event event) {
    if (finishing || player == null) return;
    if (event.type == MediaPlayer.Event.Playing) {
      position.started();
      if (!initializedTracks) {
        initializedTracks = true;
        if (initialMs > 0 && player.isSeekable()) player.setTime(initialMs);
        applyInitialTracks();
      }
      getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
      reporter.start(position.ticks(), volume, audioServerIndex, subtitleServerIndex);
      report();
    } else if (event.type == MediaPlayer.Event.Paused) {
      getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
      report();
    } else if (event.type == MediaPlayer.Event.EndReached) {
      position.update(player.getLength());
      finishPlayback("ended");
    } else if (event.type == MediaPlayer.Event.EncounteredError) {
      finishPlayback("error");
    } else if (event.type == MediaPlayer.Event.ESAdded && initializedTracks) {
      applyInitialTracks();
    }
  }

  private void buildUi(JSObject options) {
    root = new FrameLayout(this);
    root.setBackgroundColor(Color.BLACK);
    setContentView(root);
    root.addView(new VLCVideoLayout(this), new FrameLayout.LayoutParams(-1, -1));
    View gesture = new View(this);
    root.addView(gesture, new FrameLayout.LayoutParams(-1, -1));
    installGestures(gesture);
    top = new LinearLayout(this);
    top.setGravity(Gravity.CENTER_VERTICAL);
    top.setBackgroundColor(0xC0000000);
    top.setPadding(dp(12), dp(8), dp(12), dp(8));
    FrameLayout.LayoutParams topLayout = new FrameLayout.LayoutParams(-1, -2, Gravity.TOP);
    root.addView(top, topLayout);
    top.addView(button("Retour", () -> finishPlayback("back")));
    TextView title = new TextView(this);
    title.setTextColor(Color.WHITE);
    title.setTextSize(18);
    title.setText(options.optString("title", "ArkoPlex"));
    top.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
    top.addView(button("Licences", this::showLicenses));
    bottom = new LinearLayout(this);
    bottom.setOrientation(LinearLayout.VERTICAL);
    bottom.setPadding(dp(12), dp(8), dp(12), dp(8));
    bottom.setBackgroundColor(0xC0000000);
    root.addView(bottom, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
    time = new TextView(this);
    time.setTextColor(Color.WHITE);
    bottom.addView(time);
    seek = new SeekBar(this);
    seek.setMax(1000);
    bottom.addView(seek, new LinearLayout.LayoutParams(-1, dp(48)));
    seek.setOnSeekBarChangeListener(
        new SeekBar.OnSeekBarChangeListener() {
          @Override
          public void onStartTrackingTouch(SeekBar bar) {
            seeking = true;
            handler.removeCallbacks(hideControls);
          }

          @Override
          public void onProgressChanged(SeekBar bar, int progress, boolean user) {}

          @Override
          public void onStopTrackingTouch(SeekBar bar) {
            seeking = false;
            if (player != null) seekTo(player.getLength() * bar.getProgress() / 1000);
            showControls();
          }
        });
    LinearLayout controls = new LinearLayout(this);
    controls.setGravity(Gravity.CENTER);
    bottom.addView(controls);
    if (options.optBoolean("hasPrevious"))
      controls.addView(button("Précédent", () -> finishPlayback("previous")));
    pause =
        button(
            "Pause",
            () -> {
              if (player == null) return;
              if (player.isPlaying()) player.pause();
              else if (requestAudioFocus()) player.play();
              report();
              showControls();
            });
    controls.addView(pause);
    controls.addView(button("Audio", () -> chooseTrack(false)));
    controls.addView(button("Sous-titres", () -> chooseTrack(true)));
    if (options.optBoolean("hasNext"))
      controls.addView(button("Suivant", () -> finishPlayback("next")));
    skip =
        button(
            "Passer l’introduction",
            () -> {
              JSONObject segment = currentSegment();
              if (segment != null) seekTo(segment.optLong("endMs"));
            });
    bottom.addView(skip);
    feedback = new TextView(this);
    feedback.setTextColor(Color.WHITE);
    feedback.setTextSize(22);
    feedback.setGravity(Gravity.CENTER);
    feedback.setVisibility(View.GONE);
    root.addView(feedback, new FrameLayout.LayoutParams(-1, dp(100), Gravity.CENTER));
    // Keep controls outside display cutouts while the video fills the screen.
    if (Build.VERSION.SDK_INT >= 28)
      root.setOnApplyWindowInsetsListener(
          (view, insets) -> {
            android.view.DisplayCutout cutout = insets.getDisplayCutout();
            if (cutout != null) {
              top.setPadding(
                  dp(12) + cutout.getSafeInsetLeft(),
                  dp(8) + cutout.getSafeInsetTop(),
                  dp(12) + cutout.getSafeInsetRight(),
                  dp(8));
              bottom.setPadding(
                  dp(12) + cutout.getSafeInsetLeft(),
                  dp(8),
                  dp(12) + cutout.getSafeInsetRight(),
                  dp(8) + cutout.getSafeInsetBottom());
            }
            return insets;
          });
    showControls();
  }

  private Button button(String text, Runnable action) {
    Button button = new Button(this);
    button.setText(text);
    button.setTextSize(12);
    button.setAllCaps(false);
    button.setMinWidth(0);
    button.setMinimumWidth(0);
    button.setPadding(dp(10), dp(4), dp(10), dp(4));
    button.setOnClickListener(view -> action.run());
    return button;
  }

  private void installGestures(View view) {
    GestureDetector detector =
        new GestureDetector(
            this,
            new GestureDetector.SimpleOnGestureListener() {
              private float startBrightness, startVolume;

              @Override
              public boolean onDown(MotionEvent event) {
                startBrightness = brightness;
                startVolume = volume;
                return true;
              }

              @Override
              public boolean onSingleTapConfirmed(MotionEvent event) {
                if (top.getVisibility() == View.VISIBLE) hideControls.run();
                else showControls();
                return true;
              }

              @Override
              public boolean onDoubleTap(MotionEvent event) {
                if (player != null) {
                  boolean forward = event.getX() >= view.getWidth() / 2f;
                  seekTo(position.milliseconds() + (forward ? 10000 : -10000));
                  showFeedback(forward ? "+10 s" : "−10 s");
                }
                return true;
              }

              @Override
              public boolean onScroll(MotionEvent first, MotionEvent current, float dx, float dy) {
                if (first == null
                    || Math.abs(current.getY() - first.getY()) < dp(12)
                    || Math.abs(current.getY() - first.getY())
                        < Math.abs(current.getX() - first.getX()) * 1.2) return false;
                float delta =
                    (first.getY() - current.getY()) / Math.max(1, view.getHeight()) * 1.5f;
                if (first.getX() < view.getWidth() / 2f) {
                  brightness = Math.max(.3f, Math.min(1, startBrightness + delta));
                  applyBrightness();
                  showFeedback("Luminosité " + Math.round(brightness * 100) + " %");
                } else {
                  volume = Math.max(0, Math.min(100, Math.round(startVolume + delta * 100)));
                  if (player != null) player.setVolume(volume);
                  showFeedback("Volume " + volume + " %");
                }
                return true;
              }
            });
    view.setOnTouchListener((surface, event) -> detector.onTouchEvent(event));
  }

  private void applyBrightness() {
    WindowManager.LayoutParams attributes = getWindow().getAttributes();
    attributes.screenBrightness = brightness;
    getWindow().setAttributes(attributes);
  }

  private void showFeedback(String text) {
    feedback.setText(text);
    feedback.setVisibility(View.VISIBLE);
    handler.removeCallbacks(clearFeedback);
    handler.postDelayed(clearFeedback, 900);
  }

  private final Runnable clearFeedback =
      () -> {
        if (feedback != null) feedback.setVisibility(View.GONE);
      };

  private void showControls() {
    if (top == null || finishing) return;
    top.setVisibility(View.VISIBLE);
    bottom.setVisibility(View.VISIBLE);
    handler.removeCallbacks(hideControls);
    handler.postDelayed(hideControls, 4000);
  }

  private void fullscreen() {
    if (Build.VERSION.SDK_INT >= 30) {
      getWindow().setDecorFitsSystemWindows(false);
      WindowInsetsController controller = getWindow().getInsetsController();
      if (controller != null) {
        controller.hide(WindowInsets.Type.systemBars());
        controller.setSystemBarsBehavior(
            WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
      }
    } else
      getWindow()
          .getDecorView()
          .setSystemUiVisibility(
              View.SYSTEM_UI_FLAG_FULLSCREEN
                  | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                  | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                  | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                  | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                  | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) fullscreen();
  }

  private void seekTo(long requested) {
    if (player == null || !player.isSeekable()) return;
    long length = player.getLength();
    long target = Math.max(0, length > 0 ? Math.min(requested, length) : requested);
    position.seek(target);
    player.setTime(target);
    report();
  }

  private JSONObject currentSegment() {
    JSONArray segments = run.options.optJSONArray("segments");
    if (segments != null)
      for (int i = 0; i < segments.length(); i++) {
        JSONObject segment = segments.optJSONObject(i);
        if (segment != null
            && position.milliseconds() >= segment.optLong("startMs")
            && position.milliseconds() < segment.optLong("endMs")) return segment;
      }
    return null;
  }

  private void updateSkip() {
    JSONObject segment = currentSegment();
    skip.setVisibility(segment == null ? View.GONE : View.VISIBLE);
    if (segment != null) skip.setText(segment.optString("name"));
  }

  private ArrayList<MediaPlayer.TrackDescription> tracks(boolean subtitles) {
    ArrayList<MediaPlayer.TrackDescription> result = new ArrayList<>();
    MediaPlayer.TrackDescription[] values =
        subtitles ? player.getSpuTracks() : player.getAudioTracks();
    if (values != null)
      for (MediaPlayer.TrackDescription track : values) if (track.id >= 0) result.add(track);
    return result;
  }

  private void applyInitialTracks() {
    if (player == null) return;
    ArrayList<MediaPlayer.TrackDescription> audio = tracks(false);
    // Ordinals are only mapped when VLC and Jellyfin agree on track counts.
    if (!initialAudioApplied
        && audioIndices != null
        && audio.size() == audioIndices.length()
        && audioOrdinal >= 0
        && audioOrdinal < audio.size()) {
      initialAudioApplied = true;
      player.setAudioTrack(audio.get(audioOrdinal).id);
    }
    if (!initialSubtitleApplied) {
      // Set before adding an external slave: ESAdded may fire immediately.
      initialSubtitleApplied = true;
      if (subtitleOrdinal < 0) player.setSpuTrack(-1);
      else selectSubtitle(subtitleOrdinal);
    }
  }

  private void selectSubtitle(int ordinal) {
    if (externalSubtitles != null)
      for (int i = 0; i < externalSubtitles.length(); i++) {
        JSONObject external = externalSubtitles.optJSONObject(i);
        if (external.optInt("ordinal", -2) == ordinal) {
          player.addSlave(IMedia.Slave.Type.Subtitle, Uri.parse(external.optString("url")), true);
          subtitleOrdinal = ordinal;
          subtitleServerIndex = subtitleIndices == null ? -1 : subtitleIndices.optInt(ordinal, -1);
          return;
        }
      }
    ArrayList<MediaPlayer.TrackDescription> tracks = tracks(true);
    if (embeddedSubtitles != null && tracks.size() == embeddedSubtitles.length()) {
      for (int i = 0; i < embeddedSubtitles.length(); i++)
        if (embeddedSubtitles.optInt(i, -2) == ordinal) {
          player.setSpuTrack(tracks.get(i).id);
          subtitleOrdinal = ordinal;
          subtitleServerIndex = subtitleIndices == null ? -1 : subtitleIndices.optInt(ordinal, -1);
        }
    }
  }

  private void chooseTrack(boolean subtitles) {
    if (player == null || finishing) return;
    handler.removeCallbacks(hideControls);
    if (run.options.optBoolean("serverTrackSelection")) {
      JSONArray source = run.options.optJSONArray(subtitles ? "sourceSubtitles" : "sourceAudio");
      ArrayList<String> labels = new ArrayList<>();
      if (subtitles) labels.add("Désactivés");
      if (source != null)
        for (int i = 0; i < source.length(); i++)
          labels.add(source.optJSONObject(i).optString("name"));
      new AlertDialog.Builder(this)
          .setTitle(subtitles ? "Sous-titres" : "Audio")
          .setItems(
              labels.toArray(new String[0]),
              (dialog, index) -> {
                selectedServerIndex =
                    subtitles && index == 0
                        ? -1
                        : source.optJSONObject(index - (subtitles ? 1 : 0)).optInt("index", -1);
                int current = subtitles ? subtitleServerIndex : audioServerIndex;
                if (selectedServerIndex != current)
                  finishPlayback(subtitles ? "subtitle" : "audio");
                else showControls();
              })
          .setOnDismissListener(dialog -> showControls())
          .show();
      return;
    }
    ArrayList<MediaPlayer.TrackDescription> tracks = tracks(subtitles);
    ArrayList<String> names = new ArrayList<>();
    if (subtitles) names.add("Désactivés");
    for (MediaPlayer.TrackDescription track : tracks) names.add(track.name);
    int externalStart = names.size();
    if (subtitles && externalSubtitles != null)
      for (int i = 0; i < externalSubtitles.length(); i++)
        names.add(externalSubtitles.optJSONObject(i).optString("name") + " (externe)");
    if (names.isEmpty()) {
      Toast.makeText(this, "Aucune piste disponible", Toast.LENGTH_SHORT).show();
      showControls();
      return;
    }
    new AlertDialog.Builder(this)
        .setTitle(subtitles ? "Sous-titres" : "Audio")
        .setItems(
            names.toArray(new String[0]),
            (dialog, index) -> {
              if (player == null) return;
              initialAudioApplied = true;
              initialSubtitleApplied = true;
              if (subtitles && index == 0) {
                player.setSpuTrack(-1);
                subtitleOrdinal = -1;
                subtitleServerIndex = -1;
              } else if (subtitles && index >= externalStart)
                selectSubtitle(
                    externalSubtitles.optJSONObject(index - externalStart).optInt("ordinal"));
              else {
                int trackIndex = index - (subtitles ? 1 : 0);
                if (subtitles) {
                  player.setSpuTrack(tracks.get(trackIndex).id);
                  subtitleOrdinal =
                      embeddedSubtitles != null && tracks.size() == embeddedSubtitles.length()
                          ? embeddedSubtitles.optInt(trackIndex, -1)
                          : -2;
                  subtitleServerIndex =
                      subtitleIndices == null ? -1 : subtitleIndices.optInt(subtitleOrdinal, -1);
                } else {
                  player.setAudioTrack(tracks.get(trackIndex).id);
                  audioOrdinal =
                      audioIndices != null && tracks.size() == audioIndices.length()
                          ? trackIndex
                          : -2;
                  audioServerIndex =
                      audioIndices == null ? -1 : audioIndices.optInt(audioOrdinal, -1);
                }
              }
              report();
              showControls();
            })
        .setOnDismissListener(dialog -> showControls())
        .show();
  }

  private void report() {
    if (player == null || reporter == null || finishing) return;
    position.update(player.getTime());
    reporter.progress(
        position.ticks(), !player.isPlaying(), volume, audioServerIndex, subtitleServerIndex);
    lastReport = android.os.SystemClock.elapsedRealtime();
  }

  private boolean requestAudioFocus() {
    audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
    int result;
    if (Build.VERSION.SDK_INT >= 26) {
      focusRequest =
          new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
              .setAudioAttributes(
                  new AudioAttributes.Builder()
                      .setUsage(AudioAttributes.USAGE_MEDIA)
                      .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE)
                      .build())
              .setOnAudioFocusChangeListener(focusListener)
              .build();
      result = audioManager.requestAudioFocus(focusRequest);
    } else
      result =
          audioManager.requestAudioFocus(
              focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
    boolean granted = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    if (!granted)
      Toast.makeText(
              this,
              "Lecture en pause : le son est utilisé par une autre application.",
              Toast.LENGTH_LONG)
          .show();
    return granted;
  }

  void finishPlayback(String reason) {
    if (finishing) return;
    if (player != null && position != null) position.update(player.getTime());
    finishing = true;
    handler.removeCallbacksAndMessages(null);
    if (position == null || !position.close()) {
      finish();
      return;
    }
    if (player != null) {
      player.setEventListener(null);
      player.stop();
      player.detachViews();
      player.release();
      player = null;
    }
    if (lib != null) {
      lib.release();
      lib = null;
    }
    if (receiverRegistered) {
      unregisterReceiver(noisy);
      receiverRegistered = false;
    }
    if (audioManager != null) {
      if (Build.VERSION.SDK_INT >= 26 && focusRequest != null)
        audioManager.abandonAudioFocusRequest(focusRequest);
      else audioManager.abandonAudioFocus(focusListener);
    }
    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    JSObject result = new JSObject();
    result.put("positionMs", position.milliseconds());
    result.put("selectedServerIndex", selectedServerIndex);
    result.put("reason", reason);
    result.put("volume", volume / 100.0);
    result.put("brightness", (double) brightness);
    if (audioOrdinal >= 0) result.put("audioOrdinal", audioOrdinal);
    if (subtitleOrdinal >= -1) result.put("subtitleOrdinal", subtitleOrdinal);
    // The activity returns only after bounded cleanup, so React can report synchronization
    // failures.
    reporter.close(
        position.ticks(),
        failed ->
            runOnUiThread(
                () -> {
                  result.put("cleanupFailed", failed);
                  run.result = result;
                  setResult(RESULT_OK);
                  finish();
                }));
    if (feedback != null) {
      feedback.setText("Fermeture de la session Jellyfin…");
      feedback.setVisibility(View.VISIBLE);
    }
  }

  @Override
  protected void onPause() {
    if (!finishing && player != null) {
      player.pause();
      report();
    }
    super.onPause();
  }

  @Override
  protected void onStop() {
    if (!isChangingConfigurations()) finishPlayback("interrupted");
    super.onStop();
  }

  @Override
  protected void onDestroy() {
    finishPlayback("interrupted");
    if (run != null) run.activity = null;
    super.onDestroy();
  }

  private void showLicenses() {
    try {
      String notice;
      try (java.io.InputStream input = getAssets().open("android-notices.txt")) {
        java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
        notice = bytes.toString("UTF-8");
      }
      TextView text = new TextView(this);
      text.setText(notice);
      text.setPadding(dp(16), dp(16), dp(16), dp(16));
      android.widget.ScrollView scroll = new android.widget.ScrollView(this);
      scroll.addView(text);
      new AlertDialog.Builder(this)
          .setTitle("Licences")
          .setView(scroll)
          .setPositiveButton("Fermer", null)
          .show();
    } catch (Exception ignored) {
      Toast.makeText(this, "Mentions : voir la documentation Android", Toast.LENGTH_SHORT).show();
    }
  }

  private int dp(int value) {
    return Math.round(value * getResources().getDisplayMetrics().density);
  }

  private static String format(long milliseconds) {
    long seconds = Math.max(0, milliseconds / 1000);
    return String.format(
        Locale.ROOT, "%d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60);
  }
}
