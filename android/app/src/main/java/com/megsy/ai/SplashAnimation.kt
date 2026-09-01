package com.megsy.ai

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.AnimatorSet
import android.animation.ArgbEvaluator
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.graphics.Color
import android.graphics.PorterDuff
import android.os.Build
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.view.animation.PathInterpolator
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat

/**
 * Native launch animation (~2.6s) matching the `/test` prototype:
 *  0.00s clean theme-colored screen, the mark alone in the middle
 *  0.70s the mark shrinks while the "Megsy" wordmark reveals beside it
 *  1.70s the whole lockup grows and the brand color floods the screen
 *  2.40s hold, then the app is revealed
 */
object SplashAnimation {

    private const val DURATION = 2600L

    fun play(
        root: View,
        flood: View,
        lockup: LinearLayout,
        mark: ImageView,
        word: TextView,
        onEnd: () -> Unit,
    ) {
        val context = root.context
        val ink = ContextCompat.getColor(context, R.color.app_foreground)

        mark.setColorFilter(ink, PorterDuff.Mode.SRC_IN)
        word.setTextColor(ink)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            word.fontVariationSettings = "'wght' 700"
        }

        // Respect the system animation setting: skip straight to the app.
        val scale = Settings.Global.getFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            1f,
        )
        if (scale == 0f) {
            onEnd()
            return
        }

        val ease = PathInterpolator(0.16f, 1f, 0.3f, 1f)

        // Measure the wordmark so it can be revealed by width.
        word.measure(
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
        )
        val wordWidth = word.measuredWidth
        setWordWidth(word, 0)
        word.alpha = 0f

        lockup.scaleX = 1.8f
        lockup.scaleY = 1.8f
        lockup.alpha = 0f
        // The mark starts centered on screen: the empty wordmark keeps it there.

        val fadeIn = ObjectAnimator.ofFloat(lockup, View.ALPHA, 0f, 1f).apply {
            duration = 260
            interpolator = ease
        }

        val shrink = ValueAnimator.ofFloat(1.8f, 1f).apply {
            startDelay = 200
            duration = 700
            interpolator = ease
            addUpdateListener {
                val v = it.animatedValue as Float
                lockup.scaleX = v
                lockup.scaleY = v
            }
        }

        val reveal = ValueAnimator.ofInt(0, wordWidth).apply {
            startDelay = 780
            duration = 560
            interpolator = ease
            addUpdateListener {
                setWordWidth(word, it.animatedValue as Int)
                word.alpha = (it.animatedFraction * 1.6f).coerceAtMost(1f)
            }
        }

        val grow = ValueAnimator.ofFloat(1f, 1.22f).apply {
            startDelay = 1660
            duration = 500
            interpolator = ease
            addUpdateListener {
                val v = it.animatedValue as Float
                lockup.scaleX = v
                lockup.scaleY = v
            }
        }

        val floodSize = maxOf(
            root.resources.displayMetrics.widthPixels,
            root.resources.displayMetrics.heightPixels,
        ) * 2
        flood.layoutParams = (flood.layoutParams as ViewGroup.LayoutParams).apply {
            width = floodSize
            height = floodSize
        }
        flood.scaleX = 0.15f
        flood.scaleY = 0.15f

        val floodIn = ValueAnimator.ofFloat(0f, 1f).apply {
            startDelay = 1600
            duration = 430
            interpolator = ease
            addUpdateListener {
                val f = it.animatedFraction
                flood.alpha = (f * 1.8f).coerceAtMost(1f)
                val s = 0.15f + f * 1.0f
                flood.scaleX = s
                flood.scaleY = s
            }
        }

        val inkFlip = ValueAnimator.ofObject(ArgbEvaluator(), ink, Color.WHITE).apply {
            startDelay = 1770
            duration = 240
            addUpdateListener {
                val c = it.animatedValue as Int
                word.setTextColor(c)
                mark.setColorFilter(c, PorterDuff.Mode.SRC_IN)
            }
        }

        AnimatorSet().apply {
            playTogether(fadeIn, shrink, reveal, grow, floodIn, inkFlip)
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    root.postDelayed({ onEnd() }, DURATION - 2160)
                }
            })
            start()
        }
    }

    private fun setWordWidth(word: TextView, width: Int) {
        word.layoutParams = word.layoutParams.apply { this.width = width }
        word.requestLayout()
    }
}
