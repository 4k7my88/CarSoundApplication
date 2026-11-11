package kr.gilgut.demo

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.WebView
import android.webkit.WebViewClient

/** 길굿 시연용 앱: 앱에 담긴 웹 데모(주행 장단 엔진 + 차량 신호 시뮬레이터)를 전체 화면으로 보여 줍니다. */
class MainActivity : Activity() {
    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        web = WebView(this)
        setContentView(web)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true                    // 한 판 기록 · 가락 지도 저장
            mediaPlaybackRequiresUserGesture = false    // 음성 명령/자동 시연으로도 소리 시작
            useWideViewPort = true
            loadWithOverviewMode = true
            allowFileAccess = true
            userAgentString = "$userAgentString GilgutApp/0.1"
        }
        web.webViewClient = WebViewClient()
        web.setBackgroundColor(0xFF070605.toInt())
        if (savedInstanceState == null) web.loadUrl("file:///android_asset/gilgut-demo/index.html")
        else web.restoreState(savedInstanceState)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) @Suppress("DEPRECATION") {
            window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onPause() { web.onPause(); super.onPause() }
    override fun onResume() { super.onResume(); web.onResume() }
    override fun onDestroy() { web.destroy(); super.onDestroy() }
}
