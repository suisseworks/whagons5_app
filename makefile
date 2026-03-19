.PHONY: help android-run android-apk-debug android-apk-release android-clean \
       ios-run ios-prebuild ios-build-sim ios-clean \
       release version

# Detect OS for sed compatibility
UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
    SED_INPLACE = sed -i ''
else
    SED_INPLACE = sed -i
endif

REMOTE_REPO := $(shell git remote get-url origin)

# ---- iOS build vars ----
IOS_WORKSPACE ?= ios/Whagons.xcworkspace
IOS_SCHEME ?= Whagons
IOS_DERIVED_DATA ?= ios/build

# ===========================================================================
#  Help
# ===========================================================================
help:
	@echo "Targets:"
	@echo ""
	@echo "  make release               Atomic: auto-bump patch, build, upload, tag + push"
	@echo "  make release VERSION=2.0.0 Same but with explicit version"
	@echo "  make version               Show current version info"
	@echo ""
	@echo "  make android-run           Run app on Android via Expo (dev)"
	@echo "  make android-apk-debug     Build debug APK"
	@echo "  make android-apk-release   Build release APK"
	@echo "  make android-clean         Clean Android build"
	@echo "  make ios-run               Run app on iOS via Expo (dev)"
	@echo "  make ios-prebuild          Generate native iOS project"
	@echo "  make ios-build-sim         Build iOS simulator app"
	@echo "  make ios-clean             Clean iOS derived data"

# ===========================================================================
#  Android builds
# ===========================================================================
android-run:
	npx expo run:android

android-apk-debug: android-clean
	cd android && ./gradlew assembleDebug

android-apk-release: android-clean
	cd android && ./gradlew assembleRelease

android-clean:
	rm -rf android/app/.cxx android/app/build android/build android/.gradle

# ===========================================================================
#  iOS builds
# ===========================================================================
ios-run:
	npx expo run:ios

ios-prebuild:
	npx expo prebuild -p ios

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

# ===========================================================================
#  Version info
# ===========================================================================
version:
	@echo "=== Version Info ==="
	@echo "last git tag:       $$(git tag -l 'v*' --sort=-v:refname | head -1 || echo 'none')"
	@echo "next version:       $$(v=$$(git tag -l 'v*' --sort=-v:refname | head -1 | sed 's/^v//'); if [ -z "$$v" ]; then echo '5.0.0'; else python3 -c "v='$$v'.split('.'); v[2]=str(int(v[2])+1); print('.'.join(v))"; fi)"
	@echo "app.json:           $$(python3 -c 'import json; print(json.load(open("app.json"))["expo"]["version"])')"
	@echo "package.json:       $$(python3 -c 'import json; print(json.load(open("package.json"))["version"])')"
	@echo "build.gradle code:  $$(grep 'versionCode' android/app/build.gradle | head -1 | grep -o '[0-9]*')"
	@echo "build.gradle name:  $$(grep 'versionName' android/app/build.gradle | head -1 | grep -oP '"[^"]*"')"
	@echo "version.ts:         $$(grep APP_VERSION src/config/version.ts | head -1)"
	@echo "Git hash:           $$(git rev-parse --short HEAD)"
	@echo "Git tags:           $$(git describe --tags --abbrev=0 2>/dev/null || echo 'none')"

# ===========================================================================
#  release — the one command that does everything atomically
#
#  Version is derived from git tags (latest v* tag).
#  Override with: make release VERSION=2.0.0
#
#  Steps (in order, each must succeed or we abort):
#    1. Derive next version from git tags (auto patch bump)
#    2. Build Go uploader CLI (if needed)
#    3. Query Play Store for latest versionCode, increment, update build.gradle
#    4. Sync versionName across files
#    5. Stamp git hash into version.ts
#    6. Build release AAB with the new versionCode
#    7. Upload AAB to Google Play Console
#    8. Commit, tag, push
# ===========================================================================
release:
	@set -e && \
	\
	echo "=== Step 1: Determine version ===" && \
	latest_tag=$$(git tag -l 'v*' --sort=-v:refname | head -1) && \
	if [ -z "$$latest_tag" ]; then \
		last_version="4.255.255"; \
	else \
		last_version=$$(echo $$latest_tag | sed 's/^v//'); \
	fi && \
	if [ -n "$(VERSION)" ]; then \
		version="$(VERSION)"; \
		echo "  using override VERSION=$$version (last tag: $$last_version)"; \
	else \
		version=$$(python3 -c "v='$$last_version'.split('.'); v[2]=str(int(v[2])+1); print('.'.join(v))") ; \
		echo "  auto-bumping: $$last_version -> $$version"; \
	fi && \
	\
	echo "=== Step 2: Build uploader CLI ===" && \
	if [ ! -f scripts/whagons-uploader ]; then \
		cd scripts && go build -o whagons-uploader main.go && cd ..; \
	fi && \
	\
	echo "=== Step 3: Query Play Store for latest versionCode ===" && \
	play_code=$$(cd scripts && ./whagons-uploader --service-account ../play-store-service-account.json latest-code && cd ..) && \
	next_code=$$((play_code + 1)) && \
	echo "  Play Store latest: $$play_code -> using: $$next_code" && \
	$(SED_INPLACE) "s/versionCode [0-9]*/versionCode $$next_code/" android/app/build.gradle && \
	\
	echo "=== Step 4: Sync version name across files ===" && \
	$(SED_INPLACE) "s/versionName \".*\"/versionName \"$$version\"/" android/app/build.gradle && \
	python3 -c "import json; f='app.json'; d=json.load(open(f)); d['expo']['version']='$$version'; json.dump(d, open(f,'w'), indent=2)" && \
	python3 -c "import json; f='package.json'; d=json.load(open(f)); d['version']='$$version'; json.dump(d, open(f,'w'), indent=2)" && \
	$(SED_INPLACE) "s/export const APP_VERSION = '.*';/export const APP_VERSION = '$$version';/" src/config/version.ts && \
	$(SED_INPLACE) "s/export const BUILD_NUMBER = [0-9]*;/export const BUILD_NUMBER = $$next_code;/" src/config/version.ts && \
	\
	echo "=== Step 5: Stamp git hash ===" && \
	git_hash=$$(git rev-parse --short HEAD) && \
	$(SED_INPLACE) "s/export const GIT_HASH = '.*';/export const GIT_HASH = '$$git_hash';/" src/config/version.ts && \
	echo "  hash: $$git_hash" && \
	\
	echo "=== Step 6: Build AAB ===" && \
	cd android && ./gradlew bundleRelease && cd .. && \
	\
	echo "=== Step 7: Upload to Google Play Console ===" && \
	cd scripts && ./whagons-uploader --service-account ../play-store-service-account.json upload --bundle ../android/app/build/outputs/bundle/release/app-release.aab && cd .. && \
	\
	echo "=== Step 8: Commit, tag, push ===" && \
	release_name="$$version (Build $$next_code) #$$git_hash" && \
	tag_name="v$$version" && \
	git add . && \
	git commit -m "Release $$release_name" && \
	git tag -a "$$tag_name" -m "Release $$release_name" && \
	git push $(REMOTE_REPO) main && \
	git push $(REMOTE_REPO) --tags && \
	\
	echo "" && \
	echo "Done: $$release_name published to Play Console and tagged on GitHub."
