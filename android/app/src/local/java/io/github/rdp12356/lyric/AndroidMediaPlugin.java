package io.github.rdp12356.lyric;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Local edition: no notification listener or external media-session access. */
@CapacitorPlugin(name = "AndroidMedia")
public class AndroidMediaPlugin extends Plugin {
    @PluginMethod
    public void getCapabilities(PluginCall call) {
        JSObject result = new JSObject();
        result.put("musicPlayerSync", false);
        call.resolve(result);
    }
}
