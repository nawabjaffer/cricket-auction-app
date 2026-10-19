package com.njsstore.livestudio.bridge

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Key/value storage. Secrets (stream keys) are sealed with an AES-256-GCM key that never leaves the Android
 * Keystore, so they are unreadable from backups or a copied app data folder.
 */
class SecureModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = NAME

    private val prefs get() = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    @ReactMethod
    fun getItem(key: String, secure: Boolean, promise: Promise) {
        try {
            val raw = prefs.getString(prefix(secure) + key, null)
            if (raw == null || !secure) {
                promise.resolve(raw)
                return
            }
            val plain = try {
                decrypt(raw)
            } catch (_: Exception) {
                // The Keystore key was reset (restore, lock-screen change): the secret is gone, ask the user again.
                prefs.edit().remove(SECURE + key).apply()
                null
            }
            promise.resolve(plain)
        } catch (e: Exception) {
            promise.reject("storage", e.message, e)
        }
    }

    @ReactMethod
    fun setItem(key: String, value: String, secure: Boolean, promise: Promise) {
        try {
            val editor = prefs.edit()
            if (secure) editor.putString(SECURE + key, encrypt(value)).remove(PLAIN + key)
            else editor.putString(PLAIN + key, value).remove(SECURE + key)
            if (!editor.commit()) throw IllegalStateException("The value could not be saved")
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("storage", e.message, e)
        }
    }

    @ReactMethod
    fun removeItem(key: String, promise: Promise) {
        prefs.edit().remove(PLAIN + key).remove(SECURE + key).apply()
        promise.resolve(null)
    }

    @ReactMethod
    fun clear(promise: Promise) {
        prefs.edit().clear().apply()
        runCatching { KeyStore.getInstance(KEYSTORE).apply { load(null) }.deleteEntry(ALIAS) }
        promise.resolve(null)
    }

    private fun prefix(secure: Boolean) = if (secure) SECURE else PLAIN

    private fun masterKey(): SecretKey {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, masterKey()) }
        val sealed = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        return "v1:" + Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(sealed, Base64.NO_WRAP)
    }

    private fun decrypt(stored: String): String {
        val parts = stored.split(":")
        require(parts.size == 3 && parts[0] == "v1") { "Unsupported secret format" }
        val iv = Base64.decode(parts[1], Base64.NO_WRAP)
        val sealed = Base64.decode(parts[2], Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.DECRYPT_MODE, masterKey(), GCMParameterSpec(128, iv)) }
        return String(cipher.doFinal(sealed), Charsets.UTF_8)
    }

    companion object {
        const val NAME = "NjsStudioSecure"
        private const val PREFS = "njs_studio_store"
        private const val PLAIN = "p:"
        private const val SECURE = "s:"
        private const val KEYSTORE = "AndroidKeyStore"
        private const val ALIAS = "njs_studio_master"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
