package com.njsstore.livestudio.studio

import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import org.json.JSONObject
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

object GalleryMedia {
    @Synchronized
    fun publish(context: Context, file: File, mime: String, image: Boolean = false): String {
        require(file.isFile && file.length() > 0) { "The recording is empty or could not be finalized" }
        if (!image) {
            val metadata = MediaMetadataRetriever()
            try {
                metadata.setDataSource(file.absolutePath)
                require((metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0) > 0 && metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_VIDEO) == "yes") { "This recording was interrupted before the MP4 was finalized. It cannot be saved as a playable clip." }
            } finally { metadata.release() }
        }
        val journal = File(context.filesDir, "gallery-exports.json")
        val previous = runCatching { JSONObject(journal.readText()) }.getOrElse { JSONObject() }
        val key = "${file.canonicalPath}:${file.length()}:${file.lastModified()}"
        val saved = previous.optString(key)
        if (saved.isNotBlank()) {
            val readable = runCatching { context.contentResolver.openFileDescriptor(Uri.parse(saved), "r")?.use { true } ?: false }.getOrDefault(false)
            if (readable) return saved
        }
        val uri = if (Build.VERSION.SDK_INT >= 29) {
            val collection = if (image) MediaStore.Images.Media.EXTERNAL_CONTENT_URI else MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, file.name)
                put(MediaStore.MediaColumns.MIME_TYPE, mime)
                put(MediaStore.MediaColumns.RELATIVE_PATH, "${if (image) Environment.DIRECTORY_PICTURES else Environment.DIRECTORY_MOVIES}/NJSLiveStudio")
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val resolver = context.contentResolver
            val target = resolver.insert(collection, values) ?: throw IllegalStateException("Gallery is unavailable")
            try {
                resolver.openOutputStream(target, "w").use { output ->
                    requireNotNull(output) { "Could not open Gallery storage" }
                    file.inputStream().use { input -> input.copyTo(output) }
                }
                val finalized = ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }
                require(resolver.update(target, finalized, null, null) > 0) { "Could not finalize the Gallery item" }
                target.toString()
            } catch (error: Exception) {
                resolver.delete(target, null, null)
                throw error
            }
        } else {
            @Suppress("DEPRECATION")
            val folder = File(Environment.getExternalStoragePublicDirectory(if (image) Environment.DIRECTORY_PICTURES else Environment.DIRECTORY_MOVIES), "NJSLiveStudio")
            require(folder.isDirectory || folder.mkdirs()) { "Allow storage access to save to Gallery" }
            val target = File(folder, file.name)
            val staging = File(folder, ".${file.name}.pending")
            try {
                file.copyTo(staging, overwrite = true)
                require(staging.renameTo(target)) { "Could not finalize the recording" }
            } finally { staging.delete() }
            val done = CountDownLatch(1)
            var result: Uri? = null
            MediaScannerConnection.scanFile(context, arrayOf(target.absolutePath), arrayOf(mime)) { _, scanned -> result = scanned; done.countDown() }
            require(done.await(20, TimeUnit.SECONDS) && result != null) { "The file was saved, but Gallery has not indexed it yet. Retry saving." }
            result.toString()
        }
        val keys = previous.keys().asSequence().toList()
        keys.take((keys.size - 99).coerceAtLeast(0)).forEach { previous.remove(it) }
        previous.put(key, uri)
        val stagedJournal = File(context.filesDir, "gallery-exports.pending")
        runCatching {
            stagedJournal.writeText(previous.toString())
            if (!stagedJournal.renameTo(journal)) stagedJournal.delete()
        }
        return uri
    }
}