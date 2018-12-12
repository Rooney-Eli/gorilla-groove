package com.example.groove.db.model

import java.sql.Timestamp
import java.util.*
import javax.persistence.*

@Entity
@Table(name = "playlist")
data class Playlist(

		@Id
		@GeneratedValue(strategy = GenerationType.IDENTITY)
		val id: Long = 0,

		@Column(nullable = false)
		val name: String,

		@Column(name = "created_at", nullable = false)
		var createdAt: Timestamp = Timestamp(Date().time)
)
