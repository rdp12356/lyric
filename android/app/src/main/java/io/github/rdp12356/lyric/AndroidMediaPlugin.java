package io.github.rdp12356.lyric;

import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Bitmap;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "AndroidMedia")
public class AndroidMediaPlugin extends Plugin {
    private String artworkKey = "";
    private String artworkData = "";

    private ComponentName listener() {
        return new ComponentName(getContext(), LyricNotificationListener.class);
    }

    private boolean hasAccess() {
        String enabled = Settings.Secure.getString(getContext().getContentResolver(), "enabled_notification_listeners");
        if (enabled == null) return false;
        for (String value : enabled.split(":")) {
            if (listener().equals(ComponentName.unflattenFromString(value))) return true;
        }
        return false;
    }

    private List<MediaController> sessions() {
        if (!hasAccess()) return Collections.emptyList();
        MediaSessionManager manager = (MediaSessionManager) getContext().getSystemService(android.content.Context.MEDIA_SESSION_SERVICE);
        return manager == null ? Collections.emptyList() : manager.getActiveSessions(listener());
    }

    private MediaController activeController() {
        MediaController fallback = null;
        for (MediaController controller : sessions()) {
            MediaMetadata metadata = controller.getMetadata();
            PlaybackState state = controller.getPlaybackState();
            if (metadata == null || state == null || metadata.getString(MediaMetadata.METADATA_KEY_TITLE) == null) continue;
            if (state.getState() == PlaybackState.STATE_PLAYING) return controller;
            if (fallback == null && state.getState() == PlaybackState.STATE_PAUSED) fallback = controller;
        }
        return fallback;
    }

    @PluginMethod
    public void getPlayback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("permissionGranted", hasAccess());
        result.put("active", false);
        try {
            MediaController controller = activeController();
            if (controller == null) { call.resolve(result); return; }
            MediaMetadata metadata = controller.getMetadata();
            PlaybackState state = controller.getPlaybackState();
            if (metadata == null || state == null) { call.resolve(result); return; }
            boolean playing = state.getState() == PlaybackState.STATE_PLAYING;
            long duration = Math.max(0, metadata.getLong(MediaMetadata.METADATA_KEY_DURATION));
            long position = Math.max(0, state.getPosition());
            if (playing && state.getLastPositionUpdateTime() > 0) {
                position += (long) ((SystemClock.elapsedRealtime() - state.getLastPositionUpdateTime()) * state.getPlaybackSpeed());
            }
            if (duration > 0) position = Math.min(duration, position);
            String title = metadata.getString(MediaMetadata.METADATA_KEY_TITLE);
            String artist = metadata.getString(MediaMetadata.METADATA_KEY_ARTIST);
            String album = metadata.getString(MediaMetadata.METADATA_KEY_ALBUM);
            result.put("active", true);
            result.put("packageName", controller.getPackageName());
            result.put("title", title);
            result.put("artist", artist == null ? "" : artist);
            result.put("album", album == null ? "" : album);
            result.put("playing", playing);
            result.put("position", Math.max(0, position) / 1000.0);
            result.put("duration", duration / 1000.0);
            Bitmap artwork = metadata.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
            if (artwork == null) artwork = metadata.getBitmap(MediaMetadata.METADATA_KEY_ART);
            if (artwork == null) artwork = metadata.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON);
            String key = controller.getPackageName() + title + artist + (artwork == null ? "" : artwork.getGenerationId());
            if (!key.equals(artworkKey)) {
                artworkKey = key;
                artworkData = "";
                if (artwork != null && artwork.getWidth() > 0 && artwork.getHeight() > 0) {
                    float scale = Math.min(1f, 400f / Math.max(artwork.getWidth(), artwork.getHeight()));
                    Bitmap small = Bitmap.createScaledBitmap(artwork, Math.max(1, (int) (artwork.getWidth() * scale)), Math.max(1, (int) (artwork.getHeight() * scale)), true);
                    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                    small.compress(Bitmap.CompressFormat.JPEG, 75, bytes);
                    artworkData = "data:image/jpeg;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP);
                    if (small != artwork) small.recycle();
                }
            }
            result.put("artwork", artworkData);
            call.resolve(result);
        } catch (SecurityException ex) {
            result.put("permissionGranted", false);
            call.resolve(result);
        } catch (Exception ex) {
            call.reject("Could not read the active media session", ex);
        }
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception ex) { call.reject("Could not open notification access settings", ex); }
    }

    @PluginMethod
    public void control(PluginCall call) {
        try {
            MediaController controller = activeController();
            if (controller == null) { call.reject("No active music player"); return; }
            String action = call.getString("action", "");
            MediaController.TransportControls controls = controller.getTransportControls();
            PlaybackState state = controller.getPlaybackState();
            if (state == null) { call.reject("Player state unavailable"); return; }
            long supported = state.getActions();
            switch (action) {
                case "play-pause":
                    if (state.getState() == PlaybackState.STATE_PLAYING) {
                        if ((supported & (PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE)) == 0) { call.reject("Pause unavailable"); return; }
                        controls.pause();
                    } else {
                        if ((supported & (PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PLAY_PAUSE)) == 0) { call.reject("Play unavailable"); return; }
                        controls.play();
                    }
                    break;
                case "next":
                    if ((supported & PlaybackState.ACTION_SKIP_TO_NEXT) == 0) { call.reject("Next unavailable"); return; }
                    controls.skipToNext(); break;
                case "previous":
                    if ((supported & PlaybackState.ACTION_SKIP_TO_PREVIOUS) == 0) { call.reject("Previous unavailable"); return; }
                    controls.skipToPrevious(); break;
                case "seek":
                    Double seconds = call.getDouble("position");
                    if (seconds == null || !Double.isFinite(seconds) || seconds < 0 || (supported & PlaybackState.ACTION_SEEK_TO) == 0) { call.reject("Seek unavailable"); return; }
                    long max = controller.getMetadata() == null ? 0 : controller.getMetadata().getLong(MediaMetadata.METADATA_KEY_DURATION);
                    long target = (long) Math.min(seconds * 1000, Long.MAX_VALUE);
                    controls.seekTo(max > 0 ? Math.min(max, target) : target); break;
                default: call.reject("Unknown control"); return;
            }
            call.resolve();
        } catch (Exception ex) { call.reject("Music player control failed", ex); }
    }
}
