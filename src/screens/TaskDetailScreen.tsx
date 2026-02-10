import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../context/ThemeContext';
import { useTasks } from '../context/TaskContext';
import { RootStackParamList, Comment, ChecklistItem } from '../models/types';
import { CustomChip } from '../components/CustomChip';
import { DetailRow } from '../components/DetailRow';
import { priorityColor, statusColor, getInitials } from '../utils/helpers';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';

type TaskDetailRouteProp = RouteProp<RootStackParamList, 'TaskDetail'>;

export const TaskDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<TaskDetailRouteProp>();
  const { task } = route.params;
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { setActiveTask, markTaskDone } = useTasks();
  const cardBorder = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E1D7';

  const [activeTab, setActiveTab] = useState<'details' | 'checklist' | 'comments'>('details');
  const [commentText, setCommentText] = useState('');
  const [attachedImages, setAttachedImages] = useState<string[]>([]);

  const [comments, setComments] = useState<Comment[]>([
    { author: 'Alex', time: '10 mins ago', text: 'Started working on this task' },
    { author: 'You', time: '5 mins ago', text: 'Please update when complete' },
  ]);

  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([
    { title: 'Inspect equipment', completed: true },
    { title: 'Take photos', completed: true },
    { title: 'Update log', completed: false },
    { title: 'Notify supervisor', completed: false },
  ]);

  const handleStartWorking = () => {
    setActiveTask(task);
    navigation.goBack();
    Alert.alert('Started', `Now working on "${task.title}"`);
  };

  const handleMarkDone = () => {
    markTaskDone(task.id || '');
    navigation.goBack();
    Alert.alert('Done', 'Task marked as done');
  };

  const handleAddComment = () => {
    if (commentText.trim()) {
      setComments(prev => [...prev, { author: 'You', time: 'Just now', text: commentText.trim() }]);
      setCommentText('');
    }
  };

  const handleToggleChecklistItem = (index: number) => {
    setChecklistItems(prev => {
      const newItems = [...prev];
      newItems[index] = { ...newItems[index], completed: !newItems[index].completed };
      return newItems;
    });
  };

  const handleAddChecklistItem = () => {
    setChecklistItems(prev => [
      ...prev,
      { title: `New item ${prev.length + 1}`, completed: false },
    ]);
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

  const renderDetailsTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
      <Text style={[styles.taskTitle, { color: colors.text }]}>{task.title}</Text>

      <View style={styles.statusRow}>
        <CustomChip label={task.status} color={statusColor(task.status)} />
        <View style={{ width: 8 }} />
        <CustomChip label={task.priority} color={priorityColor(task.priority)} />
      </View>

      {/* Details Card */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: cardBorder }]}
      >
        <DetailRow icon="location-on" label="Location" value={task.spot} />
        <View style={styles.divider} />
        <DetailRow icon="schedule" label="Created" value={task.createdAt} />
        {task.approval && (
          <>
            <View style={styles.divider} />
            <DetailRow icon="approval" label="Approval" value={task.approval} />
          </>
        )}
        {task.sla && (
          <>
            <View style={styles.divider} />
            <DetailRow icon="timer" label="SLA" value={task.sla} />
          </>
        )}
      </View>

      {/* Assignees Card */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: cardBorder }]}
      >
        <View style={styles.cardHeader}>
          <MaterialIcons name="people-outline" size={20} color={colors.textSecondary} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>Assignees</Text>
        </View>
        <View style={styles.chipsRow}>
          {task.assignees.map((name, index) => (
            <View key={index} style={styles.assigneeChip}>
              <View style={styles.assigneeAvatar}>
                <Text style={styles.assigneeInitial}>{getInitials(name)}</Text>
              </View>
              <Text style={[styles.assigneeName, { color: colors.text }]}>{name}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Tags Card */}
        {task.tags.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: cardBorder }]}
        >
          <View style={styles.cardHeader}>
            <MaterialIcons name="label-outline" size={20} color={colors.textSecondary} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Tags</Text>
          </View>
          <View style={styles.chipsRow}>
            {task.tags.map((tag, index) => (
              <View key={index} style={{ marginRight: 6, marginBottom: 6 }}>
                <CustomChip label={tag} color="#F5F5F5" textColor="#212121" />
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Attachments Card */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: cardBorder }]}
      >
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="photo-library" size={20} color={colors.textSecondary} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Attachments</Text>
            {attachedImages.length > 0 && (
              <View style={[styles.attachmentCount, { backgroundColor: `${primaryColor}1A` }]}
              >
                <Text style={[styles.attachmentCountText, { color: primaryColor }]}>
                  {attachedImages.length}
                </Text>
              </View>
            )}
          </View>
          <TouchableOpacity onPress={showImageOptions}>
            <MaterialIcons name="add-photo-alternate" size={24} color={primaryColor} />
          </TouchableOpacity>
        </View>

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
          <View style={styles.imagesGrid}>
            {attachedImages.map((uri, index) => (
              <TouchableOpacity key={index} style={styles.imageContainer}>
                <Image source={{ uri }} style={styles.attachedImage} />
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => setAttachedImages(prev => prev.filter((_, i) => i !== index))}
                >
                  <MaterialIcons name="close" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Timestamps Card */}
      <View style={[styles.card, styles.timestampsCard, { borderColor: cardBorder, backgroundColor: isDarkMode ? 'rgba(31, 36, 34, 0.6)' : 'rgba(255, 255, 255, 0.6)' }]}
      >
        <View style={styles.timestampRow}>
          <MaterialIcons name="schedule" size={16} color={colors.textSecondary} />
          <Text style={[styles.timestampLabel, { color: colors.textSecondary }]}>Created:</Text>
          <Text style={[styles.timestampValue, { color: colors.text }]}>{task.createdAt}</Text>
        </View>
        <View style={[styles.timestampRow, { marginTop: 8 }]}> 
          <MaterialIcons name="update" size={16} color={colors.textSecondary} />
          <Text style={[styles.timestampLabel, { color: colors.textSecondary }]}>Last updated:</Text>
          <Text style={[styles.timestampValue, { color: colors.text }]}>{task.createdAt}</Text>
        </View>
      </View>
    </ScrollView>
  );

  const renderChecklistTab = () => (
    <View style={styles.tabContent}>
      <ScrollView style={styles.flex}>
        {checklistItems.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.checklistItem, { backgroundColor: colors.surface, borderColor: cardBorder }]}
            onPress={() => handleToggleChecklistItem(index)}
          >
            <MaterialIcons
              name={item.completed ? 'check-box' : 'check-box-outline-blank'}
              size={24}
              color={item.completed ? primaryColor : '#757575'}
            />
            <Text
              style={[
                styles.checklistText,
                { color: colors.text },
                item.completed && styles.checklistTextCompleted,
              ]}
            >
              {item.title}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.bottomAction}>
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: cardBorder },
          ]}
        />
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: primaryColor }]}
          onPress={handleAddChecklistItem}
        >
          <MaterialIcons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.actionButtonText}>Add Item</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderCommentsTab = () => (
    <View style={styles.tabContent}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.commentsList}>
        {comments.map((comment, index) => {
          const isYou = comment.author === 'You';
          return (
            <View key={index} style={styles.commentItem}>
              <View style={[styles.commentAvatar, isYou && { backgroundColor: primaryColor }]}>
                <Text style={styles.commentAvatarText}>{getInitials(comment.author)}</Text>
              </View>
              <View style={styles.commentContent}>
                <View style={styles.commentHeader}>
                  <Text style={[styles.commentAuthor, { color: colors.text }]}>{comment.author}</Text>
                  <Text style={[styles.commentTime, { color: colors.textSecondary }]}>{comment.time}</Text>
                </View>
                <View style={[styles.commentBubble, { backgroundColor: isDarkMode ? 'rgba(31, 36, 34, 0.7)' : '#FFFFFF' }]}>
                  <Text style={[styles.commentText, { color: colors.text }]}>{comment.text}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.commentInputContainer, { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: cardBorder }]}>
        <TextInput
          style={[
            styles.commentInput,
            {
              backgroundColor: isDarkMode ? 'rgba(31, 36, 34, 0.7)' : '#F3EEE4',
              color: colors.text,
            },
          ]}
          placeholder="Add a comment..."
          placeholderTextColor={colors.textSecondary}
          value={commentText}
          onChangeText={setCommentText}
          onSubmitEditing={handleAddComment}
        />
        <TouchableOpacity
          style={[styles.sendButton, { backgroundColor: primaryColor }]}
          onPress={handleAddComment}
        >
          <MaterialIcons name="send" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Task Details</Text>
        <TouchableOpacity>
          <MaterialIcons name="more-vert" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {(['details', 'checklist', 'comments'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && { borderBottomColor: primaryColor }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && { color: primaryColor },
              ]}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      {activeTab === 'details' && renderDetailsTab()}
      {activeTab === 'checklist' && renderChecklistTab()}
      {activeTab === 'comments' && renderCommentsTab()}

      {/* Action Buttons - Only show in details tab */}
      {activeTab === 'details' && (
        <View
          style={[
            styles.actionButtonsContainer,
            { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: cardBorder },
          ]}
        >
          <TouchableOpacity
            style={[styles.actionButton, styles.startButton, { backgroundColor: primaryColor }]}
            onPress={handleStartWorking}
          >
            <MaterialIcons name="play-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>Start Working</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.doneButton]}
            onPress={handleMarkDone}
          >
            <MaterialIcons name="check-circle-outline" size={20} color="#43A047" />
            <Text style={[styles.actionButtonText, { color: '#43A047' }]}>Mark Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
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
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E6E1D7',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    color: '#7A817C',
  },
  tabContent: {
    flex: 1,
  },
  tabContentContainer: {
    padding: spacing.md,
  },
  taskTitle: {
    fontSize: fontSizes.xl,
    fontFamily: fontFamilies.displaySemibold,
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  card: {
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    ...shadows.subtle,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    marginLeft: 8,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
    color: '#1E2321',
  },
  divider: {
    height: 1,
    backgroundColor: '#E6E1D7',
    marginVertical: 12,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  assigneeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3EEE4',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 8,
  },
  assigneeAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  assigneeInitial: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyBold,
    color: '#1E2321',
  },
  assigneeName: {
    marginLeft: 8,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    color: '#1E2321',
  },
  attachmentCount: {
    marginLeft: 8,
    backgroundColor: 'rgba(20, 183, 163, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  attachmentCountText: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
    color: '#C77B43',
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
  imagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
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
  timestampsCard: {
    borderWidth: 1,
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timestampLabel: {
    marginLeft: 8,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
  },
  timestampValue: {
    marginLeft: 4,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'transparent',
    ...shadows.subtle,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  startButton: {
    marginRight: 12,
  },
  doneButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#43A047',
  },
  actionButtonText: {
    marginLeft: 8,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
    color: '#FFFFFF',
  },
  bottomAction: {
    padding: 16,
    backgroundColor: 'transparent',
    position: 'relative',
    ...shadows.subtle,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  checklistText: {
    marginLeft: 12,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyMedium,
    color: '#1E2321',
  },
  checklistTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#757575',
  },
  commentsList: {
    padding: 16,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#BDBDBD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentAvatarText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
    color: '#FFFFFF',
  },
  commentContent: {
    flex: 1,
    marginLeft: 12,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  commentAuthor: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
    color: '#1E2321',
  },
  commentTime: {
    marginLeft: 8,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
    color: '#8B8E84',
  },
  commentBubble: {
    marginTop: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: 12,
  },
  commentText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    color: '#1E2321',
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'transparent',
    ...shadows.subtle,
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#F3EEE4',
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    color: '#1E2321',
  },
  sendButton: {
    marginLeft: 8,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
