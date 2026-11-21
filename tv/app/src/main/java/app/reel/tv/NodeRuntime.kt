package app.reel.tv

import android.content.Context
import android.util.Log
import java.io.File
import java.util.zip.ZipInputStream

/**
 * Runs Reel's Node.js side (core + UI server, see tv/node/main.mjs) on nodejs-mobile.
 * Node can only be started once per process, so this lives for the whole app process.
 */
object NodeRuntime {
    private const val TAG = "ReelTV"
    @Volatile private var started = false

    init {
        System.loadLibrary("node")
        System.loadLibrary("native-lib")
    }

    private external fun startNode(arguments: Array<String>): Int

    /** Unpacks the bundled Node project when the app was installed/updated, then starts Node on its own thread. */
    @Synchronized
    fun start(context: Context, onStatus: (String) -> Unit) {
        if (started) return
        started = true
        // the Node main thread needs a much larger stack than Android's default (V8 + deep module graphs)
        Thread(null, {
            try {
                val project = File(context.filesDir, "nodejs-project")
                val data = File(context.filesDir, "data").apply { mkdirs() }
                val stamp = File(context.filesDir, "nodejs-project.stamp")
                val installed = context.packageManager.getPackageInfo(context.packageName, 0).lastUpdateTime.toString()
                if (!project.exists() || !stamp.exists() || stamp.readText() != installed) {
                    onStatus("Preparing Reel… (first start after an update can take a minute)")
                    project.deleteRecursively()
                    unzipAsset(context, "nodejs-project.zip", project)
                    stamp.writeText(installed)
                }
                onStatus("Starting Reel…")
                val code = startNode(arrayOf("node", File(project, "main.mjs").absolutePath, data.absolutePath))
                Log.e(TAG, "Node exited with code $code")
                onStatus("Reel's engine stopped (code $code). Restart the app.")
            } catch (t: Throwable) {
                Log.e(TAG, "Node failed to start", t)
                onStatus("Reel couldn't start: ${t.message}")
            }
        }, "node", 16L * 1024 * 1024).start()
    }

    private fun unzipAsset(context: Context, name: String, target: File) {
        val root = target.canonicalFile
        ZipInputStream(context.assets.open(name).buffered()).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                val out = File(root, entry.name).canonicalFile
                require(out.path.startsWith(root.path)) { "bad zip entry ${entry.name}" }
                if (entry.isDirectory) {
                    out.mkdirs()
                } else {
                    out.parentFile?.mkdirs()
                    out.outputStream().buffered().use { zip.copyTo(it) }
                }
            }
        }
    }
}
