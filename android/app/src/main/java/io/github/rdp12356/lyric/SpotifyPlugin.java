package io.github.rdp12356.lyric;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.spotify.android.appremote.api.ConnectionParams;
import com.spotify.android.appremote.api.Connector;
import com.spotify.android.appremote.api.SpotifyAppRemote;
import com.spotify.protocol.client.CallResult;
import com.spotify.protocol.client.Subscription;
import com.spotify.protocol.types.*;
import java.io.ByteArrayOutputStream;
import java.security.MessageDigest;
import java.util.concurrent.atomic.AtomicBoolean;

/** Official Spotify App Remote. No Web API, client secret, or notification access. */
@CapacitorPlugin(name = "Spotify")
public class SpotifyPlugin extends Plugin {
    private static final String DEFAULT_CLIENT_ID = "62946f0e6551422aa8d3a5627245ab54";
    private static final String REDIRECT = "http://127.0.0.1:43821/callback";
    private SpotifyAppRemote remote;
    private final AtomicBoolean connecting = new AtomicBoolean(false);
    private boolean wantsConnection;
    private String artworkKey = "", artwork = "";
    private Subscription<PlayerState> subscription;
    private volatile PlayerState latest;
    private int generation;
    private volatile PluginCall pendingLogin;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private android.content.SharedPreferences prefs() { return getContext().getSharedPreferences("spotify.remote", 0); }
    @SuppressWarnings("deprecation")
    private String fingerprint() {
        try {
            Signature[] signatures = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), PackageManager.GET_SIGNATURES).signatures;
            byte[] digest = MessageDigest.getInstance("SHA-1").digest(signatures[0].toByteArray());
            StringBuilder text = new StringBuilder();
            for (byte value : digest) { if (text.length() > 0) text.append(':'); text.append(String.format(java.util.Locale.US, "%02X", value & 255)); }
            return text.toString();
        } catch (Exception ignored) { return ""; }
    }
    private JSObject status() {
        JSObject result = new JSObject(); result.put("connected", remote != null && remote.isConnected()); result.put("clientId", prefs().getString("clientId", DEFAULT_CLIENT_ID));
        result.put("spotifyInstalled", SpotifyAppRemote.isSpotifyInstalled(getContext())); result.put("packageName", getContext().getPackageName()); result.put("fingerprint", fingerprint()); result.put("redirectUri", REDIRECT); return result;
    }
    @PluginMethod public void getStatus(PluginCall call) { call.resolve(status()); }
    @PluginMethod public void connect(PluginCall call) {
        String clientId = call.getString("clientId", "").trim();
        if (!clientId.matches("[a-fA-F0-9]{32}")) { call.reject("Enter the 32-character public Spotify Client ID"); return; }
        if (!SpotifyAppRemote.isSpotifyInstalled(getContext())) { call.reject("The official Spotify Android app was not detected. Install Spotify (not Spotify Lite), open it, sign in, and play a song before connecting."); return; }
        prefs().edit().putString("clientId", clientId).apply(); wantsConnection = true;
        getActivity().runOnUiThread(() -> connectRemote(clientId, true, call));
    }
    private void connectRemote(String clientId, boolean showAuth, PluginCall call) {
        if (!connecting.compareAndSet(false, true)) { if (call != null) call.reject("Spotify connection is already in progress"); return; }
        if (remote != null && remote.isConnected()) { connecting.set(false); if (call != null) call.resolve(status()); return; }
        pendingLogin = call;
        int attempt = ++generation;
        Runnable timeout = () -> { if (attempt == generation && connecting.getAndSet(false)) { generation++; if (call != null) call.reject("Spotify connection timed out. Check the app registration, package name, and signing fingerprint."); } };
        handler.postDelayed(timeout, 60000);
        try {
            ConnectionParams params = new ConnectionParams.Builder(clientId).setRedirectUri(REDIRECT).showAuthView(showAuth).build();
            SpotifyAppRemote.connect(getActivity(), params, new Connector.ConnectionListener() {
                @Override public void onConnected(SpotifyAppRemote value) {
                    if (attempt != generation || !wantsConnection) { SpotifyAppRemote.disconnect(value); return; }
                    handler.removeCallbacks(timeout); pendingLogin = null; remote = value; connecting.set(false);
                    subscription = remote.getPlayerApi().subscribeToPlayerState();
                    subscription.setEventCallback(state -> latest = state);
                    subscription.setErrorCallback(error -> latest = null);
                    if (call != null) call.resolve(status());
                }
                @Override public void onFailure(Throwable error) {
                    if (attempt != generation) return;
                    handler.removeCallbacks(timeout); pendingLogin = null; connecting.set(false); remote = null;
                    if (call != null) call.reject("Spotify connection failed (" + error.getClass().getSimpleName() + "). Check that Spotify is installed, your Client ID is registered for Android, and the package name and SHA-1 match this APK.");
                }
            });
        } catch (Exception error) { handler.removeCallbacks(timeout); connecting.set(false); if (call != null) call.reject("Could not open Spotify. Install the official Spotify app first."); }
    }
    private void dropConnection() {
        if (subscription != null) subscription.cancel(); subscription = null;
        if (remote != null) SpotifyAppRemote.disconnect(remote); remote = null; latest = null;
    }
    @PluginMethod public void disconnect(PluginCall call) {
        wantsConnection = false; generation++; connecting.set(false);
        PluginCall pending = pendingLogin; pendingLogin = null;
        if (pending != null) pending.reject("Spotify connection cancelled");
        getActivity().runOnUiThread(() -> { dropConnection(); call.resolve(); });
    }
    private void onMain(PluginCall call, Runnable action) {
        getActivity().runOnUiThread(() -> {
            try { action.run(); }
            catch (RuntimeException error) { call.reject("Spotify connection was interrupted. Reconnect from Sources."); }
        });
    }
    @PluginMethod public void getPlayback(PluginCall call) {
        onMain(call, () -> {
            SpotifyAppRemote current = remote;
            if (current == null || !current.isConnected()) { call.reject(connecting.get() ? "Reconnecting to Spotify…" : "Reconnect Spotify from Sources to read playback."); return; }
            AtomicBoolean finished = new AtomicBoolean(false);
            Runnable timeout = () -> { if (finished.compareAndSet(false, true)) call.reject("Spotify playback update timed out"); };
            handler.postDelayed(timeout, 4000);
            current.getPlayerApi().getPlayerState().setResultCallback(state -> {
                if (!finished.compareAndSet(false, true)) return; handler.removeCallbacks(timeout); latest = state;
                if (state == null) { call.reject("Spotify returned no playback state"); return; }
                JSObject result = new JSObject(); result.put("permissionGranted", true); result.put("active", state.track != null);
                if (state.track != null) {
                    Track track = state.track;
                    result.put("title", track.name); result.put("artist", track.artist == null ? "" : track.artist.name); result.put("album", track.album == null ? "" : track.album.name);
                    result.put("trackId", track.uri);
                    result.put("duration", track.duration / 1000.0); result.put("position", state.playbackPosition / 1000.0); result.put("playing", !state.isPaused); result.put("speed", state.playbackSpeed);
                    result.put("packageName", "com.spotify.music"); result.put("canSeek", state.playbackRestrictions != null && state.playbackRestrictions.canSeek);
                    if (track.imageUri != null && track.imageUri.raw != null && !track.imageUri.raw.equals(artworkKey)) {
                        artworkKey = track.imageUri.raw; artwork = ""; final String requested = artworkKey;
                        try { current.getImagesApi().getImage(track.imageUri).setResultCallback(bitmap -> {
                            if (!requested.equals(artworkKey) || bitmap == null) return;
                            float ratio = Math.min(1, 400f / Math.max(bitmap.getWidth(), bitmap.getHeight()));
                            Bitmap small = Bitmap.createScaledBitmap(bitmap, Math.max(1, (int)(bitmap.getWidth()*ratio)), Math.max(1,(int)(bitmap.getHeight()*ratio)), true);
                            ByteArrayOutputStream bytes = new ByteArrayOutputStream(); small.compress(Bitmap.CompressFormat.JPEG, 75, bytes);
                            artwork = "data:image/jpeg;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP);
                            if (small != bitmap) small.recycle();
                        }).setErrorCallback(error -> {}); } catch (RuntimeException ignored) { /* Artwork is optional if Spotify disconnects. */ }
                    }
                    result.put("artwork", artwork);
                }
                call.resolve(result);
            }).setErrorCallback(error -> { if (finished.compareAndSet(false, true)) { handler.removeCallbacks(timeout); call.reject("Spotify could not provide playback state. Open Spotify and play a song, then return."); } });
        });
    }
    @PluginMethod public void control(PluginCall call) {
        onMain(call, () -> {
            SpotifyAppRemote current = remote;
            if (current == null || !current.isConnected()) { call.reject("Connect Spotify first"); return; }
            String action = call.getString("action", ""); CallResult<Empty> result;
            PlayerState state = latest;
            switch (action) {
                case "play-pause": result = state != null && !state.isPaused ? current.getPlayerApi().pause() : current.getPlayerApi().resume(); break;
                case "next": if (state != null && state.playbackRestrictions != null && !state.playbackRestrictions.canSkipNext) { call.reject("Spotify does not allow another skip on this account right now"); return; } result = current.getPlayerApi().skipNext(); break;
                case "previous": if (state != null && state.playbackRestrictions != null && !state.playbackRestrictions.canSkipPrev) { call.reject("Spotify does not allow going back on this account"); return; } result = current.getPlayerApi().skipPrevious(); break;
                case "seek":
                    Double seconds = call.getDouble("position");
                    if (seconds == null || !Double.isFinite(seconds) || seconds < 0 || seconds > 86400 || (state != null && state.playbackRestrictions != null && !state.playbackRestrictions.canSeek)) { call.reject("Seeking is not allowed for this Spotify playback"); return; }
                    result = current.getPlayerApi().seekTo((long)(seconds*1000)); break;
                default: call.reject("Unknown Spotify control"); return;
            }
            AtomicBoolean finished = new AtomicBoolean(false);
            handler.postDelayed(() -> { if (finished.compareAndSet(false, true)) call.reject("Spotify control timed out"); }, 5000);
            result.setResultCallback(value -> { if (finished.compareAndSet(false, true)) call.resolve(); }).setErrorCallback(error -> { if (finished.compareAndSet(false, true)) call.reject("Spotify rejected this control. Availability depends on your account and current track."); });
        });
    }
    @PluginMethod public void openApp(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try { Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("spotify:")); intent.setPackage("com.spotify.music"); getActivity().startActivity(intent); call.resolve(); }
            catch (Exception error) { call.reject("Install the official Spotify app to use App Remote."); }
        });
    }
    @PluginMethod public void openWebPlayer(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                String uri = call.getString("uri", "");
                String url = uri.matches("spotify:track:[A-Za-z0-9]{22}") ? "https://open.spotify.com/track/" + uri.substring(14) : "https://open.spotify.com/";
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                Intent probe = new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.example.com/"));
                probe.addCategory(Intent.CATEGORY_BROWSABLE);
                android.content.pm.ResolveInfo browser = getContext().getPackageManager().resolveActivity(probe, PackageManager.MATCH_DEFAULT_ONLY);
                if (browser != null && browser.activityInfo != null && !"android".equals(browser.activityInfo.packageName)) intent.setPackage(browser.activityInfo.packageName);
                getActivity().startActivity(intent); call.resolve();
            } catch (Exception error) { call.reject("Could not open a web browser. Open https://open.spotify.com manually."); }
        });
    }
    @Override protected void handleOnResume() {
        if (wantsConnection && !connecting.get() && (remote == null || !remote.isConnected())) {
            String client = prefs().getString("clientId", DEFAULT_CLIENT_ID); if (!client.isEmpty()) getActivity().runOnUiThread(() -> connectRemote(client, false, null));
        }
    }
    @Override protected void handleOnStop() { if (remote != null && remote.isConnected()) dropConnection(); }
    @Override protected void handleOnDestroy() { wantsConnection = false; generation++; connecting.set(false); dropConnection(); handler.removeCallbacksAndMessages(null); }
}
