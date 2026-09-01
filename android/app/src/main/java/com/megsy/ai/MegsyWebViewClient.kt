package com.megsy.ai

import android.graphics.Bitmap
import android.net.Uri
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

class MegsyWebViewClient(
    private val openExternally: (Uri) -> Unit,
    private val onMainFrameError: () -> Unit,
    private val onPageStarted: () -> Unit,
    private val onPageDone: () -> Unit,
) : WebViewClient() {

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val uri = request.url ?: return false
        if (UrlPolicy.isInternal(uri)) return false
        openExternally(uri)
        return true
    }

    override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
        onPageStarted()
    }

    override fun onPageFinished(view: WebView, url: String?) {
        onPageDone()
    }

    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
        if (request.isForMainFrame) onMainFrameError()
    }
}
