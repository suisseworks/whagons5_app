.PHONY: help android-run android-apk-debug android-apk-release android-clean ios-run ios-prebuild ios-build-sim ios-clean

# ---- iOS build vars (only used after `make ios-prebuild` creates ios/) ----
# Override as needed, e.g.:
#   make ios-build-sim IOS_WORKSPACE=ios/Whagons.xcworkspace IOS_SCHEME=Whagons
IOS_WORKSPACE ?= ios/Whagons.xcworkspace
IOS_SCHEME ?= Whagons
IOS_DERIVED_DATA ?= ios/build

help:
    @echo "Targets (run from react-native/):"
    @echo "  make android-run         # Run app on Android via Expo (dev)"
    @echo "  make android-apk-debug   # Build debug APK via Gradle"
    @echo "  make android-apk-release # Build release APK via Gradle"
    @echo "  make android-clean       # Clean Android build outputs"
    @echo "  make ios-run             # Run app on iOS via Expo (dev)"
    @echo "  make ios-prebuild        # Generate native iOS project (creates ios/)"
    @echo "  make ios-build-sim       # Build iOS simulator app via xcodebuild (requires ios/)"
    @echo "  make ios-clean           # Clean iOS derived data (local build artifacts)"

android-run:
    npx expo run:android

# Builds: android/app/build/outputs/apk/debug/app-debug.apk
android-apk-debug:
    cd android && ./gradlew clean assembleDebug

# Builds: android/app/build/outputs/apk/release/app-release.apk
android-apk-release:
    cd android && ./gradlew clean assembleRelease

android-clean:
    cd android && ./gradlew clean

ios-run:
    npx expo run:ios

# Creates ios/ (and may require CocoaPods + Xcode).
ios-prebuild:
    npx expo prebuild -p ios

# Builds an iOS simulator .app (requires Xcode + a generated ios/ project).
ios-build-sim:
    xcodebuild \
        -workspace "$(IOS_WORKSPACE)" \
        -scheme "$(IOS_SCHEME)" \
        -configuration Debug \
        -sdk iphonesimulator \
        -derivedDataPath "$(IOS_DERIVED_DATA)" \
        build

ios-clean:
    rm -rf "$(IOS_DERIVED_DATA)"