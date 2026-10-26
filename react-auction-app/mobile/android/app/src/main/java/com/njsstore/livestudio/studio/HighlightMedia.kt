package com.njsstore.livestudio.studio

import android.content.Context
import android.os.Environment
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import java.util.UUID

object HighlightMedia {
    private const val BUCKET = "e-auction-store.firebasestorage.app"

    fun file(context: Context, path: String): File {
        val file = File(path).canonicalFile
        val folder = File(context.getExternalFilesDir(Environment.DIRECTORY_MOVIES), "NJSLiveStudio/Highlights").canonicalFile
        require(file.parentFile == folder && file.extension == "mp4") { "Invalid highlight file" }
        return file
    }

    fun upload(context: Context, path: String, storagePath: String): String {
        val source = file(context, path)
        require(source.isFile && source.length() in 1..MAX_UPLOAD_BYTES) { "Highlight must be no larger than 48 MB for cloud upload" }
        require(storagePath.matches(Regex("tenants/[a-zA-Z0-9_-]{1,64}/highlights/[a-zA-Z0-9_-]{1,64}/[a-zA-Z0-9_-]{1,64}/[a-zA-Z0-9_-]{1,64}\\.mp4"))) { "Invalid highlight storage path" }
        val encoded = URLEncoder.encode(storagePath, "UTF-8")
        val endpoint = URI("https://firebasestorage.googleapis.com/v0/b/$BUCKET/o?name=$encoded")
        val token = UUID.randomUUID().toString()
        val metadata = JSONObject().put("name", storagePath).put("contentType", "video/mp4")
            .put("cacheControl", "private,max-age=3600").put("metadata", JSONObject().put("firebaseStorageDownloadTokens", token))
        val start = endpoint.toURL().openConnection() as HttpURLConnection
        val uploadUrl = try {
            configure(start)
            start.requestMethod = "POST"; start.doOutput = true
            start.setRequestProperty("X-Goog-Upload-Protocol", "resumable")
            start.setRequestProperty("X-Goog-Upload-Command", "start")
            start.setRequestProperty("X-Goog-Upload-Header-Content-Length", source.length().toString())
            start.setRequestProperty("X-Goog-Upload-Header-Content-Type", "video/mp4")
            start.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            start.outputStream.use { it.write(metadata.toString().toByteArray(Charsets.UTF_8)) }
            require(start.responseCode in 200..299) { "Firebase Storage denied highlight upload (HTTP ${start.responseCode}). Check Storage rules and App Check; the clip remains on this phone." }
            start.getHeaderField("X-Goog-Upload-URL") ?: throw IllegalStateException("Firebase Storage did not start an upload")
        } finally { start.disconnect() }
        val destination = URI(uploadUrl)
        require(destination.scheme == "https" && destination.host == "firebasestorage.googleapis.com") { "Unexpected upload destination" }
        val upload = destination.toURL().openConnection() as HttpURLConnection
        return try {
            configure(upload)
            upload.requestMethod = "POST"; upload.doOutput = true
            upload.setRequestProperty("X-Goog-Upload-Command", "upload, finalize")
            upload.setRequestProperty("X-Goog-Upload-Offset", "0")
            upload.setRequestProperty("Content-Type", "video/mp4")
            upload.setFixedLengthStreamingMode(source.length())
            source.inputStream().use { input -> upload.outputStream.use { output -> input.copyTo(output, 64 * 1024) } }
            require(upload.responseCode in 200..299) { "Highlight upload failed (HTTP ${upload.responseCode}); the local clip is retained" }
            val response = upload.inputStream.bufferedReader().use { reader -> reader.readText().take(64 * 1024) }
            val saved = JSONObject(response)
            require(saved.optString("name") == storagePath) { "Unexpected uploaded highlight path" }
            val downloadToken = saved.optString("downloadTokens").substringBefore(',').ifBlank { token }
            "https://firebasestorage.googleapis.com/v0/b/$BUCKET/o/$encoded?alt=media&token=${URLEncoder.encode(downloadToken, "UTF-8")}"
        } finally { upload.disconnect() }
    }

    private fun configure(connection: HttpURLConnection) {
        connection.connectTimeout = 15_000
        connection.readTimeout = 60_000
        connection.instanceFollowRedirects = false
    }

    private const val MAX_UPLOAD_BYTES = 48L * 1024 * 1024
}