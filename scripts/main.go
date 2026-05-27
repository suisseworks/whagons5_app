package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/spf13/cobra"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/androidpublisher/v3"
	"google.golang.org/api/googleapi"
	"google.golang.org/api/option"
)

type Config struct {
	PackageName        string
	ServiceAccountPath string
	BundlePath         string
	Track              string
	ReleaseNotes       string
	VersionCode        int64
	VersionName        string
	Publish            bool
	ListingLanguage    string
	ListingImageType   string
	ListingImagePath   string
}

var config Config

var rootCmd = &cobra.Command{
	Use:   "whagons-uploader",
	Short: "Upload app bundles to Google Play Console",
	Long:  `A CLI tool to upload app bundles to Google Play Console using the Google Play Publishing API`,
}

var uploadCmd = &cobra.Command{
	Use:   "upload",
	Short: "Upload an AAB to Google Play",
	Run:   runUpload,
}

var latestCodeCmd = &cobra.Command{
	Use:   "latest-code",
	Short: "Print the highest versionCode on Google Play across all tracks",
	Run:   runLatestCode,
}

var uploadListingImageCmd = &cobra.Command{
	Use:   "upload-listing-image",
	Short: "Upload a Google Play store listing image",
	Run:   runUploadListingImage,
}

func init() {
	// Global flags
	rootCmd.PersistentFlags().StringVarP(&config.PackageName, "package", "p", "com.whagons.v5", "Android package name")
	rootCmd.PersistentFlags().StringVarP(&config.ServiceAccountPath, "service-account", "s", "", "Path to service account JSON file")
	rootCmd.MarkPersistentFlagRequired("service-account")

	// Upload flags
	uploadCmd.Flags().StringVarP(&config.BundlePath, "bundle", "b", "", "Path to the app bundle (.aab file)")
	uploadCmd.Flags().StringVarP(&config.Track, "track", "t", "internal", "Release track (internal, alpha, beta, production)")
	uploadCmd.Flags().StringVarP(&config.ReleaseNotes, "notes", "n", "", "Release notes")
	uploadCmd.Flags().Int64VarP(&config.VersionCode, "version-code", "c", 0, "Version code (auto-detected if not provided)")
	uploadCmd.Flags().StringVarP(&config.VersionName, "version-name", "v", "", "Version name (auto-detected if not provided)")
	uploadCmd.Flags().BoolVar(&config.Publish, "publish", false, "Publish immediately (default: save as draft)")
	uploadCmd.MarkFlagRequired("bundle")

	// Store listing image flags
	uploadListingImageCmd.Flags().StringVarP(&config.ListingLanguage, "language", "l", "en-US", "Store listing language")
	uploadListingImageCmd.Flags().StringVarP(&config.ListingImageType, "type", "t", "", "Image type (icon, featureGraphic, phoneScreenshots, sevenInchScreenshots, tenInchScreenshots)")
	uploadListingImageCmd.Flags().StringVarP(&config.ListingImagePath, "file", "f", "", "Path to the PNG or JPEG image")
	uploadListingImageCmd.MarkFlagRequired("type")
	uploadListingImageCmd.MarkFlagRequired("file")

	rootCmd.AddCommand(uploadCmd)
	rootCmd.AddCommand(latestCodeCmd)
	rootCmd.AddCommand(uploadListingImageCmd)
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}

// ---- latest-code command ----

func runLatestCode(cmd *cobra.Command, args []string) {
	service, err := createAndroidPublisherService()
	if err != nil {
		log.Fatalf("Failed to create service: %v", err)
	}

	editId, err := startEdit(service)
	if err != nil {
		log.Fatalf("Failed to start edit: %v", err)
	}

	highest := getHighestVersionCode(service, editId)

	// Discard the edit (we didn't change anything)
	_ = deleteEdit(service, editId)

	// Print just the number so the makefile can capture it
	fmt.Print(highest)
}

func getHighestVersionCode(service *androidpublisher.Service, editId string) int64 {
	var highest int64

	tracks := []string{"internal", "alpha", "beta", "production"}
	for _, trackName := range tracks {
		track, err := service.Edits.Tracks.Get(config.PackageName, editId, trackName).Do()
		if err != nil {
			continue
		}
		for _, release := range track.Releases {
			for _, vc := range release.VersionCodes {
				if vc > highest {
					highest = vc
				}
			}
		}
	}

	// Also check uploaded bundles
	bundlesResp, err := service.Edits.Bundles.List(config.PackageName, editId).Do()
	if err == nil {
		for _, bundle := range bundlesResp.Bundles {
			if bundle.VersionCode > highest {
				highest = bundle.VersionCode
			}
		}
	}

	return highest
}

func deleteEdit(service *androidpublisher.Service, editId string) error {
	return service.Edits.Delete(config.PackageName, editId).Do()
}

// ---- upload command ----

func runUpload(cmd *cobra.Command, args []string) {
	fmt.Println("🚀 Starting Whagons App Bundle Upload...")

	if _, err := os.Stat(config.BundlePath); os.IsNotExist(err) {
		log.Fatalf("❌ Bundle file not found: %s", config.BundlePath)
	}

	if config.VersionCode == 0 || config.VersionName == "" {
		detectVersionInfo()
	}

	service, err := createAndroidPublisherService()
	if err != nil {
		log.Fatalf("❌ Failed to create Android Publisher service: %v", err)
	}

	fmt.Println("📝 Starting edit session...")
	editId, err := startEdit(service)
	if err != nil {
		log.Fatalf("❌ Failed to start edit: %v", err)
	}
	fmt.Printf("✅ Edit session started with ID: %s\n", editId)

	fmt.Println("📦 Uploading app bundle...")
	versionCode, err := uploadBundle(service, editId)
	if err != nil {
		log.Fatalf("❌ Failed to upload bundle: %v", err)
	}
	fmt.Printf("✅ Bundle uploaded successfully with version code: %d\n", versionCode)

	fmt.Println("🎯 Creating release...")
	err = createRelease(service, editId, versionCode)
	if err != nil {
		log.Fatalf("❌ Failed to create release: %v", err)
	}

	if config.Publish {
		fmt.Printf("✅ Release published on %s track\n", config.Track)
	} else {
		fmt.Printf("✅ Release saved as draft on %s track\n", config.Track)
	}

	fmt.Println("💾 Committing changes...")
	err = commitEdit(service, editId)
	if err != nil {
		log.Fatalf("❌ Failed to commit changes: %v", err)
	}

	if config.Publish {
		fmt.Println("🎉 App bundle uploaded and published successfully!")
	} else {
		fmt.Println("🎉 App bundle uploaded as draft! Go to Google Play Console to review and publish.")
	}
}

// ---- upload-listing-image command ----

func runUploadListingImage(cmd *cobra.Command, args []string) {
	fmt.Printf("🚀 Uploading %s listing image for %s...\n", config.ListingImageType, config.ListingLanguage)

	if _, err := os.Stat(config.ListingImagePath); os.IsNotExist(err) {
		log.Fatalf("❌ Listing image not found: %s", config.ListingImagePath)
	}

	contentType, err := listingImageContentType(config.ListingImagePath)
	if err != nil {
		log.Fatalf("❌ %v", err)
	}

	service, err := createAndroidPublisherService()
	if err != nil {
		log.Fatalf("❌ Failed to create Android Publisher service: %v", err)
	}

	fmt.Println("📝 Starting edit session...")
	editId, err := startEdit(service)
	if err != nil {
		log.Fatalf("❌ Failed to start edit: %v", err)
	}
	fmt.Printf("✅ Edit session started with ID: %s\n", editId)

	fmt.Println("🧹 Replacing existing image(s)...")
	if _, err := service.Edits.Images.Deleteall(config.PackageName, editId, config.ListingLanguage, config.ListingImageType).Do(); err != nil {
		_ = deleteEdit(service, editId)
		log.Fatalf("❌ Failed to clear existing listing images: %v", err)
	}

	fmt.Println("🖼️  Uploading listing image...")
	if err := uploadListingImage(service, editId, contentType); err != nil {
		_ = deleteEdit(service, editId)
		log.Fatalf("❌ Failed to upload listing image: %v", err)
	}

	fmt.Println("💾 Committing changes...")
	if err := commitEdit(service, editId); err != nil {
		log.Fatalf("❌ Failed to commit changes: %v", err)
	}

	fmt.Printf("🎉 Uploaded %s for %s successfully!\n", config.ListingImageType, config.ListingLanguage)
}

// ---- shared helpers ----

func createAndroidPublisherService() (*androidpublisher.Service, error) {
	ctx := context.Background()

	serviceAccountJSON, err := os.ReadFile(config.ServiceAccountPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read service account file: %v", err)
	}

	credentials, err := google.CredentialsFromJSON(ctx, serviceAccountJSON, androidpublisher.AndroidpublisherScope)
	if err != nil {
		return nil, fmt.Errorf("failed to create credentials: %v", err)
	}

	service, err := androidpublisher.NewService(ctx, option.WithCredentials(credentials))
	if err != nil {
		return nil, fmt.Errorf("failed to create Android Publisher service: %v", err)
	}

	return service, nil
}

func startEdit(service *androidpublisher.Service) (string, error) {
	edit := &androidpublisher.AppEdit{}
	editResponse, err := service.Edits.Insert(config.PackageName, edit).Do()
	if err != nil {
		return "", err
	}
	return editResponse.Id, nil
}

func uploadBundle(service *androidpublisher.Service, editId string) (int64, error) {
	file, err := os.Open(config.BundlePath)
	if err != nil {
		return 0, fmt.Errorf("failed to open bundle file: %v", err)
	}
	defer file.Close()

	bundleResponse, err := service.Edits.Bundles.Upload(config.PackageName, editId).
		Media(file, googleapi.ContentType("application/octet-stream")).Do()
	if err != nil {
		return 0, fmt.Errorf("failed to upload bundle: %v", err)
	}

	return bundleResponse.VersionCode, nil
}

func uploadListingImage(service *androidpublisher.Service, editId string, contentType string) error {
	file, err := os.Open(config.ListingImagePath)
	if err != nil {
		return fmt.Errorf("failed to open listing image: %v", err)
	}
	defer file.Close()

	_, err = service.Edits.Images.Upload(config.PackageName, editId, config.ListingLanguage, config.ListingImageType).
		Media(file, googleapi.ContentType(contentType)).Do()
	if err != nil {
		return fmt.Errorf("failed to upload listing image: %v", err)
	}

	return nil
}

func createRelease(service *androidpublisher.Service, editId string, versionCode int64) error {
	track, err := service.Edits.Tracks.Get(config.PackageName, editId, config.Track).Do()
	if err != nil {
		track = &androidpublisher.Track{
			Track: config.Track,
		}
	}

	var releaseNotes []*androidpublisher.LocalizedText
	if config.ReleaseNotes != "" {
		releaseNotes = []*androidpublisher.LocalizedText{
			{
				Language: "en-US",
				Text:     config.ReleaseNotes,
			},
		}
	}

	status := "draft"
	if config.Publish {
		status = "completed"
	}

	release := &androidpublisher.TrackRelease{
		Name:         config.VersionName,
		VersionCodes: []int64{versionCode},
		Status:       status,
		ReleaseNotes: releaseNotes,
	}

	track.Releases = []*androidpublisher.TrackRelease{release}

	_, err = service.Edits.Tracks.Update(config.PackageName, editId, config.Track, track).Do()
	if err != nil {
		return fmt.Errorf("failed to update track: %v", err)
	}

	return nil
}

func listingImageContentType(path string) (string, error) {
	lowerPath := strings.ToLower(path)
	switch {
	case strings.HasSuffix(lowerPath, ".png"):
		return "image/png", nil
	case strings.HasSuffix(lowerPath, ".jpg"), strings.HasSuffix(lowerPath, ".jpeg"):
		return "image/jpeg", nil
	default:
		return "", fmt.Errorf("listing image must be a PNG or JPEG: %s", path)
	}
}

func commitEdit(service *androidpublisher.Service, editId string) error {
	_, err := service.Edits.Commit(config.PackageName, editId).Do()
	return err
}

func detectVersionInfo() {
	fmt.Println("🔍 Auto-detecting version information...")

	if versionData, err := os.ReadFile("../version.txt"); err == nil {
		version := strings.TrimSpace(string(versionData))
		if config.VersionName == "" {
			config.VersionName = version
			fmt.Printf("📋 Detected version name: %s\n", config.VersionName)
		}
	}

	if gradleData, err := os.ReadFile("../android/app/build.gradle"); err == nil {
		gradleContent := string(gradleData)

		if config.VersionCode == 0 {
			if versionCodeStr := extractFromGradle(gradleContent, "versionCode"); versionCodeStr != "" {
				if versionCode, err := strconv.ParseInt(versionCodeStr, 10, 64); err == nil {
					config.VersionCode = versionCode
					fmt.Printf("📋 Detected version code: %d\n", config.VersionCode)
				}
			}
		}

		if config.VersionName == "" {
			if versionName := extractFromGradle(gradleContent, "versionName"); versionName != "" {
				config.VersionName = strings.Trim(versionName, "'\"")
				fmt.Printf("📋 Detected version name from gradle: %s\n", config.VersionName)
			}
		}
	}

	if config.VersionCode == 0 {
		config.VersionCode = 1
		fmt.Printf("⚠️  Using default version code: %d\n", config.VersionCode)
	}
	if config.VersionName == "" {
		config.VersionName = "1.0.0"
		fmt.Printf("⚠️  Using default version name: %s\n", config.VersionName)
	}
}

func extractFromGradle(content, key string) string {
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.Contains(line, key) && !strings.HasPrefix(line, "//") {
			parts := strings.Split(line, key)
			if len(parts) > 1 {
				value := strings.TrimSpace(parts[1])
				value = strings.TrimPrefix(value, "=")
				value = strings.TrimPrefix(value, ":")
				value = strings.TrimSpace(value)
				value = strings.Trim(value, "'\"")
				value = strings.TrimSuffix(value, ";")
				return value
			}
		}
	}
	return ""
}
