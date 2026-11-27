package com.prakiva.app;

import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

@CapacitorPlugin(name = "PrakivaBiometricVault")
public class PrakivaBiometricVaultPlugin extends Plugin {
    private static final int STRONG = BiometricManager.Authenticators.BIOMETRIC_STRONG;
    private boolean busy = false; // accessed only on UI thread
    private SharedPreferences store() {
        return getContext().getSharedPreferences("prakiva_biometric_vault", 0);
    }
    private KeyStore keys() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        return ks;
    }
    private String alias(PluginCall call) throws Exception {
        String id = call.getString("deviceId");
        if (id == null || id.trim().isEmpty()) throw new IllegalArgumentException("Missing deviceId");
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(id.getBytes(StandardCharsets.UTF_8));
        return "prakiva.bio." + Base64.encodeToString(hash, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }
    private SecretKey createKey(String alias) throws Exception {
        KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(alias,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true);
        if (Build.VERSION.SDK_INT >= 30) spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        else spec.setUserAuthenticationValidityDurationSeconds(-1);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(spec.build());
        return generator.generateKey();
    }
    @PluginMethod
    public void isAvailable(PluginCall call) {
        int status = BiometricManager.from(getContext()).canAuthenticate(STRONG);
        JSObject result = new JSObject();
        result.put("available", status == BiometricManager.BIOMETRIC_SUCCESS);
        result.put("status", status);
        call.resolve(result);
    }
    @PluginMethod
    public void hasCredentials(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                String a = alias(call);
                JSObject result = new JSObject();
                result.put("saved", store().contains(a) && keys().containsAlias(a));
                call.resolve(result);
            } catch (Exception e) { call.reject("Unable to inspect vault", "VAULT_ERROR"); }
        });
    }
    @PluginMethod
    public void saveCredentials(PluginCall call) { runPrompt(call, true); }
    @PluginMethod
    public void getCredentials(PluginCall call) { runPrompt(call, false); }
    private void runPrompt(PluginCall call, boolean saving) {
        getActivity().runOnUiThread(() -> {
            if (busy) { call.reject("Biometric operation in progress", "BUSY"); return; }
            if (BiometricManager.from(getContext()).canAuthenticate(STRONG) != BiometricManager.BIOMETRIC_SUCCESS) {
                call.reject("Strong biometrics unavailable", "UNAVAILABLE"); return;
            }
            busy = true;
            try {
                final String a = alias(call);
                final String user = call.getString("userId");
                final String password = call.getString("password");
                final Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                final byte[] encrypted;
                if (saving) {
                    if (user == null || user.isEmpty() || password == null || password.isEmpty()) throw new IllegalArgumentException("Missing credentials");
                    // Reuse the existing key with a fresh GCM IV. Keep the old record
                    // intact until biometric authentication and storage commit succeed.
                    SecretKey key = (SecretKey) keys().getKey(a, null);
                    if (key == null) {
                        if (store().contains(a)) { busy = false; call.reject("Credential key unavailable", "KEY_INVALID"); return; }
                        key = createKey(a);
                    }
                    cipher.init(Cipher.ENCRYPT_MODE, key);
                    encrypted = null;
                } else {
                    String record = store().getString(a, null);
                    if (record == null) { busy = false; call.reject("No saved credentials", "NOT_FOUND"); return; }
                    JSONObject data = new JSONObject(record);
                    SecretKey key = (SecretKey) keys().getKey(a, null);
                    if (key == null) { busy = false; call.reject("Credential key unavailable", "KEY_INVALID"); return; }
                    cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Base64.decode(data.getString("iv"), Base64.NO_WRAP)));
                    encrypted = Base64.decode(data.getString("ciphertext"), Base64.NO_WRAP);
                }
                BiometricPrompt prompt = new BiometricPrompt(getActivity(), ContextCompat.getMainExecutor(getContext()), new BiometricPrompt.AuthenticationCallback() {
                    @Override public void onAuthenticationError(int code, CharSequence message) {
                        busy = false;
                        call.reject(message.toString(), "BIOMETRIC_" + code);
                    }
                    @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        try {
                            Cipher authenticated = result.getCryptoObject() == null ? null : result.getCryptoObject().getCipher();
                            if (authenticated == null) throw new IllegalStateException("Missing authenticated cipher");
                            authenticated.updateAAD(a.getBytes(StandardCharsets.UTF_8));
                            JSObject response = new JSObject();
                            if (saving) {
                                JSONObject plain = new JSONObject();
                                plain.put("userId", user); plain.put("password", password);
                                byte[] bytes = authenticated.doFinal(plain.toString().getBytes(StandardCharsets.UTF_8));
                                JSONObject record = new JSONObject();
                                record.put("iv", Base64.encodeToString(authenticated.getIV(), Base64.NO_WRAP));
                                record.put("ciphertext", Base64.encodeToString(bytes, Base64.NO_WRAP));
                                if (!store().edit().putString(a, record.toString()).commit()) throw new IllegalStateException("Storage failed");
                                response.put("saved", true);
                            } else {
                                JSONObject plain = new JSONObject(new String(authenticated.doFinal(encrypted), StandardCharsets.UTF_8));
                                response.put("userId", plain.getString("userId"));
                                response.put("password", plain.getString("password"));
                            }
                            call.resolve(response);
                        } catch (Exception e) { call.reject("Credential cryptographic operation failed", "VAULT_ERROR"); }
                        finally { busy = false; }
                    }
                });
                prompt.authenticate(new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(saving ? "Enable biometric login" : "PRAKIVA biometric login")
                    .setAllowedAuthenticators(STRONG).setNegativeButtonText("Cancel").build(), new BiometricPrompt.CryptoObject(cipher));
            } catch (android.security.keystore.KeyPermanentlyInvalidatedException e) {
                busy = false; call.reject("Biometric key invalidated; remove and enrol again", "KEY_INVALID");
            } catch (Exception e) { busy = false; call.reject("Unable to start biometric operation", "VAULT_ERROR"); }
        });
    }
    @PluginMethod
    public void removeCredentials(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (busy) { call.reject("Biometric operation in progress", "BUSY"); return; }
            try {
                String a = alias(call);
                keys().deleteEntry(a);
                if (!store().edit().remove(a).commit()) throw new IllegalStateException("Storage failed");
                call.resolve();
            } catch (Exception e) { call.reject("Unable to remove credentials", "VAULT_ERROR"); }
        });
    }
}
