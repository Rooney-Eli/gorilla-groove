package com.example.groove.controllers

import com.example.groove.db.model.Device
import com.example.groove.db.model.enums.DeviceType
import com.example.groove.services.DeviceService
import com.example.groove.util.loadLoggedInUser

import org.springframework.web.bind.annotation.*
import javax.servlet.http.HttpServletRequest

@RestController
@RequestMapping("api/device")
class DeviceController(
		private val deviceService: DeviceService
) {

	@GetMapping
    fun getDevices(): List<Device> {
		return deviceService.getDevices(loadLoggedInUser())
    }

	@PutMapping
    fun updateDeviceVersion(
			@RequestBody body: UpdateDeviceVersionDTO,
			request: HttpServletRequest
	) {
		val ipAddress = request.getHeader("x-forwarded-for")

		deviceService.createOrUpdateDevice(
				user = loadLoggedInUser(),
				deviceId = body.deviceId,
				deviceType = body.deviceType,
				version = body.version,
				ipAddress = ipAddress
		)
    }

	data class UpdateDeviceVersionDTO(
			val deviceId: String,
			val deviceType: DeviceType,
			val version: String
	)
}