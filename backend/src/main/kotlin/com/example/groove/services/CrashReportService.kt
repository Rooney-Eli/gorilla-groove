package com.example.groove.services

import com.example.groove.db.dao.CrashReportRepository
import com.example.groove.db.model.CrashReport
import com.example.groove.db.model.User
import com.example.groove.properties.FileStorageProperties
import com.example.groove.util.extension
import com.example.groove.util.logger
import com.example.groove.util.withNewExtension
import com.example.groove.util.withoutExtension
import org.springframework.stereotype.Service
import org.springframework.web.multipart.MultipartFile
import java.io.File
import java.util.zip.ZipFile


@Service
class CrashReportService(
		private val songIngestionService: SongIngestionService,
		private val fileStorageProperties: FileStorageProperties,
		private val crashReportRepository: CrashReportRepository
) {
	fun saveCrashReport(user: User, crashData: MultipartFile) {
		// Should be a .zip
		val crashFile = songIngestionService.storeMultipartFile(crashData)

		// Contains the db and logs
		val files = try {
			unzipFile(crashFile)
		} catch (e: Throwable) {
			crashFile.delete()
			throw e
		}

		logger.info("Crash log zip was extracted")

		// Grab the size after the unzip so we get the true size on disk and not the compressed size
		val sizeKb = files.sumBy { (it.length() / 1024L).toInt() }

		// Now that we have unzipped the files and they're good, we need to save the crash report into the DB
		// so we know what ID we get. Then we'll rename the files to that ID so they're easy to locate
		val crashReport = CrashReport(
				user = user,
				version = user.currentAuthToken!!.device!!.applicationVersion,
				sizeKb = sizeKb
		).also { crashReportRepository.save(it) }

		val parentDir = File(fileStorageProperties.crashReportLocation!!)
		if (!parentDir.exists()) {
			parentDir.mkdirs()
		}

		files.forEach { tmpFile ->
			val newFileName = crashReport.id.toString().withNewExtension(tmpFile.extension)
			val permanentFile = File(fileStorageProperties.crashReportLocation, newFileName)

			tmpFile.renameTo(permanentFile)
		}

		crashFile.delete()

		logger.info("Crash log successfully saved")
	}

	// The zip should contain 1 txt file (for logs) and 1 db file
	// If it doesn't contain both, this will throw
	private fun unzipFile(file: File): List<File> {
		var logFile: File? = null
		var dbFile: File? = null

		val tmpName = file.name.withoutExtension()
		ZipFile(file).use { zip ->
			val entries = zip.entries().asSequence()
			entries.forEachIndexed { i, entry ->
				if (i > 2) {
					throw IllegalArgumentException("Zip file contained too many items! Only 1 .txt file and one .db file should be inside")
				}

				zip.getInputStream(entry).use { input ->
					val extension = entry.name.extension()
					val subFileName = tmpName.withNewExtension(extension)

					val subFile = File(fileStorageProperties.tmpDir, subFileName)
					subFile.outputStream().use { output -> input.copyTo(output) }

					when (extension) {
						"txt" -> logFile = subFile
						"db" -> dbFile = subFile
						else -> {
							subFile.delete()
							logFile?.delete()
							dbFile?.delete()
							throw IllegalArgumentException("Unknown extension '$extension' in ZIP file! Only a .txt and .db file should be inside")
						}
					}
				}
			}
		}

		if (logFile == null) {
			dbFile?.delete()
			throw IllegalArgumentException("No .txt file found inside of zip file!")
		}
		if (dbFile == null) {
			logFile?.delete()
			throw IllegalArgumentException("No .db file found inside of zip file!")
		}

		return listOf(logFile!!, dbFile!!)
	}

	companion object {
		val logger = logger()
	}
}