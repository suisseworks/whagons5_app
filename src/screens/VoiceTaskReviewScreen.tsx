import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { fontFamilies, fontSizes, radius, spacing } from '../config/designTokens';
import { RootStackParamList } from '../models/types';
import { useTenant } from '../hooks/useTenant';
import { GPS_CAPTURE_STORAGE_KEY } from './SettingsScreen';
import { Toast, ToastRef } from '../components/Toast';
import { UserPickerSheet, type UserPickerItem } from '../components/UserPickerSheet';
import { useOfflineMutation } from '../hooks/useOfflineMutation';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'VoiceTaskReview'>;
type ScreenRouteProp = RouteProp<RootStackParamList, 'VoiceTaskReview'>;

type PickerItem = { id: string; name: string; searchText?: string };

type DraftContextItem = { id: string; name: string };
type DraftWorkspace = DraftContextItem & { allowedCategoryIds: string[]; categoryId?: string; color?: string | null };
type DraftTemplate = DraftContextItem & {
  workspaceId?: string;
  categoryId?: string;
  defaultSpotId?: string;
  priorityId?: string;
  defaultUserIds?: string[];
  spotsNotApplicable: boolean;
};
type DraftSpot = DraftContextItem & { alias?: string; parentId?: string };
type DraftPriority = DraftContextItem & { color?: string | null; categoryId?: string };
type DraftUser = DraftContextItem;
type VoiceDraftContext = {
  selectedWorkspaceId?: string;
  workspaces: DraftWorkspace[];
  templates: DraftTemplate[];
  spots: DraftSpot[];
  priorities: DraftPriority[];
  users: DraftUser[];
};

interface PickerModalProps {
  visible: boolean;
  title: string;
  items: PickerItem[];
  searchable?: boolean;
  searchPlaceholder: string;
  emptyText: string;
  selectedId?: string | null;
  selectedIds?: Set<string>;
  multi?: boolean;
  onSelect: (item: PickerItem) => void;
  onClose: () => void;
  colors: { surface: string; text: string; textSecondary: string };
  primaryColor: string;
  isDarkMode: boolean;
}

const PickerModal: React.FC<PickerModalProps> = ({
  visible,
  title,
  items,
  searchable = false,
  searchPlaceholder,
  emptyText,
  selectedId,
  selectedIds,
  multi = false,
  onSelect,
  onClose,
  colors,
  primaryColor,
  isDarkMode,
}) => {
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!visible) {
      setSearch('');
    }
  }, [visible]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => `${item.name} ${item.searchText ?? ''}`.toLowerCase().includes(query));
  }, [items, search]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalKeyboard} behavior="padding">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: colors.surface,
                borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E7E2D9',
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>

            {searchable ? (
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={searchPlaceholder}
                placeholderTextColor={colors.textSecondary}
                style={[
                  styles.modalSearchInput,
                  {
                    color: colors.text,
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F7F4EF',
                    borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7',
                  },
                ]}
              />
            ) : null}

            <FlatList
              data={filteredItems}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSelected = multi ? selectedIds?.has(item.id) : item.id === selectedId;
                return (
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      { borderColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#EFE8DE' },
                    ]}
                    onPress={() => onSelect(item)}
                  >
                    <Text style={[styles.modalItemText, { color: colors.text }]}>{item.name}</Text>
                    {isSelected ? <MaterialIcons name="check" size={20} color={primaryColor} /> : null}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textSecondary }]}>{emptyText}</Text>}
            />
          </View>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
};

async function getOptionalCapturedLocation() {
  const enabled = await AsyncStorage.getItem(GPS_CAPTURE_STORAGE_KEY);
  if (enabled === 'false') return undefined;

  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') return undefined;

  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  } catch {
    return undefined;
  }
}

function isLowPriorityName(name: string | undefined): boolean {
  const normalized = name?.trim().toLowerCase();
  return normalized === 'low' || normalized === 'baja';
}

function resolveDefaultPriorityId(
  context: VoiceDraftContext,
  workspaceId: string | null | undefined,
  templateId: string | null | undefined,
): string | null {
  const template = context.templates.find((item) => item.id === templateId) ?? null;
  const workspace = context.workspaces.find((item) => item.id === workspaceId) ?? null;
  const targetCategoryId = template?.categoryId ?? workspace?.categoryId;

  return context.priorities.find((priority) =>
    priority.categoryId === targetCategoryId && isLowPriorityName(priority.name),
  )?.id
    ?? context.priorities.find((priority) => !priority.categoryId && isLowPriorityName(priority.name))?.id
    ?? context.priorities.find((priority) => isLowPriorityName(priority.name))?.id
    ?? null;
}

export const VoiceTaskReviewScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();
  const { tenantId } = useTenant();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const { user: authUser } = useAuth();
  const { data } = useData();

  const reviewData = useQuery(
    api.voiceTaskDrafts.get,
    tenantId ? { tenantId, draftId: route.params.draftId as any } : 'skip',
  );
  const confirmDraft = useOfflineMutation(api.voiceTaskDrafts.confirm, 'voiceTaskDrafts.confirm');
  const cancelDraft = useOfflineMutation(api.voiceTaskDrafts.cancel, 'voiceTaskDrafts.cancel');

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [taskName, setTaskName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [selectedPriorityId, setSelectedPriorityId] = useState<string | null>(null);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [workspaceModalVisible, setWorkspaceModalVisible] = useState(false);
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [spotModalVisible, setSpotModalVisible] = useState(false);
  const [priorityModalVisible, setPriorityModalVisible] = useState(false);
  const [assigneeModalVisible, setAssigneeModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [initializedDraftId, setInitializedDraftId] = useState<string | null>(null);
  const toastRef = React.useRef<ToastRef>(null);

  const draft = reviewData?.draft;
  const context = reviewData?.context as VoiceDraftContext | undefined;
  const proposal = (draft?.proposal ?? {}) as {
    workspaceId?: string;
    templateId?: string;
    taskName?: string;
    description?: string;
    spotId?: string;
    priorityId?: string;
    assigneeUserIds?: string[];
    transcript?: string;
    intent?: string;
  };

  useEffect(() => {
    if (!draft || !context) return;
    const draftId = String(draft._id);
    if (initializedDraftId === draftId) return;

    const initialWorkspaceId = proposal.workspaceId ?? context.selectedWorkspaceId ?? context.workspaces[0]?.id ?? null;
    const initialTemplateId = proposal.templateId ?? null;
    const initialTemplate = context.templates.find((item) => item.id === initialTemplateId) ?? null;
    setInitializedDraftId(draftId);
    setSelectedWorkspaceId(initialWorkspaceId);
    setSelectedTemplateId(initialTemplateId);
    setTaskName(proposal.taskName ?? '');
    setDescription(proposal.description ?? '');
    setSelectedSpotId(proposal.spotId ?? null);
    setSelectedPriorityId(
      proposal.priorityId
        ?? initialTemplate?.priorityId
        ?? resolveDefaultPriorityId(context, initialWorkspaceId, initialTemplateId),
    );
    setSelectedAssigneeIds(
      proposal.assigneeUserIds && proposal.assigneeUserIds.length > 0
        ? proposal.assigneeUserIds
        : (initialTemplate?.defaultUserIds ?? []),
    );
  }, [context, draft, initializedDraftId, proposal]);

  useEffect(() => {
    if (!context || selectedPriorityId) return;
    const selectedTemplate = context.templates.find((item) => item.id === selectedTemplateId) ?? null;
    const fallbackPriorityId = selectedTemplate?.priorityId
      ?? resolveDefaultPriorityId(context, selectedWorkspaceId, selectedTemplateId);
    if (fallbackPriorityId) {
      setSelectedPriorityId(fallbackPriorityId);
    }
  }, [context, selectedPriorityId, selectedTemplateId, selectedWorkspaceId]);

  useEffect(() => {
    if (!context || selectedAssigneeIds.length > 0 || !selectedTemplateId) return;
    const selectedTemplate = context.templates.find((item) => item.id === selectedTemplateId) ?? null;
    if (selectedTemplate?.defaultUserIds?.length) {
      setSelectedAssigneeIds(selectedTemplate.defaultUserIds);
    }
  }, [context, selectedAssigneeIds.length, selectedTemplateId]);

  const selectedTemplateFromContext = context?.templates.find((template: DraftTemplate) => template.id === selectedTemplateId) ?? null;

  const availableTemplates = useMemo(() => {
    if (!context) return [];
    if (!selectedWorkspaceId) return context.templates;
    return context.templates.filter((template: DraftTemplate) => !template.workspaceId || template.workspaceId === selectedWorkspaceId);
  }, [context, selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedTemplateId) return;
    const exists = availableTemplates.some((template: DraftTemplate) => template.id === selectedTemplateId);
    if (!exists) {
      if (selectedTemplateFromContext?.workspaceId && selectedTemplateFromContext.workspaceId !== selectedWorkspaceId) {
        setSelectedWorkspaceId(selectedTemplateFromContext.workspaceId);
        return;
      }
      setSelectedTemplateId(null);
    }
  }, [availableTemplates, selectedTemplateFromContext, selectedTemplateId, selectedWorkspaceId]);

  const selectedWorkspace = context?.workspaces.find((workspace: DraftWorkspace) => workspace.id === selectedWorkspaceId) ?? null;
  const selectedTemplate = selectedTemplateFromContext;
  const selectedSpot = context?.spots.find((spot: DraftSpot) => spot.id === selectedSpotId) ?? null;
  const selectedPriority = context?.priorities.find((priority: DraftPriority) => priority.id === selectedPriorityId) ?? null;
  const selectedAssignees = context?.users.filter((user: DraftUser) => selectedAssigneeIds.includes(user.id)) ?? [];

  const userProfileByConvexId = useMemo(() => {
    const map = new Map<string, any>();
    for (const userRecord of data.users) {
      const convexId = (userRecord as any)?._id;
      if (convexId) {
        map.set(String(convexId), userRecord);
      }
    }
    return map;
  }, [data.users]);

  const assigneePickerUsers = useMemo<UserPickerItem[]>(() => {
    if (!context) return [];

    return context.users.map((draftUser: DraftUser) => {
      const userProfile = userProfileByConvexId.get(String(draftUser.id));
      const avatarCandidate =
        userProfile?.url_picture
        ?? userProfile?.urlPicture
        ?? userProfile?.avatar
        ?? userProfile?.photo_url
        ?? null;

      return {
        id: String(draftUser.id),
        name: draftUser.name,
        email: typeof userProfile?.email === 'string' ? userProfile.email : undefined,
        avatarUrl: typeof avatarCandidate === 'string' ? avatarCandidate : null,
      };
    });
  }, [context, userProfileByConvexId]);

  useEffect(() => {
    if (!selectedTemplate?.workspaceId) return;
    if (selectedTemplate.workspaceId !== selectedWorkspaceId) {
      setSelectedWorkspaceId(selectedTemplate.workspaceId);
    }
  }, [selectedTemplate, selectedWorkspaceId]);

  const liveMissingFields = useMemo(() => {
    const normalizedMissing = ((draft?.missingFields ?? []) as string[])
      .map((field) => {
        if (field === 'workspaceKey') return 'workspace';
        if (field === 'templateKey') return 'template';
        if (field === 'spotKey') return 'spot';
        if (field === 'priorityKey') return 'priority';
        if (field === 'assigneeKeys') return 'assignees';
        return field;
      })
      .filter((field) => ['workspace', 'template', 'taskName', 'spot', 'priority', 'assignees'].includes(field));

    const missing = new Set<string>(normalizedMissing);
    if (selectedWorkspaceId) {
      missing.delete('workspace');
    } else {
      missing.add('workspace');
    }

    if (availableTemplates.length > 0) {
      if (selectedTemplateId) missing.delete('template');
      else missing.add('template');
    } else {
      missing.delete('template');
    }

    const effectiveTaskName = selectedTemplate ? selectedTemplate.name : taskName.trim();
    if (effectiveTaskName) missing.delete('taskName');
    else missing.add('taskName');

    const effectiveSpotId = selectedSpotId || selectedTemplate?.defaultSpotId || null;
    if (!selectedTemplate || selectedTemplate.spotsNotApplicable || effectiveSpotId) missing.delete('spot');

    const effectivePriorityId = selectedPriorityId || selectedTemplate?.priorityId || null;
    if (effectivePriorityId) missing.delete('priority');

    const effectiveAssigneeIds = selectedAssigneeIds.length > 0 ? selectedAssigneeIds : (selectedTemplate?.defaultUserIds ?? []);
    if (effectiveAssigneeIds.length > 0) missing.delete('assignees');

    return Array.from(missing);
  }, [
    availableTemplates.length,
    draft?.missingFields,
    selectedAssigneeIds.length,
    selectedPriorityId,
    selectedSpotId,
    selectedTemplate,
    selectedTemplateId,
    selectedWorkspaceId,
    taskName,
  ]);

  const liveBlockingFields = useMemo(
    () => liveMissingFields.filter((field) => field !== 'priority' && field !== 'assignees'),
    [liveMissingFields],
  );

  const canConfirm =
    !!draft &&
    draft.status === 'ready' &&
    proposal.intent !== 'unsupported' &&
    liveBlockingFields.length === 0 &&
    !isSubmitting;

  const workspaceItems = context?.workspaces.map((workspace: DraftWorkspace) => ({ id: workspace.id, name: workspace.name })) ?? [];
  const templateItems = availableTemplates.map((template: DraftTemplate) => ({ id: template.id, name: template.name }));
  const spotItems = context?.spots.map((spot: DraftSpot) => ({
    id: spot.id,
    name: spot.name,
    searchText: typeof spot.alias === 'string' ? spot.alias : undefined,
  })) ?? [];
  const priorityItems = context?.priorities.map((priority: DraftPriority) => ({ id: priority.id, name: priority.name })) ?? [];

  const toggleAssignee = useCallback((userId: string) => {
    setSelectedAssigneeIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  }, []);

  const handleCancel = useCallback(async () => {
    if (!tenantId || !draft) return;
    try {
      await cancelDraft({ tenantId, draftId: draft._id });
    } catch {}
    navigation.goBack();
  }, [cancelDraft, draft, navigation, tenantId]);

  const handleConfirm = useCallback(async () => {
    if (!tenantId || !draft || !selectedWorkspaceId) return;
    if (liveBlockingFields.length > 0) {
      toastRef.current?.show({
        type: 'warning',
        title: t('voiceTaskReview.missingInfoTitle'),
        body: t('voiceTaskReview.missingInfoBody'),
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const gpsLocation = await getOptionalCapturedLocation();
      await confirmDraft({
        tenantId,
        draftId: draft._id,
        workspaceId: selectedWorkspaceId as any,
        templateId: selectedTemplateId ? (selectedTemplateId as any) : undefined,
        name: selectedTemplate ? undefined : taskName.trim(),
        description: description.trim() || undefined,
        spotId: selectedSpotId ? (selectedSpotId as any) : undefined,
        priorityId: selectedPriorityId ? (selectedPriorityId as any) : undefined,
        assigneeUserIds: selectedAssigneeIds.length > 0 ? (selectedAssigneeIds as any) : undefined,
        latitude: gpsLocation?.latitude,
        longitude: gpsLocation?.longitude,
      });
      toastRef.current?.show({
        type: 'success',
        title: t('common.success'),
        body: t('createTask.taskCreatedSuccess'),
      });
      setTimeout(() => navigation.goBack(), 700);
    } catch (error: any) {
      toastRef.current?.show({
        type: 'error',
        title: t('common.error'),
        body: error?.message || t('voiceTaskReview.createTaskFailedFallback'),
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    confirmDraft,
    description,
    draft,
    liveBlockingFields.length,
    navigation,
    selectedAssigneeIds,
    selectedPriorityId,
    selectedSpotId,
    selectedTemplate,
    selectedTemplateId,
    selectedWorkspaceId,
    t,
    taskName,
    tenantId,
  ]);

  if (reviewData === undefined) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={primaryColor} />
      </SafeAreaView>
    );
  }

  if (!draft || !context) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyText, { color: colors.text }]}>{t('voiceTaskReview.draftNotFound')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? colors.background : '#F6F5F2' }]}>
      <View style={[styles.header, { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E7E2D9' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('voiceTaskReview.headerTitle')}</Text>
        <TouchableOpacity onPress={handleCancel}>
          <Text style={[styles.headerAction, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('voiceTaskReview.transcriptLabel')}</Text>
          <Text style={[styles.transcriptText, { color: colors.text }]}>
            {draft.transcript || proposal.transcript || t('voiceTaskReview.noTranscript')}
          </Text>
        </View>

        {proposal.intent === 'unsupported' ? (
          <View style={[styles.warningCard, { backgroundColor: isDarkMode ? 'rgba(239,68,68,0.14)' : '#FDE8E8' }]}>
            <Text style={[styles.warningTitle, { color: colors.text }]}>{t('voiceTaskReview.unsupportedTitle')}</Text>
            <Text style={[styles.warningBody, { color: colors.textSecondary }]}>
              {t('voiceTaskReview.unsupportedBody')}
            </Text>
          </View>
        ) : null}

        {(draft.warnings?.length ?? 0) > 0 ? (
          <View style={[styles.warningCard, { backgroundColor: isDarkMode ? 'rgba(245,158,11,0.16)' : '#FEF3C7' }]}>
            <Text style={[styles.warningTitle, { color: colors.text }]}>{t('voiceTaskReview.warningsTitle')}</Text>
            {(draft.warnings as string[]).map((warning, index) => (
              <Text key={`${warning}-${index}`} style={[styles.warningBody, { color: colors.textSecondary }]}>
                • {warning}
              </Text>
            ))}
          </View>
        ) : null}

        {liveMissingFields.length > 0 ? (
          <View style={[styles.warningCard, { backgroundColor: isDarkMode ? 'rgba(59,130,246,0.14)' : '#DBEAFE' }]}>
            <Text style={[styles.warningTitle, { color: colors.text }]}>{t('voiceTaskReview.needsReviewTitle')}</Text>
            {liveMissingFields.map((field) => (
              <Text key={field} style={[styles.warningBody, { color: colors.textSecondary }]}>
                • {field === 'taskName'
                  ? t('voiceTaskReview.fieldTaskTitle')
                  : t(`voiceTaskReview.field.${field}`)}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('voiceTaskReview.workspaceLabel')}</Text>
          <TouchableOpacity
            style={[styles.selectorRow, selectedTemplate ? styles.selectorRowDisabled : null]}
            onPress={selectedTemplate ? undefined : () => setWorkspaceModalVisible(true)}
            disabled={!!selectedTemplate}
          >
            <Text style={[styles.selectorValue, { color: colors.text }]}>
              {selectedWorkspace?.name || t('createTask.selectWorkspace')}
            </Text>
            {selectedTemplate ? (
              <Text style={[styles.lockedHint, { color: colors.textSecondary }]}>{t('voiceTaskReview.fromTemplate')}</Text>
            ) : (
              <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textSecondary} />
            )}
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('voiceTaskReview.templateLabel')}</Text>
          <TouchableOpacity style={styles.selectorRow} onPress={() => setTemplateModalVisible(true)}>
            <Text style={[styles.selectorValue, { color: colors.text }]}>
              {selectedTemplate?.name || (availableTemplates.length > 0 ? t('createTask.selectTemplate') : t('voiceTaskReview.noTemplatesRequired'))}
            </Text>
            <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {!selectedTemplate ? (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('voiceTaskReview.taskTitleLabel')}</Text>
            <TextInput
              value={taskName}
              onChangeText={setTaskName}
              placeholder={t('createTask.taskName')}
              placeholderTextColor={colors.textSecondary}
              style={[styles.textInput, { color: colors.text, borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E7E2D9' }]}
            />
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('createTask.addDescription')}</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t('createTask.addDescriptionPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            multiline
            style={[
              styles.textArea,
              { color: colors.text, borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E7E2D9' },
            ]}
          />
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('createTask.locationLabel')}</Text>
          <TouchableOpacity style={styles.selectorRow} onPress={() => setSpotModalVisible(true)}>
            <Text style={[styles.selectorValue, { color: colors.text }]}>
              {selectedSpot?.name || t('createTask.selectLocation')}
            </Text>
            <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('createTask.priorityLabel')}</Text>
          <TouchableOpacity style={styles.selectorRow} onPress={() => setPriorityModalVisible(true)}>
            <Text style={[styles.selectorValue, { color: colors.text }]}>
              {selectedPriority?.name || t('voiceTaskReview.selectPriority')}
            </Text>
            <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('createTask.assignToLabel')}</Text>
          <TouchableOpacity style={styles.selectorRow} onPress={() => setAssigneeModalVisible(true)}>
            <Text style={[styles.selectorValue, { color: colors.text }]}>
              {selectedAssignees.length > 0 ? selectedAssignees.map((item: DraftUser) => item.name).join(', ') : t('createTask.selectAssignees')}
            </Text>
            <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E7E2D9' }]}>
        <TouchableOpacity
          style={[styles.secondaryButton, { borderColor: isDarkMode ? 'rgba(255,255,255,0.10)' : '#D7D0C5' }]}
          onPress={handleCancel}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.text }]}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            { backgroundColor: canConfirm ? primaryColor : (isDarkMode ? '#3A3A3A' : '#CFC9BE') },
          ]}
          disabled={!canConfirm}
          onPress={handleConfirm}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>{t('createTask.createButton')}</Text>
          )}
        </TouchableOpacity>
      </View>

      <PickerModal
        visible={workspaceModalVisible}
        title={t('createTask.selectWorkspaceModalTitle')}
        items={workspaceItems}
        searchable
        searchPlaceholder={t('common.search')}
        emptyText={t('common.noItemsFound')}
        selectedId={selectedWorkspaceId}
        onSelect={(item) => {
          setSelectedWorkspaceId(item.id);
          setWorkspaceModalVisible(false);
        }}
        onClose={() => setWorkspaceModalVisible(false)}
        colors={colors}
        primaryColor={primaryColor}
        isDarkMode={isDarkMode}
      />
      <PickerModal
        visible={templateModalVisible}
        title={t('createTask.selectTemplateModalTitle')}
        items={templateItems}
        searchable
        searchPlaceholder={t('common.search')}
        emptyText={t('common.noItemsFound')}
        selectedId={selectedTemplateId}
        onSelect={(item) => {
          const template = availableTemplates.find((entry: DraftTemplate) => entry.id === item.id) ?? null;
          setSelectedTemplateId(item.id);
          if (template?.workspaceId) {
            setSelectedWorkspaceId(template.workspaceId);
          }
          setTemplateModalVisible(false);
        }}
        onClose={() => setTemplateModalVisible(false)}
        colors={colors}
        primaryColor={primaryColor}
        isDarkMode={isDarkMode}
      />
      <PickerModal
        visible={spotModalVisible}
        title={t('createTask.selectLocationModalTitle')}
        items={spotItems}
        searchable
        searchPlaceholder={t('common.search')}
        emptyText={t('common.noItemsFound')}
        selectedId={selectedSpotId}
        onSelect={(item) => {
          setSelectedSpotId(item.id);
          setSpotModalVisible(false);
        }}
        onClose={() => setSpotModalVisible(false)}
        colors={colors}
        primaryColor={primaryColor}
        isDarkMode={isDarkMode}
      />
      <PickerModal
        visible={priorityModalVisible}
        title={t('voiceTaskReview.selectPriority')}
        items={priorityItems}
        searchable
        searchPlaceholder={t('common.search')}
        emptyText={t('common.noItemsFound')}
        selectedId={selectedPriorityId}
        onSelect={(item) => {
          setSelectedPriorityId(item.id);
          setPriorityModalVisible(false);
        }}
        onClose={() => setPriorityModalVisible(false)}
        colors={colors}
        primaryColor={primaryColor}
        isDarkMode={isDarkMode}
      />
      <UserPickerSheet
        visible={assigneeModalVisible}
        title={t('createTask.selectAssigneesModalTitle')}
        users={assigneePickerUsers}
        selectedIds={new Set(selectedAssigneeIds)}
        onToggleUser={toggleAssignee}
        onClose={() => setAssigneeModalVisible(false)}
        colors={colors}
        primaryColor={primaryColor}
        isDarkMode={isDarkMode}
        currentUserId={authUser?.id ?? null}
        currentUserName={authUser?.name ?? null}
        searchPlaceholder={t('common.searchUsers')}
        emptyText={t('common.noItemsFound')}
        youLabel={t('common.you')}
      />
      <Toast ref={toastRef} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontFamily: fontFamilies.displaySemibold,
    fontSize: fontSizes.lg,
  },
  headerAction: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: fontSizes.md,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  sectionLabel: {
    fontFamily: fontFamilies.bodySemibold,
    fontSize: fontSizes.xs,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  transcriptText: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: fontSizes.md,
    lineHeight: 22,
  },
  selectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  selectorRowDisabled: {
    opacity: 0.72,
  },
  selectorValue: {
    flex: 1,
    fontFamily: fontFamilies.bodyMedium,
    fontSize: fontSizes.md,
  },
  lockedHint: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: fontSizes.sm,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fontFamilies.bodyMedium,
    fontSize: fontSizes.md,
  },
  textArea: {
    minHeight: 110,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    textAlignVertical: 'top',
    fontFamily: fontFamilies.bodyMedium,
    fontSize: fontSizes.md,
  },
  warningCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  warningTitle: {
    fontFamily: fontFamilies.bodySemibold,
    fontSize: fontSizes.md,
    marginBottom: spacing.xs,
  },
  warningBody: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  secondaryButtonText: {
    fontFamily: fontFamilies.bodySemibold,
    fontSize: fontSizes.md,
  },
  primaryButton: {
    flex: 1.2,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontFamily: fontFamilies.bodySemibold,
    fontSize: fontSizes.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.32)',
    justifyContent: 'flex-end',
  },
  modalKeyboard: {
    flex: 1,
  },
  modalSheet: {
    maxHeight: '70%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  modalHandle: {
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.45)',
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontFamily: fontFamilies.displaySemibold,
    fontSize: fontSizes.lg,
    marginBottom: spacing.md,
  },
  modalSearchInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fontFamilies.bodyMedium,
    fontSize: fontSizes.md,
    marginBottom: spacing.sm,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  modalItemText: {
    flex: 1,
    fontFamily: fontFamilies.bodyMedium,
    fontSize: fontSizes.md,
  },
  emptyText: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: fontSizes.md,
  },
});
