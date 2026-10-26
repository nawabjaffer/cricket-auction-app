package com.njsstore.livestudio.studio

import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.rtmp.RtmpDataSource
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.exoplayer.rtsp.RtspMediaSource
import java.net.URI

@OptIn(UnstableApi::class)
object PeerMedia {
    fun valid(url: String): Boolean = runCatching {
        val uri = URI(url)
        url.length <= 600 && !uri.host.isNullOrBlank() && uri.fragment == null
            && uri.scheme in setOf("rtsp", "rtmp") && (uri.port == -1 || uri.port in 1..65535)
            && (uri.scheme != "rtmp" || uri.userInfo == null)
    }.getOrDefault(false)

    fun source(url: String): MediaSource {
        require(valid(url)) { "Invalid RTSP or RTMP playback source" }
        val item = MediaItem.fromUri(url)
        return if (URI(url).scheme == "rtmp") {
            ProgressiveMediaSource.Factory(RtmpDataSource.Factory()).createMediaSource(item)
        } else RtspMediaSource.Factory().setForceUseRtpTcp(true).setTimeoutMs(8_000).createMediaSource(item)
    }
}