package io.github.rdp12356.lyric;

import android.os.Bundle;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AndroidMediaPlugin.class);
        registerPlugin(SpotifyPlugin.class);
        registerPlugin(AudioInputPlugin.class);
        super.onCreate(savedInstanceState);
        View content = findViewById(android.R.id.content);
        WindowInsetsControllerCompat systemBars = new WindowInsetsControllerCompat(getWindow(), content);
        systemBars.setAppearanceLightNavigationBars(false);
        systemBars.setAppearanceLightStatusBars(false);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets keyboard = insets.getInsets(WindowInsetsCompat.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(content);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (getBridge() == null) { delegateBack(); return; }
                getBridge().getWebView().evaluateJavascript("!window.dispatchEvent(new Event('lyric-back', {cancelable:true}))", handled -> {
                    if (!"true".equals(handled)) delegateBack();
                });
            }
            private void delegateBack() {
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }
}
