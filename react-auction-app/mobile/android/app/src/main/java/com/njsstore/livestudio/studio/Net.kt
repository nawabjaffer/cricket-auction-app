package com.njsstore.livestudio.studio

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import org.json.JSONArray
import org.json.JSONObject
import java.net.Inet4Address
import java.net.NetworkInterface

/** Network facts shared by the bridge module and the engine (LAN camera URL). */
object Net {
    data class Address(val iface: String, val ip: String, val kind: String)

    /** Maps interface names to the roles the app cares about; mobile data is never offered for LAN features. */
    fun kindOf(iface: String): String {
        val name = iface.lowercase()
        return when {
            name.startsWith("ap") || name.startsWith("swlan") || name.startsWith("softap") -> "hotspot"
            name.startsWith("wlan") || name.startsWith("wifi") -> "wifi"
            name.startsWith("eth") || name.startsWith("usb") || name.startsWith("enp") -> "ethernet"
            name.startsWith("rmnet") || name.startsWith("ccmni") || name.startsWith("v4-rmnet") || name.startsWith("pdp") -> "cellular"
            else -> "other"
        }
    }

    fun addresses(): List<Address> {
        val result = ArrayList<Address>()
        try {
            for (iface in NetworkInterface.getNetworkInterfaces().toList()) {
                if (!iface.isUp || iface.isLoopback) continue
                for (address in iface.inetAddresses.toList()) {
                    if (address is Inet4Address && !address.isLoopbackAddress && !address.isLinkLocalAddress) {
                        result += Address(iface.name, address.hostAddress.orEmpty(), kindOf(iface.name))
                    }
                }
            }
        } catch (_: Exception) {
            // Interface enumeration can fail while the network is changing; an empty list is a valid answer.
        }
        return result
    }

    fun lanAddress(): Address? {
        val rank = mapOf("wifi" to 0, "hotspot" to 1, "ethernet" to 2, "other" to 3)
        return addresses().filter { it.kind != "cellular" }.minByOrNull { rank[it.kind] ?: 9 }
    }

    fun snapshot(context: Context): JSONObject {
        val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = manager.activeNetwork
        val caps = network?.let { manager.getNetworkCapabilities(it) }
        val type = when {
            caps == null -> "none"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
            else -> "other"
        }
        return JSONObject().apply {
            put("connected", caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET))
            put("type", type)
            put("metered", caps != null && !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED))
            put("validated", caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true)
            put("addresses", JSONArray().apply {
                addresses().forEach { put(JSONObject().put("iface", it.iface).put("ip", it.ip).put("kind", it.kind)) }
            })
        }
    }
}
