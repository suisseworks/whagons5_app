.PHONY: help android-run android-apk-debug android-apk-release android-apk-dev-backend android-clean \
       ios-run ios-prebuild ios-build-sim ios-archive ios-clean ios-screenshots \
       release release-prod release-notes-preview version

# Detect OS for sed compatibility
UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
    SED_INPLACE = sed -i ''
else
    SED_INPLACE = sed -i
endif

REMOTE_REPO := $(shell git remote get-url origin)
OPENROUTER_MODEL ?= moonshotai/kimi-k2.5

# ---- iOS build vars ----
IOS_WORKSPACE ?= ios/Whagons.xcworkspace
IOS_SCHEME ?= Whagons
IOS_DERIVED_DATA ?= ios/build
IOS_ARCHIVE_PATH ?= ios/build/archives/Whagons.xcarchive
IOS_CONFIGURATION ?= Release

# ===========================================================================
#  Help
# ===========================================================================
help:
	@echo "Targets:"
	@echo ""
	@echo "  make release               Atomic: auto-bump patch, build, upload as draft, tag + push"
	@echo "  make release VERSION=2.0.0 Same but with explicit version"
	@echo "  make release-prod          Same as release but publishes to production (not draft)"
	@echo "  make release-prod VERSION=2.0.0  Production release with explicit version"
	@echo "  make release-notes-preview Safe: generate release notes only into /tmp"
	@echo "  make version               Show current version info"
	@echo ""
	@echo "  make android-run           Run app on Android via Expo (dev)"
	@echo "  make android-apk-debug     Build debug APK"
	@echo "  make android-apk-release   Build release APK"
	@echo "  make android-apk-dev-backend  Build release APK using .env.dev-backend"
	@echo "  make android-clean         Clean Android build"
	@echo "  make ios-run               Run app on iOS via Expo (dev)"
	@echo "  make ios-prebuild          Generate native iOS project"
	@echo "  make ios-build-sim         Build iOS simulator app"
	@echo "  make ios-archive           Archive iOS app for App Store upload"
	@echo "  make ios-screenshots       Capture App Store iOS screenshots at 1284x2778"
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

android-apk-dev-backend: android-clean
	set -a && . ./.env.dev-backend && set +a && export EXPO_NO_DOTENV=1 && cd android && ./gradlew --no-daemon assembleRelease

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

ios-archive:
	xcodebuild \
		-workspace "$(IOS_WORKSPACE)" \
		-scheme "$(IOS_SCHEME)" \
		-configuration "$(IOS_CONFIGURATION)" \
		-destination "generic/platform=iOS" \
		-archivePath "$(IOS_ARCHIVE_PATH)" \
		-derivedDataPath "$(IOS_DERIVED_DATA)" \
		archive

ios-clean:
	rm -rf "$(IOS_DERIVED_DATA)"

ios-screenshots:
	bash scripts/appstore-ios-screenshots.sh

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
#  release-notes-preview — run only the agentic release-note generator
#
#  Safe preview target. It does not build, upload, commit, tag, push, publish,
#  or write bundled notes into src/config. It writes files under /tmp only.
# ===========================================================================
release-notes-preview:
	@set -e && \
	set -a && . ../.env && set +a && \
	\
	echo "=== Release notes preview ===" && \
	latest_tag=$$(gh release list --limit 1 --json tagName --jq '.[0].tagName' 2>/dev/null || true) && \
	if [ -z "$$latest_tag" ]; then latest_tag=$$(git tag -l 'v*' --sort=-v:refname | head -1); fi && \
	if [ -z "$$latest_tag" ]; then \
		last_version="4.255.255"; \
	else \
		last_version=$$(echo $$latest_tag | sed 's/^v//'); \
	fi && \
	if [ -n "$(VERSION)" ]; then \
		version="$(VERSION)"; \
	else \
		version=$$(python3 -c "v='$$last_version'.split('.'); v[2]=str(int(v[2])+1); print('.'.join(v))"); \
	fi && \
	build_code=$$(grep 'versionCode' android/app/build.gradle | head -1 | grep -o '[0-9]*') && \
	git_hash=$$(git rev-parse --short HEAD) && \
	release_name="$$version (Preview Build $$build_code) #$$git_hash" && \
	release_notes_file="/tmp/whagons-release-notes-preview-$$version.md" && \
	bundled_preview_file="/tmp/whagons-release-notes-preview-$$version.ts" && \
	echo "  previous tag: $${latest_tag:-none}" && \
	echo "  preview version: $$version" && \
	echo "  notes file: $$release_notes_file" && \
	echo "  bundled preview: $$bundled_preview_file" && \
	PREVIOUS_TAG="$$latest_tag" RELEASE_VERSION="$$version" RELEASE_NAME="$$release_name" RELEASE_NOTES_FILE="$$release_notes_file" RELEASE_BUILD_NUMBER="$$build_code" RELEASE_GIT_HASH="$$git_hash" BUNDLED_RELEASE_NOTES_FILE="$$bundled_preview_file" OPENROUTER_MODEL="$(OPENROUTER_MODEL)" npx tsx scripts/generate-release-notes.ts && \
	echo "" && \
	echo "Preview generated:" && \
	echo "  $$release_notes_file" && \
	echo "  $$bundled_preview_file"

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
#    6. Generate AI release notes through OpenRouter and bundle them into the app
#    7. Build release AAB with the new versionCode
#    8. Upload AAB to Google Play Console
#    9. Commit, tag, create GitHub release, publish app release notes to Convex
# ===========================================================================
release:
	@set -e && \
	set -a && . ./.env.production && set +a && export EXPO_NO_DOTENV=1 && \
	if [ -z "$${OPENROUTER_API_KEY:-}" ]; then echo "Error: OPENROUTER_API_KEY is required in .env.production."; exit 1; fi && \
	if [ -z "$${RELEASE_NOTES_SECRET:-}" ]; then echo "Error: RELEASE_NOTES_SECRET is required in .env.production and must match the Convex deployment env."; exit 1; fi && \
	if [ -z "$${EXPO_PUBLIC_CONVEX_URL:-}" ] && [ -z "$${CONVEX_URL:-}" ]; then echo "Error: EXPO_PUBLIC_CONVEX_URL or CONVEX_URL is required in .env.production."; exit 1; fi && \
	\
	echo "=== Step 1: Determine version ===" && \
	latest_tag=$$(gh release list --limit 1 --json tagName --jq '.[0].tagName' 2>/dev/null || true) && \
	if [ -z "$$latest_tag" ]; then latest_tag=$$(git tag -l 'v*' --sort=-v:refname | head -1); fi && \
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
	release_name="$$version (Build $$next_code) #$$git_hash" && \
	tag_name="v$$version" && \
	release_notes_file="/tmp/whagons-release-notes-$$version.md" && \
	release_tag_file="/tmp/whagons-release-tag-$$version.txt" && \
	echo "=== Step 6: Generate release notes ===" && \
	PREVIOUS_TAG="$$latest_tag" RELEASE_VERSION="$$version" RELEASE_NAME="$$release_name" RELEASE_NOTES_FILE="$$release_notes_file" RELEASE_BUILD_NUMBER="$$next_code" RELEASE_GIT_HASH="$$git_hash" OPENROUTER_MODEL="$(OPENROUTER_MODEL)" npx tsx scripts/generate-release-notes.ts && \
	printf "Release %s\n\n" "$$release_name" > "$$release_tag_file" && \
	cat "$$release_notes_file" >> "$$release_tag_file" && \
	\
	echo "=== Step 7: Build AAB ===" && \
	cd android && ./gradlew --no-daemon bundleRelease && cd .. && \
	\
	echo "=== Step 8: Upload to Google Play Console ===" && \
	cd scripts && ./whagons-uploader --service-account ../play-store-service-account.json upload --bundle ../android/app/build/outputs/bundle/release/app-release.aab && cd .. && \
	\
	echo "=== Step 9: Commit, tag, push, and publish release notes ===" && \
	git add . && \
	git commit -m "Release $$release_name" && \
	git tag -a "$$tag_name" -F "$$release_tag_file" && \
	git push $(REMOTE_REPO) main && \
	git push $(REMOTE_REPO) --tags && \
	gh release create "$$tag_name" --title "Release $$release_name" --notes-file "$$release_notes_file" && \
	RELEASE_VERSION="$$version" RELEASE_TAG="$$tag_name" RELEASE_TITLE="Release $$release_name" RELEASE_NOTES_FILE="$$release_notes_file" RELEASE_BUILD_NUMBER="$$next_code" RELEASE_GIT_HASH="$$git_hash" RELEASE_GITHUB_URL="$$(gh release view "$$tag_name" --json url --jq .url)" RELEASE_PUBLISHED_AT="$$(node -e 'console.log(Date.now())')" node scripts/publish-release-notes.mjs && \
	echo "" && \
	echo "Done: $$release_name published to Play Console and tagged on GitHub."

# ===========================================================================
#  release-prod — same as release but publishes to production track directly
# ===========================================================================
release-prod:
	@set -e && \
	set -a && . ./.env.production && set +a && export EXPO_NO_DOTENV=1 && \
	if [ -z "$${OPENROUTER_API_KEY:-}" ]; then echo "Error: OPENROUTER_API_KEY is required in .env.production."; exit 1; fi && \
	if [ -z "$${RELEASE_NOTES_SECRET:-}" ]; then echo "Error: RELEASE_NOTES_SECRET is required in .env.production and must match the Convex deployment env."; exit 1; fi && \
	if [ -z "$${EXPO_PUBLIC_CONVEX_URL:-}" ] && [ -z "$${CONVEX_URL:-}" ]; then echo "Error: EXPO_PUBLIC_CONVEX_URL or CONVEX_URL is required in .env.production."; exit 1; fi && \
	\
	echo "=== Step 1: Determine version ===" && \
	latest_tag=$$(gh release list --limit 1 --json tagName --jq '.[0].tagName' 2>/dev/null || true) && \
	if [ -z "$$latest_tag" ]; then latest_tag=$$(git tag -l 'v*' --sort=-v:refname | head -1); fi && \
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
	release_name="$$version (Build $$next_code) #$$git_hash" && \
	tag_name="v$$version" && \
	release_notes_file="/tmp/whagons-release-notes-$$version.md" && \
	release_tag_file="/tmp/whagons-release-tag-$$version.txt" && \
	echo "=== Step 6: Generate release notes ===" && \
	PREVIOUS_TAG="$$latest_tag" RELEASE_VERSION="$$version" RELEASE_NAME="$$release_name" RELEASE_NOTES_FILE="$$release_notes_file" RELEASE_BUILD_NUMBER="$$next_code" RELEASE_GIT_HASH="$$git_hash" OPENROUTER_MODEL="$(OPENROUTER_MODEL)" npx tsx scripts/generate-release-notes.ts && \
	printf "Release %s\n\n" "$$release_name" > "$$release_tag_file" && \
	cat "$$release_notes_file" >> "$$release_tag_file" && \
	\
	echo "=== Step 7: Build AAB ===" && \
	cd android && ./gradlew --no-daemon bundleRelease && cd .. && \
	\
	echo "=== Step 8: Upload to Google Play Console (PRODUCTION) ===" && \
	cd scripts && ./whagons-uploader --service-account ../play-store-service-account.json upload --bundle ../android/app/build/outputs/bundle/release/app-release.aab --track production --publish && cd .. && \
	\
	echo "=== Step 9: Commit, tag, push, and publish release notes ===" && \
	git add . && \
	git commit -m "Release $$release_name" && \
	git tag -a "$$tag_name" -F "$$release_tag_file" && \
	git push $(REMOTE_REPO) main && \
	git push $(REMOTE_REPO) --tags && \
	gh release create "$$tag_name" --title "Release $$release_name" --notes-file "$$release_notes_file" && \
	RELEASE_VERSION="$$version" RELEASE_TAG="$$tag_name" RELEASE_TITLE="Release $$release_name" RELEASE_NOTES_FILE="$$release_notes_file" RELEASE_BUILD_NUMBER="$$next_code" RELEASE_GIT_HASH="$$git_hash" RELEASE_GITHUB_URL="$$(gh release view "$$tag_name" --json url --jq .url)" RELEASE_PUBLISHED_AT="$$(node -e 'console.log(Date.now())')" node scripts/publish-release-notes.mjs && \
	echo "" && \
	echo "Done: $$release_name published to PRODUCTION on Play Console and tagged on GitHub."
