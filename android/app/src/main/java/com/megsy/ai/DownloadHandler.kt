package com.megsy.ai

import android.app.Activity
import android.app.DownloadManager
import android.net.Uri
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.widget.Toast

object DownloadHandler {
    fun enqueue(activity: Activity, url: String, contentDisposition: String?, mimeType: String?) {
        runCatching {
            val fileName = URLUtil.guessFileName(url, contentDisposition, mimeType)
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setMimeType(mimeType)
                addRequestHeader("cookie", CookieManager.getInstance().getCookie(url) ?: "")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
            }
            val dm = activity.getSystemService(Activity.DOWNLOAD_SERVICE) as DownloadManager
            dm.enqueue(request)
            Toast.makeText(activity, fileName, Toast.LENGTH_SHORT).show()
        }
    }
}
