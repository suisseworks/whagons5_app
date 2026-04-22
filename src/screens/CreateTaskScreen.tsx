import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useTasks } from '../context/TaskContext';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../hooks/useTenant';
import { useConvexUpload, ConvexAttachment } from '../hooks/useConvexUpload';
import { AttachmentPickerSheet } from '../components/AttachmentPickerSheet';
import { FaIcon } from '../components/FaIcon';
import { UserPickerSheet, type UserPickerItem } from '../components/UserPickerSheet';
import { Toast, ToastRef } from '../components/Toast';
import { parseWorkspaceIcon } from '../utils/helpers';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';
import { GPS_CAPTURE_STORAGE_KEY } from './SettingsScreen';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SelectedEntity {
  _id: string;
  name: string;
  color?: string | null;
}

interface AttachmentItem {
  id: string; // local unique id
  fileName: string;
  fileSize: number;
  fileType: string;
  uri?: string; // local URI before upload
  storageId?: string; // set after successful upload
  status: 'uploading' | 'done' | 'error';
}

const MAX_ATTACHMENTS = 10;
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

// ---------------------------------------------------------------------------
// Reusable bottom-sheet selector modal (kept for workspace picker)
// ---------------------------------------------------------------------------
interface SelectorModalProps {
  visible: boolean;
  title: string;
  items: { _id: string; name: string; color?: string | null; subtitle?: string }[];
  selectedId?: string | null;
  onSelect: (item: { _id: string; name: string; color?: string | null }) => void;
  onClose: () => void;
  searchable?: boolean;
  multiSelect?: boolean;
  selectedIds?: Set<string>;
  colors: any;
  isDarkMode: boolean;
  primaryColor: string;
}

const SelectorModal: React.FC<SelectorModalProps> = ({
  visible, title, items, selectedId, onSelect, onClose,
  searchable = false, multiSelect = false, selectedIds,
  colors, isDarkMode, primaryColor,
}) => {
  const [search, setSearch] = useState('');
  const insets = useSafeAreaInsets();

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={modalStyles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.bottom}
      >
        <TouchableOpacity style={modalStyles.overlay} activeOpacity={1} onPress={onClose}>
          <View
            style={[
              modalStyles.sheet,
              {
                backgroundColor: colors.surface,
                borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7',
                paddingBottom: Math.max(20, insets.bottom + 12),
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={modalStyles.handle} />
            <Text style={[modalStyles.title, { color: colors.text }]}>{title}</Text>

            {searchable && (
              <TextInput
                style={[
                  modalStyles.searchInput,
                  { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F7F4EF', color: colors.text, borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7' },
                ]}
                placeholder="Search..."
                placeholderTextColor={isDarkMode ? 'rgba(255,255,255,0.3)' : '#A8A299'}
                value={search}
                onChangeText={setSearch}
                autoFocus
              />
            )}

            <FlatList
              data={filtered}
              keyExtractor={(item) => String(item._id)}
              style={modalStyles.list}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSelected = multiSelect
                  ? selectedIds?.has(item._id)
                  : item._id === selectedId;
                return (
                  <TouchableOpacity
                    style={[
                      modalStyles.item,
                      { borderColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F0EBE1' },
                      isSelected && { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F7F4EF' },
                    ]}
                    onPress={() => onSelect(item)}
                    activeOpacity={0.7}
                  >
                    {item.color && (
                      <View style={[modalStyles.dot, { backgroundColor: item.color }]} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[modalStyles.itemText, { color: colors.text }, isSelected && { fontFamily: fontFamilies.bodySemibold }]}> 
                        {item.name}
                      </Text>
                    </View>
                    {isSelected && <MaterialIcons name="check" size={20} color={primaryColor} />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={[modalStyles.emptyText, { color: colors.textSecondary }]}>No items found</Text>
              }
            />
          </View>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Helper: format file size
// ---------------------------------------------------------------------------
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Helper: get icon for file type
function getFileIcon(fileType: string): string {
  if (fileType.startsWith('image/')) return 'image';
  if (fileType.startsWith('video/')) return 'videocam';
  if (fileType.includes('pdf')) return 'picture-as-pdf';
  if (fileType.includes('word') || fileType.includes('doc')) return 'description';
  if (fileType.includes('sheet') || fileType.includes('xls')) return 'table-chart';
  return 'insert-drive-file';
}

// ---------------------------------------------------------------------------
// CreateTaskScreen
// ---------------------------------------------------------------------------
export const CreateTaskScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { createTask, selectedWorkspace, workspaceObjects, statuses } = useTasks();
  const { data, userTeams } = useData();
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const { t } = useLanguage();
  const { pickImages, takePhoto, pickDocuments, uploadFile } = useConvexUpload();
  const createDocumentMutation = useMutation(api.documents.create);
  const createDocumentAssociationMutation = useMutation(api.documents.createAssociation);
  const addTagByPgIdMutation = useMutation(api.taskResources.addTagByPgId);
  const addTagByTaskPgIdMutation = useMutation(api.taskResources.addTagByTaskPgId);

  const titleInputRef = useRef<TextInput>(null);
  const toastRef = useRef<ToastRef>(null);

  // Form state
  const [chosenWorkspaceId, setChosenWorkspaceId] = useState<string | null>(null);
  const [taskName, setTaskName] = useState('');
  const [description, setDescription] = useState('');
  const [showDescription, setShowDescription] = useState(false);
  const [selectedPriorityConvexId, setSelectedPriorityConvexId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [imageViewerUri, setImageViewerUri] = useState<string | null>(null);
  const [photoPickerVisible, setPhotoPickerVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Template state
  const [selectedTemplate, setSelectedTemplate] = useState<{ _id: string; name: string } | null>(null);
  const [templateModalVisible, setTemplateModalVisible] = useState(false);

  // Assignee, spot, tag state
  const [selectedAssignees, setSelectedAssignees] = useState<SelectedEntity[]>([]);
  const [selectedSpot, setSelectedSpot] = useState<SelectedEntity | null>(null);
  const [selectedTags, setSelectedTags] = useState<SelectedEntity[]>([]);
  const [assigneeModalVisible, setAssigneeModalVisible] = useState(false);
  const [spotModalVisible, setSpotModalVisible] = useState(false);
  const [tagModalVisible, setTagModalVisible] = useState(false);

  // GPS capture
  const [capturedLocation, setCapturedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'done' | 'off' | 'denied'>('idle');

  // Modal visibility
  const [workspaceModalVisible, setWorkspaceModalVisible] = useState(
    selectedWorkspace === 'Everything'
  );

  // Capture GPS on mount (if setting is enabled)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const enabled = await AsyncStorage.getItem(GPS_CAPTURE_STORAGE_KEY);
      if (enabled === 'false') {
        setGpsStatus('off');
        return;
      }
      setGpsStatus('loading');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!cancelled) setGpsStatus('denied');
        return;
      }
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setCapturedLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          setGpsStatus('done');
        }
      } catch {
        if (!cancelled) setGpsStatus('denied');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // GPS icon animations
  const gpsOpacityAnim = useRef(new Animated.Value(1)).current;
  const gpsScaleAnim = useRef(new Animated.Value(1)).current;
  const blinkLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (gpsStatus === 'loading') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(gpsOpacityAnim, { toValue: 0.2, duration: 600, useNativeDriver: true }),
          Animated.timing(gpsOpacityAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      );
      blinkLoopRef.current = loop;
      loop.start();
      return () => loop.stop();
    }
    if (gpsStatus === 'done') {
      blinkLoopRef.current?.stop();
      gpsOpacityAnim.setValue(1);
      // Pop bounce to draw attention to the green icon
      gpsScaleAnim.setValue(0.5);
      Animated.spring(gpsScaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [gpsStatus, gpsOpacityAnim, gpsScaleAnim]);

  // ---------------------------------------------------------------------------
  // Resolve current workspace
  // ---------------------------------------------------------------------------
  const currentWorkspace = useMemo(() => {
    if (chosenWorkspaceId) {
      return data.workspaces.find((w: any) => w._id === chosenWorkspaceId) as any;
    }
    if (selectedWorkspace === 'Everything' || selectedWorkspace === 'Shared') {
      return null;
    }
    return data.workspaces.find((w: any) => w.name === selectedWorkspace) as any;
  }, [selectedWorkspace, data.workspaces, chosenWorkspaceId]);

  const workspaceConvexId = currentWorkspace?._id ?? null;
  const workspaceColor = currentWorkspace?.color ?? primaryColor;

  // ---------------------------------------------------------------------------
  // User team IDs for reporting-team checks
  // ---------------------------------------------------------------------------
  const userTeamIds = useMemo(() => {
    if (!user?.id || !userTeams) return [];
    return (userTeams as any[])
      .filter((ut: any) => {
        const utUserId = ut.user_id ?? ut.userId;
        return utUserId != null && String(utUserId) === String(user.id);
      })
      .map((ut: any) => String(ut.team_id ?? ut.teamId))
      .filter(Boolean);
  }, [user, userTeams]);

  // ---------------------------------------------------------------------------
  // Resolve categories & initial status
  // ---------------------------------------------------------------------------
  const workspaceCategories = useMemo(() => {
    if (!currentWorkspace) return [];
    const own = data.categories.filter((c: any) => c._id === currentWorkspace.categoryId || c.workspaceId === currentWorkspace._id);
    // Also include categories from other workspaces where user's team is a reporting team
    const ownIds = new Set(own.map((c: any) => String(c._id)));
    const reporting = data.categories.filter((c: any) => {
      if (ownIds.has(String(c._id))) return false;
      let rtIds = c.reportingTeamIds ?? c.reporting_team_ids;
      if (!rtIds) return false;
      if (typeof rtIds === 'string') {
        try { rtIds = JSON.parse(rtIds); } catch { return false; }
      }
      if (!Array.isArray(rtIds)) return false;
      return rtIds.some((rtId: any) => userTeamIds.some((utId: any) => String(rtId) === String(utId)));
    });
    return [...own, ...reporting];
  }, [currentWorkspace, data.categories, userTeamIds]);

  const workspaceCategoryIds = useMemo(() => {
    return new Set(workspaceCategories.map((c: any) => c._id));
  }, [workspaceCategories]);

  const workspaceCategoryPgIds = useMemo(() => {
    return new Set(workspaceCategories.map((c: any) => String(c.id)));
  }, [workspaceCategories]);

  // Templates for the current workspace's category
  const categoryTemplates = useMemo(() => {
    if (workspaceCategoryIds.size === 0) return [];
    return data.templates.filter((tmpl: any) =>
      tmpl.categoryId && workspaceCategoryIds.has(tmpl.categoryId) && !tmpl.deletedAt && tmpl.enabled !== false
    );
  }, [data.templates, workspaceCategoryIds]);

  const hasTemplates = categoryTemplates.length > 0;

  // Auto-focus title on mount (only when no templates)
  useEffect(() => {
    if (hasTemplates) return;
    const timer = setTimeout(() => titleInputRef.current?.focus(), 400);
    return () => clearTimeout(timer);
  }, [hasTemplates]);

  // Reset selected template when workspace/category changes
  useEffect(() => {
    setSelectedTemplate(null);
  }, [workspaceConvexId]);

  const initialStatusConvexId = useMemo(() => {
    if (workspaceCategoryIds.size > 0) {
      const s = data.statuses.find((s: any) => s.initial && workspaceCategoryIds.has(s.categoryId));
      if (s) return (s as any)._id;
    }
    const s = data.statuses.find((s: any) => s.initial);
    return s ? (s as any)._id : null;
  }, [data.statuses, workspaceCategoryIds]);

  // ---------------------------------------------------------------------------
  // Build priority options from backend data instead of app-level defaults.
  // ---------------------------------------------------------------------------
  const priorityOptions = useMemo(() => {
    const scopedPriorities = data.priorities.filter((priority: any) => {
      if (workspaceCategoryIds.size === 0 && workspaceCategoryPgIds.size === 0) return true;

      const priorityCategoryConvexId = priority.categoryId != null ? String(priority.categoryId) : null;
      const priorityCategoryPgId = priority.category_id != null ? String(priority.category_id) : null;

      if (!priorityCategoryConvexId && !priorityCategoryPgId) return true;

      return (
        (priorityCategoryConvexId != null && workspaceCategoryIds.has(priorityCategoryConvexId)) ||
        (priorityCategoryPgId != null && workspaceCategoryPgIds.has(priorityCategoryPgId))
      );
    });

    return (scopedPriorities.length > 0 ? scopedPriorities : data.priorities).map((priority: any) => ({
      _id: String(priority._id),
      label: String(priority.name ?? ''),
      color: priority.color ?? '#9CA3AF',
    }));
  }, [data.priorities, workspaceCategoryIds, workspaceCategoryPgIds]);

  useEffect(() => {
    setSelectedPriorityConvexId((current) => {
      if (current && priorityOptions.some((option) => option._id === current)) {
        return current;
      }

      const preferred = priorityOptions.find((option) => {
        const normalized = option.label.toLowerCase();
        return normalized.includes('medium') || normalized.includes('normal') || normalized.includes('media');
      });

      return preferred?._id ?? priorityOptions[0]?._id ?? null;
    });
  }, [priorityOptions]);

  const workspaceItems = useMemo(() => {
    return data.workspaces.map((w: any) => ({
      _id: w._id,
      name: w.name,
      color: w.color ?? null,
    }));
  }, [data.workspaces]);

  const assigneePickerUsers = useMemo<UserPickerItem[]>(() => {
    return data.users.reduce<UserPickerItem[]>((acc, rawUser: any) => {
      const resolvedId = rawUser?._id ?? rawUser?.id;
      const resolvedName = typeof rawUser?.name === 'string' ? rawUser.name.trim() : '';
      if (resolvedId == null || !resolvedName) {
        return acc;
      }

      const avatarCandidate =
        rawUser?.url_picture
        ?? rawUser?.urlPicture
        ?? rawUser?.avatar
        ?? rawUser?.photo_url
        ?? null;

      acc.push({
        id: String(resolvedId),
        name: resolvedName,
        email: typeof rawUser?.email === 'string' ? rawUser.email : undefined,
        avatarUrl: typeof avatarCandidate === 'string' ? avatarCandidate : null,
      });
      return acc;
    }, []);
  }, [data.users]);

  const assigneeNameById = useMemo(() => {
    const next = new Map<string, string>();
    for (const pickerUser of assigneePickerUsers) {
      next.set(pickerUser.id, pickerUser.name);
    }
    return next;
  }, [assigneePickerUsers]);

  const spotItems = useMemo(() => {
    return data.spots.map((s: any) => ({ _id: s._id, name: s.name }));
  }, [data.spots]);

  const tagItems = useMemo(() => {
    return data.tags.map((tg: any) => ({ _id: tg._id, name: tg.name, color: tg.color ?? null }));
  }, [data.tags]);

  const selectedAssigneeIds = useMemo(() => new Set(selectedAssignees.map(a => a._id)), [selectedAssignees]);
  const selectedTagIds = useMemo(() => new Set(selectedTags.map(tg => tg._id)), [selectedTags]);

  // ---------------------------------------------------------------------------
  // Workspace selection
  // ---------------------------------------------------------------------------
  const handleWorkspaceSelect = useCallback((ws: { _id: string; name: string }) => {
    setChosenWorkspaceId(ws._id);
    setWorkspaceModalVisible(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Toggle helpers for multi-select
  // ---------------------------------------------------------------------------
  const handleToggleAssignee = useCallback((userId: string) => {
    setSelectedAssignees((prev) => {
      const exists = prev.some((a) => a._id === userId);
      if (exists) {
        return prev.filter((a) => a._id !== userId);
      }
      return [...prev, { _id: userId, name: assigneeNameById.get(userId) ?? userId }];
    });
  }, [assigneeNameById]);

  const handleToggleTag = useCallback((item: { _id: string; name: string; color?: string | null }) => {
    setSelectedTags((prev) => {
      const exists = prev.find((tg) => tg._id === item._id);
      if (exists) return prev.filter((tg) => tg._id !== item._id);
      return [...prev, { _id: item._id, name: item.name, color: item.color }];
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Attachments
  // ---------------------------------------------------------------------------
  const addAttachmentFiles = useCallback(async (files: { uri: string; fileName: string; fileSize: number; fileType: string }[]) => {
    const available = MAX_ATTACHMENTS - attachments.length;
    if (available <= 0) {
      Alert.alert(t('createTask.limitReachedTitle'), t('createTask.limitReachedMessage', { max: MAX_ATTACHMENTS }));
      return;
    }
    const toAdd = files.slice(0, available);

    // Check file sizes
    const oversized = toAdd.filter(f => f.fileSize > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      Alert.alert(t('createTask.fileTooLargeTitle'), t('createTask.fileTooLargeMessage', { count: oversized.length }));
    }
    const valid = toAdd.filter(f => f.fileSize <= MAX_FILE_SIZE || f.fileSize === 0); // 0 = unknown size, allow
    if (valid.length === 0) return;

    // Create attachment items with uploading status
    const newItems: AttachmentItem[] = valid.map((f, i) => ({
      id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      fileName: f.fileName,
      fileSize: f.fileSize,
      fileType: f.fileType,
      uri: f.uri,
      status: 'uploading' as const,
    }));

    setAttachments(prev => [...prev, ...newItems]);

    // Upload each file
    for (const item of newItems) {
      try {
        const result = await uploadFile({
          uri: item.uri!,
          fileName: item.fileName,
          fileSize: item.fileSize,
          fileType: item.fileType,
        });
        setAttachments(prev =>
          prev.map(a => a.id === item.id
            ? { ...a, storageId: result.storageId, fileSize: result.fileSize, status: 'done' as const }
            : a)
        );
      } catch {
        setAttachments(prev =>
          prev.map(a => a.id === item.id ? { ...a, status: 'error' as const } : a)
        );
      }
    }
  }, [attachments.length, uploadFile, t]);

  const handlePickFile = useCallback(async () => {
    const docs = await pickDocuments();
    if (docs.length > 0) {
      addAttachmentFiles(docs.map(d => ({ uri: d.uri, fileName: d.fileName, fileSize: d.fileSize, fileType: d.fileType })));
    }
  }, [pickDocuments, addAttachmentFiles]);

  const handlePickPhoto = useCallback(async () => {
    setPhotoPickerVisible(true);
  }, []);

  const handleTakeTaskPhoto = useCallback(async () => {
    setPhotoPickerVisible(false);
    const photo = await takePhoto();
    if (photo) {
      addAttachmentFiles([{ uri: photo.uri, fileName: photo.fileName, fileSize: photo.fileSize, fileType: photo.fileType }]);
    }
  }, [takePhoto, addAttachmentFiles]);

  const handleChooseTaskPhotos = useCallback(async () => {
    setPhotoPickerVisible(false);
    const images = await pickImages();
    if (images.length > 0) {
      addAttachmentFiles(images.map(img => ({ uri: img.uri, fileName: img.fileName, fileSize: img.fileSize, fileType: img.fileType })));
    }
  }, [pickImages, addAttachmentFiles]);

  const handleRetryAttachment = useCallback(async (item: AttachmentItem) => {
    if (!item.uri) return;
    setAttachments(prev =>
      prev.map(a => a.id === item.id ? { ...a, status: 'uploading' as const } : a)
    );
    try {
      const result = await uploadFile({
        uri: item.uri,
        fileName: item.fileName,
        fileSize: item.fileSize,
        fileType: item.fileType,
      });
      setAttachments(prev =>
        prev.map(a => a.id === item.id
          ? { ...a, storageId: result.storageId, fileSize: result.fileSize, status: 'done' as const }
          : a)
      );
    } catch {
      setAttachments(prev =>
        prev.map(a => a.id === item.id ? { ...a, status: 'error' as const } : a)
      );
    }
  }, [uploadFile]);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  const handlePreviewAttachment = useCallback((attachment: AttachmentItem) => {
    if (!attachment.fileType.startsWith('image/') || !attachment.uri) return;
    setImageViewerUri(attachment.uri);
  }, []);

  // ---------------------------------------------------------------------------
  // Create task
  // ---------------------------------------------------------------------------
  const canCreate = hasTemplates ? !!selectedTemplate : taskName.trim().length > 0;
  const hasUploadingFiles = attachments.some(a => a.status === 'uploading');

  const handleCreateTask = useCallback(async () => {
    const finalName = hasTemplates ? (selectedTemplate?.name ?? '') : taskName.trim();
    if (!finalName) {
      Alert.alert(t('common.error'), hasTemplates ? t('createTask.errorSelectTemplate') : t('createTask.errorEnterTaskName'));
      return;
    }
    if (!workspaceConvexId) {
      Alert.alert(t('common.error'), t('createTask.errorNoWorkspace'));
      return;
    }
    if (hasUploadingFiles) {
      Alert.alert(t('createTask.pleaseWaitTitle'), t('createTask.pleaseWaitMessage'));
      return;
    }

    setIsSubmitting(true);
    try {
      const uploadedAttachments = attachments
        .filter(a => a.status === 'done' && a.storageId)
        .map(a => ({
          storageId: a.storageId!,
          fileName: a.fileName,
          fileSize: a.fileSize,
          fileType: a.fileType,
        }));

      const createdTask = await createTask({
        name: finalName,
        description: description.trim() || undefined,
        workspaceConvexId,
        categoryConvexId: workspaceCategories.length === 1 ? (workspaceCategories[0] as any)._id : currentWorkspace?.categoryId ?? undefined,
        templateConvexId: selectedTemplate?._id,
        statusConvexId: initialStatusConvexId ?? undefined,
        priorityConvexId: selectedPriorityConvexId ?? undefined,
        spotConvexId: selectedSpot?._id,
        userConvexIds: selectedAssignees.length > 0 ? selectedAssignees.map(a => a._id) : undefined,
        attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
        latitude: capturedLocation?.latitude,
        longitude: capturedLocation?.longitude,
      });

      if (tenantId && uploadedAttachments.length > 0) {
        for (const attachment of uploadedAttachments) {
          const ext = attachment.fileName.split('.').pop()?.toLowerCase() || '';
          const title = attachment.fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
          const documentId = await createDocumentMutation({
            tenantId,
            title,
            workspaceId: workspaceConvexId as any,
            storageId: attachment.storageId as any,
            fileName: attachment.fileName,
            fileExtension: ext,
            fileSize: attachment.fileSize,
            documentType: 'OTHER',
          });

          await createDocumentAssociationMutation({
            tenantId,
            documentId,
            associableType: 'task',
            associableId: String(createdTask.pgId ?? createdTask._id),
          });
        }
      }

      if (tenantId && createdTask.pgId && selectedTags.length > 0) {
        for (const tag of selectedTags) {
          const numericTagId = Number(tag._id);
          if (Number.isFinite(numericTagId) && numericTagId > 0) {
            await addTagByPgIdMutation({
              tenantId,
              taskPgId: createdTask.pgId,
              tagPgId: numericTagId,
            });
          } else {
            await addTagByTaskPgIdMutation({
              tenantId,
              taskPgId: createdTask.pgId,
              tagId: tag._id as any,
            });
          }
        }
      }

      toastRef.current?.show({ type: 'success', title: t('common.success'), body: t('createTask.taskCreatedSuccess') });
      setTimeout(() => navigation.goBack(), 800);
    } catch (err: any) {
      console.warn('[CreateTask] Failed:', err);
      toastRef.current?.show({ type: 'error', title: t('common.error'), body: err?.message || t('createTask.createFailedMessage') });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    taskName, description, workspaceConvexId, createTask, navigation,
    initialStatusConvexId, selectedPriorityConvexId, attachments, hasUploadingFiles,
    workspaceCategories, currentWorkspace, capturedLocation,
    hasTemplates, selectedTemplate, selectedSpot, selectedAssignees, t,
    tenantId, createDocumentMutation, createDocumentAssociationMutation,
    selectedTags, addTagByPgIdMutation, addTagByTaskPgIdMutation,
  ]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.08)' : '#E8E4DE';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? colors.background : '#F6F5F2' }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: isDarkMode ? colors.background : '#F6F5F2' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialIcons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('createTask.headerTitle')}</Text>
        {gpsStatus === 'loading' || gpsStatus === 'done' ? (
          <Animated.View style={{
            opacity: gpsStatus === 'loading' ? gpsOpacityAnim : 1,
            transform: [{ scale: gpsScaleAnim }],
          }}>
            <View>
              <MaterialIcons
                name={gpsStatus === 'done' ? 'gps-fixed' : 'gps-not-fixed'}
                size={22}
                color={gpsStatus === 'done' ? '#22C55E' : (isDarkMode ? 'rgba(255,255,255,0.4)' : '#A8A299')}
              />
              {gpsStatus === 'done' && (
                <View style={styles.gpsBadge}>
                  <MaterialIcons name="check" size={8} color="#FFFFFF" />
                </View>
              )}
            </View>
          </Animated.View>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Workspace Selector */}
          <TouchableOpacity
            style={[styles.workspaceBadge, { backgroundColor: `${workspaceColor}18`, borderColor: `${workspaceColor}30` }]}
            onPress={() => setWorkspaceModalVisible(true)}
            activeOpacity={0.7}
          >
            <View style={[styles.workspaceIcon, { backgroundColor: workspaceColor }]}>
              {currentWorkspace?.icon ? (
                (() => {
                  const parsed = parseWorkspaceIcon(currentWorkspace.icon);
                  return <FaIcon name={parsed.name} size={12} color="#FFFFFF" solid={parsed.solid} brand={parsed.brand} />;
                })()
              ) : (
                <Text style={styles.workspaceIconText}>
                  {currentWorkspace?.name?.charAt(0)?.toUpperCase() || 'W'}
                </Text>
              )}
            </View>
            <Text style={[styles.workspaceBadgeText, { color: colors.text }]}>
              {currentWorkspace?.name ?? t('createTask.selectWorkspace')}
            </Text>
            <MaterialIcons name="keyboard-arrow-down" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Task Title or Template Selector */}
          {hasTemplates ? (
            <TouchableOpacity
              style={[
                styles.templateSelector,
                {
                  borderColor: selectedTemplate ? primaryColor : borderColor,
                  backgroundColor: selectedTemplate
                    ? `${primaryColor}08`
                    : (isDarkMode ? 'rgba(255,255,255,0.04)' : colors.surface),
                },
              ]}
              onPress={() => setTemplateModalVisible(true)}
              activeOpacity={0.7}
            >
              <MaterialIcons
                name="description"
                size={20}
                color={selectedTemplate ? primaryColor : (isDarkMode ? 'rgba(255,255,255,0.3)' : '#A8A299')}
              />
              <Text
                style={[
                  styles.templateSelectorText,
                  selectedTemplate
                    ? { color: colors.text, fontFamily: fontFamilies.bodySemibold }
                    : { color: isDarkMode ? 'rgba(255,255,255,0.3)' : '#A8A299', fontFamily: fontFamilies.bodyMedium },
                ]}
                numberOfLines={1}
              >
                {selectedTemplate?.name ?? t('createTask.selectTemplate')}
              </Text>
              <MaterialIcons name="keyboard-arrow-down" size={20} color={isDarkMode ? 'rgba(255,255,255,0.3)' : '#A8A299'} />
            </TouchableOpacity>
          ) : (
            <TextInput
              ref={titleInputRef}
              style={[styles.titleInput, { color: colors.text }]}
              placeholder={t('createTask.taskName')}
              placeholderTextColor={isDarkMode ? 'rgba(255,255,255,0.3)' : '#A8A299'}
              value={taskName}
              onChangeText={setTaskName}
              returnKeyType="done"
            />
          )}

          {/* Description (collapsed by default) */}
          {showDescription ? (
            <TextInput
              style={[
                styles.descriptionInput,
                {
                  color: colors.text,
                  backgroundColor: colors.surface,
                  borderColor,
                },
              ]}
              placeholder={t('createTask.addDescriptionPlaceholder')}
              placeholderTextColor={isDarkMode ? 'rgba(255,255,255,0.3)' : '#A8A299'}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              autoFocus
            />
          ) : (
            <TouchableOpacity onPress={() => setShowDescription(true)} style={styles.addDescriptionButton}>
              <MaterialIcons name="add" size={18} color={primaryColor} />
              <Text style={[styles.addDescriptionText, { color: primaryColor }]}>{t('createTask.addDescription')}</Text>
            </TouchableOpacity>
          )}

          {/* Priority Selector */}
          <Text style={[styles.sectionLabel, { color: isDarkMode ? 'rgba(255,255,255,0.4)' : '#8C8780' }]}>{t('createTask.priorityLabel')}</Text>
          <View style={styles.priorityRow}>
            {priorityOptions.map((opt) => {
              const isActive = selectedPriorityConvexId === opt._id;
              return (
                <TouchableOpacity
                  key={opt._id}
                  style={[
                    styles.priorityPill,
                    {
                      backgroundColor: isActive ? `${opt.color}15` : (isDarkMode ? 'rgba(255,255,255,0.04)' : colors.surface),
                      borderColor: isActive ? opt.color : borderColor,
                    },
                  ]}
                  onPress={() => setSelectedPriorityConvexId(opt._id)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.priorityDot,
                      { backgroundColor: opt.color },
                    ]}
                  />
                  <Text
                    style={[
                      styles.priorityPillText,
                      {
                        color: isActive ? opt.color : (isDarkMode ? 'rgba(255,255,255,0.5)' : '#8C8780'),
                        fontFamily: isActive ? fontFamilies.bodySemibold : fontFamilies.bodyMedium,
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Assign To */}
          <Text style={[styles.sectionLabel, { color: isDarkMode ? 'rgba(255,255,255,0.4)' : '#8C8780' }]}>{t('createTask.assignToLabel')}</Text>
          <TouchableOpacity
            style={[
              styles.fieldSelector,
              {
                borderColor: selectedAssignees.length > 0 ? primaryColor : borderColor,
                backgroundColor: selectedAssignees.length > 0
                  ? `${primaryColor}08`
                  : (isDarkMode ? 'rgba(255,255,255,0.04)' : colors.surface),
              },
            ]}
            onPress={() => setAssigneeModalVisible(true)}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name="person-add"
              size={18}
              color={selectedAssignees.length > 0 ? primaryColor : (isDarkMode ? 'rgba(255,255,255,0.3)' : '#A8A299')}
            />
            <Text
              style={[
                styles.fieldSelectorText,
                selectedAssignees.length > 0
                  ? { color: colors.text, fontFamily: fontFamilies.bodySemibold }
                  : { color: isDarkMode ? 'rgba(255,255,255,0.3)' : '#A8A299', fontFamily: fontFamilies.bodyMedium },
              ]}
              numberOfLines={1}
            >
              {selectedAssignees.length > 0 ? selectedAssignees.map(a => a.name).join(', ') : t('createTask.selectAssignees')}
            </Text>
            <MaterialIcons name="keyboard-arrow-down" size={20} color={isDarkMode ? 'rgba(255,255,255,0.3)' : '#A8A299'} />
          </TouchableOpacity>
          {selectedAssignees.length > 0 && (
            <View style={styles.chipsRow}>
              {selectedAssignees.map((a) => (
                <View key={a._id} style={[styles.chip, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#F3EEE4' }]}>
                  <Text style={[styles.chipText, { color: colors.text }]}>{a.name}</Text>
                  <TouchableOpacity onPress={() => setSelectedAssignees((prev) => prev.filter((x) => x._id !== a._id))} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <MaterialIcons name="close" size={14} color={isDarkMode ? 'rgba(255,255,255,0.4)' : '#A8A299'} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Spot / Location */}
          {spotItems.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: isDarkMode ? 'rgba(255,255,255,0.4)' : '#8C8780' }]}>{t('createTask.locationLabel')}</Text>
              <TouchableOpacity
                style={[
                  styles.fieldSelector,
                  {
                    borderColor: selectedSpot ? primaryColor : borderColor,
                    backgroundColor: selectedSpot
                      ? `${primaryColor}08`
                      : (isDarkMode ? 'rgba(255,255,255,0.04)' : colors.surface),
                  },
                ]}
                onPress={() => setSpotModalVisible(true)}
                activeOpacity={0.7}
              >
                <MaterialIcons
                  name="place"
                  size={18}
                  color={selectedSpot ? primaryColor : (isDarkMode ? 'rgba(255,255,255,0.3)' : '#A8A299')}
                />
                <Text
                  style={[
                    styles.fieldSelectorText,
                    selectedSpot
                      ? { color: colors.text, fontFamily: fontFamilies.bodySemibold }
                      : { color: isDarkMode ? 'rgba(255,255,255,0.3)' : '#A8A299', fontFamily: fontFamilies.bodyMedium },
                  ]}
                  numberOfLines={1}
                >
                  {selectedSpot?.name ?? t('createTask.selectLocation')}
                </Text>
                <MaterialIcons name="keyboard-arrow-down" size={20} color={isDarkMode ? 'rgba(255,255,255,0.3)' : '#A8A299'} />
              </TouchableOpacity>
            </>
          )}

          {/* Tags */}
          {tagItems.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: isDarkMode ? 'rgba(255,255,255,0.4)' : '#8C8780' }]}>{t('createTask.tagsLabel')}</Text>
              <TouchableOpacity
                style={[
                  styles.fieldSelector,
                  {
                    borderColor: selectedTags.length > 0 ? primaryColor : borderColor,
                    backgroundColor: selectedTags.length > 0
                      ? `${primaryColor}08`
                      : (isDarkMode ? 'rgba(255,255,255,0.04)' : colors.surface),
                  },
                ]}
                onPress={() => setTagModalVisible(true)}
                activeOpacity={0.7}
              >
                <MaterialIcons
                  name="label"
                  size={18}
                  color={selectedTags.length > 0 ? primaryColor : (isDarkMode ? 'rgba(255,255,255,0.3)' : '#A8A299')}
                />
                <Text
                  style={[
                    styles.fieldSelectorText,
                    selectedTags.length > 0
                      ? { color: colors.text, fontFamily: fontFamilies.bodySemibold }
                      : { color: isDarkMode ? 'rgba(255,255,255,0.3)' : '#A8A299', fontFamily: fontFamilies.bodyMedium },
                  ]}
                  numberOfLines={1}
                >
                  {selectedTags.length > 0 ? selectedTags.map(tg => tg.name).join(', ') : t('createTask.selectTags')}
                </Text>
                <MaterialIcons name="keyboard-arrow-down" size={20} color={isDarkMode ? 'rgba(255,255,255,0.3)' : '#A8A299'} />
              </TouchableOpacity>
              {selectedTags.length > 0 && (
                <View style={styles.chipsRow}>
                  {selectedTags.map((tag) => (
                    <View key={tag._id} style={[styles.chip, { backgroundColor: tag.color ? `${tag.color}20` : (isDarkMode ? 'rgba(255,255,255,0.08)' : '#F3EEE4') }]}>
                      {tag.color && <View style={[styles.tagDot, { backgroundColor: tag.color }]} />}
                      <Text style={[styles.chipText, { color: colors.text }]}>{tag.name}</Text>
                      <TouchableOpacity onPress={() => setSelectedTags((prev) => prev.filter((x) => x._id !== tag._id))} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <MaterialIcons name="close" size={14} color={isDarkMode ? 'rgba(255,255,255,0.4)' : '#A8A299'} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Attachments */}
          <Text style={[styles.sectionLabel, { color: isDarkMode ? 'rgba(255,255,255,0.4)' : '#8C8780' }]}>{t('createTask.attachmentsLabel')}</Text>
          <View style={styles.attachmentButtonsRow}>
            <TouchableOpacity
              style={[styles.attachmentButton, { borderColor, backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : colors.surface }]}
              onPress={handlePickFile}
              activeOpacity={0.7}
            >
              <MaterialIcons name="attach-file" size={20} color={isDarkMode ? 'rgba(255,255,255,0.4)' : '#8C8780'} />
              <Text style={[styles.attachmentButtonText, { color: isDarkMode ? 'rgba(255,255,255,0.5)' : '#8C8780' }]}>{t('createTask.fileButton')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.attachmentButton, { borderColor, backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : colors.surface }]}
              onPress={handlePickPhoto}
              activeOpacity={0.7}
            >
              <MaterialIcons name="photo-camera" size={20} color={isDarkMode ? 'rgba(255,255,255,0.4)' : '#8C8780'} />
              <Text style={[styles.attachmentButtonText, { color: isDarkMode ? 'rgba(255,255,255,0.5)' : '#8C8780' }]}>{t('createTask.photoButton')}</Text>
            </TouchableOpacity>
          </View>

          {/* Attachment chips */}
          {attachments.map((att) => (
            <View
              key={att.id}
              style={[
                styles.attachmentChip,
                {
                  backgroundColor: colors.surface,
                  borderColor: att.status === 'error' ? '#EF4444' : borderColor,
                },
              ]}
            >
              <TouchableOpacity
                style={styles.attachmentMain}
                onPress={() => handlePreviewAttachment(att)}
                disabled={!att.fileType.startsWith('image/') || !att.uri}
                activeOpacity={0.7}
              >
                <MaterialIcons
                  name={getFileIcon(att.fileType) as any}
                  size={20}
                  color={att.status === 'error' ? '#EF4444' : (isDarkMode ? 'rgba(255,255,255,0.5)' : '#8C8780')}
                />
                <View style={styles.attachmentInfo}>
                  <Text
                    style={[styles.attachmentName, { color: colors.text }]}
                    numberOfLines={1}
                    ellipsizeMode="middle"
                  >
                    {att.fileName}
                  </Text>
                  <Text style={[styles.attachmentSize, { color: isDarkMode ? 'rgba(255,255,255,0.3)' : '#A8A299' }]}>
                    {att.fileSize > 0 ? formatFileSize(att.fileSize) : ''}
                    {att.status === 'error' && ` - ${t('createTask.uploadFailed')}`}
                    {att.fileType.startsWith('image/') && att.uri ? ` - ${t('createTask.tapToPreview')}` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
              {att.status === 'uploading' && (
                <ActivityIndicator size="small" color={primaryColor} style={{ marginRight: 4 }} />
              )}
              {att.status === 'error' && (
                <TouchableOpacity onPress={() => handleRetryAttachment(att)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialIcons name="refresh" size={20} color="#EF4444" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => handleRemoveAttachment(att.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ marginLeft: 4 }}
              >
                <MaterialIcons name="close" size={18} color={isDarkMode ? 'rgba(255,255,255,0.3)' : '#A8A299'} />
              </TouchableOpacity>
            </View>
          ))}

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Create Button */}
      <View style={[styles.footer, { backgroundColor: isDarkMode ? colors.background : '#F6F5F2' }]}>
        <TouchableOpacity
          style={[
            styles.createButton,
            canCreate && !isSubmitting
              ? { backgroundColor: isDarkMode ? '#F5F5F5' : '#1A1815' }
              : { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#D4D0C8' },
          ]}
          onPress={handleCreateTask}
          disabled={!canCreate || isSubmitting}
          activeOpacity={0.8}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={isDarkMode ? '#1A1815' : '#FFFFFF'} />
          ) : (
            <MaterialIcons
              name="check"
              size={20}
              color={canCreate ? (isDarkMode ? '#1A1815' : '#FFFFFF') : (isDarkMode ? 'rgba(255,255,255,0.3)' : '#A8A299')}
            />
          )}
          <Text
            style={[
              styles.createButtonText,
              {
                color: canCreate && !isSubmitting
                  ? (isDarkMode ? '#1A1815' : '#FFFFFF')
                  : (isDarkMode ? 'rgba(255,255,255,0.3)' : '#A8A299'),
              },
            ]}
          >
            {isSubmitting ? t('createTask.creatingButton') : t('createTask.createButton')}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={!!imageViewerUri}
        transparent
        animationType="fade"
        onRequestClose={() => setImageViewerUri(null)}
      >
        <View style={styles.imageViewerOverlay}>
          <TouchableOpacity style={styles.imageViewerClose} onPress={() => setImageViewerUri(null)}>
            <MaterialIcons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          {imageViewerUri && (
            <Image
              source={{ uri: imageViewerUri }}
              style={styles.imageViewerImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      <AttachmentPickerSheet
        visible={photoPickerVisible}
        busy={false}
        title={t('createTask.addPhotoTitle')}
        subtitle={t('createTask.addPhotoMessage')}
        showFiles={false}
        onClose={() => setPhotoPickerVisible(false)}
        onTakePhoto={handleTakeTaskPhoto}
        onChoosePhotos={handleChooseTaskPhotos}
        onChooseFiles={() => {}}
      />

      {/* Workspace Modal */}
      <SelectorModal
        visible={workspaceModalVisible}
        title={t('createTask.selectWorkspaceModalTitle')}
        items={workspaceItems}
        selectedId={currentWorkspace?._id}
        onSelect={handleWorkspaceSelect}
        onClose={() => {
          setWorkspaceModalVisible(false);
          if (!currentWorkspace) navigation.goBack();
        }}
        colors={colors}
        isDarkMode={isDarkMode}
        primaryColor={primaryColor}
      />

      {/* Template Modal */}
      <SelectorModal
        visible={templateModalVisible}
        title={t('createTask.selectTemplateModalTitle')}
        items={categoryTemplates.map((tmpl: any) => ({ _id: tmpl._id, name: tmpl.name, color: null }))}
        selectedId={selectedTemplate?._id}
        onSelect={(item) => {
          setSelectedTemplate(item);
          setTemplateModalVisible(false);
        }}
        onClose={() => setTemplateModalVisible(false)}
        searchable
        colors={colors}
        isDarkMode={isDarkMode}
        primaryColor={primaryColor}
      />

      {/* Assignee Modal (multi-select) */}
      <UserPickerSheet
        visible={assigneeModalVisible}
        title={t('createTask.selectAssigneesModalTitle')}
        users={assigneePickerUsers}
        selectedIds={selectedAssigneeIds}
        onToggleUser={handleToggleAssignee}
        onClose={() => setAssigneeModalVisible(false)}
        colors={colors}
        primaryColor={primaryColor}
        isDarkMode={isDarkMode}
        currentUserId={user?.id ?? null}
        currentUserName={user?.name ?? null}
        searchPlaceholder={t('common.searchUsers')}
        emptyText={t('common.noItemsFound')}
        youLabel={t('common.you')}
      />

      {/* Spot Modal */}
      <SelectorModal
        visible={spotModalVisible}
        title={t('createTask.selectLocationModalTitle')}
        items={spotItems}
        selectedId={selectedSpot?._id}
        onSelect={(item) => { setSelectedSpot(item); setSpotModalVisible(false); }}
        onClose={() => setSpotModalVisible(false)}
        searchable
        colors={colors}
        isDarkMode={isDarkMode}
        primaryColor={primaryColor}
      />

      {/* Tag Modal (multi-select) */}
      <SelectorModal
        visible={tagModalVisible}
        title={t('createTask.selectTagsModalTitle')}
        items={tagItems}
        onSelect={handleToggleTag}
        onClose={() => setTagModalVisible(false)}
        searchable
        multiSelect
        selectedIds={selectedTagIds}
        colors={colors}
        isDarkMode={isDarkMode}
        primaryColor={primaryColor}
      />
      <Toast ref={toastRef} />
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
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
  gpsBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22C55E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  workspaceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingRight: 14,
    paddingLeft: 4,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
  },
  workspaceIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  workspaceIconText: {
    fontSize: 12,
    fontFamily: fontFamilies.bodySemibold,
    color: '#FFFFFF',
  },
  workspaceBadgeText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
    marginLeft: 8,
    marginRight: 4,
  },
  titleInput: {
    fontSize: fontSizes.xl,
    fontFamily: fontFamilies.displayBold,
    paddingVertical: 8,
    marginBottom: 8,
  },
  templateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 8,
    gap: 10,
  },
  templateSelectorText: {
    flex: 1,
    fontSize: fontSizes.md,
  },
  fieldSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 10,
  },
  fieldSelectorText: {
    flex: 1,
    fontSize: fontSizes.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  chipText: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
  },
  tagDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  addDescriptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 8,
  },
  addDescriptionText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    marginLeft: 4,
  },
  descriptionInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyRegular,
    minHeight: 90,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 10,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  priorityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  priorityPillText: {
    fontSize: fontSizes.xs,
  },
  attachmentButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  attachmentButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 6,
  },
  attachmentButtonText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: 8,
    gap: 8,
  },
  attachmentMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attachmentInfo: {
    flex: 1,
  },
  attachmentName: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  attachmentSize: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyRegular,
    marginTop: 1,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
  },
  createButtonText: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  imageViewerImage: {
    width: '100%',
    height: '80%',
  },
});

const modalStyles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '78%',
    flexShrink: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 12,
    paddingBottom: 32,
    paddingHorizontal: 20,
    ...shadows.subtle,
  },
  list: {
    maxHeight: 350,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1CBC0',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
    marginBottom: 12,
  },
  searchInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyMedium,
    marginBottom: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderBottomWidth: 1,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  itemText: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyMedium,
  },
  emptyText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
