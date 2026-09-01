package com.megsy.ai

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.view.View
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.megsy.ai.databinding.ActivityMainBinding
import java.io.File

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var networkMonitor: NetworkMonitor

    private var pendingPermissionRequest: PermissionRequest? = null
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var cameraOutputUri: Uri? = null
    private var lastBackPress = 0L
    private var loadFailed = false

    private val mediaPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
            val request = pendingPermissionRequest ?: return@registerForActivityResult
            pendingPermissionRequest = null
            if (result.values.all { it }) request.grant(request.resources) else request.deny()
        }

    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = filePathCallback ?: return@registerForActivityResult
            filePathCallback = null
            val data = result.data
            val uris: Array<Uri>? = when {
                result.resultCode != RESULT_OK -> null
                data?.clipData != null -> Array(data.clipData!!.itemCount) { i ->
                    data.clipData!!.getItemAt(i).uri
                }
                data?.data != null -> arrayOf(data.data!!)
                cameraOutputUri != null -> arrayOf(cameraOutputUri!!)
                else -> null
            }
            callback.onReceiveValue(uris)
            cameraOutputUri = null
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupWebView()
        binding.retryButton.setOnClickListener { reload() }

        networkMonitor = NetworkMonitor(this) {
            runOnUiThread { if (loadFailed) reload() }
        }

        val target = intent?.data?.takeIf { UrlPolicy.isInternal(it) }?.toString()
        binding.webView.loadUrl(target ?: UrlPolicy.START_URL)

        SplashAnimation.play(
            root = binding.splash.splashRoot,
            flood = binding.splash.splashFlood,
            lockup = binding.splash.splashLockup,
            mark = binding.splash.splashMark,
            word = binding.splash.splashWord,
        ) {
            binding.splash.splashRoot.animate()
                .alpha(0f)
                .setDuration(220)
                .withEndAction { binding.splash.splashRoot.visibility = View.GONE }
                .start()
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (binding.webView.canGoBack()) {
                    binding.webView.goBack()
                    return
                }
                val now = System.currentTimeMillis()
                if (now - lastBackPress < 2000) {
                    finish()
                } else {
                    lastBackPress = now
                    Toast.makeText(
                        this@MainActivity,
                        R.string.press_back_again,
                        Toast.LENGTH_SHORT,
                    ).show()
                }
            }
        })
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.data?.takeIf { UrlPolicy.isInternal(it) }?.let {
            binding.webView.loadUrl(it.toString())
        }
    }

    @Suppress("SetJavaScriptEnabled")
    private fun setupWebView() = with(binding.webView) {
        settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(false)
            allowFileAccess = false
            allowContentAccess = false
            textZoom = 100
            useWideViewPort = true
            loadWithOverviewMode = false
        }
        // Never look like a browser page.
        isVerticalScrollBarEnabled = false
        isHorizontalScrollBarEnabled = false
        overScrollMode = View.OVER_SCROLL_NEVER
        isLongClickable = false
        setOnLongClickListener { true }
        setBackgroundColor(ContextCompat.getColor(this@MainActivity, R.color.app_background))

        webViewClient = MegsyWebViewClient(
            openExternally = ::openExternally,
            onMainFrameError = { showOffline(true) },
            onPageStarted = { loadFailed = false },
            onPageDone = { if (!loadFailed) showOffline(false) },
        )
        webChromeClient = MegsyChromeClient(
            requestMediaPermissions = ::handleMediaPermissions,
            showFileChooser = ::openFileChooser,
        )
        setDownloadListener { url, _, contentDisposition, mimeType, _ ->
            DownloadHandler.enqueue(this@MainActivity, url, contentDisposition, mimeType)
        }
    }

    private fun reload() {
        loadFailed = false
        showOffline(false)
        binding.webView.reload()
    }

    private fun showOffline(show: Boolean) {
        loadFailed = show
        binding.offlineView.visibility = if (show) View.VISIBLE else View.GONE
        binding.webView.visibility = if (show) View.INVISIBLE else View.VISIBLE
    }

    /** External links and Google sign-in run in a Chrome Custom Tab, never in the WebView. */
    private fun openExternally(uri: Uri) {
        if (UrlPolicy.isSystemScheme(uri)) {
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
            return
        }
        try {
            CustomTabsIntent.Builder()
                .setShowTitle(true)
                .build()
                .launchUrl(this, uri)
        } catch (_: ActivityNotFoundException) {
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
        }
    }

    private fun handleMediaPermissions(request: PermissionRequest) {
        val needed = mutableListOf<String>()
        request.resources.forEach { resource ->
            when (resource) {
                PermissionRequest.RESOURCE_VIDEO_CAPTURE -> needed += Manifest.permission.CAMERA
                PermissionRequest.RESOURCE_AUDIO_CAPTURE -> needed += Manifest.permission.RECORD_AUDIO
            }
        }
        val missing = needed.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) {
            request.grant(request.resources)
            return
        }
        pendingPermissionRequest = request
        mediaPermissionLauncher.launch(missing.toTypedArray())
    }

    private fun openFileChooser(
        callback: ValueCallback<Array<Uri>>,
        params: WebChromeClient.FileChooserParams,
    ): Boolean {
        filePathCallback?.onReceiveValue(null)
        filePathCallback = callback

        val contentIntent = params.createIntent().apply {
            if (params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            }
        }

        val extras = mutableListOf<Intent>()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED
        ) {
            runCatching {
                val dir = File(cacheDir, "captures").apply { mkdirs() }
                val photo = File(dir, "capture_${System.currentTimeMillis()}.jpg")
                cameraOutputUri = FileProvider.getUriForFile(
                    this,
                    "$packageName.fileprovider",
                    photo,
                )
                extras += Intent(MediaStore.ACTION_IMAGE_CAPTURE)
                    .putExtra(MediaStore.EXTRA_OUTPUT, cameraOutputUri)
            }
        }

        val chooser = Intent(Intent.ACTION_CHOOSER)
            .putExtra(Intent.EXTRA_INTENT, contentIntent)
            .putExtra(Intent.EXTRA_INITIAL_INTENTS, extras.toTypedArray())

        return try {
            fileChooserLauncher.launch(chooser)
            true
        } catch (_: ActivityNotFoundException) {
            filePathCallback = null
            false
        }
    }

    override fun onStart() {
        super.onStart()
        networkMonitor.start()
    }

    override fun onStop() {
        networkMonitor.stop()
        super.onStop()
    }

    override fun onResume() {
        super.onResume()
        binding.webView.onResume()
        // Coming back from the Google sign-in Custom Tab: refresh session state.
        if (!loadFailed && binding.webView.url != null) {
            binding.webView.evaluateJavascript(
                "window.dispatchEvent(new Event('visibilitychange'));",
                null,
            )
        }
    }

    override fun onPause() {
        binding.webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        binding.webView.destroy()
        super.onDestroy()
    }
}
