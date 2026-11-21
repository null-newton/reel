package app.reel.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import java.net.HttpURLConnection
import java.net.URL

/** Full-screen WebView showing Reel's UI, served by the Node side on 127.0.0.1:47320. */
class MainActivity : Activity() {
    private val main = Handler(Looper.getMainLooper())
    private lateinit var root: FrameLayout
    private lateinit var web: WebView
    private lateinit var status: TextView
    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null
    private var loaded = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        root = FrameLayout(this).apply { setBackgroundColor(BG) }
        web = WebView(this).apply {
            setBackgroundColor(BG)
            visibility = View.INVISIBLE
            isFocusable = true
            isFocusableInTouchMode = true
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.userAgentString = settings.userAgentString + " ReelTV/" + BuildConfig.VERSION_NAME
            webViewClient = object : WebViewClient() {
                // keep Reel inside the app; it never needs to open other sites
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) =
                    !request.url.toString().startsWith(UI_URL)

                override fun onPageFinished(view: WebView, url: String) {
                    view.visibility = View.VISIBLE
                    status.visibility = View.GONE
                    view.requestFocus()
                }
            }
            webChromeClient = object : WebChromeClient() {
                // element fullscreen (the player's fullscreen button)
                override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                    customView?.let { onHideCustomView() }
                    customView = view
                    customViewCallback = callback
                    root.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                }

                override fun onHideCustomView() {
                    customView?.let { root.removeView(it) }
                    customView = null
                    customViewCallback?.onCustomViewHidden()
                    customViewCallback = null
                    web.requestFocus()
                }
            }
        }
        status = TextView(this).apply {
            setTextColor(Color.parseColor("#A59B8C"))
            textSize = 20f
            gravity = Gravity.CENTER
            text = "Starting Reel…"
        }
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root.addView(status, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)

        NodeRuntime.start(applicationContext) { msg -> main.post { if (!loaded) status.text = msg } }
        waitForServer()
    }

    /** Poll the local UI server, then load it. */
    private fun waitForServer() {
        Thread {
            while (!isFinishing && !isDestroyed) {
                if (ping()) {
                    main.post {
                        if (!loaded) {
                            loaded = true
                            web.loadUrl(UI_URL)
                        }
                    }
                    return@Thread
                }
                Thread.sleep(300)
            }
        }.start()
    }

    private fun ping(): Boolean = try {
        (URL("$UI_URL/__reel/health").openConnection() as HttpURLConnection).run {
            connectTimeout = 500
            readTimeout = 1000
            val ok = responseCode == 200
            disconnect()
            ok
        }
    } catch (_: Exception) {
        false
    }

    /** Remote Back: let the page close dialogs / go back first; exit only when it has nothing to do. */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action == KeyEvent.ACTION_UP) {
                if (customView != null) {
                    web.webChromeClient?.onHideCustomView()
                } else if (!loaded) {
                    finish()
                } else {
                    web.evaluateJavascript("(window.__reelBack ? window.__reelBack() : false)") { handled ->
                        if (handled != "true") finish()
                    }
                }
            }
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onPause() {
        super.onPause()
        web.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    override fun onDestroy() {
        root.removeAllViews()
        web.destroy()
        super.onDestroy()
    }

    companion object {
        const val UI_URL = "http://127.0.0.1:47320"
        private val BG = Color.parseColor("#16130F")
    }
}
