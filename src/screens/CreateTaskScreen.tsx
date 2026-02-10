import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../context/ThemeContext';
import { useTasks } from '../context/TaskContext';
import { TaskItem } from '../models/types';
import { priorityColor } from '../utils/helpers';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';

const priorities = ['Low', 'Medium', 'High'] as const;

export const CreateTaskScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { addTask } = useTasks();

  const [title, setTitle] = useState('');
  const [spot, setSpot] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [assigneeInput, setAssigneeInput] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);

  const handleCreateTask = () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a task title');
      return;
    }

    const newTask: TaskItem = {
      id: String(Date.now()),
      title: title.trim(),
      spot: spot.trim() || 'Unassigned',
      priority: selectedPriority,
      status: 'Open',
      assignees: assignees.length > 0 ? assignees : ['Unassigned'],
      createdAt: 'Just now',
      tags,
      approval: null,
      sla: null,
    };

    addTask(newTask);
    Alert.alert('Success', 'Task created successfully');
    navigation.goBack();
  };

  const handleAddAssignee = () => {
    if (assigneeInput.trim()) {
      setAssignees(prev => [...prev, assigneeInput.trim()]);
      setAssigneeInput('');
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim()) {
      setTags(prev => [...prev, tagInput.trim()]);
      setTagInput('');
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]) {
      setAttachedImages(prev => [...prev, result.assets[0].uri]);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission required', 'Camera permission is required to take photos');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]) {
      setAttachedImages(prev => [...prev, result.assets[0].uri]);
    }
  };

  const showImageOptions = () => {
    Alert.alert('Add Photo', 'Choose an option', [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Gallery', onPress: pickImage },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Create Task</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Title */}
        <Text style={[styles.label, { color: colors.text }]}>Task Title</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E1D7' }]}
          placeholder="Enter task title"
          placeholderTextColor={colors.textSecondary}
          value={title}
          onChangeText={setTitle}
        />

        {/* Location */}
        <Text style={[styles.label, { color: colors.text }]}>Location</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E1D7' }]}
          placeholder="Enter location"
          placeholderTextColor={colors.textSecondary}
          value={spot}
          onChangeText={setSpot}
        />

        {/* Assignees */}
        <Text style={[styles.label, { color: colors.text }]}>Assignees</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, styles.inputFlex, { backgroundColor: colors.surface, color: colors.text, borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E1D7' }]}
            placeholder="Add an assignee"
            placeholderTextColor={colors.textSecondary}
            value={assigneeInput}
            onChangeText={setAssigneeInput}
            onSubmitEditing={handleAddAssignee}
          />
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: primaryColor }]}
            onPress={handleAddAssignee}
          >
            <MaterialIcons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        {assignees.length > 0 && (
          <View style={styles.chipsContainer}>
            {assignees.map((assignee, index) => (
              <View key={index} style={styles.chip}>
                <Text style={styles.chipText}>{assignee}</Text>
                <TouchableOpacity
                  onPress={() => setAssignees(prev => prev.filter((_, i) => i !== index))}
                >
                  <MaterialIcons name="close" size={18} color="#757575" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Priority */}
        <Text style={[styles.label, { color: colors.text }]}>Priority</Text>
        <TouchableOpacity
          style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E1D7' }]}
          onPress={() => setShowPriorityDropdown(!showPriorityDropdown)}
        >
          <View style={styles.priorityRow}>
            <View style={[styles.priorityDot, { backgroundColor: priorityColor(selectedPriority) }]} />
            <Text style={styles.dropdownText}>{selectedPriority}</Text>
          </View>
          <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        {showPriorityDropdown && (
          <View style={[styles.dropdownMenu, { backgroundColor: colors.surface, borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E1D7' }]}
          >
            {priorities.map(priority => (
              <TouchableOpacity
                key={priority}
                style={styles.dropdownItem}
                onPress={() => {
                  setSelectedPriority(priority);
                  setShowPriorityDropdown(false);
                }}
              >
                <View style={[styles.priorityDot, { backgroundColor: priorityColor(priority) }]} />
                <Text style={[styles.dropdownItemText, { color: colors.text }]}>{priority}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Tags */}
        <Text style={[styles.label, { color: colors.text }]}>Tags</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, styles.inputFlex, { backgroundColor: colors.surface, color: colors.text, borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E1D7' }]}
            placeholder="Add a tag"
            placeholderTextColor={colors.textSecondary}
            value={tagInput}
            onChangeText={setTagInput}
            onSubmitEditing={handleAddTag}
          />
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: primaryColor }]}
            onPress={handleAddTag}
          >
            <MaterialIcons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        {tags.length > 0 && (
          <View style={styles.chipsContainer}>
            {tags.map((tag, index) => (
              <View key={index} style={styles.chip}>
                <Text style={styles.chipText}>{tag}</Text>
                <TouchableOpacity
                  onPress={() => setTags(prev => prev.filter((_, i) => i !== index))}
                >
                  <MaterialIcons name="close" size={18} color="#757575" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Attachments */}
        <Text style={[styles.label, { color: colors.text }]}>Attachments</Text>
        <View style={[styles.attachmentsCard, { backgroundColor: colors.surface, borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E1D7' }]}
        >
          {attachedImages.length === 0 ? (
            <View style={styles.emptyAttachments}>
              <MaterialIcons name="add-a-photo" size={48} color="#E0E0E0" />
              <Text style={styles.emptyText}>No attachments yet</Text>
              <TouchableOpacity style={[styles.addPhotoButton, { borderColor: primaryColor }]} onPress={showImageOptions}>
                <MaterialIcons name="add" size={20} color={primaryColor} />
                <Text style={[styles.addPhotoText, { color: primaryColor }]}>Add Photo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.attachmentsHeader}>
                <View style={styles.attachmentsHeaderLeft}>
                  <MaterialIcons name="photo-library" size={20} color={colors.textSecondary} />
                  <Text style={[styles.attachmentsCount, { color: colors.text }]}>
                    {attachedImages.length} photo{attachedImages.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={showImageOptions}>
                  <MaterialIcons name="add-photo-alternate" size={24} color={primaryColor} />
                </TouchableOpacity>
              </View>
              <View style={styles.imagesGrid}>
                {attachedImages.map((uri, index) => (
                  <View key={index} style={styles.imageContainer}>
                    <Image source={{ uri }} style={styles.attachedImage} />
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => setAttachedImages(prev => prev.filter((_, i) => i !== index))}
                    >
                      <MaterialIcons name="close" size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* Create Button */}
      <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E1D7' }]}
      >
        <TouchableOpacity
          style={[styles.createButton, { backgroundColor: primaryColor }]}
          onPress={handleCreateTask}
        >
          <MaterialIcons name="add-task" size={20} color="#FFFFFF" />
          <Text style={styles.createButtonText}>Create Task</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
  },
  label: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
    marginBottom: 8,
    marginTop: 20,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: fontSizes.md,
    color: '#1E2321',
    fontFamily: fontFamilies.bodyMedium,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputFlex: {
    flex: 1,
    marginRight: 8,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3EEE4',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6,
    marginBottom: 6,
  },
  chipText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    color: '#1E2321',
    marginRight: 4,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  priorityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priorityDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  dropdownText: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyMedium,
    color: '#1E2321',
  },
  dropdownMenu: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: 4,
    ...shadows.subtle,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownItemText: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyMedium,
    color: '#1E2321',
  },
  attachmentsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 16,
  },
  emptyAttachments: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  emptyText: {
    marginTop: 8,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    color: '#8B8E84',
  },
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#14B7A3',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addPhotoText: {
    marginLeft: 4,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  attachmentsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  attachmentsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  attachmentsCount: {
    marginLeft: 8,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
    color: '#1E2321',
  },
  imagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  imageContainer: {
    width: '31%',
    aspectRatio: 1,
    marginRight: '2%',
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  attachedImage: {
    width: '100%',
    height: '100%',
  },
  removeImageButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#F44336',
    borderRadius: 12,
    padding: 4,
  },
  footer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    ...shadows.subtle,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: radius.md,
  },
  createButtonText: {
    marginLeft: 8,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
    color: '#FFFFFF',
  },
});
