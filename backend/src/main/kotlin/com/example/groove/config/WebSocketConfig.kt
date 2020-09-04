package com.example.groove.config

import com.example.groove.db.dao.TrackLinkRepository
import com.example.groove.db.dao.TrackRepository
import com.example.groove.db.dao.UserRepository
import com.example.groove.db.model.Device
import com.example.groove.db.model.Track
import com.example.groove.exception.PermissionDeniedException
import com.example.groove.security.SecurityConfiguration
import com.example.groove.services.ArtSize
import com.example.groove.services.DeviceService
import com.example.groove.services.TrackService
import com.example.groove.services.event.EventType
import com.example.groove.services.event.NowPlayingTrack
import com.example.groove.services.event.RemotePlayType
import com.example.groove.util.*
import com.fasterxml.jackson.annotation.JsonSubTypes
import com.fasterxml.jackson.annotation.JsonTypeInfo
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.http.server.ServerHttpRequest
import org.springframework.http.server.ServerHttpResponse
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.socket.CloseStatus
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketHandler
import org.springframework.web.socket.WebSocketSession
import org.springframework.web.socket.config.annotation.EnableWebSocket
import org.springframework.web.socket.config.annotation.WebSocketConfigurer
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry
import org.springframework.web.socket.handler.TextWebSocketHandler
import org.springframework.web.socket.server.HandshakeInterceptor
import org.springframework.web.socket.server.support.DefaultHandshakeHandler
import java.security.Principal
import java.util.concurrent.ConcurrentHashMap
import kotlin.reflect.full.declaredMemberProperties
import kotlin.reflect.full.primaryConstructor

@Configuration
@EnableWebSocket
class WebSocketConfig(
		val userRepository: UserRepository,
		val trackLinkRepository: TrackLinkRepository,
		val trackRepository: TrackRepository,
		val deviceService: DeviceService,
		val trackService: TrackService
) : WebSocketConfigurer {

	private val objectMapper = createMapper()
	private val sessions = mutableMapOf<String, WebSocketSession>()

	override fun registerWebSocketHandlers(registry: WebSocketHandlerRegistry) {
		registry
				.addHandler(SocketTextHandler(), "/api/socket")
				.setAllowedOrigins(*SecurityConfiguration.allowedOrigins)
				.setHandshakeHandler(object : DefaultHandshakeHandler() {
					override fun determineUser(request: ServerHttpRequest, wsHandler: WebSocketHandler, attributes: MutableMap<String, Any>): Principal? {
						// I know it's confusing that "name" is "email", that's because the email is unique, so that's what
						// is assigned to the name in the principal
						val email = request.principal!!.name

						// We can now look up this user based off the unique email in order to get the ID associated with them
						val user = userRepository.findByEmail(email)
								?: throw IllegalStateException("No user found with the email $email!")

						// Now throw it in the extra attributes so we can find it more readily as this user uses this session
						attributes["userId"] = user.id

						return request.principal
					}
				})
				.addInterceptors(object : HandshakeInterceptor {
					override fun beforeHandshake(request: ServerHttpRequest, response: ServerHttpResponse, wsHandler: WebSocketHandler, attributes: MutableMap<String, Any>): Boolean {
						// I think this is temporary. I'd like to save the deviceId with the logged in user's principal going forward, actually
						val paramParts = request.uri.query?.split("=")
						if (paramParts.isNullOrEmpty() || paramParts.size != 2) {
							response.setStatusCode(HttpStatus.BAD_REQUEST)
							return false
						}

						val (paramKey, paramValue) = paramParts
						if (paramKey != "deviceIdentifier") {
							response.setStatusCode(HttpStatus.BAD_REQUEST)
							return false
						}

						attributes["deviceIdentifier"] = paramValue
						return true
					}

					override fun afterHandshake(request: ServerHttpRequest, response: ServerHttpResponse, wsHandler: WebSocketHandler, exception: Exception?) {}
				})
	}

	@Transactional(readOnly = true)
	fun getActiveDevices(excludingDeviceId: String?): List<Device> {
		// Load the user in this transaction so we can load its partyDevices.
		// If we try to access the devices otherwise we'll get a LazyInitializationException
		val user = userRepository.get(loadLoggedInUser().id)!!

		// Grab all of our own active devices (including our current one) and then add in all
		// devices we have access to via Party Mode
		val currentDevice = excludingDeviceId?.let { deviceService.getDeviceById(it) }

		val ownDevices = sessions.values
				.filter { it.userId == user.id && it.deviceIdentifier != currentDevice?.deviceId }
				.map { deviceService.getDeviceById(it.deviceIdentifier) }

		val now = DateUtils.now()

		val partyDevices = user.partyDevices.filter {
			it.partyEnabledUntil != null && it.partyEnabledUntil!! > now
		}

		// Finally, remove devices from our list if they have not been seen polling
		return ownDevices + partyDevices
	}

	fun WebSocketSession.sendIfOpen(message: String) {
		sendIfOpen(TextMessage(message))
	}

	fun WebSocketSession.sendIfOpen(message: TextMessage) {
		logger.info("About to broadcast to session $id : '${message.payload}'")
		if (isOpen) {
			sendMessage(message)
		} else {
			logger.info("Could not send message to socket ID: $id: $message")
		}
	}

	var WebSocketSession.userId: Long
		get() = this.attributes["userId"] as Long
		set(value) {
			this.attributes["userId"] = value
		}

	var WebSocketSession.deviceIdentifier: String
		get() = this.attributes["deviceIdentifier"] as String
		set(value) {
			this.attributes["deviceIdentifier"] = value
		}

	inner class SocketTextHandler : TextWebSocketHandler() {

		private val currentSongListens = ConcurrentHashMap<String, NowListeningResponse>()

		override fun handleTextMessage(session: WebSocketSession, message: TextMessage) {
			logger.info("Received message from session ${session.id}")
			val clientMessage = try {
				objectMapper.readValue(message.payload, WebSocketMessage::class.java)
			} catch (e: Exception) {
				logger.error("Could not deserialize WebSocket message! Message: $message", e)
				return
			}

			when (clientMessage) {
				is NowListeningRequest -> handleNowListeningData(session, clientMessage)
				is RemotePlayRequest -> handleRemotePlayData(session, clientMessage)
				else -> throw IllegalArgumentException("Incorrect message type!")
			}
		}

		private fun handleNowListeningData(session: WebSocketSession, nowListeningRequest: NowListeningRequest) {
			val nowListeningResponse = nowListeningRequest.toResponse(session)

			// currentSongListens holds onto the existing state of the device. Augment it with the new state as the new state
			// might not hold every property (the clients don't send every property every time any changes)
			val broadcastMessage = nowListeningResponse.merge(currentSongListens[session.id])
			currentSongListens[session.id] = broadcastMessage

			val otherSessions = sessions - session.id
			otherSessions.values.forEach { it.sendIfOpen(objectMapper.writeValueAsString(broadcastMessage)) }
		}

		private fun handleRemotePlayData(session: WebSocketSession, remotePlayRequest: RemotePlayRequest) {
			val user = userRepository.get(session.userId)!!
			val targetDeviceId = remotePlayRequest.targetDeviceId

			val targetDevice = deviceService.getDeviceById(targetDeviceId)

			if (!targetDevice.canBePlayedBy(user.id)) {
				throw PermissionDeniedException("Not authorized to access device")
			}

			val trackIdToTrack = trackService
					.getTracksByIds(remotePlayRequest.trackIds?.toSet() ?: emptySet(), user)
					// Don't allow playing your own private songs to someone who isn't you. It won't load for them anyway
					.map { it.id to it }
					.toMap()

			require(trackIdToTrack.values.all { !it.private || targetDevice.user.id == user.id }) {
				"Private tracks may not be played remotely to another user"
			}

			// A user could, theoretically, tell us to play a single track ID more than once.
			// So load all the unique tracks belonging to the IDs from the DB, and then iterate
			// over the IDs we are given so we preserve any duplicate IDs
			val tracksToPlay = remotePlayRequest.trackIds?.map { trackIdToTrack.getValue(it) }

			val remotePlayResponse = RemotePlayResponse(
					tracks = tracksToPlay,
					newFloatValue = remotePlayRequest.newFloatValue,
					remotePlayAction = remotePlayRequest.remotePlayAction
			)

			val targetSession = sessions.values.find { it.deviceIdentifier == targetDevice.deviceId }
					?: throw IllegalStateException("No session exists with device identifier ${targetDevice.deviceId}!")

			targetSession.sendIfOpen(objectMapper.writeValueAsString(remotePlayResponse))
		}

		private fun Device.canBePlayedBy(userId: Long): Boolean {
			// If we are the user, then we're always good
			if (userId == user.id) {
				return true
			}

			// Check if we're in a valid party mode. If we aren't, then this isn't playable by other people
			if (partyEnabledUntil == null || partyEnabledUntil!! < DateUtils.now()) {
				return false
			}

			// We're in a valid party mode. Make sure the user who is controlling us is present in the list
			return partyUsers.any { it.id == userId }
		}

		override fun afterConnectionEstablished(session: WebSocketSession) {
			logger.info("New user with ID: ${session.userId} connected to socket with ID: ${session.id}")
			sessions[session.id] = session

			// Tell this new user about all the things being listened to
			currentSongListens.values
					.map { objectMapper.writeValueAsString(it) }
					.forEach { session.sendIfOpen(it) }
		}

		override fun afterConnectionClosed(session: WebSocketSession, status: CloseStatus) {
			logger.info("User with ID: ${session.userId} disconnected from socket with ID: ${session.id}")
			val lastSentUpdate = currentSongListens[session.id]

			sessions.remove(session.id)
			currentSongListens.remove(session.id)

			// If this user was not playing something, then there is no need to update any clients
			if (lastSentUpdate?.trackData == null) {
				return
			}

			val newUpdate = lastSentUpdate.copy(trackData = null)
			val message = objectMapper.writeValueAsString(newUpdate)
			sessions.values.forEach { it.sendIfOpen(message) }
		}

		private fun NowListeningRequest.toResponse(session: WebSocketSession): NowListeningResponse {
			val userId = session.userId
			val device = deviceService.getDeviceByIdAndUserId(session.deviceIdentifier, userId)
			return NowListeningResponse(
					deviceId = device.id,
					deviceName = device.deviceName,
					userId = userId,
					timePlayed = this.timePlayed,
					isPlaying = this.isPlaying,
					isRepeating = this.isRepeating,
					isShuffling = this.isShuffling,
					volume = this.volume,
					muted = this.muted,
					trackData = this.trackId?.let { trackRepository.get(it) }?.toListenTrack(),
					lastTimeUpdate = if (this.timePlayed != null) { System.currentTimeMillis() } else { null }
			)
		}

		// Get a trimmed down version (that also includes an art link)
		private fun Track.toListenTrack(): NowPlayingTrack? {
			return when {
				private -> NowPlayingTrack(isPrivate = true)
				else -> NowPlayingTrack(
						id = id,
						name = name,
						artist = artist,
						album = album,
						releaseYear = releaseYear,
						length = length,
						isPrivate = false,
						inReview = inReview,
						albumArtLink = trackLinkRepository.findUnexpiredArtByTrackIdAndArtSize(id, ArtSize.LARGE)?.link
				)
			}
		}
	}

	companion object {
		val logger = logger()
	}
}

@JsonTypeInfo(
		use = JsonTypeInfo.Id.NAME,
		include = JsonTypeInfo.As.PROPERTY,
		property = "messageType",
		visible = true
)
@JsonSubTypes(
		JsonSubTypes.Type(value = NowListeningRequest::class, name = "NOW_PLAYING"),
		JsonSubTypes.Type(value = RemotePlayRequest::class, name = "REMOTE_PLAY")
)
interface WebSocketMessage {
	val messageType: EventType
}

data class NowListeningRequest(
		override val messageType: EventType,
		val timePlayed: Double?,
		val trackId: Long?,
		val isShuffling: Boolean?,
		val isRepeating: Boolean?,
		val isPlaying: Boolean?,
		val volume: Double?,
		val muted: Boolean?
) : WebSocketMessage

data class NowListeningResponse(
		override val messageType: EventType = EventType.NOW_PLAYING,
		val deviceId: Long,
		val deviceName: String,
		val userId: Long,
		val timePlayed: Double?,
		val trackData: NowPlayingTrack?,
		val isShuffling: Boolean?,
		val isRepeating: Boolean?,
		val isPlaying: Boolean?,
		val volume: Double?,
		val muted: Boolean?,
		val lastTimeUpdate: Long? // millis
) : WebSocketMessage

data class RemotePlayRequest(
		override val messageType: EventType,
		val deviceId: String,
		val targetDeviceId: Long,
		val trackIds: List<Long>?,
		val newFloatValue: Double?,
		val remotePlayAction: RemotePlayType
) : WebSocketMessage

data class RemotePlayResponse(
		override val messageType: EventType = EventType.REMOTE_PLAY,
		val tracks: List<Track>?,
		val newFloatValue: Double?,
		val remotePlayAction: RemotePlayType
) : WebSocketMessage


inline fun <reified T : Any> T.merge(other: T?): T {
	if (other == null) {
		return this
	}

	val propertiesByName = T::class.declaredMemberProperties.associateBy { it.name }
	val primaryConstructor = T::class.primaryConstructor
			?: throw IllegalArgumentException("merge type must have a primary constructor")
	val args = primaryConstructor.parameters.associateWith { parameter ->
		val property = propertiesByName[parameter.name]
				?: throw IllegalStateException("no declared member property found with name '${parameter.name}'")
		(property.get(this) ?: property.get(other))
	}
	return primaryConstructor.callBy(args)
}
