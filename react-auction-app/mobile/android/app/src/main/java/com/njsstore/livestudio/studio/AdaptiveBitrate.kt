package com.njsstore.livestudio.studio

/**
 * Lowers the encoder bitrate quickly when an uplink queue backs up and raises it again slowly once it has been
 * calm for a while, never leaving [minBps]..[maxBps].
 */
class AdaptiveBitrate(
    private var maxBps: Int,
    private var minBps: Int,
    private val calmTicksToRaise: Int = 6,
    private val apply: (Int) -> Unit,
) {
    var currentBps: Int = maxBps
        private set
    private var calmTicks = 0

    fun reset(newMaxBps: Int, newMinBps: Int) {
        maxBps = newMaxBps
        minBps = newMinBps.coerceAtMost(newMaxBps)
        currentBps = newMaxBps
        calmTicks = 0
    }

    /** Call once per second with whether any destination's send queue is congested. */
    fun tick(congested: Boolean) {
        if (congested) {
            calmTicks = 0
            change((currentBps * DECREASE).toInt().coerceAtLeast(minBps))
        } else if (currentBps < maxBps && ++calmTicks >= calmTicksToRaise) {
            calmTicks = 0
            change((currentBps * INCREASE).toInt().coerceAtMost(maxBps))
        }
    }

    private fun change(next: Int) {
        if (next == currentBps) return
        currentBps = next
        apply(next)
    }

    private companion object {
        const val DECREASE = 0.8
        const val INCREASE = 1.1
    }
}
