import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { fontFamilies, fontSizes, radius, spacing } from '../config/designTokens';
import { RootStackParamList } from '../models/types';
import { useTenant } from '../hooks/useTenant';
import { GPS_CAPTURE_STORAGE_KEY } from './SettingsScreen';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'VoiceTaskReview'>;
type ScreenRouteProp = RouteProp<RootStackParamList, 'VoiceTaskReview'>;

type PickerItem = { id: string; name: string };

type DraftContextItem = { id: string; name: string };
type DraftWorkspace = DraftContextItem & { allowedCategoryIds: string[]; categoryId?: string; color?: string | null };
type DraftTemplate = DraftContextItem & {
  workspaceId?: string;
  categoryId?: string;
  defaultSpotId?: string;
  priorityId?: string;
  spotsNotApplicable: boolean;
};
type DraftSpot = DraftContextItem & { parentId?: string };
type DraftPriority = DraftContextItem & { color?: string | null };
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
  selectedId,
  selectedIds,
  multi = false,
  onSelect,
  onClose,
  colors,
  primaryColor,
  isDarkMode,
}) => (
  <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
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
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
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
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No items available</Text>
          }
        />
      </View>
    </TouchableOpacity>
  </Modal>
);

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

export const VoiceTaskReviewScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();
  const { tenantId } = useTenant();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { t } = useLanguage();

  const reviewData = useQuery(
    api.voiceTaskDrafts.get,
    tenantId ? { tenantId, draftId: route.params.draftId as any } : 'skip',
  );
  const confirmDraft = useMutation(api.voiceTaskDrafts.confirm);
  const cancelDraft = useMutation(api.voiceTaskDrafts.cancel);

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

    setInitializedDraftId(draftId);
    setSelectedWorkspaceId(proposal.workspaceId ?? context.selectedWorkspaceId ?? context.workspaces[0]?.id ?? null);
    setSelectedTemplateId(proposal.templateId ?? null);
    setTaskName(proposal.taskName ?? '');
    setDescription(proposal.description ?? '');
    setSelectedSpotId(proposal.spotId ?? null);
    setSelectedPriorityId(proposal.priorityId ?? null);
    setSelectedAssigneeIds(proposal.assigneeUserIds ?? []);
  }, [context, draft, initializedDraftId, proposal]);

  const availableTemplates = useMemo(() => {
    if (!context) return [];
    if (!selectedWorkspaceId) return context.templates;
    return context.templates.filter((template: DraftTemplate) => !template.workspaceId || template.workspaceId === selectedWorkspaceId);
  }, [context, selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedTemplateId) return;
    const exists = availableTemplates.some((template: DraftTemplate) => template.id === selectedTemplateId);
    if (!exists) {
      setSelectedTemplateId(null);
    }
  }, [availableTemplates, selectedTemplateId]);

  useEffect(() => {
    if (!selectedTemplate?.workspaceId) return;
    if (selectedTemplate.workspaceId !== selectedWorkspaceId) {
      setSelectedWorkspaceId(selectedTemplate.workspaceId);
    }
  }, [selectedTemplate, selectedWorkspaceId]);

  const selectedWorkspace = context?.workspaces.find((workspace: DraftWorkspace) => workspace.id === selectedWorkspaceId) ?? null;
  const selectedTemplate = availableTemplates.find((template: DraftTemplate) => template.id === selectedTemplateId) ?? null;
  const selectedSpot = context?.spots.find((spot: DraftSpot) => spot.id === selectedSpotId) ?? null;
  const selectedPriority = context?.priorities.find((priority: DraftPriority) => priority.id === selectedPriorityId) ?? null;
  const selectedAssignees = context?.users.filter((user: DraftUser) => selectedAssigneeIds.includes(user.id)) ?? [];

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

    if (selectedAssigneeIds.length > 0) missing.delete('assignees');

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

  const canConfirm =
    !!draft &&
    draft.status === 'ready' &&
    proposal.intent !== 'unsupported' &&
    liveMissingFields.length === 0 &&
    !isSubmitting;

  const workspaceItems = context?.workspaces.map((workspace: DraftWorkspace) => ({ id: workspace.id, name: workspace.name })) ?? [];
  const templateItems = availableTemplates.map((template: DraftTemplate) => ({ id: template.id, name: template.name }));
  const spotItems = context?.spots.map((spot: DraftSpot) => ({ id: spot.id, name: spot.name })) ?? [];
  const priorityItems = context?.priorities.map((priority: DraftPriority) => ({ id: priority.id, name: priority.name })) ?? [];
  const assigneeItems = context?.users.map((user: DraftUser) => ({ id: user.id, name: user.name })) ?? [];

  const toggleAssignee = useCallback((item: PickerItem) => {
    setSelectedAssigneeIds((current) =>
      current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id],
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
    if (liveMissingFields.length > 0) {
      Alert.alert('Missing information', 'Please resolve the missing fields before creating the task.');
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
      Alert.alert(t('common.success'), t('createTask.taskCreatedSuccess'));
      navigation.goBack();
    } catch (error: any) {
      Alert.alert(t('common.error'), error?.message || 'Could not create the task.');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    confirmDraft,
    description,
    draft,
    liveMissingFields.length,
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
        <Text style={[styles.emptyText, { color: colors.text }]}>Draft not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? colors.background : '#F6F5F2' }]}>
      <View style={[styles.header, { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E7E2D9' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Review task draft</Text>
        <TouchableOpacity onPress={handleCancel}>
          <Text style={[styles.headerAction, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Transcript</Text>
          <Text style={[styles.transcriptText, { color: colors.text }]}>
            {draft.transcript || proposal.transcript || 'No transcript available.'}
          </Text>
        </View>

        {proposal.intent === 'unsupported' ? (
          <View style={[styles.warningCard, { backgroundColor: isDarkMode ? 'rgba(239,68,68,0.14)' : '#FDE8E8' }]}>
            <Text style={[styles.warningTitle, { color: colors.text }]}>This didn&apos;t sound like a task request</Text>
            <Text style={[styles.warningBody, { color: colors.textSecondary }]}>
              Try again and describe the task you want to create, who it should be assigned to, and where it belongs.
            </Text>
          </View>
        ) : null}

        {(draft.warnings?.length ?? 0) > 0 ? (
          <View style={[styles.warningCard, { backgroundColor: isDarkMode ? 'rgba(245,158,11,0.16)' : '#FEF3C7' }]}>
            <Text style={[styles.warningTitle, { color: colors.text }]}>Warnings</Text>
            {(draft.warnings as string[]).map((warning, index) => (
              <Text key={`${warning}-${index}`} style={[styles.warningBody, { color: colors.textSecondary }]}>
                • {warning}
              </Text>
            ))}
          </View>
        ) : null}

        {liveMissingFields.length > 0 ? (
          <View style={[styles.warningCard, { backgroundColor: isDarkMode ? 'rgba(59,130,246,0.14)' : '#DBEAFE' }]}>
            <Text style={[styles.warningTitle, { color: colors.text }]}>Needs review</Text>
            {liveMissingFields.map((field) => (
              <Text key={field} style={[styles.warningBody, { color: colors.textSecondary }]}>
                • {field === 'taskName' ? 'Task title' : field.charAt(0).toUpperCase() + field.slice(1)}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Workspace</Text>
          <TouchableOpacity
            style={[styles.selectorRow, selectedTemplate ? styles.selectorRowDisabled : null]}
            onPress={selectedTemplate ? undefined : () => setWorkspaceModalVisible(true)}
            disabled={!!selectedTemplate}
          >
            <Text style={[styles.selectorValue, { color: colors.text }]}> 
              {selectedWorkspace?.name || 'Select workspace'}
            </Text>
            {selectedTemplate ? (
              <Text style={[styles.lockedHint, { color: colors.textSecondary }]}>From template</Text>
            ) : (
              <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textSecondary} />
            )}
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Template</Text>
          <TouchableOpacity style={styles.selectorRow} onPress={() => setTemplateModalVisible(true)}>
            <Text style={[styles.selectorValue, { color: colors.text }]}>
              {selectedTemplate?.name || (availableTemplates.length > 0 ? 'Select template' : 'No templates required')}
            </Text>
            <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {!selectedTemplate ? (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Task title</Text>
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
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Description</Text>
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
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Location</Text>
          <TouchableOpacity style={styles.selectorRow} onPress={() => setSpotModalVisible(true)}>
            <Text style={[styles.selectorValue, { color: colors.text }]}>
              {selectedSpot?.name || t('createTask.selectLocation')}
            </Text>
            <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Priority</Text>
          <TouchableOpacity style={styles.selectorRow} onPress={() => setPriorityModalVisible(true)}>
            <Text style={[styles.selectorValue, { color: colors.text }]}>
              {selectedPriority?.name || 'Select priority'}
            </Text>
            <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Assign to</Text>
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
          <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Cancel</Text>
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
            <Text style={styles.primaryButtonText}>Create task</Text>
          )}
        </TouchableOpacity>
      </View>

      <PickerModal
        visible={workspaceModalVisible}
        title="Select workspace"
        items={workspaceItems}
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
        title="Select template"
        items={templateItems}
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
        title="Select location"
        items={spotItems}
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
        title="Select priority"
        items={priorityItems}
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
      <PickerModal
        visible={assigneeModalVisible}
        title="Assign to"
        items={assigneeItems}
        selectedIds={new Set(selectedAssigneeIds)}
        multi
        onSelect={toggleAssignee}
        onClose={() => setAssigneeModalVisible(false)}
        colors={colors}
        primaryColor={primaryColor}
        isDarkMode={isDarkMode}
      />
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
