import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// 서명 정보는 저장소 밖에 둡니다: -Pgilgut.signing=/path/keystore.properties 또는 ~/.gilgut/keystore.properties
val signingFile = file(
    (findProperty("gilgut.signing") as String?) ?: "${System.getProperty("user.home")}/.gilgut/keystore.properties"
)
val signingProps = Properties().apply { if (signingFile.exists()) signingFile.inputStream().use { load(it) } }

// 웹 데모(gilgut-demo)를 그대로 앱 assets에 담습니다.
val webAssets = layout.buildDirectory.dir("webassets")
val syncWeb = tasks.register<Sync>("syncWebDemo") {
    from(rootProject.file("../gilgut-demo")) { exclude("._*", ".DS_Store") }
    into(webAssets.map { it.dir("gilgut-demo") })
}

android {
    namespace = "kr.gilgut.demo"
    compileSdk = 34

    defaultConfig {
        applicationId = "kr.gilgut.demo"
        minSdk = 28
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
    }

    signingConfigs {
        if (signingFile.exists()) create("release") {
            storeFile = file(signingProps.getProperty("storeFile"))
            storePassword = signingProps.getProperty("storePassword")
            keyAlias = signingProps.getProperty("keyAlias")
            keyPassword = signingProps.getProperty("keyPassword")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }

    sourceSets["main"].assets.srcDir(webAssets)

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

tasks.named("preBuild") { dependsOn(syncWeb) }
