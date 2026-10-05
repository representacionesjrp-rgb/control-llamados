plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Server URL baked into the app so executives only type their 6-letter code.
// Taken from the SERVER_URL environment variable, or else serverUrl in gradle.properties.
val serverUrl: String = System.getenv("SERVER_URL")?.takeIf { it.isNotBlank() }
    ?: (project.findProperty("serverUrl") as String?)
    ?: ""

android {
    namespace = "cl.controlllamados.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "cl.controlllamados.app"
        minSdk = 23
        targetSdk = 35
        versionCode = (System.getenv("VERSION_CODE") ?: "1").toInt()
        versionName = "1.0." + (System.getenv("VERSION_CODE") ?: "0")
        buildConfigField("String", "DEFAULT_SERVER_URL", "\"$serverUrl\"")
    }

    signingConfigs {
        create("release") {
            // Fixed key kept in the repo so every build can be installed over the previous one.
            storeFile = file("llamados.keystore")
            storePassword = "controlllamados"
            keyAlias = "llamados"
            keyPassword = "controlllamados"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    lint {
        // Internal app installed by hand: lint findings should not block the APK.
        abortOnError = false
        checkReleaseBuilds = false
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
}
