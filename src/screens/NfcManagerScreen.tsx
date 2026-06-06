import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import * as Crypto from 'expo-crypto';
import { api } from '../../../convex/_generated/api';
import { fontFamilies, radius, spacing } from '../config/designTokens';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useNetwork } from '../context/NetworkContext';
import { useTheme } from '../context/ThemeContext';
import { useTenant } from '../hooks/useTenant';
import { writeNfcUrl } from '../services/nfcService';
import {
  getNfcActionLabel,
  getNfcLinkedActionLabel,
  getNfcTapUrl,
  NfcActionKind,
  NfcExecutionMode,
  NfcLinkedAction,
} from '../utils/nfc';
import {
  buildNfcManagerSavePayload,
  canSaveNfcManagerForm,
  emptyNfcManagerForm,
  getNfcManagerFormFromTag,
  type NfcManagerFormState,
} from '../utils/nfcManager';

type NfcTagRecord = {
  _id: string;
  uuid: string;
  label?: string | null;
  actionKind?: NfcActionKind;
  actionConfig?: Record<string, any>;
  actionType?: string;
  executionMode?: NfcExecutionMode;
  isActive?: boolean;
  lastTappedAt?: number | null;
  programmedAt?: number | null;
  workspaceName?: string | null;
  taskName?: string | null;
  templateName?: string | null;
  categoryName?: string | null;
  spotName?: string | null;
  activeSessionCount?: number;
};

type Option = {
  value: string;
  label: string;
  subtitle?: string;
};

const actionKinds: NfcActionKind[] = ['task_session_toggle', 'linked_task_status', 'open_url'];
const linkedActions: NfcLinkedAction[] = ['open_task', 'start_task', 'complete_task'];

const rowId = (row: any): string => String(row?._id ?? row?.convexId ?? row?.id ?? '');
const rowName = (row: any): string => String(row?.name ?? row?.title ?? 'Untitled');

async function hashTagUid(tagUid?: string | null) {
  if (!tagUid) return undefined;
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, tagUid);
}

function formatDate(value?: number | null) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

function SelectField({
  title,
  value,
  options,
  onSelect,
  placeholder,
}: {
  title: string;
  value: string;
  options: Option[];
  onSelect: (value: string) => void;
  placeholder: string;
}) {
  const { colors, primaryColor, isDarkMode } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)';

  return (
    <>
      <TouchableOpacity
        style={[styles.selectButton, { borderColor }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <View style={styles.selectTextGroup}>
          <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{title}</Text>
          <Text style={[styles.selectValue, { color: selected ? colors.text : colors.textSecondary }]} numberOfLines={1}>
            {selected?.label ?? placeholder}
          </Text>
          {selected?.subtitle ? (
            <Text style={[styles.optionSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {selected.subtitle}
            </Text>
          ) : null}
        </View>
        <MaterialIcons name="expand-more" size={22} color={colors.textSecondary} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalScrim}>
          <View style={[styles.optionSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{title}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10}>
                <MaterialIcons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.optionList}>
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.optionRow,
                      isSelected && { backgroundColor: `${primaryColor}14` },
                    ]}
                    onPress={() => {
                      onSelect(option.value);
                      setOpen(false);
                    }}
                  >
                    <View style={styles.optionTextGroup}>
                      <Text style={[styles.optionLabel, { color: colors.text }]}>{option.label}</Text>
                      {option.subtitle ? (
                        <Text style={[styles.optionSubtitle, { color: colors.textSecondary }]}>{option.subtitle}</Text>
                      ) : null}
                    </View>
                    {isSelected ? <MaterialIcons name="check" size={20} color={primaryColor} /> : null}
                  </TouchableOpacity>
                );
              })}
              {options.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No options available.</Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

export const NfcManagerScreen: React.FC = () => {
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { tenantId } = useTenant();
  const { token } = useAuth();
  const { isOnline } = useNetwork();
  const { data } = useData();
  const tagsRaw = useQuery(api.nfc.listTags, tenantId ? { tenantId } : 'skip');
  const createTag = useMutation(api.nfc.createTag);
  const updateTag = useMutation(api.nfc.updateTag);
  const markProgrammed = useMutation(api.nfc.markProgrammed);
  const deactivateTag = useMutation(api.nfc.deactivateTag);

  const [formOpen, setFormOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<NfcTagRecord | null>(null);
  const [form, setForm] = useState<NfcManagerFormState>(emptyNfcManagerForm);
  const [saving, setSaving] = useState(false);
  const [writingTagId, setWritingTagId] = useState<string | null>(null);

  const tags = (tagsRaw ?? []) as NfcTagRecord[];
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7';
  const mutedSurface = isDarkMode ? 'rgba(255,255,255,0.06)' : '#F5F5F7';

  const workspaces = useMemo<Option[]>(
    () => (data.workspaces ?? [])
      .filter((row: any) => rowId(row))
      .map((row: any) => ({ value: rowId(row), label: rowName(row) })),
    [data.workspaces],
  );
  const workspaceNameById = useMemo(
    () => new Map(workspaces.map((option) => [option.value, option.label])),
    [workspaces],
  );
  const categories = useMemo<Option[]>(
    () => (data.categories ?? [])
      .filter((row: any) => rowId(row))
      .map((row: any) => ({ value: rowId(row), label: rowName(row), subtitle: workspaceNameById.get(String(row.workspaceId ?? row.workspace_id)) })),
    [data.categories, workspaceNameById],
  );
  const templates = useMemo<Option[]>(
    () => (data.templates ?? [])
      .filter((row: any) => rowId(row))
      .map((row: any) => ({ value: rowId(row), label: rowName(row) })),
    [data.templates],
  );
  const spots = useMemo<Option[]>(
    () => (data.spots ?? [])
      .filter((row: any) => rowId(row))
      .map((row: any) => ({ value: rowId(row), label: rowName(row) })),
    [data.spots],
  );
  const priorities = useMemo<Option[]>(
    () => (data.priorities ?? [])
      .filter((row: any) => rowId(row))
      .map((row: any) => ({ value: rowId(row), label: rowName(row) })),
    [data.priorities],
  );
  const tasks = useMemo<Option[]>(
    () => (data.tasks ?? [])
      .filter((task: any) => rowId(task) && !task.deleted_at && !task.deletedAt)
      .slice()
      .sort((a: any, b: any) => rowName(a).localeCompare(rowName(b)))
      .map((task: any) => ({
        value: rowId(task),
        label: rowName(task),
        subtitle: workspaceNameById.get(String(task.workspaceId ?? task.workspace_id)) ?? undefined,
      })),
    [data.tasks, workspaceNameById],
  );

  const canSave = canSaveNfcManagerForm(form, saving);

  const openCreate = () => {
    setEditingTag(null);
    setForm(emptyNfcManagerForm);
    setFormOpen(true);
  };

  const openEdit = (tag: NfcTagRecord) => {
    setEditingTag(tag);
    setForm(getNfcManagerFormFromTag(tag));
    setFormOpen(true);
  };

  const saveTag = useCallback(async () => {
    if (!tenantId || !canSave) return;
    setSaving(true);
    try {
      const payload = buildNfcManagerSavePayload(form, tenantId);
      if (editingTag) {
        await updateTag({ ...payload, id: editingTag._id as any, isActive: editingTag.isActive !== false });
      } else {
        await createTag(payload);
      }
      setFormOpen(false);
      Vibration.vibrate(40);
    } catch (error: any) {
      Alert.alert('NFC', error?.message || 'Unable to save this NFC tag.');
      Vibration.vibrate([0, 80, 60, 80]);
    } finally {
      setSaving(false);
    }
  }, [canSave, createTag, editingTag, form, tenantId, updateTag]);

  const writeTag = useCallback(async (tag: NfcTagRecord) => {
    if (!tenantId || !token) {
      Alert.alert('NFC', 'Sign in and select a tenant before programming NFC cards.');
      return;
    }
    if (!isOnline) {
      Alert.alert('NFC', 'Programming needs a connection.');
      return;
    }

    const url = getNfcTapUrl(tag.uuid, tenantId);
    setWritingTagId(String(tag._id));
    try {
      const result = await writeNfcUrl(url);
      await markProgrammed({
        tenantId,
        id: tag._id as any,
        tagUidHash: await hashTagUid(result.tagUid),
      });
      Alert.alert('NFC card programmed', url);
      Vibration.vibrate(80);
    } catch (error: any) {
      Alert.alert('NFC', error?.message || 'Unable to program NFC card.');
      Vibration.vibrate([0, 80, 60, 80]);
    } finally {
      setWritingTagId(null);
    }
  }, [isOnline, markProgrammed, tenantId, token]);

  const deactivate = useCallback((tag: NfcTagRecord) => {
    if (!tenantId) return;
    Alert.alert('Deactivate NFC tag?', tag.label || tag.uuid, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Deactivate',
        style: 'destructive',
        onPress: () => {
          deactivateTag({ tenantId, id: tag._id as any }).catch((error: any) => {
            Alert.alert('NFC', error?.message || 'Unable to deactivate NFC tag.');
          });
        },
      },
    ]);
  }, [deactivateTag, tenantId]);

  const renderTagTarget = (tag: NfcTagRecord) => {
    if (tag.actionKind === 'open_url') return String(tag.actionConfig?.url ?? 'URL');
    if (tag.actionKind === 'linked_task_status') return tag.taskName || 'Linked task';
    return [tag.templateName || tag.categoryName || tag.actionConfig?.taskName || 'Task session', tag.workspaceName, tag.spotName]
      .filter(Boolean)
      .join(' · ');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View style={styles.headerTitleGroup}>
          <Text style={[styles.title, { color: colors.text }]}>NFC cards</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Create actions and write physical NFC cards from this phone.</Text>
        </View>
        <TouchableOpacity style={[styles.headerButton, { backgroundColor: primaryColor }]} onPress={openCreate}>
          <MaterialIcons name="add" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {tagsRaw === undefined ? (
        <View style={styles.centered}>
          <ActivityIndicator color={primaryColor} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {tags.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor }]}>
              <MaterialIcons name="nfc" size={28} color={primaryColor} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No NFC cards yet</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Create an action, then tap Program card to write it.</Text>
              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: primaryColor }]} onPress={openCreate}>
                <Text style={styles.primaryButtonText}>Create NFC action</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {tags.map((tag) => {
            const isWriting = writingTagId === String(tag._id);
            return (
              <View key={String(tag._id)} style={[styles.tagCard, { backgroundColor: colors.surface, borderColor }]}>
                <View style={styles.tagHeader}>
                  <View style={styles.tagTitleGroup}>
                    <Text style={[styles.tagTitle, { color: colors.text }]}>{tag.label || 'Untitled NFC card'}</Text>
                    <Text style={[styles.tagMeta, { color: colors.textSecondary }]}>{getNfcActionLabel(tag.actionKind)}</Text>
                  </View>
                  <View style={[styles.statePill, { backgroundColor: tag.isActive === false ? '#E5E7EB' : `${primaryColor}18` }]}>
                    <Text style={[styles.stateText, { color: tag.isActive === false ? '#6B7280' : primaryColor }]}>
                      {tag.isActive === false ? 'Inactive' : 'Active'}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.targetText, { color: colors.text }]}>{renderTagTarget(tag)}</Text>
                {tag.actionKind === 'linked_task_status' ? (
                  <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                    {getNfcLinkedActionLabel(tag.actionConfig?.actionType ?? tag.actionType)}
                  </Text>
                ) : null}
                <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                  Last tap: {formatDate(tag.lastTappedAt)}
                  {tag.programmedAt ? ` · Programmed ${formatDate(tag.programmedAt)}` : ''}
                </Text>

                <View style={styles.cardActions}>
                  <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: mutedSurface }]} onPress={() => openEdit(tag)}>
                    <MaterialIcons name="edit" size={18} color={colors.text} />
                    <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryButton, { backgroundColor: primaryColor, opacity: isWriting ? 0.7 : 1 }]}
                    disabled={isWriting}
                    onPress={() => void writeTag(tag)}
                  >
                    {isWriting ? <ActivityIndicator size="small" color="#FFFFFF" /> : <MaterialIcons name="nfc" size={18} color="#FFFFFF" />}
                    <Text style={styles.primaryButtonText}>{isWriting ? 'Writing...' : 'Program card'}</Text>
                  </TouchableOpacity>
                  {tag.isActive !== false ? (
                    <TouchableOpacity style={[styles.iconButton, { backgroundColor: mutedSurface }]} onPress={() => deactivate(tag)}>
                      <MaterialIcons name="power-settings-new" size={18} color="#DC2626" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={formOpen} animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={styles.header}>
            <View style={styles.headerTitleGroup}>
              <Text style={[styles.title, { color: colors.text }]}>{editingTag ? 'Edit NFC action' : 'New NFC action'}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Choose what this card should do when tapped.</Text>
            </View>
            <TouchableOpacity style={[styles.iconButton, { backgroundColor: mutedSurface }]} onPress={() => setFormOpen(false)}>
              <MaterialIcons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.formContent}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Label</Text>
            <TextInput
              value={form.label}
              onChangeText={(label) => setForm((current) => ({ ...current, label }))}
              placeholder="Room 204 minibar"
              placeholderTextColor={colors.textSecondary}
              style={[styles.textInput, { color: colors.text, borderColor, backgroundColor: colors.surface }]}
            />

            <View style={styles.segmented}>
              {actionKinds.map((kind) => {
                const selected = form.actionKind === kind;
                return (
                  <TouchableOpacity
                    key={kind}
                    style={[styles.segment, { backgroundColor: selected ? primaryColor : mutedSurface }]}
                    onPress={() => setForm((current) => ({ ...current, actionKind: kind }))}
                  >
                    <Text style={[styles.segmentText, { color: selected ? '#FFFFFF' : colors.text }]}>
                      {getNfcActionLabel(kind)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.segmented}>
              {(['direct', 'confirm'] as NfcExecutionMode[]).map((mode) => {
                const selected = form.executionMode === mode;
                return (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.segment, { backgroundColor: selected ? primaryColor : mutedSurface }]}
                    onPress={() => setForm((current) => ({ ...current, executionMode: mode }))}
                  >
                    <Text style={[styles.segmentText, { color: selected ? '#FFFFFF' : colors.text }]}>
                      {mode === 'direct' ? 'Run directly' : 'Ask first'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {form.actionKind === 'task_session_toggle' ? (
              <>
                <SelectField title="Workspace" value={form.workspaceId} options={workspaces} placeholder="Choose workspace" onSelect={(workspaceId) => setForm((current) => ({ ...current, workspaceId }))} />
                <SelectField title="Task type" value={form.categoryId} options={categories} placeholder="Optional" onSelect={(categoryId) => setForm((current) => ({ ...current, categoryId }))} />
                <SelectField title="Template" value={form.templateId} options={templates} placeholder="Optional" onSelect={(templateId) => setForm((current) => ({ ...current, templateId }))} />
                <SelectField title="Spot" value={form.spotId} options={spots} placeholder="Optional" onSelect={(spotId) => setForm((current) => ({ ...current, spotId }))} />
                <SelectField title="Priority" value={form.priorityId} options={priorities} placeholder="Optional" onSelect={(priorityId) => setForm((current) => ({ ...current, priorityId }))} />
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Task name override</Text>
                <TextInput
                  value={form.taskName}
                  onChangeText={(taskName) => setForm((current) => ({ ...current, taskName }))}
                  placeholder="Optional"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.textInput, { color: colors.text, borderColor, backgroundColor: colors.surface }]}
                />
              </>
            ) : null}

            {form.actionKind === 'linked_task_status' ? (
              <>
                <SelectField title="Task" value={form.taskId} options={tasks} placeholder="Choose task" onSelect={(taskId) => setForm((current) => ({ ...current, taskId }))} />
                <View style={styles.segmented}>
                  {linkedActions.map((action) => {
                    const selected = form.linkedAction === action;
                    return (
                      <TouchableOpacity
                        key={action}
                        style={[styles.segment, { backgroundColor: selected ? primaryColor : mutedSurface }]}
                        onPress={() => setForm((current) => ({ ...current, linkedAction: action }))}
                      >
                        <Text style={[styles.segmentText, { color: selected ? '#FFFFFF' : colors.text }]}>
                          {getNfcLinkedActionLabel(action)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}

            {form.actionKind === 'open_url' ? (
              <>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>URL</Text>
                <TextInput
                  value={form.url}
                  onChangeText={(url) => setForm((current) => ({ ...current, url }))}
                  placeholder="https://..."
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  keyboardType="url"
                  style={[styles.textInput, { color: colors.text, borderColor, backgroundColor: colors.surface }]}
                />
              </>
            ) : null}

            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: primaryColor, opacity: canSave ? 1 : 0.45 }]}
              disabled={!canSave}
              onPress={() => void saveTag()}
            >
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
              <Text style={styles.primaryButtonText}>{editingTag ? 'Save action' : 'Create action'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 12 : 4,
    paddingBottom: 12,
  },
  headerTitleGroup: { flex: 1 },
  title: {
    fontFamily: fontFamilies.displaySemibold,
    fontSize: 24,
    lineHeight: 30,
  },
  subtitle: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  headerButton: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  listContent: {
    gap: 12,
    padding: 20,
    paddingBottom: 40,
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 10,
    padding: 24,
  },
  emptyTitle: {
    fontFamily: fontFamilies.bodySemibold,
    fontSize: 17,
  },
  emptyText: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  tagCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  tagHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  tagTitleGroup: { flex: 1 },
  tagTitle: {
    fontFamily: fontFamilies.bodySemibold,
    fontSize: 16,
  },
  tagMeta: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 12,
    marginTop: 2,
  },
  statePill: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stateText: {
    fontFamily: fontFamilies.bodySemibold,
    fontSize: 11,
  },
  targetText: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  detailText: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 12,
    lineHeight: 17,
  },
  cardActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontFamily: fontFamilies.bodySemibold,
    fontSize: 13,
  },
  secondaryButtonText: {
    fontFamily: fontFamilies.bodySemibold,
    fontSize: 13,
  },
  formContent: {
    gap: 12,
    padding: 20,
    paddingBottom: 40,
  },
  inputLabel: {
    fontFamily: fontFamilies.bodySemibold,
    fontSize: 12,
  },
  textInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 15,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  segmented: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  segment: {
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  segmentText: {
    fontFamily: fontFamilies.bodySemibold,
    fontSize: 12,
  },
  selectButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  selectTextGroup: { flex: 1, gap: 2 },
  selectValue: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 14,
  },
  modalScrim: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  optionSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '76%',
    paddingBottom: spacing.lg,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sheetTitle: {
    fontFamily: fontFamilies.bodySemibold,
    fontSize: 17,
  },
  optionList: {
    paddingHorizontal: 12,
  },
  optionRow: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  optionTextGroup: { flex: 1 },
  optionLabel: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 14,
  },
  optionSubtitle: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 12,
    marginTop: 2,
  },
  saveButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 8,
    paddingVertical: 13,
  },
});
