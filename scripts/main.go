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
}

var config Config

var rootCmd = &cobra.Command{
	Use:   "whagons-uploader",
	Short: "Upload app bundles to Google Play Console",
	Long:  `A CLI tool to upload app bundles to Google Play Console using the Google Play Publishing API`,
	Run:   runUpload,
}

func init() {
	rootCmd.Flags().StringVarP(&config.PackageName, "package", "p", "com.whagons.v5", "Android package name")
	rootCmd.Flags().StringVarP(&config.ServiceAccountPath, "service-account", "s", "whagons5-service-account.json", "Path to service account JSON file")
	rootCmd.Flags().StringVarP(&config.BundlePath, "bundle", "b", "", "Path to the app bundle (.aab file)")
	rootCmd.Flags().StringVarP(&config.Track, "track", "t", "internal", "Release track (internal, alpha, beta, production)")
	rootCmd.Flags().StringVarP(&config.ReleaseNotes, "notes", "n", "", "Release notes")
	rootCmd.Flags().Int64VarP(&config.VersionCode, "version-code", "c", 0, "Version code (auto-detected if not provided)")
	rootCmd.Flags().StringVarP(&config.VersionName, "version-name", "v", "", "Version name (auto-detected if not provided)")
	rootCmd.Flags().BoolVar(&config.Publish, "publish", false, "Publish immediately (default: save as draft)")

	rootCmd.MarkFlagRequired("bundle")
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}

func runUpload(cmd *cobra.Command, args []string) {
	fmt.Println("🚀 Starting Whagons App Bundle Upload...")

	// Validate bundle file exists
	if _, err := os.Stat(config.BundlePath); os.IsNotExist(err) {
		log.Fatalf("❌ Bundle file not found: %s", config.BundlePath)
	}

	// Auto-detect version info if not provided
	if config.VersionCode == 0 || config.VersionName == "" {
		detectVersionInfo()
	}

	// Create service
	service, err := createAndroidPublisherService()
	if err != nil {
		log.Fatalf("❌ Failed to create Android Publisher service: %v", err)
	}

	// Start edit session
	fmt.Println("📝 Starting edit session...")
	editId, err := startEdit(service)
	if err != nil {
		log.Fatalf("❌ Failed to start edit: %v", err)
	}

	fmt.Printf("✅ Edit session started with ID: %s\n", editId)

	// Upload bundle
	fmt.Println("📦 Uploading app bundle...")
	versionCode, err := uploadBundle(service, editId)
	if err != nil {
		log.Fatalf("❌ Failed to upload bundle: %v", err)
	}

	fmt.Printf("✅ Bundle uploaded successfully with version code: %d\n", versionCode)

	// Create release
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

	// Commit changes
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

func createAndroidPublisherService() (*androidpublisher.Service, error) {
	ctx := context.Background()

	// Read service account file
	serviceAccountJSON, err := os.ReadFile(config.ServiceAccountPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read service account file: %v", err)
	}

	// Create credentials
	credentials, err := google.CredentialsFromJSON(ctx, serviceAccountJSON, androidpublisher.AndroidpublisherScope)
	if err != nil {
		return nil, fmt.Errorf("failed to create credentials: %v", err)
	}

	// Create service
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
	// Open bundle file
	file, err := os.Open(config.BundlePath)
	if err != nil {
		return 0, fmt.Errorf("failed to open bundle file: %v", err)
	}
	defer file.Close()

	// Upload bundle with correct content type
	bundleResponse, err := service.Edits.Bundles.Upload(config.PackageName, editId).
		Media(file, googleapi.ContentType("application/octet-stream")).Do()
	if err != nil {
		return 0, fmt.Errorf("failed to upload bundle: %v", err)
	}

	return bundleResponse.VersionCode, nil
}

func createRelease(service *androidpublisher.Service, editId string, versionCode int64) error {
	// Get current track
	track, err := service.Edits.Tracks.Get(config.PackageName, editId, config.Track).Do()
	if err != nil {
		// If track doesn't exist, create a new one
		track = &androidpublisher.Track{
			Track: config.Track,
		}
	}

	// Create release notes if provided
	var releaseNotes []*androidpublisher.LocalizedText
	if config.ReleaseNotes != "" {
		releaseNotes = []*androidpublisher.LocalizedText{
			{
				Language: "en-US",
				Text:     config.ReleaseNotes,
			},
		}
	}

	// Determine release status based on publish flag
	status := "draft"
	if config.Publish {
		status = "completed"
	}

	// Create new release
	release := &androidpublisher.TrackRelease{
		Name:         config.VersionName,
		VersionCodes: []int64{versionCode},
		Status:       status,
		ReleaseNotes: releaseNotes,
	}

	// Add release to track
	track.Releases = []*androidpublisher.TrackRelease{release}

	// Update track
	_, err = service.Edits.Tracks.Update(config.PackageName, editId, config.Track, track).Do()
	if err != nil {
		return fmt.Errorf("failed to update track: %v", err)
	}

	return nil
}

func commitEdit(service *androidpublisher.Service, editId string) error {
	_, err := service.Edits.Commit(config.PackageName, editId).Do()
	return err
}

func detectVersionInfo() {
	fmt.Println("🔍 Auto-detecting version information...")

	// Try to read from version.txt
	if versionData, err := os.ReadFile("../version.txt"); err == nil {
		version := strings.TrimSpace(string(versionData))
		if config.VersionName == "" {
			config.VersionName = version
			fmt.Printf("📋 Detected version name: %s\n", config.VersionName)
		}
	}

	// Try to read from Android build.gradle
	if gradleData, err := os.ReadFile("../android/app/build.gradle"); err == nil {
		gradleContent := string(gradleData)

		// Extract version code
		if config.VersionCode == 0 {
			if versionCodeStr := extractFromGradle(gradleContent, "versionCode"); versionCodeStr != "" {
				if versionCode, err := strconv.ParseInt(versionCodeStr, 10, 64); err == nil {
					config.VersionCode = versionCode
					fmt.Printf("📋 Detected version code: %d\n", config.VersionCode)
				}
			}
		}

		// Extract version name if not already set
		if config.VersionName == "" {
			if versionName := extractFromGradle(gradleContent, "versionName"); versionName != "" {
				config.VersionName = strings.Trim(versionName, "'\"")
				fmt.Printf("📋 Detected version name from gradle: %s\n", config.VersionName)
			}
		}
	}

	// Set defaults if still not found
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
				// Remove common gradle syntax
				value = strings.TrimPrefix(value, "=")
				value = strings.TrimPrefix(value, ":")
				value = strings.TrimSpace(value)
				// Remove quotes and trailing semicolon
				value = strings.Trim(value, "'\"")
				value = strings.TrimSuffix(value, ";")
				return value
			}
		}
	}
	return ""
}
