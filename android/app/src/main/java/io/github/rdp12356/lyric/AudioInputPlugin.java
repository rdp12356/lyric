package io.github.rdp12356.lyric;

import android.Manifest;
import android.annotation.SuppressLint;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;

/** Foreground-only microphone analysis. Audio is never stored or transmitted. */
@CapacitorPlugin(name = "AudioInput", permissions = @Permission(alias = "microphone", strings = {Manifest.permission.RECORD_AUDIO}))
public class AudioInputPlugin extends Plugin {
    private volatile AudioRecord recorder;
    private volatile float bass, mid, treble, overall;
    private static final int RATE = 22050;
    @PluginMethod public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermission"); return;
        }
        begin(call);
    }
    @PermissionCallback private void microphonePermission(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) call.reject("Microphone permission was not granted");
        else begin(call);
    }
    @SuppressLint("MissingPermission") // Capacitor permission alias is checked above, including the permission callback.
    private synchronized void begin(PluginCall call) {
        if (recorder != null) { call.resolve(); return; }
        AudioRecord input = null;
        try {
            int size = Math.max(4096, AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT));
            input = new AudioRecord(MediaRecorder.AudioSource.MIC, RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, size);
            if (input.getState() != AudioRecord.STATE_INITIALIZED) throw new IllegalStateException("Microphone unavailable");
            input.startRecording(); recorder = input;
            final AudioRecord stream = input;
            new Thread(() -> analyze(stream), "Lyric microphone energy").start();
            call.resolve();
        } catch (Exception error) {
            if (input != null) input.release();
            recorder = null; call.reject("Could not start the microphone", error);
        }
    }
    private void analyze(AudioRecord input) {
        short[] pcm = new short[1024]; double[] samples = new double[1024];
        double[] window = new double[1024];
        for (int i = 0; i < window.length; i++) window[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (window.length - 1));
        try {
            while (recorder == input) {
                int count = input.read(pcm, 0, pcm.length);
                if (count <= 0) break;
                double sum = 0;
                for (int i = 0; i < count; i++) { double v = pcm[i] / 32768.0; sum += v * v; samples[i] = v * window[i]; }
                double rms = Math.sqrt(sum / count);
                if (rms < 0.002) { bass = mid = treble = overall = 0; continue; }
                bass = band(samples, count, new int[]{45, 65, 90, 120, 160});
                mid = band(samples, count, new int[]{300, 600, 1000, 1800});
                treble = band(samples, count, new int[]{3000, 4500, 6500, 8500});
                overall = (float) Math.min(1, rms * 12);
            }
        } catch (RuntimeException ignored) {
            // A lifecycle stop can interrupt a blocking AudioRecord read.
        } finally {
            try { input.stop(); } catch (Exception ignored) {}
            input.release();
            if (recorder == input) recorder = null;
            bass = mid = treble = overall = 0;
        }
    }
    private float band(double[] samples, int count, int[] frequencies) {
        double max = 0;
        for (int frequency : frequencies) {
            double coefficient = 2 * Math.cos(2 * Math.PI * frequency / RATE), a = 0, b = 0;
            for (int i = 0; i < count; i++) { double next = samples[i] + coefficient * a - b; b = a; a = next; }
            max = Math.max(max, 2 * Math.sqrt(Math.max(0, a * a + b * b - coefficient * a * b)) / count);
        }
        return (float) Math.min(1, max * 25);
    }
    private synchronized void stopInput() {
        AudioRecord current = recorder; recorder = null;
        if (current != null) try { current.stop(); } catch (Exception ignored) {}
        bass = mid = treble = overall = 0;
    }
    @PluginMethod public void stop(PluginCall call) { stopInput(); call.resolve(); }
    @PluginMethod public void getEnergy(PluginCall call) {
        JSObject result = new JSObject(); result.put("active", recorder != null);
        result.put("bass", bass); result.put("mid", mid); result.put("treble", treble); result.put("overall", overall);
        call.resolve(result);
    }
    @Override protected void handleOnPause() { stopInput(); }
    @Override protected void handleOnDestroy() { stopInput(); }
}
