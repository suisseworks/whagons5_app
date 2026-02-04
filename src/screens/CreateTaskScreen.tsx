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

const priorities = ['Low', 'Medium', 'High'] as const;

export const CreateTaskScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors, primaryColor } = useTheme();
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
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Create Task</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Title */}
        <Text style={styles.label}>Task Title</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter task title"
          placeholderTextColor="#9E9E9E"
          value={title}
          onChangeText={setTitle}
        />

        {/* Location */}
        <Text style={styles.label}>Location</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter location"
          placeholderTextColor="#9E9E9E"
          value={spot}
          onChangeText={setSpot}
        />

        {/* Assignees */}
        <Text style={styles.label}>Assignees</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, styles.inputFlex]}
            placeholder="Add an assignee"
            placeholderTextColor="#9E9E9E"
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
        <Text style={styles.label}>Priority</Text>
        <TouchableOpacity
          style={styles.dropdown}
          onPress={() => setShowPriorityDropdown(!showPriorityDropdown)}
        >
          <View style={styles.priorityRow}>
            <View style={[styles.priorityDot, { backgroundColor: priorityColor(selectedPriority) }]} />
            <Text style={styles.dropdownText}>{selectedPriority}</Text>
          </View>
          <MaterialIcons name="keyboard-arrow-down" size={24} color="#757575" />
        </TouchableOpacity>
        {showPriorityDropdown && (
          <View style={styles.dropdownMenu}>
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
                <Text style={styles.dropdownItemText}>{priority}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Tags */}
        <Text style={styles.label}>Tags</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, styles.inputFlex]}
            placeholder="Add a tag"
            placeholderTextColor="#9E9E9E"
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
        <Text style={styles.label}>Attachments</Text>
        <View style={styles.attachmentsCard}>
          {attachedImages.length === 0 ? (
            <View style={styles.emptyAttachments}>
              <MaterialIcons name="add-a-photo" size={48} color="#E0E0E0" />
              <Text style={styles.emptyText}>No attachments yet</Text>
              <TouchableOpacity style={styles.addPhotoButton} onPress={showImageOptions}>
                <MaterialIcons name="add" size={20} color={primaryColor} />
                <Text style={[styles.addPhotoText, { color: primaryColor }]}>Add Photo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.attachmentsHeader}>
                <View style={styles.attachmentsHeaderLeft}>
                  <MaterialIcons name="photo-library" size={20} color="#616161" />
                  <Text style={styles.attachmentsCount}>
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
      <View style={styles.footer}>
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
    fontSize: 18,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 8,
    marginTop: 20,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#212121',
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
    borderRadius: 12,
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
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6,
    marginBottom: 6,
  },
  chipText: {
    fontSize: 14,
    color: '#212121',
    marginRight: 4,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
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
    fontSize: 16,
    color: '#212121',
  },
  dropdownMenu: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#212121',
  },
  attachmentsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
  },
  emptyAttachments: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    color: '#9E9E9E',
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
    fontSize: 14,
    fontWeight: '500',
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
    fontSize: 14,
    fontWeight: '500',
    color: '#212121',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 5,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
  },
  createButtonText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
