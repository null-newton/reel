import groovy.json.JsonSlurper

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// One version for every Reel build: desktop/package.json
@Suppress("UNCHECKED_CAST")
val reelVersion = (JsonSlurper().parse(rootDir.resolve("../desktop/package.json")) as Map<String, Any>)["version"] as String
val reelVersionCode = reelVersion.split(".").map { it.toInt() }.let { (major, minor, patch) -> major * 10000 + minor * 100 + patch }

// Release signing from the environment (CI secrets); falls back to the debug key when absent.
// (GitHub passes unset secrets as empty strings, so blank counts as missing.)
fun env(name: String): String? = System.getenv(name)?.takeIf { it.isNotBlank() }
val keystorePath: String? = env("REEL_KEYSTORE_PATH")

android {
    namespace = "app.reel.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.reel.tv"
        minSdk = 24
        targetSdk = 35
        versionName = reelVersion
        // per-ABI APKs get versionCode * 10 + abi index below
        versionCode = reelVersionCode
        externalNativeBuild {
            cmake {
                cppFlags += "-std=c++17"
                arguments += "-DANDROID_STL=c++_shared"
            }
        }
    }

    splits {
        abi {
            isEnable = true
            reset()
            include("arm64-v8a", "armeabi-v7a", "x86_64")
            isUniversalApk = true
        }
    }

    sourceSets["main"].jniLibs.srcDirs("libnode/bin")

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    signingConfigs {
        if (keystorePath != null) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = env("REEL_KEYSTORE_PASSWORD")
                keyAlias = env("REEL_KEY_ALIAS")
                keyPassword = env("REEL_KEY_PASSWORD") ?: env("REEL_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    androidResources {
        noCompress += "zip" // the bundled Node project is already compressed
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

// Distinct versionCodes per ABI APK so updates install cleanly (universal = 0)
val abiCodes = mapOf("armeabi-v7a" to 1, "arm64-v8a" to 2, "x86_64" to 3)
androidComponents {
    onVariants { variant ->
        variant.outputs.forEach { output ->
            val abi = output.filters.find { it.filterType == com.android.build.api.variant.FilterConfiguration.FilterType.ABI }?.identifier
            output.versionCode.set(reelVersionCode * 10 + (abiCodes[abi] ?: 0))
        }
    }
}
