package com.njsstore.livestudio.bridge

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.google.android.gms.auth.GoogleAuthUtil
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.Scope
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning

/** Google Authorization (OAuth access tokens for the YouTube Live API) without a stored refresh token. */
class AuthModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = NAME

    private var pending: Promise? = null

    private val results = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode != REQUEST_CODE) return
            val promise = pending ?: return
            pending = null
            if (resultCode != Activity.RESULT_OK || data == null) {
                promise.reject("cancelled", "Google sign-in was cancelled")
                return
            }
            try {
                resolve(promise, Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(data))
            } catch (e: ApiException) {
                promise.reject("auth_failed", describe(e), e)
            }
        }
    }

    init {
        context.addActivityEventListener(results)
    }

    override fun invalidate() {
        context.removeActivityEventListener(results)
        super.invalidate()
    }

    @ReactMethod
    fun authorizeGoogle(scopes: ReadableArray, promise: Promise) {
        val activity = context.currentActivity
        if (activity == null) {
            promise.reject("no_activity", "Open the app to continue with Google sign-in")
            return
        }
        val requested = (0 until scopes.size()).mapNotNull { scopes.getString(it) }.map { Scope(it) }
        if (requested.isEmpty()) {
            promise.reject("invalid_argument", "No permissions were requested")
            return
        }
        if (pending != null) {
            promise.reject("busy", "A Google sign-in is already in progress")
            return
        }
        val request = AuthorizationRequest.builder().setRequestedScopes(requested).build()
        Identity.getAuthorizationClient(activity).authorize(request)
            .addOnSuccessListener { result ->
                val intent = result.pendingIntent
                if (result.hasResolution() && intent != null) {
                    pending = promise
                    try {
                        activity.startIntentSenderForResult(intent.intentSender, REQUEST_CODE, null, 0, 0, 0)
                    } catch (e: Exception) {
                        pending = null
                        promise.reject("auth_failed", e.message, e)
                    }
                } else {
                    resolve(promise, result)
                }
            }
            .addOnFailureListener { error -> promise.reject("auth_failed", describe(error), error) }
    }

    @ReactMethod
    fun clearGoogleToken(accessToken: String, promise: Promise) {
        Thread {
            try {
                GoogleAuthUtil.clearToken(context, accessToken)
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("auth_failed", e.message, e)
            }
        }.start()
    }

    private fun resolve(promise: Promise, result: AuthorizationResult) {
        val token = result.accessToken
        if (token.isNullOrEmpty()) {
            promise.reject("auth_failed", "Google did not return an access token")
            return
        }
        promise.resolve(Arguments.createMap().apply {
            putString("accessToken", token)
            putArray("grantedScopes", Arguments.createArray().apply { result.grantedScopes.forEach { pushString(it) } })
        })
    }

    private fun describe(error: Exception): String {
        val code = (error as? ApiException)?.statusCode
        return when (code) {
            10, 12500 -> "Google sign-in is not set up for this build of the app (OAuth client / SHA-1). Use a manual stream key instead."
            7 -> "No network connection to Google"
            else -> error.message ?: "Google sign-in failed"
        }
    }

    companion object {
        const val NAME = "NjsStudioAuth"
        private const val REQUEST_CODE = 7101
    }
}

/** QR scanning through Google Play services: no camera permission is needed inside this app. */
class ScannerModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = NAME

    @ReactMethod
    fun scanQr(promise: Promise) {
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .enableAutoZoom()
            .build()
        GmsBarcodeScanning.getClient(context, options).startScan()
            .addOnSuccessListener { barcode ->
                val value = barcode.rawValue
                if (value.isNullOrBlank()) promise.reject("scan_failed", "The QR code was empty") else promise.resolve(value)
            }
            .addOnCanceledListener { promise.reject("cancelled", "Scanning was cancelled") }
            .addOnFailureListener { promise.reject("scan_failed", it.message ?: "The scanner is not available on this phone", it) }
    }

    companion object {
        const val NAME = "NjsStudioScanner"
    }
}
