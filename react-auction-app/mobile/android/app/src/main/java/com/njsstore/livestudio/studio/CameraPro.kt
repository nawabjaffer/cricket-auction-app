package com.njsstore.livestudio.studio

import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CaptureRequest
import org.json.JSONObject

object CameraPro {
    fun apply(builder: CaptureRequest.Builder, controls: JSONObject, camera: CameraCharacteristics, maxExposureNs: Long = Long.MAX_VALUE) {
        if (!controls.isNull("iso") || !controls.isNull("exposureNs")) {
            val capabilities = camera.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES) ?: intArrayOf()
            require(capabilities.contains(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR)) { "Manual sensor control is not supported by this camera" }
            val iso = controls.getInt("iso")
            val exposure = controls.getLong("exposureNs")
            require(camera.get(CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE)?.contains(iso) == true) { "ISO is outside the sensor range" }
            require(camera.get(CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE)?.contains(exposure) == true && exposure <= maxExposureNs) { "Shutter speed is not supported at this frame rate" }
            builder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_OFF)
            builder.set(CaptureRequest.SENSOR_SENSITIVITY, iso)
            builder.set(CaptureRequest.SENSOR_EXPOSURE_TIME, exposure)
            if (maxExposureNs != Long.MAX_VALUE) builder.set(CaptureRequest.SENSOR_FRAME_DURATION, maxExposureNs)
        } else builder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
        if (!controls.isNull("focusDiopters")) {
            val maximum = camera.get(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE) ?: 0f
            val focus = controls.getDouble("focusDiopters").toFloat()
            require(maximum > 0 && focus in 0f..maximum && camera.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES)?.contains(CaptureRequest.CONTROL_AF_MODE_OFF) == true) { "Manual focus is not supported" }
            builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_OFF)
            builder.set(CaptureRequest.LENS_FOCUS_DISTANCE, focus)
        } else {
            val modes = camera.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES) ?: intArrayOf()
            val mode = if (modes.contains(CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO)) CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO else modes.firstOrNull() ?: CaptureRequest.CONTROL_AF_MODE_OFF
            builder.set(CaptureRequest.CONTROL_AF_MODE, mode)
        }
        val whiteBalance = controls.optInt("whiteBalance", CaptureRequest.CONTROL_AWB_MODE_AUTO)
        require(camera.get(CameraCharacteristics.CONTROL_AWB_AVAILABLE_MODES)?.contains(whiteBalance) == true) { "This white balance mode is not supported" }
        builder.set(CaptureRequest.CONTROL_AWB_MODE, whiteBalance)
    }
}