@file:Suppress("MoveVariableDeclarationIntoWhen")

package com.gorilla.gorillagroove.service

import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.support.v4.media.MediaBrowserCompat
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaControllerCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import com.gorilla.gorillagroove.service.GGLog.logDebug
import com.gorilla.gorillagroove.service.GGLog.logError
import com.gorilla.gorillagroove.service.GGLog.logInfo
import com.gorilla.gorillagroove.service.GGLog.logWarn
import com.gorilla.gorillagroove.ui.currentPlayBackPosition
import com.gorilla.gorillagroove.util.KtLiveData

class MusicServiceConnection(
    context: Context,
    serviceComponent: ComponentName
) {

    val isConnected = KtLiveData(false)
    val networkFailure = KtLiveData(false)
    val playbackState = KtLiveData(EMPTY_PLAYBACK_STATE)
    val repeatState = KtLiveData(PlaybackStateCompat.REPEAT_MODE_NONE)
    val shuffleState = KtLiveData(PlaybackStateCompat.SHUFFLE_MODE_NONE)
    val nowPlaying = KtLiveData(NOTHING_PLAYING)
    val currentSongTimeMillis = KtLiveData(0L)

    val transportControls: MediaControllerCompat.TransportControls
        get() = mediaController.transportControls

    private val mediaBrowserConnectionCallback = MediaBrowserConnectionCallback(context)
    private val mediaBrowser = MediaBrowserCompat(
        context,
        serviceComponent,
        mediaBrowserConnectionCallback, null
    ).apply {
        connect()
    }

    // The exoplayer somehow doesn't have the ability to add a periodic time observer. So this is legitimately the "recommended" way to do it. Stupid.
    private val handler = Handler()
    private val runnable: Runnable by lazy {
        Runnable {
            handler.postDelayed(runnable, 1000)

            val nextSongTime = playbackState.value.currentPlayBackPosition

            if (currentSongTimeMillis.value != nextSongTime) {
                currentSongTimeMillis.postValue(nextSongTime)
            }
        }
    }

    init {
        handler.postDelayed(runnable, 0)
    }

    private lateinit var mediaController: MediaControllerCompat


    private inner class MediaBrowserConnectionCallback(private val context: Context) : MediaBrowserCompat.ConnectionCallback() {
        override fun onConnected() {
            logInfo("MediaBrowserConnection was connected")
            // Get a MediaController for the MediaSession.
            mediaController = MediaControllerCompat(context, mediaBrowser.sessionToken).apply {
                registerCallback(MediaControllerCallback())
            }

            isConnected.postValue(true)
        }

        override fun onConnectionSuspended() {
            logInfo("MediaBrowserConnection was suspended")

            isConnected.postValue(false)
        }

        override fun onConnectionFailed() {
            logError("MediaBrowserConnection failed")

            isConnected.postValue(false)
        }
    }

    private inner class MediaControllerCallback : MediaControllerCompat.Callback() {

        override fun onPlaybackStateChanged(state: PlaybackStateCompat?) {
            val stateId = state?.state ?: -1

            val stateString = when (stateId) {
                0 -> "NONE"
                1 -> "STOPPED"
                2 -> "PLAYING"
                3 -> "PAUSED"
                6 -> "BUFFERING"
                7 -> "ERROR"
                8 -> "CONNECTING"
                else -> "UNKNOWN ($stateId)"
            }

            logDebug("MediaControllerCallback playback state changed to $stateString")

            playbackState.postValue(state ?: EMPTY_PLAYBACK_STATE)
        }

        override fun onRepeatModeChanged(repeatMode: Int) {
            logInfo("Repeat mode was changed to $repeatMode")

            repeatState.postValue(repeatMode)
        }

        override fun onShuffleModeChanged(shuffleMode: Int) {
            logInfo("Shuffle mode was changed to $shuffleMode")

            shuffleState.postValue(shuffleMode)
        }

        override fun onMetadataChanged(metadata: MediaMetadataCompat?) {
            logDebug("Media metadata was changed")

            nowPlaying.postValue(
                if (metadata?.id == null) {
                    NOTHING_PLAYING
                } else {
                    metadata
                }
            )
        }
        override fun onQueueChanged(queue: MutableList<MediaSessionCompat.QueueItem>?) {
            logDebug("Media queue was changed")
        }

        override fun onSessionEvent(event: String?, extras: Bundle?) {
            super.onSessionEvent(event, extras)
            when (event) {
                NETWORK_FAILURE -> {
                    logWarn("Network failure session event encountered")
                    networkFailure.postValue(true)
                }
            }
        }

        override fun onSessionDestroyed() {
            logWarn("MediaController session was destroyed")

            mediaBrowserConnectionCallback.onConnectionSuspended()
        }
    }

    companion object {
        @Volatile
        private var instance: MusicServiceConnection? = null

        fun getInstance(context: Context, serviceComponent: ComponentName) = synchronized(this) {
            instance ?: MusicServiceConnection(context, serviceComponent).also {
                logDebug("Creating new MusicServiceConnection")
                instance = it
            }
        }
    }
}

@Suppress("PropertyName")
val EMPTY_PLAYBACK_STATE: PlaybackStateCompat = PlaybackStateCompat.Builder()
    .setState(PlaybackStateCompat.STATE_NONE, 0, 0f)
    .build()

@Suppress("PropertyName")
val NOTHING_PLAYING: MediaMetadataCompat = MediaMetadataCompat.Builder()
    .putString(MediaMetadataCompat.METADATA_KEY_MEDIA_ID, "")
    .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, 0)
    .build()

inline val MediaMetadataCompat.id: String?
    get() = getString(MediaMetadataCompat.METADATA_KEY_MEDIA_ID)

const val NETWORK_FAILURE = "com.gorilla.ggmobileredux.service.NETWORK_FAILURE"