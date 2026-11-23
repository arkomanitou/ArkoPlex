package app.arkoplex.android;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle state) {
    registerPlugin(ArkoLibVLCPlugin.class);
    super.onCreate(state);
  }
}
