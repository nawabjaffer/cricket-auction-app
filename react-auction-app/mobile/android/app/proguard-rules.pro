# R8 / ProGuard rules for NJS Live Studio (release builds are minified).

# React Native discovers native modules and view props by reflection on these annotations.
-keepclassmembers class * { @com.facebook.react.bridge.ReactMethod *; }
-keepclassmembers class * { @com.facebook.react.uimanager.annotations.ReactProp *; }
-keepclassmembers class * { @com.facebook.react.uimanager.annotations.ReactPropGroup *; }
-keep class com.njsstore.livestudio.bridge.** { *; }
-keep class com.njsstore.livestudio.studio.StudioService { *; }

# RootEncoder / RTSP-Server (their classes are used directly, but keep them predictable for crash reports).
-keep class com.pedro.** { *; }
-dontwarn com.pedro.**

# ktor (pulled in by RTSP-Server) references optional JVM-only classes.
-dontwarn io.ktor.**
-dontwarn java.lang.management.**
-dontwarn org.slf4j.**
-dontwarn org.osgi.**
-dontwarn reactor.blockhound.**

# Media3 ships consumer rules; keep the RTSP factory reflection-free path intact.
-dontwarn androidx.media3.**
