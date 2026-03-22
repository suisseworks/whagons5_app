import React, { useState, useMemo, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useTasks } from '../context/TaskContext';
import { useData } from '../context/DataContext';
import { useTenant } from '../hooks/useTenant';
import { FaIcon } from '../components/FaIcon';
import { parseWorkspaceIcon } from '../utils/helpers';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';

// ---------------------------------------------------------------------------
// Types for selected entities (we track both display name and Convex _id)
// ---------------------------------------------------------------------------
interface SelectedEntity {
  _id: string;
  name: string;
  color?: string | null;
}

// ---------------------------------------------------------------------------
// Reusable bottom-sheet selector modal
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

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={modalStyles.overlay} activeOpacity={1} onPress={onClose}>
        <View
          style={[
            modalStyles.sheet,
            { backgroundColor: colors.surface, borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7' },
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
              placeholderTextColor={colors.textSecondary}
              value={search}
              onChangeText={setSearch}
              autoFocus
            />
          )}

          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item._id)}
            style={{ maxHeight: 350 }}
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
                    {item.subtitle ? (
                      <Text style={[modalStyles.itemSubtitle, { color: colors.textSecondary }]}>{item.subtitle}</Text>
                    ) : null}
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
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// CreateTaskScreen
// ---------------------------------------------------------------------------
export const CreateTaskScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { createTask, selectedWorkspace, workspaceObjects, statuses } = useTasks();
  const { data } = useData();
  const { tenantId } = useTenant();

  // Form state
  const [chosenWorkspaceId, setChosenWorkspaceId] = useState<string | null>(null);
  const [taskName, setTaskName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<SelectedEntity | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<SelectedEntity | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<SelectedEntity | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<SelectedEntity | null>(null);
  const [selectedAssignees, setSelectedAssignees] = useState<SelectedEntity[]>([]);
  const [selectedTags, setSelectedTags] = useState<SelectedEntity[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal visibility
  const [workspaceModalVisible, setWorkspaceModalVisible] = useState(
    // Auto-open workspace picker when coming from "Everything"
    selectedWorkspace === 'Everything'
  );
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [spotModalVisible, setSpotModalVisible] = useState(false);
  const [priorityModalVisible, setPriorityModalVisible] = useState(false);
  const [assigneeModalVisible, setAssigneeModalVisible] = useState(false);
  const [tagModalVisible, setTagModalVisible] = useState(false);

  // ---------------------------------------------------------------------------
  // Resolve current workspace
  // ---------------------------------------------------------------------------
  const currentWorkspace = useMemo(() => {
    // If user explicitly chose a workspace (e.g. from "Everything"), use that
    if (chosenWorkspaceId) {
      return data.workspaces.find((w: any) => w._id === chosenWorkspaceId) as any;
    }
    if (selectedWorkspace === 'Everything') {
      return null; // Force workspace selection
    }
    return data.workspaces.find((w: any) => w.name === selectedWorkspace) as any;
  }, [selectedWorkspace, data.workspaces, chosenWorkspaceId]);

  const workspaceConvexId = currentWorkspace?._id ?? null;
  const workspaceColor = currentWorkspace?.color ?? primaryColor;

  // ---------------------------------------------------------------------------
  // Resolve categories for this workspace and determine creation mode
  // ---------------------------------------------------------------------------
  const workspaceCategories = useMemo(() => {
    if (!currentWorkspace) return [];
    return data.categories.filter((c: any) => c._id === currentWorkspace.categoryId || c.workspaceId === currentWorkspace._id);
  }, [currentWorkspace, data.categories]);

  // Determine if the workspace is freeform (any of its categories allow freeform)
  const isFreeform = useMemo(() => {
    if (workspaceCategories.length === 0) return true; // no categories = allow freeform
    return workspaceCategories.some((c: any) => c.taskCreationMode === 'freeform');
  }, [workspaceCategories]);

  // ---------------------------------------------------------------------------
  // Build selector items from synced data, filtered by workspace
  // ---------------------------------------------------------------------------
  const workspaceCategoryIds = useMemo(() => {
    return new Set(workspaceCategories.map((c: any) => c._id));
  }, [workspaceCategories]);

  const templateItems = useMemo(() => {
    return data.templates
      .filter((t: any) => {
        if (t.enabled === false || t.deletedAt) return false;
        // Filter by workspace categories
        if (workspaceCategoryIds.size > 0 && t.categoryId) {
          return workspaceCategoryIds.has(t.categoryId);
        }
        // If no categories for workspace, show all templates
        return workspaceCategoryIds.size === 0;
      })
      .map((t: any) => ({ _id: t._id, name: t.name }));
  }, [data.templates, workspaceCategoryIds]);

  const spotItems = useMemo(() => {
    return data.spots.map((s: any) => ({ _id: s._id, name: s.name }));
  }, [data.spots]);

  const priorityItems = useMemo(() => {
    return data.priorities.map((p: any) => ({ _id: p._id, name: p.name, color: p.color ?? null }));
  }, [data.priorities]);

  const userItems = useMemo(() => {
    return data.users.map((u: any) => ({ _id: u._id, name: u.name }));
  }, [data.users]);

  const tagItems = useMemo(() => {
    return data.tags.map((t: any) => ({ _id: t._id, name: t.name, color: t.color ?? null }));
  }, [data.tags]);

  const workspaceItems = useMemo(() => {
    return data.workspaces.map((w: any) => ({
      _id: w._id,
      name: w.name,
      color: w.color ?? null,
    }));
  }, [data.workspaces]);

  const selectedAssigneeIds = useMemo(() => new Set(selectedAssignees.map((a) => a._id)), [selectedAssignees]);
  const selectedTagIds = useMemo(() => new Set(selectedTags.map((t) => t._id)), [selectedTags]);

  // Resolve initial status Convex _id (for the workspace's category)
  const initialStatusConvexId = useMemo(() => {
    // Try to find the initial status for the workspace's categories first
    if (workspaceCategoryIds.size > 0) {
      const s = data.statuses.find((s: any) => s.initial && workspaceCategoryIds.has(s.categoryId));
      if (s) return (s as any)._id;
    }
    // Fallback to any initial status
    const s = data.statuses.find((s: any) => s.initial);
    return s ? (s as any)._id : null;
  }, [data.statuses, workspaceCategoryIds]);

  // ---------------------------------------------------------------------------
  // Workspace selection handler
  // ---------------------------------------------------------------------------
  const handleWorkspaceSelect = useCallback((ws: { _id: string; name: string }) => {
    setChosenWorkspaceId(ws._id);
    setWorkspaceModalVisible(false);
    // Reset form since different workspace = different templates/categories
    setSelectedTemplate(null);
    setSelectedCategory(null);
    setSelectedPriority(null);
    setTaskName('');
  }, []);

  // ---------------------------------------------------------------------------
  // Template auto-fill
  // ---------------------------------------------------------------------------
  const handleTemplateSelect = useCallback((template: { _id: string; name: string }) => {
    setSelectedTemplate(template);
    setTemplateModalVisible(false);

    // Find the full template object to auto-fill
    const tpl = data.templates.find((t: any) => t._id === template._id) as any;
    if (!tpl) return;

    // In strict mode, task name = template name. In freeform, only fill if empty.
    if (!isFreeform) {
      setTaskName(tpl.name);
    } else if (!taskName.trim()) {
      setTaskName(tpl.name);
    }

    // Auto-fill priority
    if (tpl.priorityId) {
      const p = data.priorities.find((p: any) => p._id === tpl.priorityId) as any;
      if (p) setSelectedPriority({ _id: p._id, name: p.name, color: p.color ?? null });
    }

    // Auto-fill spot
    if (tpl.defaultSpotId) {
      const s = data.spots.find((s: any) => s._id === tpl.defaultSpotId) as any;
      if (s) setSelectedSpot({ _id: s._id, name: s.name });
    }

    // Auto-fill category
    if (tpl.categoryId) {
      const c = data.categories.find((c: any) => c._id === tpl.categoryId) as any;
      if (c) setSelectedCategory({ _id: c._id, name: c.name, color: c.color ?? null });
    }
  }, [data.templates, data.priorities, data.spots, data.categories, taskName, isFreeform]);

  // ---------------------------------------------------------------------------
  // Create task handler
  // ---------------------------------------------------------------------------
  const handleCreateTask = useCallback(async () => {
    // In strict mode, template is required
    if (!isFreeform && !selectedTemplate) {
      Alert.alert('Error', 'Please select a template');
      return;
    }

    // Resolve the final task name
    const finalName = isFreeform
      ? taskName.trim()
      : (selectedTemplate?.name ?? taskName.trim());

    if (!finalName) {
      Alert.alert('Error', 'Please enter a task name');
      return;
    }

    if (!workspaceConvexId) {
      Alert.alert('Error', 'No workspace available. Please select a workspace first.');
      return;
    }

    setIsSubmitting(true);
    try {
      await createTask({
        name: finalName,
        description: description.trim() || undefined,
        workspaceConvexId,
        categoryConvexId: selectedCategory?._id,
        templateConvexId: selectedTemplate?._id,
        spotConvexId: selectedSpot?._id,
        statusConvexId: initialStatusConvexId ?? undefined,
        priorityConvexId: selectedPriority?._id,
        userConvexIds: selectedAssignees.map((a) => a._id),
      });

      Alert.alert('Success', 'Task created successfully');
      navigation.goBack();
    } catch (err: any) {
      console.warn('[CreateTask] Failed:', err);
      Alert.alert('Error', err?.message || 'Failed to create task. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    taskName, description, selectedCategory, selectedTemplate,
    selectedSpot, selectedPriority, selectedAssignees,
    initialStatusConvexId, workspaceConvexId, createTask, navigation, isFreeform,
  ]);

  // ---------------------------------------------------------------------------
  // Toggle helpers for multi-select
  // ---------------------------------------------------------------------------
  const handleToggleAssignee = useCallback((item: { _id: string; name: string }) => {
    setSelectedAssignees((prev) => {
      const exists = prev.find((a) => a._id === item._id);
      if (exists) return prev.filter((a) => a._id !== item._id);
      return [...prev, { _id: item._id, name: item.name }];
    });
  }, []);

  const handleToggleTag = useCallback((item: { _id: string; name: string; color?: string | null }) => {
    setSelectedTags((prev) => {
      const exists = prev.find((t) => t._id === item._id);
      if (exists) return prev.filter((t) => t._id !== item._id);
      return [...prev, { _id: item._id, name: item.name, color: item.color }];
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Shared input style
  // ---------------------------------------------------------------------------
  const inputStyle = [
    styles.input,
    { backgroundColor: colors.surface, color: colors.text, borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7' },
  ];

  const selectorStyle = [
    styles.selector,
    { backgroundColor: colors.surface, borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7' },
  ];

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

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

          {/* Workspace indicator */}
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
              {currentWorkspace?.name ?? 'Select workspace'}
            </Text>
            <MaterialIcons name="keyboard-arrow-down" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Template (strict mode) OR Task Name (freeform mode) — mutually exclusive */}
          {isFreeform ? (
            <>
              <Text style={[styles.label, { color: colors.text }]}>Task Name</Text>
              <TextInput
                style={inputStyle}
                placeholder="Enter task name"
                placeholderTextColor={colors.textSecondary}
                value={taskName}
                onChangeText={setTaskName}
              />
            </>
          ) : (
            <>
              <Text style={[styles.label, { color: colors.text }]}>Template</Text>
              <TouchableOpacity style={selectorStyle} onPress={() => setTemplateModalVisible(true)}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.selectorText, selectedTemplate ? { color: colors.text } : { color: colors.textSecondary }]}>
                    {selectedTemplate?.name ?? 'Select a template'}
                  </Text>
                </View>
                {selectedTemplate ? (
                  <TouchableOpacity onPress={() => { setSelectedTemplate(null); setSelectedCategory(null); setTaskName(''); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <MaterialIcons name="close" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                ) : (
                  <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textSecondary} />
                )}
              </TouchableOpacity>
            </>
          )}

          {/* Description */}
          <Text style={[styles.label, { color: colors.text }]}>Description</Text>
          <TextInput
            style={[...inputStyle, styles.textArea]}
            placeholder="Add a description (optional)"
            placeholderTextColor={colors.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {/* Location (Spot) */}
          <Text style={[styles.label, { color: colors.text }]}>Location</Text>
          <TouchableOpacity style={selectorStyle} onPress={() => setSpotModalVisible(true)}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.selectorText, selectedSpot ? { color: colors.text } : { color: colors.textSecondary }]}>
                {selectedSpot?.name ?? 'Select a location (optional)'}
              </Text>
            </View>
            {selectedSpot ? (
              <TouchableOpacity onPress={() => setSelectedSpot(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialIcons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            ) : (
              <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textSecondary} />
            )}
          </TouchableOpacity>

          {/* Assignees */}
          <Text style={[styles.label, { color: colors.text }]}>Assignees</Text>
          <TouchableOpacity style={selectorStyle} onPress={() => setAssigneeModalVisible(true)}>
            <View style={{ flex: 1 }}>
              {selectedAssignees.length === 0 ? (
                <Text style={[styles.selectorText, { color: colors.textSecondary }]}>Select assignees (optional)</Text>
              ) : (
                <Text style={[styles.selectorText, { color: colors.text }]} numberOfLines={1}>
                  {selectedAssignees.map((a) => a.name).join(', ')}
                </Text>
              )}
            </View>
            <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          {selectedAssignees.length > 0 && (
            <View style={styles.chipsContainer}>
              {selectedAssignees.map((assignee) => (
                <View key={assignee._id} style={[styles.chip, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#F3EEE4' }]}>
                  <Text style={[styles.chipText, { color: colors.text }]}>{assignee.name}</Text>
                  <TouchableOpacity onPress={() => setSelectedAssignees((prev) => prev.filter((a) => a._id !== assignee._id))}>
                    <MaterialIcons name="close" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Priority */}
          <Text style={[styles.label, { color: colors.text }]}>Priority</Text>
          <TouchableOpacity style={selectorStyle} onPress={() => setPriorityModalVisible(true)}>
            <View style={styles.priorityRow}>
              {selectedPriority?.color && (
                <View style={[styles.priorityDot, { backgroundColor: selectedPriority.color }]} />
              )}
              <Text style={[styles.selectorText, selectedPriority ? { color: colors.text } : { color: colors.textSecondary }]}>
                {selectedPriority?.name ?? 'Select priority (optional)'}
              </Text>
            </View>
            {selectedPriority ? (
              <TouchableOpacity onPress={() => setSelectedPriority(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialIcons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            ) : (
              <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textSecondary} />
            )}
          </TouchableOpacity>

          {/* Tags */}
          <Text style={[styles.label, { color: colors.text }]}>Tags</Text>
          <TouchableOpacity style={selectorStyle} onPress={() => setTagModalVisible(true)}>
            <View style={{ flex: 1 }}>
              {selectedTags.length === 0 ? (
                <Text style={[styles.selectorText, { color: colors.textSecondary }]}>Select tags (optional)</Text>
              ) : (
                <Text style={[styles.selectorText, { color: colors.text }]} numberOfLines={1}>
                  {selectedTags.map((t) => t.name).join(', ')}
                </Text>
              )}
            </View>
            <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          {selectedTags.length > 0 && (
            <View style={styles.chipsContainer}>
              {selectedTags.map((tag) => (
                <View key={tag._id} style={[styles.chip, { backgroundColor: tag.color ? `${tag.color}20` : (isDarkMode ? 'rgba(255,255,255,0.08)' : '#F3EEE4') }]}>
                  {tag.color && <View style={[styles.tagDot, { backgroundColor: tag.color }]} />}
                  <Text style={[styles.chipText, { color: colors.text }]}>{tag.name}</Text>
                  <TouchableOpacity onPress={() => setSelectedTags((prev) => prev.filter((t) => t._id !== tag._id))}>
                    <MaterialIcons name="close" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Category (shown if auto-filled from template) */}
          {selectedCategory && (
            <>
              <Text style={[styles.label, { color: colors.text }]}>Category</Text>
              <View style={[selectorStyle, { opacity: 0.7 }]}>
                {selectedCategory.color && (
                  <View style={[styles.priorityDot, { backgroundColor: selectedCategory.color }]} />
                )}
                <Text style={[styles.selectorText, { color: colors.text, flex: 1 }]}>{selectedCategory.name}</Text>
                <MaterialIcons name="auto-fix-high" size={16} color={colors.textSecondary} />
              </View>
            </>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer */}
      <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7' }]}>
        <TouchableOpacity
          style={[styles.createButton, { backgroundColor: primaryColor }, isSubmitting && { opacity: 0.6 }]}
          onPress={handleCreateTask}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <MaterialIcons name="add-task" size={20} color="#FFFFFF" />
          )}
          <Text style={styles.createButtonText}>{isSubmitting ? 'Creating...' : 'Create Task'}</Text>
        </TouchableOpacity>
      </View>

      {/* ------------------------------------------------------------------- */}
      {/* Selector Modals                                                      */}
      {/* ------------------------------------------------------------------- */}

      {/* Workspace Modal */}
      <SelectorModal
        visible={workspaceModalVisible}
        title="Select Workspace"
        items={workspaceItems}
        selectedId={currentWorkspace?._id}
        onSelect={handleWorkspaceSelect}
        onClose={() => {
          setWorkspaceModalVisible(false);
          // If no workspace selected and we came from Everything, go back
          if (!currentWorkspace) navigation.goBack();
        }}
        colors={colors}
        isDarkMode={isDarkMode}
        primaryColor={primaryColor}
      />

      {/* Template Modal */}
      <SelectorModal
        visible={templateModalVisible}
        title="Select Template"
        items={templateItems}
        selectedId={selectedTemplate?._id}
        onSelect={handleTemplateSelect}
        onClose={() => setTemplateModalVisible(false)}
        searchable
        colors={colors}
        isDarkMode={isDarkMode}
        primaryColor={primaryColor}
      />

      {/* Spot Modal */}
      <SelectorModal
        visible={spotModalVisible}
        title="Select Location"
        items={spotItems}
        selectedId={selectedSpot?._id}
        onSelect={(item) => { setSelectedSpot(item); setSpotModalVisible(false); }}
        onClose={() => setSpotModalVisible(false)}
        searchable
        colors={colors}
        isDarkMode={isDarkMode}
        primaryColor={primaryColor}
      />

      {/* Priority Modal */}
      <SelectorModal
        visible={priorityModalVisible}
        title="Select Priority"
        items={priorityItems}
        selectedId={selectedPriority?._id}
        onSelect={(item) => { setSelectedPriority(item); setPriorityModalVisible(false); }}
        onClose={() => setPriorityModalVisible(false)}
        colors={colors}
        isDarkMode={isDarkMode}
        primaryColor={primaryColor}
      />

      {/* Assignee Modal (multi-select) */}
      <SelectorModal
        visible={assigneeModalVisible}
        title="Select Assignees"
        items={userItems}
        onSelect={handleToggleAssignee}
        onClose={() => setAssigneeModalVisible(false)}
        searchable
        multiSelect
        selectedIds={selectedAssigneeIds}
        colors={colors}
        isDarkMode={isDarkMode}
        primaryColor={primaryColor}
      />

      {/* Tag Modal (multi-select) */}
      <SelectorModal
        visible={tagModalVisible}
        title="Select Tags"
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
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
    marginBottom: 4,
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
  label: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
    marginBottom: 8,
    marginTop: 20,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyMedium,
  },
  textArea: {
    minHeight: 80,
    paddingTop: 14,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  selectorText: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyMedium,
  },
  priorityRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  priorityDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  tagDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6,
    marginBottom: 6,
  },
  chipText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    marginRight: 4,
  },
  footer: {
    padding: 16,
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

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 12,
    paddingBottom: 32,
    paddingHorizontal: 20,
    ...shadows.subtle,
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
  itemSubtitle: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
    marginTop: 2,
  },
  emptyText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
