package com.njsstore.livestudio.studio

import android.content.Context
import android.os.StatFs
import android.util.AtomicFile
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FilterInputStream
import java.net.HttpURLConnection
import java.net.URI
import java.security.MessageDigest
import java.util.UUID

class OverlayAssets private constructor(context: Context) {
    private val root = File(context.filesDir, "overlay-assets").apply { mkdirs() }
    private val blobs = File(root, "blobs").apply { mkdirs() }
    private val journal = AtomicFile(File(root, "packages.json"))
    @Volatile private var packages = runCatching { JSONArray(String(journal.readFully(), Charsets.UTF_8)) }.getOrElse { JSONArray() }
    @Volatile private var entries: Map<String, JSONObject> = emptyMap()
    @Volatile private var pages: Map<String, JSONObject> = emptyMap()

    init { runCatching { index() }.onFailure { packages = JSONArray(); index(); journal.delete() } }

    private fun origin(uri: URI) = "${uri.scheme}://${uri.rawAuthority}"
    private fun key(uri: URI) = origin(uri) + uri.rawPath
    private fun safeUrl(value: String): URI {
        val uri = URI(value)
        require(uri.scheme == "https" && !uri.host.isNullOrBlank() && uri.userInfo == null && uri.fragment == null) { "Use a public HTTPS asset URL without credentials" }
        require(uri.host != "localhost" && uri.host != "127.0.0.1" && uri.host != "::1") { "Local asset servers are not supported" }
        return uri
    }

    private fun index() {
        val assets = mutableMapOf<String, JSONObject>()
        val fallback = mutableMapOf<String, JSONObject>()
        for (packageIndex in 0 until packages.length()) {
            val item = packages.getJSONObject(packageIndex)
            val files = item.getJSONArray("files")
            for (fileIndex in 0 until files.length()) {
                val file = files.getJSONObject(fileIndex)
                assets[file.getString("url")] = file
                if (item.optBoolean("spa") && item.optString("id") == "njs-camera-web" && file.getString("path") == item.getString("entry")) fallback[item.getString("origin")] = file
            }
        }
        entries = assets.toMap()
        pages = fallback.toMap()
    }

    @Synchronized
    fun sync(manifestUrl: String): String {
        val retainedHashes = entries.values.map { it.getString("sha256") }.toSet()
        blobs.listFiles()?.filter { it.name !in retainedHashes }?.forEach { it.delete() }
        val manifestUri = safeUrl(manifestUrl)
        val manifest = JSONObject(String(download(manifestUri, 1024 * 1024), Charsets.UTF_8))
        require(manifest.getInt("version") == 1) { "Unsupported overlay package version" }
        val id = manifest.getString("id")
        require(id.matches(Regex("[a-zA-Z0-9_-]{1,64}"))) { "Invalid overlay package id" }
        require(manifest.getString("revision").matches(Regex("[a-f0-9]{64}"))) { "Invalid package revision" }
        val files = manifest.getJSONArray("files")
        require(files.length() in 1..512) { "An overlay package must contain 1 to 512 files" }
        val pending = JSONArray()
        val seen = mutableSetOf<String>()
        var total = 0L
        for (fileIndex in 0 until files.length()) {
            val file = JSONObject(files.getJSONObject(fileIndex).toString())
            val path = file.getString("path")
            require(path.matches(Regex("/[a-zA-Z0-9_./-]+")) && path.split('/').none { it == "." || it == ".." } && seen.add(path)) { "Invalid or duplicate asset path" }
            require(file.getString("sha256").matches(Regex("[a-f0-9]{64}"))) { "Invalid asset hash" }
            require(file.getString("mime").matches(Regex("(application|text|image|video|audio|font)/[a-zA-Z0-9.+-]+"))) { "Invalid asset MIME type" }
            val bytes = file.getLong("bytes")
            require(bytes in 1..MAX_FILE_BYTES) { "An asset exceeds the 64 MB file limit" }
            total += bytes
            require(total <= MAX_PACKAGE_BYTES) { "An overlay package exceeds the 192 MB limit" }
            file.put("url", key(manifestUri.resolve(path)))
            pending.put(file)
        }
        require(seen.contains(manifest.getString("entry"))) { "The package entry is missing" }
        val retained = (0 until packages.length()).map { packages.getJSONObject(it) }.filterNot { it.getString("origin") == origin(manifestUri) && it.getString("id") == id }
        require(retained.size < 4) { "Clear offline assets before adding another package" }
        val required = (0 until pending.length()).sumOf { index ->
            val file = pending.getJSONObject(index)
            val blob = File(blobs, file.getString("sha256"))
            if (blob.isFile && blob.length() == file.getLong("bytes")) 0L else file.getLong("bytes")
        }
        require(StatFs(root.absolutePath).availableBytes > required + 150L * 1024 * 1024) { "Not enough storage to download overlay assets" }
        var downloaded = 0
        for (fileIndex in 0 until pending.length()) {
            val file = pending.getJSONObject(fileIndex)
            val digest = file.getString("sha256")
            val blob = File(blobs, digest)
            if (blob.isFile && blob.length() == file.getLong("bytes") && hash(blob.readBytes()) == digest) continue
            val bytes = download(safeUrl(file.getString("url")), file.getLong("bytes").toInt())
            require(bytes.size.toLong() == file.getLong("bytes") && hash(bytes) == digest) { "Asset verification failed: ${file.getString("path")}. The previous package is unchanged." }
            val staging = File(blobs, "${UUID.randomUUID()}.pending")
            try { staging.writeBytes(bytes); require(staging.renameTo(blob)) { "Could not save an overlay asset" } } finally { staging.delete() }
            downloaded++
        }
        val committed = JSONObject(manifest.toString()).put("origin", origin(manifestUri)).put("files", pending)
        val next = JSONArray(retained + committed)
        val output = journal.startWrite()
        try { output.write(next.toString().toByteArray()); journal.finishWrite(output) } catch (error: Exception) { journal.failWrite(output); throw error }
        packages = next
        index()
        val referenced = entries.values.map { it.getString("sha256") }.toSet()
        blobs.listFiles()?.filter { it.name !in referenced }?.forEach { it.delete() }
        return JSONObject().put("files", pending.length()).put("bytes", total).put("downloaded", downloaded).put("revision", manifest.getString("revision")).toString()
    }

    @Synchronized
    fun clear() {
        journal.delete()
        packages = JSONArray()
        index()
        blobs.listFiles()?.forEach { it.delete() }
    }

    fun intercept(request: WebResourceRequest): WebResourceResponse? {
        if (request.method != "GET") return null
        val uri = runCatching { URI(request.url.toString()) }.getOrNull() ?: return null
        val exact = entries[key(uri)]
        val route = uri.path.orEmpty().matches(Regex("/[a-zA-Z0-9_-]+/(cricket|football|kabaddi|carrom)/scorer/.*"))
        val file = exact ?: if (request.isForMainFrame && route) pages[origin(uri)] else null
        file ?: return null
        val blob = File(blobs, file.getString("sha256"))
        if (!blob.isFile || blob.length() != file.getLong("bytes")) return null
        val length = blob.length()
        val range = request.requestHeaders.entries.firstOrNull { it.key.equals("Range", true) }?.value
        val match = range?.let { Regex("bytes=(\\d+)-(\\d*)").matchEntire(it) }
        val start = match?.groupValues?.get(1)?.toLongOrNull() ?: 0L
        val end = match?.groupValues?.get(2)?.toLongOrNull()?.coerceAtMost(length - 1) ?: (length - 1)
        if (start < 0 || end < start || start >= length) return null
        val input = blob.inputStream()
        try {
            input.channel.position(start)
            val limited = object : FilterInputStream(input) {
                private var remaining = end - start + 1
                override fun read(): Int { if (remaining <= 0) return -1; val value = super.read(); if (value >= 0) remaining--; return value }
                override fun read(buffer: ByteArray, offset: Int, count: Int): Int {
                    if (remaining <= 0) return -1
                    val size = super.read(buffer, offset, minOf(count.toLong(), remaining).toInt())
                    if (size > 0) remaining -= size
                    return size
                }
            }
            val headers = mutableMapOf("Content-Length" to (end - start + 1).toString(), "Accept-Ranges" to "bytes", "Access-Control-Allow-Origin" to "*", "Cache-Control" to "public, max-age=31536000, immutable")
            if (match != null) headers["Content-Range"] = "bytes $start-$end/$length"
            return WebResourceResponse(file.getString("mime"), null, if (match != null) 206 else 200, if (match != null) "Partial Content" else "OK", headers, limited)
        } catch (error: Exception) { input.close(); throw error }
    }

    fun image(url: String): ByteArray? {
        val uri = runCatching { URI(url) }.getOrNull() ?: return null
        val asset = entries[key(uri)] ?: return null
        if (asset.getLong("bytes") > 10 * 1024 * 1024 || !asset.getString("mime").startsWith("image/")) return null
        val blob = File(blobs, asset.getString("sha256"))
        return if (blob.isFile && blob.length() == asset.getLong("bytes")) blob.readBytes() else null
    }

    private fun download(uri: URI, limit: Int): ByteArray {
        val connection = uri.toURL().openConnection() as HttpURLConnection
        connection.connectTimeout = 15_000; connection.readTimeout = 30_000; connection.instanceFollowRedirects = false
        connection.setRequestProperty("Accept-Encoding", "identity")
        return try {
            require(connection.responseCode == 200) { "Asset download failed (HTTP ${connection.responseCode})" }
            require(connection.contentLengthLong <= limit) { "Overlay asset is too large" }
            connection.inputStream.use { input ->
                val output = ByteArrayOutputStream()
                val buffer = ByteArray(32 * 1024)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    require(output.size().toLong() + count <= limit) { "Overlay asset is too large" }
                    output.write(buffer, 0, count)
                }
                output.toByteArray()
            }
        } finally { connection.disconnect() }
    }

    private fun hash(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    companion object {
        private const val MAX_FILE_BYTES = 64L * 1024 * 1024
        private const val MAX_PACKAGE_BYTES = 192L * 1024 * 1024
        @Volatile private var instance: OverlayAssets? = null
        fun get(context: Context): OverlayAssets = instance ?: synchronized(this) { instance ?: OverlayAssets(context.applicationContext).also { instance = it } }
    }
}