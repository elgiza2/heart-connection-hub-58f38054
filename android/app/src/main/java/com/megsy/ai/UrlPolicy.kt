package com.megsy.ai

import android.net.Uri

object UrlPolicy {
    const val START_URL = "https://megsyai.com/"

    private val internalHosts = listOf("megsyai.com")

    private val systemSchemes = setOf(
        "mailto", "tel", "sms", "smsto", "whatsapp", "intent", "market", "geo"
    )

    fun isInternal(uri: Uri): Boolean {
        val host = uri.host?.lowercase() ?: return false
        val scheme = uri.scheme?.lowercase()
        if (scheme != "https" && scheme != "http") return false
        return internalHosts.any { host == it || host.endsWith(".$it") }
    }

    fun isSystemScheme(uri: Uri): Boolean =
        (uri.scheme?.lowercase() ?: "") in systemSchemes
}
