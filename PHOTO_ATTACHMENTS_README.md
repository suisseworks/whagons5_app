# Photo Attachments Feature

## Overview
The mobile app now includes photo attachment capabilities for tasks. Users can take photos with their camera or select images from their gallery to attach to tasks.

## What's Been Added

### 1. Dependencies
- **image_picker** (v1.1.2): Package for selecting images from gallery or taking photos with camera

### 2. Permissions
Configured platform-specific permissions:

#### iOS (Info.plist)
- `NSCameraUsageDescription`: Camera access for taking photos
- `NSPhotoLibraryUsageDescription`: Photo library access for selecting images
- `NSPhotoLibraryAddUsageDescription`: Saving photos to library

#### Android (AndroidManifest.xml)
- `CAMERA`: Camera access
- `READ_EXTERNAL_STORAGE`: Read photos from gallery
- `WRITE_EXTERNAL_STORAGE`: Write photos (Android 12 and below)

### 3. UI Features

#### Create Task Screen - Attachments Section
Located at the bottom of the create task form:

**When No Attachments:**
- Shows empty state with camera icon
- "No attachments yet" message
- "Add Photo" outlined button

**When Attachments Exist:**
- Shows count of attached photos
- Grid view (3 columns) displaying thumbnail images
- Remove button (X) on each thumbnail
- Tap thumbnail to view full-screen image
- "+" icon button to add more photos

#### Task Details Screen - Attachments Section
Located in the "Details" tab of the task view:

**When No Attachments:**
- Shows empty state with camera icon
- "No attachments yet" message
- "Add Photo" button

**When Attachments Exist:**
- Grid view (3 columns) displaying thumbnail images
- Badge showing number of attachments
- Remove button (X) on each thumbnail
- Tap thumbnail to view full-screen image
- "+" button in header to add more photos

#### Add Photo Options
Bottom sheet modal with three options (available in both screens):
1. **Take Photo** - Opens camera
2. **Choose from Gallery** - Opens photo picker
3. **Cancel** - Closes modal

### 4. Functionality

- **Add Photos**: Tap the "+" icon or "Add Photo" button
- **View Photos**: Tap any thumbnail to view full-screen
- **Remove Photos**: Tap the red "X" button on thumbnails
- **Image Optimization**: Photos are automatically compressed (max 1920x1080, 85% quality)

## Testing

### To Test on Simulator/Emulator:

**Testing Create Task:**
1. Run `flutter pub get` to install dependencies
2. Launch the app on iOS Simulator or Android Emulator
3. Tap the floating "+" button to create a new task
4. Scroll down to the "Attachments" section
5. Tap "Add Photo" button
6. Select "Choose from Gallery" (camera may not work on simulator)
7. Select an image from your device gallery
8. Add multiple images if desired
9. Complete the task creation

**Testing Task Details:**
1. Tap on any existing task to view details
2. Scroll to the "Attachments" section
3. Tap the "+" icon
4. Select "Choose from Gallery"
5. Select an image from your device gallery

### To Test on Physical Device:
1. Connect your device
2. Run the app
3. Test both "Take Photo" and "Choose from Gallery" options in:
   - Create Task screen
   - Task Details screen

## Current Implementation Status

This is a **mockup/UI implementation** with the following characteristics:

✅ **Implemented:**
- Full UI for adding, viewing, and removing images
- Camera and gallery picker integration
- Image display in grid format
- Full-screen image viewer
- Permission handling

⚠️ **Not Yet Implemented (Backend Integration):**
- Uploading images to server
- Fetching existing attachments from API
- Persisting attachments across app sessions
- Integration with `/api/task-attachments` endpoint

## Next Steps for Full Implementation

To connect this to your backend API:

1. **Extend ApiClient** (`lib/services/api_client.dart`):
   ```dart
   Future<Map<String, dynamic>> uploadTaskAttachment({
     required int taskId,
     required File imageFile,
   }) async {
     var request = http.MultipartRequest(
       'POST',
       Uri.parse('$baseUrl/api/task-attachments'),
     );
     request.files.add(await http.MultipartFile.fromPath('file', imageFile.path));
     request.fields['task_id'] = taskId.toString();
     request.fields['type'] = 'IMAGE';
     // Add other required fields
     var response = await request.send();
     // Handle response
   }
   ```

2. **Extend Task Model** to include attachments array

3. **Update State Management** to persist attachments

4. **Fetch Attachments** when loading task details

## UI Design

**Create Task Screen:**
- Attachments section appears at the bottom of the form (after Tags)
- White card with rounded corners
- Outlined button style for "Add Photo" in empty state
- Photo count display when images are attached

**Task Details Screen:**
- Attachments section appears between Tags and Action Buttons
- Clean white card design matching the app theme
- Badge with count in header when images exist
- Responsive grid layout for multiple images
- Teal accent color (#14B7A3) for interactive elements
- Smooth animations and transitions
