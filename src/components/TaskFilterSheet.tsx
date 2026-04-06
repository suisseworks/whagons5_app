import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTasks } from '../context/TaskContext';
import { emptyFilters } from '../context/TaskContext';
import type { TaskFilters } from '../context/TaskContext';
import { fontFamilies, fontSizes, radius, spacing } from '../config/designTokens';
import { useLanguage } from '../context/LanguageContext';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface TaskFilterSheetProps {
  visible: boolean;
  onClose: () => void;
}

const PRIORITY_KEYS: { key: string; value: string; color: string }[] = [
  { key: 'priorityHigh', value: 'High', color: '#EF4444' },
  { key: 'priorityMedium', value: 'Medium', color: '#F59E0B' },
  { key: 'priorityLow', value: 'Low', color: '#6B7280' },
];

const FLAG_COLOR_KEYS: { value: string; key: string; color: string }[] = [
  { value: 'red', key: 'flagRed', color: '#ef4444' },
  { value: 'orange', key: 'flagOrange', color: '#f97316' },
  { value: 'yellow', key: 'flagYellow', color: '#eab308' },
  { value: 'green', key: 'flagGreen', color: '#22c55e' },
  { value: 'blue', key: 'flagBlue', color: '#3b82f6' },
  { value: 'purple', key: 'flagPurple', color: '#a855f7' },
];

const INITIAL_ASSIGNEE_COUNT = 5;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TaskFilterSheet: React.FC<TaskFilterSheetProps> = ({ visible, onClose }) => {
  const { isDarkMode, primaryColor, colors } = useTheme();
  const { t } = useLanguage();
  const { filters, setFilters, availableStatuses, categories, availableAssignees, availableTags, selectedWorkspace } = useTasks();

  // Local draft so the user can adjust before applying
  const [draft, setDraft] = useState<TaskFilters>(filters);

  // Section collapse state — all collapsed by default, expand sections that have active filters
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    status: true,
    priority: true,
    assignee: true,
    tag: true,
    flag: true,
  });

  // Category filter for statuses
  const [selectedCategory, setSelectedCategory] = useState<TaskFilters['categoryIds'][number] | null>(null);

  // Assignee search
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [showAllAssignees, setShowAllAssignees] = useState(false);

  // Sync draft whenever the sheet opens — auto-expand sections with active filters
  React.useEffect(() => {
    if (visible) {
      setDraft(filters);
      setSelectedCategory(filters.categoryIds[0] ?? null);
      setAssigneeSearch('');
      setShowAllAssignees(false);
      setCollapsedSections({
        status: filters.statuses.length === 0,
        priority: filters.priorities.length === 0,
        assignee: filters.assignees.length === 0,
        tag: filters.tags.length === 0,
        flag: filters.flagColors.length === 0,
      });
    }
  }, [visible, filters]);

  const isEverything = selectedWorkspace === 'Everything' || selectedWorkspace === 'Shared';

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  // Visible statuses — context-aware, filtered by workspace category transition groups
  const visibleStatuses = useMemo(() => {
    if (selectedCategory == null) return availableStatuses;
    return availableStatuses.filter((status) => String(status.categoryId) === String(selectedCategory));
  }, [availableStatuses, selectedCategory]);

  // Filtered assignees (search + limit)
  const filteredAssignees = useMemo(() => {
    let list = availableAssignees;
    if (assigneeSearch.trim()) {
      const q = assigneeSearch.toLowerCase().trim();
      list = list.filter((n) => n.toLowerCase().includes(q));
    }
    if (!showAllAssignees && list.length > INITIAL_ASSIGNEE_COUNT) {
      return { items: list.slice(0, INITIAL_ASSIGNEE_COUNT), total: list.length, hasMore: true };
    }
    return { items: list, total: list.length, hasMore: false };
  }, [availableAssignees, assigneeSearch, showAllAssignees]);

  // Active filter count
  const activeFilterCount =
    draft.categoryIds.length + draft.statuses.length + draft.priorities.length + draft.assignees.length + draft.flagColors.length + draft.tags.length;

  // ---------------------------------------------------------------------------
  // Callbacks
  // ---------------------------------------------------------------------------

  const toggleSection = useCallback((section: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const selectCategory = useCallback((catId: TaskFilters['categoryIds'][number] | null) => {
    const nextCategory = selectedCategory === catId ? null : catId;
    setSelectedCategory(nextCategory);
    setDraft((current) => ({
      ...current,
      categoryIds: nextCategory == null ? [] : [nextCategory],
    }));
  }, [selectedCategory]);

  const toggleStatus = useCallback((name: string) => {
    setDraft((prev) => ({
      ...prev,
      statuses: prev.statuses.includes(name)
        ? prev.statuses.filter((s) => s !== name)
        : [...prev.statuses, name],
    }));
  }, []);

  const togglePriority = useCallback((name: string) => {
    setDraft((prev) => ({
      ...prev,
      priorities: prev.priorities.includes(name)
        ? prev.priorities.filter((p) => p !== name)
        : [...prev.priorities, name],
    }));
  }, []);

  const toggleAssignee = useCallback((name: string) => {
    setDraft((prev) => ({
      ...prev,
      assignees: prev.assignees.includes(name)
        ? prev.assignees.filter((a) => a !== name)
        : [...prev.assignees, name],
    }));
  }, []);

  const toggleFlagColor = useCallback((color: string) => {
    setDraft((prev) => ({
      ...prev,
      flagColors: prev.flagColors.includes(color)
        ? prev.flagColors.filter((c) => c !== color)
        : [...prev.flagColors, color],
    }));
  }, []);

  const toggleTag = useCallback((tag: string) => {
    setDraft((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter((t) => t !== tag)
        : [...prev.tags, tag],
    }));
  }, []);

  const handleApply = useCallback(() => {
    setFilters(draft);
    onClose();
  }, [draft, setFilters, onClose]);

  const handleReset = useCallback(() => {
    setDraft(emptyFilters);
    setSelectedCategory(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Style helpers
  // ---------------------------------------------------------------------------

  const chipBorderDefault = isDarkMode ? 'rgba(255,255,255,0.12)' : '#E0DBD2';
  const chipBgDefault = isDarkMode ? 'rgba(255,255,255,0.04)' : '#F8F5F0';
  const sectionBorder = isDarkMode ? 'rgba(255,255,255,0.06)' : '#F0EDE7';
  const inputBg = isDarkMode ? 'rgba(255,255,255,0.06)' : '#F5F3EE';
  const inputBorder = isDarkMode ? 'rgba(255,255,255,0.1)' : '#E6E1D7';

  // ---------------------------------------------------------------------------
  // Section header renderer
  // ---------------------------------------------------------------------------

  const renderSectionHeader = (label: string, section: string, count: number) => {
    const collapsed = collapsedSections[section];
    return (
      <TouchableOpacity
        style={[styles.sectionHeader, { borderBottomColor: sectionBorder }]}
        onPress={() => toggleSection(section)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${label} section, ${collapsed ? 'collapsed' : 'expanded'}${count > 0 ? `, ${count} selected` : ''}`}
      >
        <MaterialIcons
          name={collapsed ? 'chevron-right' : 'expand-more'}
          size={20}
          color={colors.textSecondary}
        />
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{label}</Text>
        {count > 0 && (
          <View style={[styles.countBadge, { backgroundColor: primaryColor }]}>
            <Text style={styles.countBadgeText}>{count}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ---------------------------------------------------------------------------
  // Chip renderer
  // ---------------------------------------------------------------------------

  const renderChip = (
    key: string,
    label: string,
    selected: boolean,
    accentColor: string,
    onPress: () => void,
    icon?: React.ReactNode,
  ) => (
    <TouchableOpacity
      key={key}
      style={[
        styles.chip,
        {
          borderColor: selected ? accentColor : chipBorderDefault,
          backgroundColor: selected ? `${accentColor}18` : chipBgDefault,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="checkbox"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      {icon}
      <Text
        style={[
          styles.chipText,
          { color: selected ? colors.text : colors.textSecondary },
          selected && { fontFamily: fontFamilies.bodySemibold },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {selected && (
        <MaterialIcons name="check" size={14} color={accentColor} style={{ marginLeft: 4 }} />
      )}
    </TouchableOpacity>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E1D7',
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: isDarkMode ? '#555' : '#D1CBC0' }]} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>{t('component.taskFilterSheet.title')}</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('component.taskFilterSheet.closeFiltersA11y')}
            >
              <MaterialIcons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Scrollable content */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Category selector ── */}
            {isEverything && categories.length > 1 && (
              <View style={styles.categorySection}>
                <Text style={[styles.categorySectionLabel, { color: colors.textSecondary }]}>
                  {t('component.taskFilterSheet.categoryLabel')}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoryRow}
                >
                  <TouchableOpacity
                    style={[
                      styles.categoryChip,
                      {
                        borderColor: selectedCategory === null ? primaryColor : chipBorderDefault,
                        backgroundColor: selectedCategory === null ? `${primaryColor}18` : chipBgDefault,
                      },
                    ]}
                    onPress={() => selectCategory(null)}
                    activeOpacity={0.7}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: selectedCategory === null }}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        {
                          color: selectedCategory === null ? colors.text : colors.textSecondary,
                        },
                        selectedCategory === null && { fontFamily: fontFamilies.bodySemibold },
                      ]}
                    >
                      {t('component.taskFilterSheet.categoryAll')}
                    </Text>
                  </TouchableOpacity>
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.categoryChip,
                        {
                          borderColor: selectedCategory === cat.id ? primaryColor : chipBorderDefault,
                          backgroundColor: selectedCategory === cat.id ? `${primaryColor}18` : chipBgDefault,
                        },
                      ]}
                      onPress={() => selectCategory(cat.id)}
                      activeOpacity={0.7}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: selectedCategory === cat.id }}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          {
                            color: selectedCategory === cat.id ? colors.text : colors.textSecondary,
                          },
                          selectedCategory === cat.id && { fontFamily: fontFamilies.bodySemibold },
                        ]}
                        numberOfLines={1}
                      >
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── Status section ── */}
            {renderSectionHeader(t('component.taskFilterSheet.sectionStatus'), 'status', draft.statuses.length)}
            {!collapsedSections.status && (
              <View style={styles.chipGrid}>
                {visibleStatuses.map((s) =>
                  renderChip(
                    `status-${s.id}`,
                    s.name,
                    draft.statuses.includes(s.name),
                    s.color || primaryColor,
                    () => toggleStatus(s.name),
                    <View style={[styles.statusDot, { backgroundColor: s.color || '#9E9E9E' }]} />,
                  ),
                )}
                {visibleStatuses.length === 0 && (
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    {t('component.taskFilterSheet.noStatusesForCategory')}
                  </Text>
                )}
              </View>
            )}

            {/* ── Priority section ── */}
            {renderSectionHeader(t('component.taskFilterSheet.sectionPriority'), 'priority', draft.priorities.length)}
            {!collapsedSections.priority && (
              <View style={styles.chipGrid}>
                {PRIORITY_KEYS.map((p) =>
                  renderChip(
                    `priority-${p.value}`,
                    t(`component.taskFilterSheet.${p.key}`),
                    draft.priorities.includes(p.value),
                    p.color,
                    () => togglePriority(p.value),
                    <View style={[styles.statusDot, { backgroundColor: p.color }]} />,
                  ),
                )}
              </View>
            )}

            {/* ── Assignee section ── */}
            {availableAssignees.length > 0 && (
              <>
                {renderSectionHeader(t('component.taskFilterSheet.sectionAssignee'), 'assignee', draft.assignees.length)}
                {!collapsedSections.assignee && (
                  <View>
                    {/* Search input */}
                    {availableAssignees.length > INITIAL_ASSIGNEE_COUNT && (
                      <View
                        style={[
                          styles.searchContainer,
                          { backgroundColor: inputBg, borderColor: inputBorder },
                        ]}
                      >
                        <MaterialIcons name="search" size={16} color={colors.textSecondary} />
                        <TextInput
                          style={[styles.searchInput, { color: colors.text }]}
                          placeholder={t('component.taskFilterSheet.searchAssigneesPlaceholder')}
                          placeholderTextColor={colors.textSecondary}
                          value={assigneeSearch}
                          onChangeText={setAssigneeSearch}
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                        {assigneeSearch !== '' && (
                          <TouchableOpacity onPress={() => setAssigneeSearch('')} hitSlop={8}>
                            <MaterialIcons name="close" size={14} color={colors.textSecondary} />
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                    <View style={styles.chipGrid}>
                      {filteredAssignees.items.map((name) =>
                        renderChip(
                          `assignee-${name}`,
                          name,
                          draft.assignees.includes(name),
                          primaryColor,
                          () => toggleAssignee(name),
                          <MaterialIcons
                            name="person-outline"
                            size={14}
                            color={draft.assignees.includes(name) ? primaryColor : colors.textSecondary}
                            style={{ marginRight: 2 }}
                          />,
                        ),
                      )}
                    </View>
                    {filteredAssignees.hasMore && (
                      <TouchableOpacity
                        style={styles.showAllButton}
                        onPress={() => {
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setShowAllAssignees(true);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.showAllText, { color: primaryColor }]}>
                          {t('component.taskFilterSheet.showAll', { count: filteredAssignees.total })}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </>
            )}

            {/* ── Tags section ── */}
            {availableTags.length > 0 && (
              <>
                {renderSectionHeader(t('component.taskFilterSheet.sectionTags'), 'tag', draft.tags.length)}
                {!collapsedSections.tag && (
                  <View style={styles.chipGrid}>
                    {availableTags.map((tag) =>
                      renderChip(
                        `tag-${tag}`,
                        tag,
                        draft.tags.includes(tag),
                        primaryColor,
                        () => toggleTag(tag),
                        <MaterialIcons
                          name="label-outline"
                          size={14}
                          color={draft.tags.includes(tag) ? primaryColor : colors.textSecondary}
                          style={{ marginRight: 2 }}
                        />,
                      ),
                    )}
                  </View>
                )}
              </>
            )}

            {/* ── Flag section ── */}
            {renderSectionHeader(t('component.taskFilterSheet.sectionFlag'), 'flag', draft.flagColors.length)}
            {!collapsedSections.flag && (
              <View style={styles.chipGrid}>
                {FLAG_COLOR_KEYS.map(({ key, color, value }) =>
                  renderChip(
                    `flag-${value}`,
                    t(`component.taskFilterSheet.${key}`),
                    draft.flagColors.includes(value),
                    color,
                    () => toggleFlagColor(value),
                    <View style={[styles.flagDot, { backgroundColor: color }]} />,
                  ),
                )}
              </View>
            )}

            {/* Bottom spacer for scroll */}
            <View style={{ height: spacing.md }} />
          </ScrollView>

          {/* ── Sticky footer ── */}
          <View style={[styles.footer, { borderTopColor: sectionBorder }]}>
            <TouchableOpacity
              style={styles.resetButton}
              onPress={handleReset}
              activeOpacity={0.7}
              disabled={activeFilterCount === 0}
              accessibilityRole="button"
              accessibilityLabel={t('component.taskFilterSheet.resetButton')}
            >
              <Text
                style={[
                  styles.resetText,
                  { color: activeFilterCount > 0 ? colors.text : colors.textSecondary },
                ]}
              >
                {t('component.taskFilterSheet.resetButton')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.applyButton, { backgroundColor: primaryColor }]}
              onPress={handleApply}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('component.taskFilterSheet.applyFiltersWithCount', { count: activeFilterCount })}
            >
              <Text style={styles.applyText}>
                {activeFilterCount > 0 ? t('component.taskFilterSheet.applyFiltersWithCount', { count: activeFilterCount }) : t('component.taskFilterSheet.applyFilters')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 12,
    maxHeight: '80%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },

  // Category selector
  categorySection: {
    marginBottom: spacing.sm,
  },
  categorySectionLabel: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  sectionLabel: {
    flex: 1,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: fontFamilies.bodySemibold,
  },

  // Chip grid
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 10,
    paddingBottom: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  flagDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  chipText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  emptyText: {
    width: '100%',
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    paddingVertical: 8,
  },

  // Assignee search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 10,
    height: 40,
    marginTop: 10,
    marginBottom: 4,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    paddingVertical: 0,
  },
  showAllButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  showAllText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    borderTopWidth: 1,
    gap: 12,
  },
  resetButton: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  resetText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  applyButton: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: {
    color: '#FFFFFF',
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
});
