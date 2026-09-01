package com.megsy.ai

import android.app.Application
import android.os.Build
import android.webkit.WebView

class MegsyApp : Application() {
    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val process = getProcessName()
            if (packageName != process) WebView.setDataDirectorySuffix(process)
        }
    }
}
