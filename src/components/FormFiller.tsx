/**
 * FormFiller - React Native dynamic form renderer
 *
 * Renders a FormSchema (from the backend's FormVersion.fields) as native
 * inputs. Mirrors the web client's FormFiller component but uses RN primitives.
 *
 * Supported field types:
 *   text, textarea, select, checkbox, date, number, time, datetime,
 *   single-checkbox, list, barcode (with camera scanner),
 *   signature (drawable pad), image (uploadable), fixed-image (display-only from template)
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  useWindowDimensions,
  Modal,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { FormSchema, FormSchemaField } from '../context/TaskContext';
import { useTenant } from '../hooks/useTenant';
import RenderHtml from 'react-native-render-html';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { SignaturePad } from './SignaturePad';
import { fontFamilies, fontSizes, radius } from '../config/designTokens';
import { useLanguage } from '../context/LanguageContext';
import { useConvexUpload } from '../hooks/useConvexUpload';
import { AttachmentPickerSheet } from './AttachmentPickerSheet';
import { getOptimizedImageUrl } from '../utils/imgproxy';

/** Fix self-hosted Convex storage URLs (dashboard domain → backend domain) */
function fixConvexStorageUrl(url: string): string {
  const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
  if (!convexUrl) return url;
  try {
    const expected = new URL(convexUrl);
    const actual = new URL(url);
    if (actual.hostname !== expected.hostname) {
      actual.hostname = expected.hostname;
      return actual.toString();
    }
  } catch {}
  return url;
}

/** Resolves a Convex storageId to a displayable image URL */
const ConvexImage: React.FC<{ storageId: string; style?: any; resizeMode?: any }> = ({ storageId, style, resizeMode = 'contain' }) => {
  const { tenantId } = useTenant();
  const isFullUrl = storageId.startsWith('http') || storageId.startsWith('data:');
  const rawUrl = useQuery(
    api.files.getFileUrl,
    isFullUrl || !tenantId ? 'skip' : { tenantId, storageId: storageId as any },
  );
  const uri = isFullUrl ? storageId : (rawUrl ? fixConvexStorageUrl(rawUrl) : null);

  if (!uri) {
    return (
      <View style={[style, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="small" />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: getOptimizedImageUrl(uri, { width: 1200, height: 1200, mode: resizeMode === 'cover' ? 'fill' : 'fit' }) || uri }}
      style={style}
      resizeMode={resizeMode}
    />
  );
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FormFillerProps {
  schema: FormSchema;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  readOnly?: boolean;
  showValidation?: boolean;
  colors: {
    text: string;
    textSecondary: string;
    surface: string;
    background: string;
  };
  primaryColor: string;
  isDarkMode: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isFieldEmpty(field: FormSchemaField, value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const FormFiller: React.FC<FormFillerProps> = ({
  schema,
  values,
  onChange,
  readOnly = false,
  showValidation = false,
  colors,
  primaryColor,
  isDarkMode,
}) => {
  const { t } = useLanguage();

  const handleFieldChange = (fieldId: number, value: unknown) => {
    onChange({ ...values, [fieldId]: value });
  };

  const inputBg = isDarkMode ? 'rgba(31, 36, 34, 0.7)' : '#F3EEE4';
  const borderColor = isDarkMode ? 'rgba(255, 255, 255, 0.12)' : '#E6E1D7';

  // Group fields into sections: fields before the first section are "ungrouped",
  // then each section field starts a new group containing fields until the next section.
  type SectionGroup = {
    section: FormSchemaField | null; // null = ungrouped (fields before first section)
    fields: FormSchemaField[];
  };
  const sectionGroups = useMemo((): SectionGroup[] => {
    const groups: SectionGroup[] = [];
    let current: SectionGroup = { section: null, fields: [] };
    for (const field of schema.fields) {
      if (field.type === 'section') {
        if (current.section || current.fields.length > 0) groups.push(current);
        current = { section: field, fields: [] };
      } else {
        current.fields.push(field);
      }
    }
    if (current.section || current.fields.length > 0) groups.push(current);
    return groups;
  }, [schema.fields]);

  // Which section is currently open in the detail modal (null = none)
  const [openSectionId, setOpenSectionId] = useState<number | null>(null);
  const openGroup = useMemo(
    () => sectionGroups.find(g => g.section && g.section.id === openSectionId) ?? null,
    [sectionGroups, openSectionId],
  );

  // Non-fillable field types (display-only)
  const isDisplayOnly = (f: FormSchemaField) => f.type === 'fixed-image';

  // Count how many fillable fields in a section have values filled
  const sectionFillableFields = (fields: FormSchemaField[]): FormSchemaField[] =>
    fields.filter(f => !isDisplayOnly(f));

  const sectionFilledCount = (fields: FormSchemaField[]): number =>
    sectionFillableFields(fields).filter(f => !isFieldEmpty(f, values[f.id])).length;

  const renderField = (field: FormSchemaField) => {
    const fieldValue = values[field.id];
    const hasError = showValidation && !!field.required && isFieldEmpty(field, fieldValue);

    return (
      <View key={field.id} style={styles.fieldContainer}>
        {/* Label */}
        {field.type !== 'single-checkbox' && (
          <View style={styles.labelRow}>
            <RenderHtml
              contentWidth={descriptionWidth}
              source={{ html: field.label || t('component.formFiller.untitledField') }}
              baseStyle={{
                fontSize: fontSizes.sm,
                fontFamily: fontFamilies.bodySemibold,
                color: colors.text,
                margin: 0,
                padding: 0,
              }}
              tagsStyles={{
                p: { margin: 0, padding: 0 },
                body: { margin: 0, padding: 0 },
                b: { fontFamily: fontFamilies.bodyBold },
                i: { fontStyle: 'italic' },
                u: { textDecorationLine: 'underline' },
              }}
            />
            {field.required && <Text style={styles.required}>*</Text>}
          </View>
        )}

        {/* Field input */}
        <View style={readOnly ? styles.readOnlyFieldInput : undefined}>
          {renderFieldInput(field, fieldValue, hasError)}
        </View>

        {/* Validation error */}
        {hasError && (
          <Text style={styles.errorText}>{t('component.formFiller.requiredFieldError')}</Text>
        )}
      </View>
    );
  };

  const renderFieldInput = (field: FormSchemaField, value: unknown, _hasError: boolean) => {
    switch (field.type) {
      case 'text':
        return (
          <TextInput
            style={[styles.textInput, { backgroundColor: inputBg, color: colors.text, borderColor }]}
            value={String(value ?? '')}
            onChangeText={(v) => handleFieldChange(field.id, v)}
            placeholder={field.placeholder || `Enter ${field.label?.toLowerCase() || 'text'}...`}
            placeholderTextColor={colors.textSecondary}
            editable={!readOnly}
          />
        );

      case 'barcode':
        return (
          <BarcodeFieldInput
            value={String(value ?? '')}
            onChange={(v) => handleFieldChange(field.id, v)}
            readOnly={readOnly}
            inputBg={inputBg}
            borderColor={borderColor}
            textColor={colors.text}
            secondaryColor={colors.textSecondary}
            primaryColor={primaryColor}
          />
        );

      case 'textarea':
        return (
          <TextInput
            style={[styles.textInput, styles.textArea, { backgroundColor: inputBg, color: colors.text, borderColor }]}
            value={String(value ?? '')}
            onChangeText={(v) => handleFieldChange(field.id, v)}
            placeholder={field.placeholder || t('component.formFiller.textareaPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            editable={!readOnly}
          />
        );

      case 'number':
        return (
          <NumberFieldInput
            value={value as number | undefined}
            onChange={(v) => handleFieldChange(field.id, v)}
            readOnly={readOnly}
            allowDecimals={field.properties?.allowDecimals}
            min={field.properties?.min}
            max={field.properties?.max}
            inputBg={inputBg}
            borderColor={borderColor}
            textColor={colors.text}
            secondaryColor={colors.textSecondary}
            primaryColor={primaryColor}
          />
        );

      case 'select':
        return (
          <SelectFieldInput
            options={field.options ?? []}
            value={value as string | undefined}
            onChange={(v) => handleFieldChange(field.id, v)}
            readOnly={readOnly}
            inputBg={inputBg}
            borderColor={borderColor}
            textColor={colors.text}
            secondaryColor={colors.textSecondary}
            primaryColor={primaryColor}
          />
        );

      case 'checkbox':
        return (
          <CheckboxFieldInput
            options={field.options ?? []}
            value={(value as string[]) ?? []}
            onChange={(v) => handleFieldChange(field.id, v)}
            readOnly={readOnly}
            textColor={colors.text}
            primaryColor={primaryColor}
          />
        );

      case 'single-checkbox':
        return (
          <SingleCheckboxInput
            label={field.label || t('component.formFiller.untitledField')}
            required={field.required}
            value={!!value}
            onChange={(v) => handleFieldChange(field.id, v)}
            readOnly={readOnly}
            textColor={colors.text}
            primaryColor={primaryColor}
          />
        );

      case 'date':
        return (
          <DateFieldInput
            value={value as string | undefined}
            onChange={(v) => handleFieldChange(field.id, v)}
            mode="date"
            readOnly={readOnly}
            inputBg={inputBg}
            borderColor={borderColor}
            textColor={colors.text}
            secondaryColor={colors.textSecondary}
            primaryColor={primaryColor}
          />
        );

      case 'time':
        return (
          <DateFieldInput
            value={value as string | undefined}
            onChange={(v) => handleFieldChange(field.id, v)}
            mode="time"
            readOnly={readOnly}
            inputBg={inputBg}
            borderColor={borderColor}
            textColor={colors.text}
            secondaryColor={colors.textSecondary}
            primaryColor={primaryColor}
          />
        );

      case 'datetime':
        return (
          <DateFieldInput
            value={value as string | undefined}
            onChange={(v) => handleFieldChange(field.id, v)}
            mode="datetime"
            readOnly={readOnly}
            inputBg={inputBg}
            borderColor={borderColor}
            textColor={colors.text}
            secondaryColor={colors.textSecondary}
            primaryColor={primaryColor}
          />
        );

      case 'list':
        return (
          <ListFieldInput
            value={Array.isArray(value) ? (value as string[]) : ['']}
            onChange={(v) => handleFieldChange(field.id, v)}
            itemType={field.properties?.listItemType || 'text'}
            readOnly={readOnly}
            inputBg={inputBg}
            borderColor={borderColor}
            textColor={colors.text}
            secondaryColor={colors.textSecondary}
            primaryColor={primaryColor}
          />
        );

      case 'signature':
        return (
          <SignaturePad
            value={value as string | null | undefined}
            onChange={(sig) => handleFieldChange(field.id, sig)}
            disabled={readOnly}
            strokeColor={isDarkMode ? '#FFFFFF' : '#000000'}
            borderColor={borderColor}
            backgroundColor={inputBg}
          />
        );

      case 'fixed-image': {
        // Fixed images are display-only — the image comes from the field
        // definition (set by the form designer), not from user-submitted values.
        const fixedImageId = field.properties?.imageId as string | undefined;
        const fixedImageUrl = field.properties?.imageUrl as string | undefined;
        const fixedSrc = fixedImageId || fixedImageUrl;
        if (fixedSrc) {
          return (
            <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
              <ConvexImage
                storageId={fixedSrc}
                style={{ width: '100%', height: 200, borderRadius: radius.md }}
                resizeMode="contain"
              />
            </View>
          );
        }
        return (
          <View style={[styles.placeholderField, { borderColor }]}>
            <MaterialIcons name="image" size={24} color={colors.textSecondary} />
            <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
              {t('component.formFiller.imagePlaceholder')}
            </Text>
          </View>
        );
      }

      case 'image': {
        // User-uploadable image field — value is a Convex storageId
        const imageVal = value as string | undefined;
        if (imageVal) {
          return (
            <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
              <ConvexImage
                storageId={imageVal}
                style={{ width: '100%', height: 200, borderRadius: radius.md }}
                resizeMode="contain"
              />
              {!readOnly && (
                <TouchableOpacity
                  style={[styles.imageReplaceButton, { backgroundColor: primaryColor }]}
                  onPress={() => handleFieldChange(field.id, undefined)}
                >
                  <MaterialIcons name="close" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              )}
            </View>
          );
        }
        if (readOnly) {
          return (
            <View style={[styles.placeholderField, { borderColor }]}>
              <MaterialIcons name="image" size={24} color={colors.textSecondary} />
              <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
                {t('component.formFiller.imageUploadPlaceholder')}
              </Text>
            </View>
          );
        }
        return (
          <ImageUploadField
            onUploaded={(storageId) => handleFieldChange(field.id, storageId)}
            borderColor={borderColor}
            textColor={colors.textSecondary}
            primaryColor={primaryColor}
          />
        );
      }

      default:
        return (
          <Text style={{ color: colors.textSecondary, fontSize: fontSizes.sm }}>
            {t('component.formFiller.unsupportedFieldType', { type: field.type })}
          </Text>
        );
    }
  };

  const { width: windowWidth } = useWindowDimensions();
  const descriptionWidth = windowWidth - 32;

  return (
    <View style={styles.container}>
      {/* Header */}
      {(schema.title || schema.description) && (
        <View style={styles.header}>
          {schema.title && (
            <RenderHtml
              contentWidth={descriptionWidth}
              source={{ html: schema.title }}
              baseStyle={{
                fontSize: fontSizes.lg,
                fontFamily: fontFamilies.bodySemibold,
                color: colors.text,
                margin: 0,
                padding: 0,
              }}
              tagsStyles={{
                p: { margin: 0, padding: 0 },
                body: { margin: 0, padding: 0 },
                b: { fontFamily: fontFamilies.bodyBold },
                i: { fontStyle: 'italic' },
                u: { textDecorationLine: 'underline' },
              }}
            />
          )}
          {schema.description && (
            <RenderHtml
              contentWidth={descriptionWidth}
              source={{ html: schema.description }}
              baseStyle={{
                color: colors.textSecondary,
                fontSize: fontSizes.sm,
                fontFamily: fontFamilies.bodyRegular,
                padding: 0,
                margin: 0,
              }}
              tagsStyles={{
                p: { margin: 0, padding: 0 },
                body: { margin: 0, padding: 0 },
                b: { fontFamily: fontFamilies.bodyBold },
                i: { fontStyle: 'italic' },
                u: { textDecorationLine: 'underline' },
              }}
            />
          )}
        </View>
      )}

      {/* Fields: ungrouped fields render inline, sections render as tappable cards */}
      {sectionGroups.map((group, gi) => {
        // Ungrouped fields (before the first section) — render inline
        if (!group.section) {
          return (
            <View key={`sg-ungrouped-${gi}`}>
              {group.fields.map(renderField)}
            </View>
          );
        }

        // Section → tappable list item that opens a detail view
        const filled = sectionFilledCount(group.fields);
        const total = sectionFillableFields(group.fields).length;
        const sectionLabel = group.section.label?.replace(/<[^>]*>/g, '') || t('component.formFiller.untitledSection', 'Section');

        return (
          <TouchableOpacity
            key={`sg-${group.section.id}`}
            style={[styles.sectionCard, { backgroundColor: inputBg, borderColor }]}
            onPress={() => setOpenSectionId(group.section!.id)}
            activeOpacity={0.7}
          >
            <View style={styles.sectionCardContent}>
              <Text style={[styles.sectionCardTitle, { color: colors.text }]} numberOfLines={1}>
                {sectionLabel}
              </Text>
              <Text style={[styles.sectionCardSubtitle, { color: colors.textSecondary }]}>
                {filled}/{total} {t('component.formFiller.fieldsFilled', 'fields filled')}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        );
      })}

      {/* Section detail modal */}
      <Modal
        visible={openSectionId !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpenSectionId(null)}
      >
        <View style={[styles.sectionModalContainer, { backgroundColor: colors.background }]}>
          {/* Modal header */}
          <View style={[styles.sectionModalHeader, { borderBottomColor: borderColor }]}>
            <TouchableOpacity
              onPress={() => setOpenSectionId(null)}
              style={styles.sectionModalBackButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.sectionModalTitle, { color: colors.text }]} numberOfLines={1}>
              {openGroup?.section?.label?.replace(/<[^>]*>/g, '') || t('component.formFiller.untitledSection', 'Section')}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Modal fields */}
          <ScrollView
            style={styles.sectionModalScroll}
            contentContainerStyle={styles.sectionModalContent}
            keyboardShouldPersistTaps="handled"
          >
            {openGroup?.fields.map(renderField)}
          </ScrollView>
        </View>
      </Modal>

      {/* Empty state */}
      {schema.fields.length === 0 && (
        <View style={styles.emptyState}>
          <MaterialIcons name="description" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {t('component.formFiller.noFields')}
          </Text>
        </View>
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Sub-components for complex field types
// ---------------------------------------------------------------------------

const NumberFieldInput: React.FC<{
  value?: number;
  onChange: (v: number) => void;
  readOnly: boolean;
  allowDecimals?: boolean;
  min?: unknown;
  max?: unknown;
  inputBg: string;
  borderColor: string;
  textColor: string;
  secondaryColor: string;
  primaryColor: string;
}> = ({ value, onChange, readOnly, allowDecimals, min, max, inputBg, borderColor, textColor, secondaryColor, primaryColor }) => {
  const { t } = useLanguage();

  const parseBound = (bound: unknown): number | undefined => {
    if (typeof bound === 'number' && Number.isFinite(bound)) return bound;
    if (typeof bound === 'string' && bound.trim() !== '') {
      const parsed = Number(bound);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  };

  const minValue = parseBound(min);
  const maxValue = parseBound(max);
  const effectiveMin = typeof minValue === 'number' ? minValue : undefined;
  const effectiveMax =
    typeof maxValue === 'number' && (effectiveMin === undefined || maxValue >= effectiveMin)
      ? maxValue
      : undefined;

  const normalizeForMode = (next: number): number => {
    if (allowDecimals) {
      return Math.round(next * 100) / 100;
    }
    return Math.round(next);
  };

  const clampValue = (next: number): number => {
    let normalized = normalizeForMode(next);
    if (typeof effectiveMin === 'number') normalized = Math.max(effectiveMin, normalized);
    if (typeof effectiveMax === 'number') normalized = Math.min(effectiveMax, normalized);
    return normalized;
  };

  const [textValue, setTextValue] = useState(() => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(clampValue(value));
    }
    return '';
  });

  // Sync text display when value prop changes (e.g. loading saved data)
  useEffect(() => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      setTextValue(String(clampValue(value)));
    } else if (value == null) {
      setTextValue('');
    }
  }, [value, allowDecimals, effectiveMin, effectiveMax]);

  const getCurrentValue = (): number => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return clampValue(value);
    }

    const parsedText = Number(allowDecimals ? textValue.replace(',', '.') : textValue);
    if (Number.isFinite(parsedText)) {
      return clampValue(parsedText);
    }

    if (typeof effectiveMin === 'number') return effectiveMin;
    return 0;
  };

  const handleChange = (text: string) => {
    setTextValue(text);

    const normalizedText = allowDecimals ? text.replace(',', '.') : text;
    if (
      normalizedText === '' ||
      normalizedText === '-' ||
      normalizedText === '.' ||
      normalizedText === '-.'
    ) {
      return;
    }

    const num = Number(normalizedText);
    if (!Number.isFinite(num)) return;

    const bounded = clampValue(num);
    onChange(bounded);

    if (bounded !== num) {
      setTextValue(String(bounded));
    }
  };

  const step = allowDecimals ? 0.01 : 1;

  const handleStep = (direction: -1 | 1) => {
    const next = clampValue(getCurrentValue() + direction * step);
    onChange(next);
    setTextValue(String(next));
  };

  return (
    <View style={[styles.numberRow]}>
      <TouchableOpacity
        style={[styles.numberButton, { borderColor, backgroundColor: inputBg }]}
        onPress={() => handleStep(-1)}
        disabled={readOnly}
      >
        <MaterialIcons name="remove" size={20} color={primaryColor} />
      </TouchableOpacity>
      <TextInput
        style={[styles.textInput, styles.numberInput, { backgroundColor: inputBg, color: textColor, borderColor }]}
        value={textValue}
        onChangeText={handleChange}
        keyboardType={allowDecimals ? 'decimal-pad' : 'number-pad'}
        editable={!readOnly}
        placeholder={t('component.formFiller.numberPlaceholder')}
        placeholderTextColor={secondaryColor}
        textAlign="center"
      />
      <TouchableOpacity
        style={[styles.numberButton, { borderColor, backgroundColor: inputBg }]}
        onPress={() => handleStep(1)}
        disabled={readOnly}
      >
        <MaterialIcons name="add" size={20} color={primaryColor} />
      </TouchableOpacity>
    </View>
  );
};

const SelectFieldInput: React.FC<{
  options: string[];
  value?: string;
  onChange: (v: string) => void;
  readOnly: boolean;
  inputBg: string;
  borderColor: string;
  textColor: string;
  secondaryColor: string;
  primaryColor: string;
}> = ({ options, value, onChange, readOnly, inputBg, borderColor, textColor, secondaryColor, primaryColor }) => {
  return (
    <View style={styles.optionsContainer}>
      {options.filter(o => o.trim()).map((option, index) => {
        const isSelected = value === option;
        return (
          <TouchableOpacity
            key={index}
            style={[
              styles.radioOption,
              { borderColor: isSelected ? primaryColor : borderColor, backgroundColor: isSelected ? `${primaryColor}12` : inputBg },
            ]}
            onPress={() => !readOnly && onChange(option)}
            disabled={readOnly}
            activeOpacity={0.7}
          >
            <View style={[styles.radioCircle, { borderColor: isSelected ? primaryColor : secondaryColor }]}>
              {isSelected && <View style={[styles.radioDot, { backgroundColor: primaryColor }]} />}
            </View>
            <Text style={[styles.optionText, { color: textColor }]}>{option}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const CheckboxFieldInput: React.FC<{
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  readOnly: boolean;
  textColor: string;
  primaryColor: string;
}> = ({ options, value, onChange, readOnly, textColor, primaryColor }) => {
  const toggle = (option: string) => {
    if (readOnly) return;
    if (value.includes(option)) {
      onChange(value.filter(v => v !== option));
    } else {
      onChange([...value, option]);
    }
  };

  return (
    <View style={styles.optionsContainer}>
      {options.filter(o => o.trim()).map((option, index) => {
        const isChecked = value.includes(option);
        return (
          <TouchableOpacity
            key={index}
            style={styles.checkboxOption}
            onPress={() => toggle(option)}
            disabled={readOnly}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name={isChecked ? 'check-box' : 'check-box-outline-blank'}
              size={24}
              color={isChecked ? primaryColor : '#9E9E9E'}
            />
            <Text style={[styles.optionText, { color: textColor, marginLeft: 10 }]}>{option}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const SingleCheckboxInput: React.FC<{
  label: string;
  required?: boolean;
  value: boolean;
  onChange: (v: boolean) => void;
  readOnly: boolean;
  textColor: string;
  primaryColor: string;
}> = ({ label, required, value, onChange, readOnly, textColor, primaryColor }) => {
  const { width } = useWindowDimensions();
  const htmlLabel = required ? `${label} <span style="color:#F44336">*</span>` : label;
  return (
    <TouchableOpacity
      style={styles.checkboxOption}
      onPress={() => !readOnly && onChange(!value)}
      disabled={readOnly}
      activeOpacity={0.7}
    >
      <MaterialIcons
        name={value ? 'check-box' : 'check-box-outline-blank'}
        size={24}
        color={value ? primaryColor : '#9E9E9E'}
      />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <RenderHtml
          contentWidth={width - 80}
          source={{ html: htmlLabel }}
          baseStyle={{
            fontSize: fontSizes.sm,
            fontFamily: fontFamilies.bodyRegular,
            color: textColor,
            margin: 0,
            padding: 0,
          }}
          tagsStyles={{
            p: { margin: 0, padding: 0 },
            body: { margin: 0, padding: 0 },
            b: { fontFamily: fontFamilies.bodyBold },
            i: { fontStyle: 'italic' },
            u: { textDecorationLine: 'underline' },
          }}
        />
      </View>
    </TouchableOpacity>
  );
};

const DateFieldInput: React.FC<{
  value?: string;
  onChange: (v: string) => void;
  mode: 'date' | 'time' | 'datetime';
  readOnly: boolean;
  inputBg: string;
  borderColor: string;
  textColor: string;
  secondaryColor: string;
  primaryColor: string;
}> = ({ value, onChange, mode, readOnly, inputBg, borderColor, textColor, secondaryColor, primaryColor }) => {
  const { t } = useLanguage();
  const placeholder =
    mode === 'date' ? t('component.formFiller.datePlaceholder') :
    mode === 'time' ? t('component.formFiller.timePlaceholder') :
    t('component.formFiller.dateTimePlaceholder');

  const iconName = mode === 'time' ? 'schedule' : 'calendar-today';

  const setNow = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    if (mode === 'date') {
      onChange(`${year}-${month}-${day}`);
    } else if (mode === 'time') {
      onChange(`${hours}:${minutes}`);
    } else {
      onChange(`${year}-${month}-${day}T${hours}:${minutes}`);
    }
  };

  return (
    <View style={styles.dateRow}>
      <View style={styles.dateInputWrapper}>
        <MaterialIcons name={iconName} size={18} color={secondaryColor} style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.textInput, styles.dateTextInput, { backgroundColor: inputBg, color: textColor, borderColor }]}
          value={String(value ?? '')}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={secondaryColor}
          editable={!readOnly}
        />
      </View>
      {!readOnly && (
        <TouchableOpacity
          style={[styles.nowButton, { borderColor: primaryColor }]}
          onPress={setNow}
        >
          <Text style={[styles.nowButtonText, { color: primaryColor }]}>{t('component.formFiller.nowButton')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

/** Standalone barcode field: text input + scan button */
const BarcodeFieldInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
  inputBg: string;
  borderColor: string;
  textColor: string;
  secondaryColor: string;
  primaryColor: string;
}> = ({ value, onChange, readOnly, inputBg, borderColor, textColor, secondaryColor, primaryColor }) => {
  const { t } = useLanguage();
  const [scannerOpen, setScannerOpen] = useState(false);

  return (
    <View>
      <View style={styles.barcodeRow}>
        <TextInput
          style={[styles.textInput, styles.barcodeInput, { backgroundColor: inputBg, color: textColor, borderColor }]}
          value={value}
          onChangeText={onChange}
          placeholder={t('component.formFiller.barcodePlaceholder')}
          placeholderTextColor={secondaryColor}
          editable={!readOnly}
        />
        {!readOnly && (
          <TouchableOpacity
            style={[styles.scanButton, { backgroundColor: primaryColor }]}
            onPress={() => setScannerOpen(true)}
          >
            <MaterialIcons name="qr-code-scanner" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(scanned) => {
          onChange(scanned);
          setScannerOpen(false);
        }}
      />
    </View>
  );
};

/** A single barcode list item with its own scanner state */
const BarcodeListItem: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  readOnly: boolean;
  inputBg: string;
  borderColor: string;
  textColor: string;
  secondaryColor: string;
  primaryColor: string;
}> = ({ value, onChange, placeholder, readOnly, inputBg, borderColor, textColor, secondaryColor, primaryColor }) => {
  const [scannerOpen, setScannerOpen] = useState(false);

  return (
    <View style={styles.barcodeRow}>
      <TextInput
        style={[styles.textInput, styles.barcodeInput, { backgroundColor: inputBg, color: textColor, borderColor }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={secondaryColor}
        editable={!readOnly}
      />
      {!readOnly && (
        <TouchableOpacity
          style={[styles.scanButton, { backgroundColor: primaryColor }]}
          onPress={() => setScannerOpen(true)}
        >
          <MaterialIcons name="qr-code-scanner" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      )}
      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(scanned) => {
          onChange(scanned);
          setScannerOpen(false);
        }}
      />
    </View>
  );
};

/** Image upload field – lets the user pick/take a photo and uploads to Convex */
const ImageUploadField: React.FC<{
  onUploaded: (storageId: string) => void;
  borderColor: string;
  textColor: string;
  primaryColor: string;
}> = ({ onUploaded, borderColor, textColor, primaryColor }) => {
  const { t } = useLanguage();
  const { pickAndUpload, uploading, attachmentPickerProps } = useConvexUpload();

  const handlePress = async () => {
    const attachments = await pickAndUpload();
    if (attachments.length > 0) {
      onUploaded(attachments[0].storageId);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.placeholderField, styles.imageUploadField, { borderColor }]}
        onPress={handlePress}
        disabled={uploading}
        activeOpacity={0.7}
      >
        {uploading ? (
          <ActivityIndicator size="small" color={primaryColor} />
        ) : (
          <>
            <MaterialIcons name="add-a-photo" size={28} color={primaryColor} />
            <Text style={[styles.placeholderText, { color: textColor, marginTop: 8 }]}> 
              {t('component.formFiller.tapToUploadImage', 'Tap to upload image')}
            </Text>
          </>
        )}
      </TouchableOpacity>
      <AttachmentPickerSheet {...attachmentPickerProps} />
    </>
  );
};

const ListFieldInput: React.FC<{
  value: string[];
  onChange: (v: string[]) => void;
  itemType: string;
  readOnly: boolean;
  inputBg: string;
  borderColor: string;
  textColor: string;
  secondaryColor: string;
  primaryColor: string;
}> = ({ value, onChange, itemType, readOnly, inputBg, borderColor, textColor, secondaryColor, primaryColor }) => {
  const { t } = useLanguage();
  const handleItemChange = (index: number, text: string) => {
    const newValue = [...value];
    newValue[index] = text;
    onChange(newValue);
  };

  const addItem = () => {
    onChange([...value, '']);
  };

  const removeItem = (index: number) => {
    if (value.length <= 1) return;
    onChange(value.filter((_, i) => i !== index));
  };

  const keyboardType = itemType === 'number' ? 'numeric' as const : 'default' as const;
  const isBarcode = itemType === 'barcode';

  return (
    <View>
      {value.map((item, index) => (
        <View key={index} style={styles.listItemRow}>
          <Text style={[styles.listItemNumber, { color: secondaryColor }]}>{index + 1}.</Text>
          {isBarcode ? (
            <View style={styles.listItemInput}>
              <BarcodeListItem
                value={String(item)}
                onChange={(v) => handleItemChange(index, v)}
                placeholder={t('component.formFiller.barcodeListPlaceholder', { index: index + 1 })}
                readOnly={readOnly}
                inputBg={inputBg}
                borderColor={borderColor}
                textColor={textColor}
                secondaryColor={secondaryColor}
                primaryColor={primaryColor}
              />
            </View>
          ) : (
            <TextInput
              style={[styles.textInput, styles.listItemInput, { backgroundColor: inputBg, color: textColor, borderColor }]}
              value={String(item)}
              onChangeText={(v) => handleItemChange(index, v)}
              placeholder={t('component.formFiller.listItemPlaceholder', { index: index + 1 })}
              placeholderTextColor={secondaryColor}
              keyboardType={keyboardType}
              editable={!readOnly}
            />
          )}
          {!readOnly && value.length > 1 && (
            <TouchableOpacity onPress={() => removeItem(index)} style={styles.listRemoveButton}>
              <MaterialIcons name="close" size={18} color="#F44336" />
            </TouchableOpacity>
          )}
        </View>
      ))}
      {!readOnly && (
        <TouchableOpacity style={[styles.listAddButton, { borderColor: primaryColor }]} onPress={addItem}>
          <MaterialIcons name="add" size={18} color={primaryColor} />
          <Text style={[styles.listAddText, { color: primaryColor }]}>{t('component.formFiller.addItemButton')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  header: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E6E1D7',
  },
  headerTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
    marginBottom: 4,
  },
  headerDescription: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  required: {
    color: '#F44336',
    marginLeft: 4,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  errorText: {
    marginTop: 4,
    color: '#F44336',
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
  },
  readOnlyFieldInput: {
    opacity: 0.5,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  // Number
  numberRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  numberButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberInput: {
    flex: 1,
    marginHorizontal: 8,
  },
  // Select (radio)
  optionsContainer: {
    gap: 8,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  optionText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  // Checkbox
  checkboxOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  // Date
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateTextInput: {
    flex: 1,
  },
  dateText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  nowButton: {
    marginLeft: 8,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  nowButtonText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  // Placeholder (signature, image)
  placeholderField: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.md,
    borderStyle: 'dashed',
  },
  placeholderText: {
    marginLeft: 10,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  sectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: radius.md,
    marginBottom: 12,
  },
  sectionCardContent: {
    flex: 1,
    marginRight: 8,
  },
  sectionCardTitle: {
    fontSize: fontSizes.base,
    fontFamily: fontFamilies.bodySemibold,
  },
  sectionCardSubtitle: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyRegular,
    marginTop: 2,
  },
  sectionModalContainer: {
    flex: 1,
  },
  sectionModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    paddingTop: 50,
  },
  sectionModalBackButton: {
    width: 40,
    alignItems: 'flex-start',
  },
  sectionModalTitle: {
    flex: 1,
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.bodySemibold,
    textAlign: 'center',
  },
  sectionModalScroll: {
    flex: 1,
  },
  sectionModalContent: {
    padding: 16,
    paddingBottom: 40,
  },
  imageUploadField: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 120,
  },
  imageReplaceButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // List
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  listItemNumber: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
    marginRight: 8,
    width: 20,
  },
  listItemInput: {
    flex: 1,
  },
  listRemoveButton: {
    marginLeft: 8,
    padding: 4,
  },
  listAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: radius.md,
    borderStyle: 'dashed',
    marginTop: 4,
  },
  listAddText: {
    marginLeft: 6,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  // Barcode
  barcodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  barcodeInput: {
    flex: 1,
  },
  scanButton: {
    marginLeft: 8,
    width: 46,
    height: 46,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    marginTop: 8,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
});

export default FormFiller;
