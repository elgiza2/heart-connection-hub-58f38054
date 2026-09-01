package com.megsy.ai

import android.net.Uri
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView

class MegsyChromeClient(
    private val requestMediaPermissions: (PermissionRequest) -> Unit,
    private val showFileChooser: (ValueCallback<Array<Uri>>, FileChooserParams) -> Boolean,
) : WebChromeClient() {

    override fun onPermissionRequest(request: PermissionRequest) {
        requestMediaPermissions(request)
    }

    override fun onShowFileChooser(
        webView: WebView,
        filePathCallback: ValueCallback<Array<Uri>>,
        fileChooserParams: FileChooserParams,
    ): Boolean = showFileChooser(filePathCallback, fileChooserParams)
}
