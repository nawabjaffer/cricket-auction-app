package com.njsstore.livestudio.studio

import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.URI
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

object ConnectorControl {
    private var server: DatagramSocket? = null
    private val commands = setOf("status", "flip", "torch", "zoom")

    private fun proof(token: String, value: String): String = Mac.getInstance("HmacSHA256").run {
        init(SecretKeySpec(token.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        doFinal(value.toByteArray(Charsets.UTF_8)).joinToString("") { byte -> "%02x".format(byte.toInt() and 255) }
    }

    private fun verify(expected: String, actual: String): Boolean = actual.length == 64 &&
        MessageDigest.isEqual(expected.toByteArray(Charsets.UTF_8), actual.toByteArray(Charsets.UTF_8))

    private fun local(address: InetAddress): Boolean = address.isSiteLocalAddress || address.isLinkLocalAddress || address.isLoopbackAddress ||
        (address.address.size == 16 && (address.address[0].toInt() and 254) == 252)

    @Synchronized
    fun start(port: Int, token: String) {
        require(port in 1024..65535 && token.matches(Regex("[a-zA-Z0-9_-]{32,96}"))) { "Invalid connector session" }
        stop()
        val socket = DatagramSocket(port)
        server = socket
        val busy = AtomicBoolean(false)
        Thread({
            val buffer = ByteArray(4096)
            val used = LinkedHashMap<String, Long>()
            while (!socket.isClosed) {
                try {
                    val packet = DatagramPacket(buffer, buffer.size)
                    socket.receive(packet)
                    if (!local(packet.address) || packet.length >= buffer.size) continue
                    val request = JSONObject(String(packet.data, packet.offset, packet.length, Charsets.UTF_8))
                    val id = request.optString("id")
                    val action = request.optString("action")
                    val value = request.optDouble("value", 0.0)
                    val timestamp = request.optLong("timestamp")
                    val now = System.currentTimeMillis()
                    if (!id.matches(Regex("[a-zA-Z0-9_-]{1,64}")) || action !in commands || !value.isFinite() || timestamp <= 0 || kotlin.math.abs(now - timestamp) > 300_000) continue
                    if (!verify(proof(token, "$id|$timestamp|$action|$value"), request.optString("proof"))) continue
                    used.entries.removeAll { now - it.value > 300_000 }
                    if (id in used || used.size >= 256 || !busy.compareAndSet(false, true)) continue
                    used[id] = now
                    val address = packet.address
                    val sourcePort = packet.port
                    Engine.submit {
                        if (socket.isClosed) { busy.set(false); return@submit }
                        val reply = JSONObject().put("id", id)
                        val payload: String
                        try {
                            payload = Engine.connectorCommand(action, value).toString()
                            if (action == "flip") Events.emit("studio.connectorControl") { putString("action", "flip") }
                        } catch (error: Exception) {
                            val failure = JSONObject().put("error", error.message?.take(160) ?: "Camera control failed").toString()
                            reply.put("payload", failure).put("proof", proof(token, "$id|$failure"))
                            try { val bytes = reply.toString().toByteArray(Charsets.UTF_8); socket.send(DatagramPacket(bytes, bytes.size, address, sourcePort)) } catch (_: Exception) { Unit }
                            busy.set(false)
                            return@submit
                        }
                        try {
                            reply.put("payload", payload).put("proof", proof(token, "$id|$payload"))
                            val bytes = reply.toString().toByteArray(Charsets.UTF_8)
                            socket.send(DatagramPacket(bytes, bytes.size, address, sourcePort))
                        } catch (_: Exception) {
                            Unit
                        } finally {
                            busy.set(false)
                        }
                    }
                } catch (_: Exception) {
                    if (socket.isClosed) break
                }
            }
        }, "connector-control").apply { isDaemon = true; start() }
    }

    @Synchronized
    fun stop() {
        server?.close()
        server = null
    }

    fun send(url: String, port: Int, token: String, action: String, value: Double): String {
        require(action in commands && port in 1024..65535 && token.matches(Regex("[a-zA-Z0-9_-]{32,96}"))) { "Invalid camera command" }
        val uri = URI(url)
        require(uri.scheme.equals("rtsp", true)) { "Select a valid connector camera" }
        val host = uri.host ?: throw IllegalArgumentException("The camera address is missing")
        require(host.matches(Regex("[0-9a-fA-F:.\\[\\]]+"))) { "Pair the camera using its local IP address" }
        val address = InetAddress.getByName(host)
        require(local(address)) { "Camera controls require the same private Wi-Fi or hotspot" }
        val id = UUID.randomUUID().toString()
        val timestamp = System.currentTimeMillis()
        val request = JSONObject().put("id", id).put("action", action).put("value", value).put("timestamp", timestamp)
            .put("proof", proof(token, "$id|$timestamp|$action|$value")).toString().toByteArray(Charsets.UTF_8)
        DatagramSocket().use { socket ->
            socket.connect(address, port)
            socket.soTimeout = 2500
            socket.send(DatagramPacket(request, request.size))
            val packet = DatagramPacket(ByteArray(4096), 4096)
            socket.receive(packet)
            val reply = JSONObject(String(packet.data, packet.offset, packet.length, Charsets.UTF_8))
            require(reply.optString("id") == id) { "Invalid camera response" }
            val payload = reply.getString("payload")
            require(verify(proof(token, "$id|$payload"), reply.optString("proof"))) { "Camera response authentication failed" }
            val state = JSONObject(payload)
            if (state.has("error")) throw IllegalStateException(state.optString("error", "Camera control failed"))
            return payload
        }
    }
}