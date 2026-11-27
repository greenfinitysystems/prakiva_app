package com.prakiva.app;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PrakivaDocumentSaverPlugin.class);
        registerPlugin(PrakivaBiometricVaultPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
