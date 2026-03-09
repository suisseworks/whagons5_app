import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTasks } from '../context/TaskContext';
import { emptyFilters } from '../context/TaskContext';
import type { TaskFilters, StatusOption } from '../context/TaskContext';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';

interface TaskFilterSheetProps {
  visible: boolean;
  onClose: () => void;
}

const PRIORITIES: { label: string; color: string }[] = [
  { label: 'High', color: '#EF4444' },
  { label: 'Medium', color: '#F59E0B' },
  { label: 'Low', color: '#6B7280' },
];

export const TaskFilterSheet: React.FC<TaskFilterSheetProps> = ({ visible, onClose }) => {
  const { isDarkMode, primaryColor, colors } = useTheme();
  const { filters, setFilters, statuses, availableAssignees } = useTasks();

  // Local draft so the user can adjust before applying
  const [draft, setDraft] = useState<TaskFilters>(filters);

  // Sync draft whenever the sheet opens
  React.useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

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

  const handleApply = useCallback(() => {
    setFilters(draft);
    onClose();
  }, [draft, setFilters, onClose]);

  const handleClear = useCallback(() => {
    setFilters(emptyFilters);
    onClose();
  }, [setFilters, onClose]);

  const draftHasFilters =
    draft.statuses.length > 0 || draft.priorities.length > 0 || draft.assignees.length > 0;

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
            <Text style={[styles.title, { color: colors.text }]}>Filters</Text>
            {draftHasFilters && (
              <TouchableOpacity onPress={handleClear} hitSlop={8}>
                <Text style={[styles.clearText, { color: primaryColor }]}>Clear all</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Status section */}
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Status</Text>
            <View style={styles.chipGrid}>
              {statuses.map((s: StatusOption) => {
                const selected = draft.statuses.includes(s.name);
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      styles.chip,
                      {
                        borderColor: selected
                          ? (s.color || primaryColor)
                          : isDarkMode ? 'rgba(255,255,255,0.12)' : '#E0DBD2',
                        backgroundColor: selected
                          ? `${s.color || primaryColor}18`
                          : isDarkMode ? 'rgba(255,255,255,0.04)' : '#F8F5F0',
                      },
                    ]}
                    onPress={() => toggleStatus(s.name)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: s.color || '#9E9E9E' },
                      ]}
                    />
                    <Text
                      style={[
                        styles.chipText,
                        { color: selected ? colors.text : colors.textSecondary },
                        selected && { fontFamily: fontFamilies.bodySemibold },
                      ]}
                    >
                      {s.name}
                    </Text>
                    {selected && (
                      <MaterialIcons name="check" size={14} color={s.color || primaryColor} style={{ marginLeft: 2 }} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Priority section */}
            <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: spacing.md }]}>
              Priority
            </Text>
            <View style={styles.chipGrid}>
              {PRIORITIES.map((p) => {
                const selected = draft.priorities.includes(p.label);
                return (
                  <TouchableOpacity
                    key={p.label}
                    style={[
                      styles.chip,
                      {
                        borderColor: selected
                          ? p.color
                          : isDarkMode ? 'rgba(255,255,255,0.12)' : '#E0DBD2',
                        backgroundColor: selected
                          ? `${p.color}18`
                          : isDarkMode ? 'rgba(255,255,255,0.04)' : '#F8F5F0',
                      },
                    ]}
                    onPress={() => togglePriority(p.label)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.statusDot, { backgroundColor: p.color }]} />
                    <Text
                      style={[
                        styles.chipText,
                        { color: selected ? colors.text : colors.textSecondary },
                        selected && { fontFamily: fontFamilies.bodySemibold },
                      ]}
                    >
                      {p.label}
                    </Text>
                    {selected && (
                      <MaterialIcons name="check" size={14} color={p.color} style={{ marginLeft: 2 }} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Assignee section */}
            {availableAssignees.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: spacing.md }]}>
                  Assignee
                </Text>
                <View style={styles.chipGrid}>
                  {availableAssignees.map((name) => {
                    const selected = draft.assignees.includes(name);
                    return (
                      <TouchableOpacity
                        key={name}
                        style={[
                          styles.chip,
                          {
                            borderColor: selected
                              ? primaryColor
                              : isDarkMode ? 'rgba(255,255,255,0.12)' : '#E0DBD2',
                            backgroundColor: selected
                              ? `${primaryColor}18`
                              : isDarkMode ? 'rgba(255,255,255,0.04)' : '#F8F5F0',
                          },
                        ]}
                        onPress={() => toggleAssignee(name)}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons
                          name="person-outline"
                          size={14}
                          color={selected ? primaryColor : colors.textSecondary}
                          style={{ marginRight: 2 }}
                        />
                        <Text
                          style={[
                            styles.chipText,
                            { color: selected ? colors.text : colors.textSecondary },
                            selected && { fontFamily: fontFamilies.bodySemibold },
                          ]}
                          numberOfLines={1}
                        >
                          {name}
                        </Text>
                        {selected && (
                          <MaterialIcons name="check" size={14} color={primaryColor} style={{ marginLeft: 2 }} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* Bottom spacer */}
            <View style={{ height: spacing.lg }} />
          </ScrollView>

          {/* Apply button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.applyButton, { backgroundColor: primaryColor }]}
              onPress={handleApply}
              activeOpacity={0.8}
            >
              <Text style={styles.applyText}>Apply filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

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
    maxHeight: '75%',
    ...shadows.subtle,
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
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
  },
  clearText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  scroll: {
    paddingHorizontal: 20,
  },
  sectionLabel: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  chipText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  applyButton: {
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
